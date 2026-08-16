const fs = require("fs");
const path = require("path");
const { AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleKeywordPresetType, AutoModerationRuleTriggerType, ChannelType, PermissionsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { isTicketCategoryName, isChannelInTicketCategory, isTicketChannelName } = require("../../Utils/Ticket/ticketCategoryUtils");
const { ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");
const RULE_PREFIX = "[VC] ";
const AUTOMOD_ALERT_CHANNEL_ID = String(IDs.channels?.sanzioniUtenti || "1442569245878648924");
const AUTOMOD_CONFIG_PATH = path.resolve(__dirname, "../../Utils/Config/automodConfig.json");
const RACIST_WORDS_FILE = path.resolve(__dirname, "../../Utils/Config/automodRacistWords.json");
const RACIST_WORDS_DIR = path.resolve(__dirname, "../../Utils/Config/automodRacistWords");
const { loadAutomodScamConfig } = require("../../Utils/Moderation/automodScamConfig");
const AUTOMOD_SCAM_CONFIG = loadAutomodScamConfig();
const LINK_BLACKLIST_DOMAINS = AUTOMOD_SCAM_CONFIG.domains?.length ? AUTOMOD_SCAM_CONFIG.domains : ["dsc.gg"];
const KEYWORDS_PER_RULE = 1000;
const KEYWORD_MAX_LEN = 60;
const SYNC_DEBOUNCE_MS = 4000;
const MAX_EXEMPT_CHANNELS = 50;
const AUTOMOD_DEPLOY_CACHE_KEY = "discord-automod";
let syncTimer = null;
let lastSyncSignature = "";

function readAutomodConfig() {
  try {
    if (!fs.existsSync(AUTOMOD_CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(AUTOMOD_CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function isDiscordNativeConfigEnabled() {
  const cfg = readAutomodConfig();
  const dn = cfg?.discordNative || {};
  if (typeof dn.enabled === "boolean") return dn.enabled;
  return true;
}

function shouldSyncOnStartup() {
  const cfg = readAutomodConfig();
  const dn = cfg?.discordNative || {};
  if (typeof dn.syncOnStartup === "boolean") return dn.syncOnStartup;
  return true;
}

function parseWordArrayFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x || "").trim().toLowerCase())
      .filter((x) => x.length >= 2);
  } catch {
    return [];
  }
}

function loadSlursPresetAllowList() {
  const cfg = readAutomodConfig();
  const fromCfg = cfg?.discordNative?.slursPresetAllowList;
  const merged = new Set();
  if (Array.isArray(fromCfg)) {
    for (const raw of fromCfg) {
      const word = String(raw || "").trim().toLowerCase();
      if (word.length >= 2 && word.length <= KEYWORD_MAX_LEN) merged.add(word);
    }
  }
  return [...merged].map((w) => normalizeDiscordKeyword(w, { allowWildcard: false })).filter(Boolean);
}

function loadCustomWordsAllowList() {
  const cfg = readAutomodConfig();
  const fromCfg = cfg?.discordNative?.customWordsAllowList;
  const merged = new Set();
  if (Array.isArray(fromCfg)) {
    for (const raw of fromCfg) {
      const word = String(raw || "").trim().toLowerCase();
      if (word.length >= 2 && word.length <= KEYWORD_MAX_LEN) merged.add(word);
    }
  }
  return [...merged].map((w) => normalizeDiscordKeyword(w, { allowWildcard: false })).filter(Boolean);
}

function isSlursPresetEnabled() {
  const cfg = readAutomodConfig();
  if (cfg?.heatFilters?.slursPreset === false) return false;
  if (cfg?.heatFilters?.wordBlacklist === false) return false;
  return true;
}

function loadCustomWordsForDiscord() {
  const all = new Set(parseWordArrayFile(RACIST_WORDS_FILE));
  try {
    if (fs.existsSync(RACIST_WORDS_DIR)) {
      const entries = fs
        .readdirSync(RACIST_WORDS_DIR, { withFileTypes: true })
        .filter(
          (e) =>
            e.isFile() &&
            e.name.toLowerCase().endsWith(".json") &&
            e.name.toLowerCase() !== "sources.json",
        )
        .map((e) => path.join(RACIST_WORDS_DIR, e.name));
      for (const file of entries) {
        for (const word of parseWordArrayFile(file)) all.add(word);
      }
    }
  } catch (_) {}
  return [...all];
}

function normalizeDiscordKeyword(raw, options = {}) {
  let term = String(raw || "").trim().toLowerCase();
  if (!term) return "";
  if (term.length > KEYWORD_MAX_LEN) term = term.slice(0, KEYWORD_MAX_LEN);
  if (term.includes(" ")) return term;
  if (term.startsWith("*") && term.endsWith("*")) return term;
  const cfg = readAutomodConfig();
  const wildcardTerms = new Set(
    (Array.isArray(cfg?.discordNative?.keywordWildcardTerms) ? cfg.discordNative.keywordWildcardTerms : [])
      .map((w) => String(w || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (options.allowWildcard === true || wildcardTerms.has(term)) return `*${term}*`;
  return term;
}

function chunkKeywords(words) {
  const chunks = [];
  let current = [];
  for (const raw of words) {
    const keyword = normalizeDiscordKeyword(raw);
    if (!keyword) continue;
    if (current.length >= KEYWORDS_PER_RULE) {
      chunks.push(current);
      current = [];
    }
    current.push(keyword);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function collectExemptEntityIds(collectionOrArray) {
  const out = [];
  if (!collectionOrArray) return out;
  if (typeof collectionOrArray.keys === "function") {
    for (const key of collectionOrArray.keys()) {
      const id = String(key || "").trim();
      if (/^\d{16,20}$/.test(id)) out.push(id);
    }
    return out;
  }
  const values = Array.isArray(collectionOrArray) ? collectionOrArray : [];
  for (const entry of values) {
    if (entry == null) continue;
    const id = entry?.id ?? entry;
    const key = String(id || "").trim();
    if (/^\d{16,20}$/.test(key)) out.push(key);
  }
  return out;
}

function filterGuildSnowflakeIds(guild, ids, kind = "channel") {
  const cache = kind === "role" ? guild?.roles?.cache : guild?.channels?.cache;
  if (!cache) return [];
  return (Array.isArray(ids) ? ids : []).filter((id) => cache.has(String(id)));
}

function collectExemptRoleIds(guild) {
  const staffRoleId = String(IDs.roles?.Staff || "").trim();
  if (!staffRoleId || !guild?.roles?.cache?.has(staffRoleId)) return [];
  return [staffRoleId];
}

function collectTicketAutomodExemptChannelIds(guild) {
  const ids = new Set();
  if (!guild?.channels?.cache) return ids;
  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildCategory && isTicketCategoryName(channel.name)) {
      ids.add(String(channel.id));
    }
  }
  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildCategory) continue;
    if (isChannelInTicketCategory(channel) || isTicketChannelName(channel.name)) {
      ids.add(String(channel.id));
    }
  }
  return ids;
}

function isStaffAutomodExemptChannel(channel, staffChatId, staffCmdsId) {
  if (!channel) return false;
  const id = String(channel.id || "");
  if (staffChatId && id === staffChatId) return true;
  if (staffCmdsId && id === staffCmdsId) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const parent = String(channel.parentId || "");
    if (staffChatId && parent === staffChatId) return true;
    if (staffCmdsId && parent === staffCmdsId) return true;
  }
  return false;
}

function collectStaffAutomodExemptChannelIds(guild) {
  const staffChatId = String(IDs.channels?.staffChat || "").trim();
  const staffCmdsId = String(IDs.channels?.staffCmds || "").trim();
  const ids = new Set();
  if (staffChatId) ids.add(staffChatId);
  if (staffCmdsId) ids.add(staffCmdsId);
  if (!guild?.channels?.cache) return [...ids];
  for (const channel of guild.channels.cache.values()) {
    if (isStaffAutomodExemptChannel(channel, staffChatId, staffCmdsId)) {
      ids.add(String(channel.id));
    }
  }
  return [...ids];
}

function prioritizeAutomodExemptChannelIds(guild, ids) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((id) => /^\d{16,20}$/.test(id)))];
  const existing = filterGuildSnowflakeIds(guild, unique, "channel");
  if (existing.length <= MAX_EXEMPT_CHANNELS) return existing;
  const staffChatId = String(IDs.channels?.staffChat || "").trim();
  const staffCmdsId = String(IDs.channels?.staffCmds || "").trim();
  const staffZone = [];
  const ticketCategories = [];
  const ticketChannels = [];
  for (const id of existing) {
    const channel = guild.channels.cache.get(id);
    if (isStaffAutomodExemptChannel(channel, staffChatId, staffCmdsId)) {
      staffZone.push(id);
      continue;
    }
    if (channel.type === ChannelType.GuildCategory && isTicketCategoryName(channel.name)) {
      ticketCategories.push(id);
      continue;
    }
    if (isChannelInTicketCategory(channel) || isTicketChannelName(channel.name)) {
      ticketChannels.push(id);
    }
  }
  const out = [];
  const push = (list) => {
    for (const id of list) {
      if (out.length >= MAX_EXEMPT_CHANNELS) return;
      out.push(id);
    }
  };
  push(staffZone);
  push(ticketCategories);
  push(ticketChannels);
  global.logger?.warn?.(
    `[discordAutomod] exempt channels trimmed ${existing.length} -> ${out.length}`,
  );
  return out;
}

function collectExemptChannelIds(guild) {
  if (!guild?.channels?.cache) return [];
  return prioritizeAutomodExemptChannelIds(guild, [
    ...collectTicketAutomodExemptChannelIds(guild),
    ...collectStaffAutomodExemptChannelIds(guild),
  ]);
}

function shouldResyncAutomodForChannel(channel) {
  if (!channel?.guild) return false;
  const staffChatId = String(IDs.channels?.staffChat || "").trim();
  const staffCmdsId = String(IDs.channels?.staffCmds || "").trim();
  if (isStaffAutomodExemptChannel(channel, staffChatId, staffCmdsId)) return true;
  if (channel.type === ChannelType.GuildCategory) return isTicketCategoryName(channel.name);
  return isChannelInTicketCategory(channel) || isTicketChannelName(channel.name);
}

function buildBlockActions(alertChannelId, guild) {
  const actions = [
    {
      type: AutoModerationActionType.BlockMessage,
      metadata: {
        customMessage: "Messaggio bloccato da AutoMod (Vinili & Caffè).",
      },
    },
  ];
  const alertId = String(alertChannelId || AUTOMOD_ALERT_CHANNEL_ID || "").trim();
  const alertChannel =
    alertId && guild?.channels?.cache?.get(alertId)
      ? guild.channels.cache.get(alertId)
      : null;
  const alertOk =
    alertChannel?.isTextBased?.() &&
    alertChannel
      .permissionsFor(guild?.members?.me)
      ?.has(PermissionsBitField.Flags.ViewChannel);
  if (alertId && alertOk) {
    actions.push({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: alertId },
    });
  }
  return actions;
}

function buildDesiredRuleSpecs(options = {}) {
  const guild = options.guild || null;
  const alertChannelId = options.alertChannelId || AUTOMOD_ALERT_CHANNEL_ID;
  const actions = buildBlockActions(alertChannelId, guild);
  const specs = [];
  if (readAutomodConfig()?.heatFilters?.inviteLinks !== false) {
    specs.push({
      name: `${RULE_PREFIX}invite-links`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: [
          "discord.gg/",
          "discord.com/invite",
          "discordapp.com/invite",
          "*discord.gg*",
        ],
      },
      actions,
      enabled: true,
      violationKey: "invite",
    });
  }
  const domains = LINK_BLACKLIST_DOMAINS.map((d) => normalizeDiscordKeyword(d)).filter(Boolean);
  if (domains.length && readAutomodConfig()?.heatFilters?.linkBlacklist !== false) {
    specs.push({
      name: `${RULE_PREFIX}link-blacklist`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: domains },
      actions,
      enabled: true,
      violationKey: "link_blacklist",
    });
  }
  const scamKeywords = (AUTOMOD_SCAM_CONFIG.discordKeywords || [])
    .map((raw) => normalizeDiscordKeyword(raw, { allowWildcard: String(raw || "").includes("*") }))
    .filter(Boolean);
  if (scamKeywords.length && readAutomodConfig()?.heatFilters?.maliciousLinks !== false) {
    specs.push({
      name: `${RULE_PREFIX}scam-crypto-keywords`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: scamKeywords },
      actions,
      enabled: true,
      violationKey: "scam_pattern",
    });
  }
  const words = loadCustomWordsForDiscord();
  const wordChunks = chunkKeywords(words);
  const customWordsAllowList = loadCustomWordsAllowList();
  wordChunks.forEach((keywords, index) => {
    if (!keywords.length) return;
    if (readAutomodConfig()?.heatFilters?.wordBlacklist === false) return;
    specs.push({
      name: `${RULE_PREFIX}custom-words${wordChunks.length > 1 ? `-${index + 1}` : ""}`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: keywords,
        ...(customWordsAllowList.length ? { allowList: customWordsAllowList } : {}),
      },
      actions,
      enabled: true,
      violationKey: "word_blacklist",
    });
  });
  if (isSlursPresetEnabled()) {
    const allowList = loadSlursPresetAllowList();
    specs.push({
      name: `${RULE_PREFIX}slurs-preset`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.KeywordPreset,
      triggerMetadata: {
        presets: [AutoModerationRuleKeywordPresetType.Slurs],
        ...(allowList.length ? { allowList } : {}),
      },
      actions,
      enabled: true,
      violationKey: "word_blacklist",
    });
  }
  if (readAutomodConfig()?.heatFilters?.mentions !== false) {
    const lockdown = readAutomodConfig()?.autoLockdown || {};
    const mentionPerMessage = Number(
      lockdown.mentionPerMessageLimit ?? lockdown.mentionTotalLimit ?? 5,
    );
    specs.push({
      name: `${RULE_PREFIX}mention-spam`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: {
        mentionTotalLimit: Math.max(1, Math.min(50, mentionPerMessage)),
        mentionRaidProtectionEnabled: true,
      },
      actions,
      enabled: true,
      violationKey: "mention_hour_cap",
    });
    specs.push({
      name: `${RULE_PREFIX}everyone-here`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: ["@everyone", "@here"] },
      actions,
      enabled: true,
      violationKey: "mention_everyone",
    });
  }
  return specs;
}

function stableSerialize(value) {
  return JSON.stringify(value);
}

function normalizeActionMetadata(meta) {
  const raw = meta?.toJSON?.() || meta || {};
  const out = {};
  if (raw.customMessage != null) out.customMessage = String(raw.customMessage);
  if (raw.custom_message != null) out.customMessage = String(raw.custom_message);
  const channelRef = raw.channel ?? raw.channelId ?? raw.channel_id;
  if (channelRef != null) out.channel = String(channelRef);
  return out;
}

function normalizeTriggerMetadata(meta, triggerType) {
  const raw = meta?.toJSON?.() || meta || {};
  const out = { ...raw };
  if (Array.isArray(raw.keywordFilter)) {
    out.keywordFilter = [...raw.keywordFilter].map(String).sort();
  }
  if (Array.isArray(raw.presets)) {
    out.presets = [...raw.presets].map((p) => Number(p)).filter(Number.isFinite).sort();
  }
  if (Array.isArray(raw.allowList)) {
    out.allowList = [...raw.allowList].map(String).sort();
  }
  if (Number(triggerType) === Number(AutoModerationRuleTriggerType.MentionSpam)) {
    if (raw.mentionTotalLimit != null) {
      out.mentionTotalLimit = Number(raw.mentionTotalLimit);
    }
    out.mentionRaidProtectionEnabled = Boolean(
      raw.mentionRaidProtectionEnabled ?? raw.mention_raid_protection_enabled,
    );
  }
  return out;
}

function findRulesByTriggerType(allRules, triggerType) {
  const tt = Number(triggerType);
  return (Array.isArray(allRules) ? allRules : []).filter(
    (r) => Number(r?.triggerType) === tt,
  );
}

function resolveExistingRuleForSpec(allRules, spec) {
  const name = String(spec?.name || "");
  const byName = (Array.isArray(allRules) ? allRules : []).find(
    (r) => String(r?.name || "") === name,
  );
  if (byName) return byName;

  const triggerType = Number(spec?.triggerType);
  if (triggerType === Number(AutoModerationRuleTriggerType.MentionSpam)) {
    const mentionRules = findRulesByTriggerType(allRules, triggerType);
    if (!mentionRules.length) return null;
    return (
      mentionRules.find((r) => String(r?.name || "").startsWith(RULE_PREFIX)) ||
      mentionRules[0]
    );
  }

  if (triggerType === Number(AutoModerationRuleTriggerType.KeywordPreset)) {
    const presetRules = findRulesByTriggerType(allRules, triggerType);
    if (!presetRules.length) return null;
    return (
      presetRules.find((r) => String(r?.name || "").startsWith(RULE_PREFIX)) ||
      presetRules[0]
    );
  }

  return null;
}

function serializeSpecForSignature(spec) {
  return {
    name: String(spec?.name || ""),
    eventType: Number(spec?.eventType),
    triggerType: Number(spec?.triggerType),
    triggerMetadata: normalizeTriggerMetadata(spec?.triggerMetadata, spec?.triggerType),
    actions: (spec?.actions || []).map((a) => ({
      type: Number(a.type),
      metadata: normalizeActionMetadata(a.metadata),
    })),
    enabled: Boolean(spec?.enabled),
  };
}

function buildAutomodDesiredSignaturePayload(guild, options = {}) {
  const exemptChannels = [...collectExemptChannelIds(guild)].sort();
  const exemptRoles = [...filterGuildSnowflakeIds(guild, collectExemptRoleIds(guild), "role")].sort();
  const specs = buildDesiredRuleSpecs({ ...options, guild });
  return {
    exemptChannels,
    exemptRoles,
    specs: specs.map(serializeSpecForSignature),
  };
}

function allAutomodSpecsPresent(allRules, specs) {
  const desiredNames = new Set(specs.map((s) => String(s.name)));
  for (const spec of specs) {
    if (!resolveExistingRuleForSpec(allRules, spec)) return false;
  }
  for (const rule of allRules) {
    if (!String(rule?.name || "").startsWith(RULE_PREFIX)) continue;
    if (!desiredNames.has(String(rule.name))) return false;
  }
  return true;
}

function rulePayloadMatches(rule, spec, exemptChannels, exemptRoles) {
  const meta = normalizeTriggerMetadata(
    rule.triggerMetadata,
    rule.triggerType,
  );
  const specMeta = normalizeTriggerMetadata(
    spec.triggerMetadata,
    spec.triggerType,
  );
  const actions = (rule.actions || []).map((a) => ({
    type: Number(a.type),
    metadata: normalizeActionMetadata(a.metadata),
  }));
  const specActions = (spec.actions || []).map((a) => ({
    type: Number(a.type),
    metadata: normalizeActionMetadata(a.metadata),
  }));
  const exemptCh = [...collectExemptEntityIds(rule.exemptChannels)].sort();
  const exemptRo = [...collectExemptEntityIds(rule.exemptRoles)].sort();
  return (
    String(rule.name) === String(spec.name) &&
    Number(rule.eventType) === Number(spec.eventType) &&
    Number(rule.triggerType) === Number(spec.triggerType) &&
    Boolean(rule.enabled) === Boolean(spec.enabled) &&
    stableSerialize(meta) === stableSerialize(specMeta) &&
    stableSerialize(actions) === stableSerialize(specActions) &&
    stableSerialize(exemptCh) === stableSerialize([...exemptChannels].sort()) &&
    stableSerialize(exemptRo) === stableSerialize([...exemptRoles].sort())
  );
}

async function syncGuildDiscordAutomodRules(guild, options = {}) {
  const guildId = String(guild?.id || "");
  if (!guildId) return { ok: false, reason: "no_guild" };
  try {
  const me = guild.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    return { ok: false, reason: "missing_manage_guild" };
  }
  const nativeEnabled = options.forceEnabled ?? isDiscordNativeConfigEnabled();
  const existing = await guild.autoModerationRules.fetch().catch(() => null);
  const allRules = existing ? [...existing.values()] : [];
  const managed = allRules.filter((r) => String(r?.name || "").startsWith(RULE_PREFIX));
  if (!nativeEnabled) {
    for (const rule of managed) {
      await rule.delete("Vinili AutoMod: native layer disabled").catch(() => null);
    }
    return { ok: true, removed: managed.length, created: 0, updated: 0 };
  }
  if (!me) {
    await guild.members.fetchMe().catch(() => null);
  }
  await guild.channels.fetch().catch(() => null);
  const exemptChannels = collectExemptChannelIds(guild);
  const exemptRoles = filterGuildSnowflakeIds(guild, collectExemptRoleIds(guild), "role");
  const specs = buildDesiredRuleSpecs({ ...options, guild });
  const signaturePayload = buildAutomodDesiredSignaturePayload(guild, options);
  const forceSync = options.force === true;
  const { isCommandDeployRequired, markCommandDeployComplete } = require("../../../shared/runtime/commandDeployCache");
  const deployCheck = isCommandDeployRequired(
    AUTOMOD_DEPLOY_CACHE_KEY,
    { guildId },
    signaturePayload,
  );
  if (!forceSync && !deployCheck.required && allAutomodSpecsPresent(allRules, specs)) {
    return {
      ok: true,
      skipped: true,
      guildId,
      total: specs.length,
      satisfied: specs.length,
      managed: managed.length,
      created: 0,
      updated: 0,
      removed: 0,
      failed: [],
    };
  }
  const desiredNames = new Set(specs.map((s) => s.name));
  let removed = 0;
  let created = 0;
  let updated = 0;
  const failed = [];
  for (const rule of managed) {
    if (!desiredNames.has(String(rule.name))) {
      const ok = await rule.delete("Vinili AutoMod: rule spec removed").catch(() => null);
      if (ok) removed += 1;
    }
  }
  for (const spec of specs) {
    const found = resolveExistingRuleForSpec(allRules, spec);
    const payload = {
      name: spec.name,
      eventType: spec.eventType,
      triggerType: spec.triggerType,
      triggerMetadata: spec.triggerMetadata,
      actions: spec.actions,
      enabled: spec.enabled,
      exemptChannels,
      exemptRoles,
      reason: "Vinili AutoMod sync",
    };
    if (!found) {
      let createdRule = await guild.autoModerationRules.create(payload).catch(() => null);
      if (!createdRule && payload.actions.length > 1) {
        const blockOnly = payload.actions.filter(
          (a) => Number(a.type) === Number(AutoModerationActionType.BlockMessage),
        );
        createdRule = await guild.autoModerationRules
          .create({ ...payload, actions: blockOnly })
          .catch(() => null);
      }
      if (!createdRule) {
        const adopted = resolveExistingRuleForSpec(
          await guild.autoModerationRules.fetch().then((c) => [...c.values()]).catch(() => []),
          spec,
        );
        if (adopted) {
          const edited = await adopted.edit({
            name: payload.name,
            eventType: payload.eventType,
            triggerType: payload.triggerType,
            triggerMetadata: payload.triggerMetadata,
            actions: payload.actions,
            enabled: payload.enabled,
            exemptChannels: payload.exemptChannels,
            exemptRoles: payload.exemptRoles,
            reason: `${payload.reason} (adopted existing rule)`,
          }).catch((err) => {
            failed.push({ name: spec.name, error: err?.message || String(err) });
            return null;
          });
          if (edited) updated += 1;
          continue;
        }
        failed.push({
          name: spec.name,
          error: "create_failed",
        });
      } else {
        created += 1;
      }
      continue;
    }
    if (rulePayloadMatches(found, spec, exemptChannels, exemptRoles)) continue;
    const edited = await found
      .edit({
        name: payload.name,
        eventType: payload.eventType,
        triggerType: payload.triggerType,
        triggerMetadata: payload.triggerMetadata,
        actions: payload.actions,
        enabled: payload.enabled,
        exemptChannels: payload.exemptChannels,
        exemptRoles: payload.exemptRoles,
        reason: payload.reason,
      })
      .catch((err) => {
        failed.push({ name: spec.name, error: err?.message || String(err) });
        return null;
      });
    if (edited) updated += 1;
  }
  const refreshed = await guild.autoModerationRules.fetch().catch(() => null);
  const allRulesAfter = refreshed ? [...refreshed.values()] : allRules;
  const managedAfter = allRulesAfter.filter((r) =>
    String(r?.name || "").startsWith(RULE_PREFIX),
  );
  const managedCount = managedAfter.length;
  const specsSatisfied = specs.filter((spec) =>
    resolveExistingRuleForSpec(allRulesAfter, spec),
  ).length;
  if (failed.length) {
    const seen = new Set();
    for (const row of failed) {
      const key = `${row?.name}:${row?.error}`;
      if (seen.has(key)) continue;
      seen.add(key);
      global.logger?.warn?.(
        "[discordAutomod] rule error:",
        row?.name || "?",
        row?.error || "unknown",
      );
    }
  }
  const ok = failed.length === 0 && specsSatisfied >= specs.length;
  if (ok) {
    markCommandDeployComplete(AUTOMOD_DEPLOY_CACHE_KEY, { guildId }, deployCheck.hash);
  }
  return {
    ok,
    removed,
    created,
    updated,
    failed,
    total: specs.length,
    managed: managedCount,
    satisfied: specsSatisfied,
    reason:
      !ok && specsSatisfied < specs.length
        ? "incomplete_rules"
        : failed.length
          ? "create_or_edit_errors"
          : undefined,
  };
  } catch (err) {
    return {
      ok: false,
      guildId,
      reason: err?.message || String(err),
    };
  }
}

function resolveSyncGuildIds(client) {
  const mainId = String(ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  if (!mainId) return [];
  if (client?.guilds?.cache?.has(mainId)) return [mainId];
  return [mainId];
}

async function syncDiscordAutomodRulesForClient(client, options = {}) {
  if (!client?.guilds) return { ok: false, reason: "no_client" };
  if (!isDiscordNativeConfigEnabled() && !options.forceEnabled) {
    const results = [];
    for (const guildId of resolveSyncGuildIds(client)) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      results.push(await syncGuildDiscordAutomodRules(guild, { forceEnabled: false }));
    }
    return { ok: true, results };
  }
  const results = [];
  for (const guildId of resolveSyncGuildIds(client)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      results.push({ ok: false, guildId, reason: "guild_not_cached" });
      continue;
    }
    const row = await syncGuildDiscordAutomodRules(guild, options);
    results.push({ guildId, ...row });
  }
  const signature = JSON.stringify(results);
  lastSyncSignature = signature;
  return { ok: true, results, signature };
}

function scheduleDiscordAutomodRulesResync(client, options = {}) {
  if (!client) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncDiscordAutomodRulesForClient(client, options).catch((err) => {
      global.logger?.warn?.("[discordAutomod] sync:", err?.message || err);
    });
  }, SYNC_DEBOUNCE_MS);
  syncTimer.unref?.();
}

async function resolveAutomodExecutionRule(execution) {
  if (!execution) return null;
  const cached = execution.autoModerationRule || execution.rule || null;
  if (cached?.name) return cached;
  const guild = execution.guild;
  const ruleId = String(execution.ruleId || cached?.id || "");
  if (!guild || !ruleId) return null;
  try {
    return (
      guild.autoModerationRules.cache.get(ruleId) ||
      (await guild.autoModerationRules.fetch(ruleId))
    );
  } catch {
    return null;
  }
}

function mapRuleNameToViolationKey(ruleName, matchedKeyword = "") {
  const name = String(ruleName || "");
  const matched = String(matchedKeyword || "").toLowerCase();
  if (name.includes("invite-links")) {
    return {
      key: "invite",
      info: matched || "discord invite (native)",
    };
  }
  if (name.includes("link-blacklist")) {
    return {
      key: "link_blacklist",
      info: matched || "blacklisted domain (native)",
    };
  }
  if (name.includes("custom-words") || name.includes("slurs-preset")) {
    return {
      key: "word_blacklist",
      info: matched ? `native keyword (${matched})` : "word blacklist (native)",
    };
  }
  if (name.includes("everyone-here")) {
    return {
      key: "mention_everyone",
      info: matched || "@everyone/@here (native)",
    };
  }
  if (name.includes("mention-spam")) {
    return {
      key: "mention_hour_cap",
      info: "mention spam (native)",
    };
  }
  return { key: "word_blacklist", info: matched || "native automod" };
}

module.exports = { RULE_PREFIX, isDiscordNativeConfigEnabled, shouldSyncOnStartup, buildDesiredRuleSpecs, collectExemptChannelIds, collectTicketAutomodExemptChannelIds, shouldResyncAutomodForChannel, syncGuildDiscordAutomodRules, syncDiscordAutomodRulesForClient, scheduleDiscordAutomodRulesResync, resolveAutomodExecutionRule, mapRuleNameToViolationKey };
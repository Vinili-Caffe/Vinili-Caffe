const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  PermissionsBitField,
} = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ACTIVITY_MAIN_GUILD_ID } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const {
  readAutomodConfig,
  isDiscordNativeConfigEnabled,
  normalizeDiscordKeyword,
  chunkKeywords,
  loadCustomWordsForDiscord,
  loadSlursPresetAllowList,
  loadCustomWordsAllowList,
  isSlursPresetEnabled,
  LINK_BLACKLIST_DOMAINS,
  AUTOMOD_SCAM_CONFIG,
} = require("./discordAutomodKeywords") as typeof import("./discordAutomodKeywords");
const {
  applyAutomodRuleWithExemptRepair,
  filterGuildSnowflakeIds,
  collectExemptRoleIds,
  collectExemptEntityIds,
  resolveExemptChannelsForSpec,
} = require("./discordAutomodExemptCollect") as typeof import("./discordAutomodExemptCollect");

const RULE_PREFIX = "[VC] ";
const AUTOMOD_ALERT_CHANNEL_ID = String(IDs.channels?.sanzioniUtenti || "1442569245878648924");
const SYNC_DEBOUNCE_MS = 4000;
const AUTOMOD_DEPLOY_CACHE_KEY = "discord-automod";
let syncTimer = null;

function buildBlockActions(alertChannelId?, guild?) {
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
    actions.push(({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: alertId },
    } as any));
  }
  return actions;
}

function buildDesiredRuleSpecs(options: Record<string, any> = {}) {
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
  const domains = LINK_BLACKLIST_DOMAINS.map((d?) => normalizeDiscordKeyword(d)).filter(Boolean);
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
    .map((raw?) => normalizeDiscordKeyword(raw, { allowWildcard: String(raw || "").includes("*") }))
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
  wordChunks.forEach((keywords?, index?) => {
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

function stableSerialize(value?) {
  return JSON.stringify(value);
}

function normalizeActionMetadata(meta?) {
  const raw = meta?.toJSON?.() || meta || {};
  const out: Record<string, any> = {};
  if (raw.customMessage != null) out.customMessage = String(raw.customMessage);
  if (raw.custom_message != null) out.customMessage = String(raw.custom_message);
  const channelRef = raw.channel ?? raw.channelId ?? raw.channel_id;
  if (channelRef != null) out.channel = String(channelRef);
  return out;
}

function normalizeTriggerMetadata(meta?, triggerType?) {
  const raw = meta?.toJSON?.() || meta || {};
  const out = { ...raw };
  if (Array.isArray(raw.keywordFilter)) {
    out.keywordFilter = [...raw.keywordFilter].map(String).sort();
  }
  if (Array.isArray(raw.presets)) {
    out.presets = [...raw.presets].map((p?) => Number(p)).filter(Number.isFinite).sort();
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

function findRulesByTriggerType(allRules?, triggerType?) {
  const tt = Number(triggerType);
  return (Array.isArray(allRules) ? allRules : []).filter(
    (r?) => Number(r?.triggerType) === tt,
  );
}

function resolveExistingRuleForSpec(allRules?, spec?) {
  const name = String(spec?.name || "");
  const byName = (Array.isArray(allRules) ? allRules : []).find(
    (r?) => String(r?.name || "") === name,
  );
  if (byName) return byName;

  const triggerType = Number(spec?.triggerType);
  if (triggerType === Number(AutoModerationRuleTriggerType.MentionSpam)) {
    const mentionRules = findRulesByTriggerType(allRules, triggerType);
    if (!mentionRules.length) return null;
    return (
      mentionRules.find((r?) => String(r?.name || "").startsWith(RULE_PREFIX)) ||
      mentionRules[0]
    );
  }

  if (triggerType === Number(AutoModerationRuleTriggerType.KeywordPreset)) {
    const presetRules = findRulesByTriggerType(allRules, triggerType);
    if (!presetRules.length) return null;
    return (
      presetRules.find((r?) => String(r?.name || "").startsWith(RULE_PREFIX)) ||
      presetRules[0]
    );
  }

  return null;
}

function serializeSpecForSignature(spec?) {
  return {
    name: String(spec?.name || ""),
    eventType: Number(spec?.eventType),
    triggerType: Number(spec?.triggerType),
    triggerMetadata: normalizeTriggerMetadata(spec?.triggerMetadata, spec?.triggerType),
    actions: (spec?.actions || []).map((a?) => ({
      type: Number(a.type),
      metadata: normalizeActionMetadata(a.metadata),
    })),
    enabled: Boolean(spec?.enabled),
  };
}

function buildAutomodDesiredSignaturePayload(guild?, options: Record<string, any> = {}) {
  const exemptRoles = [...filterGuildSnowflakeIds(guild, collectExemptRoleIds(guild), "role")].sort();
  const specs = buildDesiredRuleSpecs({ ...options, guild });
  return {
    exemptRoles,
    specs: specs.map((spec?) => ({
      ...serializeSpecForSignature(spec),
      exemptChannels: [...resolveExemptChannelsForSpec(guild, spec)].sort(),
    })),
  };
}

function allAutomodSpecsPresent(allRules?, specs?) {
  const desiredNames = new Set(specs.map((s?) => String(s.name)));
  for (const spec of specs) {
    if (!resolveExistingRuleForSpec(allRules, spec)) return false;
  }
  for (const rule of allRules) {
    if (!String(rule?.name || "").startsWith(RULE_PREFIX)) continue;
    if (!desiredNames.has(String(rule.name))) return false;
  }
  return true;
}

function rulePayloadMatches(rule?, spec?, exemptChannels?, exemptRoles?) {
  const meta = normalizeTriggerMetadata(
    rule.triggerMetadata,
    rule.triggerType,
  );
  const specMeta = normalizeTriggerMetadata(
    spec.triggerMetadata,
    spec.triggerType,
  );
  const actions = (rule.actions || []).map((a?) => ({
    type: Number(a.type),
    metadata: normalizeActionMetadata(a.metadata),
  }));
  const specActions = (spec.actions || []).map((a?) => ({
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

async function syncGuildDiscordAutomodRules(guild?, options: Record<string, any> = {}) {
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
  const managed = allRules.filter((r?) => String(r?.name || "").startsWith(RULE_PREFIX));
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
  const exemptRoles = filterGuildSnowflakeIds(guild, collectExemptRoleIds(guild), "role");
  const specs = buildDesiredRuleSpecs({ ...options, guild });
  const signaturePayload = buildAutomodDesiredSignaturePayload(guild, options);
  const forceSync = options.force === true;
  const { isCommandDeployRequired, markCommandDeployComplete } = require("../../../shared/runtime/commandDeployCache") as typeof import("../../../shared/runtime/commandDeployCache");
  const deployCheck = isCommandDeployRequired(
    AUTOMOD_DEPLOY_CACHE_KEY,
    { guildId },
    signaturePayload,
  );
  if (!forceSync && !deployCheck.required && allAutomodSpecsPresent(allRules, specs)) {
    /* still verify per-rule ticket exemptions match hate-only intent */
    let exemptionsMatch = true;
    for (const spec of specs) {
      const found = resolveExistingRuleForSpec(allRules, spec);
      if (!found) {
        exemptionsMatch = false;
        break;
      }
      const want = [...resolveExemptChannelsForSpec(guild, spec)].sort();
      const have = [...collectExemptEntityIds(found.exemptChannels)].sort();
      if (stableSerialize(want) !== stableSerialize(have)) {
        exemptionsMatch = false;
        break;
      }
    }
    if (exemptionsMatch) {
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
  }
  const desiredNames = new Set(specs.map((s?) => s.name));
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
    const exemptChannels = resolveExemptChannelsForSpec(guild, spec);
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
    const applyRuleEdit = async (target?, body?) =>
      applyAutomodRuleWithExemptRepair((next?) => target.edit(next), body, spec.name);
    const applyRuleCreate = async (body?) =>
      applyAutomodRuleWithExemptRepair(
        (next?) => guild.autoModerationRules.create(next),
        body,
        spec.name,
      );
    if (!found) {
      let createdRule = null;
      let createErr = null;
      try {
        createdRule = await applyRuleCreate(payload);
      } catch (err) {
        createErr = err;
      }
      if (!createdRule && payload.actions.length > 1) {
        const blockOnly = payload.actions.filter(
          (a?) => Number(a.type) === Number(AutoModerationActionType.BlockMessage),
        );
        try {
          createdRule = await applyRuleCreate({ ...payload, actions: blockOnly });
          createErr = null;
        } catch (err2) {
          createErr = err2;
        }
      }
      if (!createdRule) {
        const adopted = resolveExistingRuleForSpec(
          await guild.autoModerationRules.fetch().then((c?) => [...c.values()]).catch(() => []),
          spec,
        );
        if (adopted) {
          const edited = await applyRuleEdit(adopted, {
            name: payload.name,
            eventType: payload.eventType,
            triggerType: payload.triggerType,
            triggerMetadata: payload.triggerMetadata,
            actions: payload.actions,
            enabled: payload.enabled,
            exemptChannels: payload.exemptChannels,
            exemptRoles: payload.exemptRoles,
            reason: `${payload.reason} (adopted existing rule)`,
          }).catch((err?) => {
            failed.push({ name: spec.name, error: err?.message || String(err) });
            return null;
          });
          if (edited) updated += 1;
          continue;
        }
        failed.push({
          name: spec.name,
          error: createErr?.message || "create_failed",
        });
        continue;
      }
      created += 1;
      continue;
    }
    if (rulePayloadMatches(found, spec, exemptChannels, exemptRoles)) continue;
    const edited = await applyRuleEdit(found, {
      name: payload.name,
      eventType: payload.eventType,
      triggerType: payload.triggerType,
      triggerMetadata: payload.triggerMetadata,
      actions: payload.actions,
      enabled: payload.enabled,
      exemptChannels: payload.exemptChannels,
      exemptRoles: payload.exemptRoles,
      reason: payload.reason,
    }).catch((err?) => {
      failed.push({ name: spec.name, error: err?.message || String(err) });
      return null;
    });
    if (edited) updated += 1;
  }
  const refreshed = await guild.autoModerationRules.fetch().catch(() => null);
  const allRulesAfter = refreshed ? [...refreshed.values()] : allRules;
  const managedAfter = allRulesAfter.filter((r?) =>
    String(r?.name || "").startsWith(RULE_PREFIX),
  );
  const managedCount = managedAfter.length;
  const specsSatisfied = specs.filter((spec?) =>
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

function resolveSyncGuildIds(client?) {
  const mainId = String(ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  if (!mainId) return [];
  if (client?.guilds?.cache?.has(mainId)) return [mainId];
  return [mainId];
}

async function syncDiscordAutomodRulesForClient(client?, options: Record<string, any> = {}) {
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
  return { ok: true, results, signature };
}

function scheduleDiscordAutomodRulesResync(client?, options: Record<string, any> = {}) {
  if (!client) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncDiscordAutomodRulesForClient(client, options).catch((err?) => {
      global.logger?.warn?.("[discordAutomod] sync:", err?.message || err);
    });
  }, SYNC_DEBOUNCE_MS);
  syncTimer.unref?.();
}

async function resolveAutomodExecutionRule(execution?) {
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

function mapRuleNameToViolationKey(ruleName?, matchedKeyword = "") {
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

export = {
  RULE_PREFIX,
  syncDiscordAutomodRulesForClient,
  scheduleDiscordAutomodRulesResync,
  resolveAutomodExecutionRule,
  mapRuleNameToViolationKey,
};

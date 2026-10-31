const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const {
  getPartnershipConfigSync,
  refreshPartnershipConfigCache,
  isPartnershipSetupComplete,
  savePartnershipConfig,
  completePartnershipSetup,
  normalizePings,
  normalizeThankYouEmbed,
  normalizeLeaveAction,
  normalizeContentFilters,
} = require("../MultiGuild/core/tenantPartnershipSettings") as typeof import("../MultiGuild/core/tenantPartnershipSettings");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
const { resolvePartnershipConfigSync } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
const {
  parsePingMemberThresholdInput,
  parsePingDelayInput,
  formatPingDelayForInput,
  DEFAULT_CUSTOM_ROLE_PING_DELAY_MS,
} = require("../Utils/Partner/partnershipPingUtils") as typeof import("../Utils/Partner/partnershipPingUtils");
const { setTenantObjectiveFlag } = require("../MultiGuild/services/Partner/tenantObjectiveService") as typeof import("../MultiGuild/services/Partner/tenantObjectiveService");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const {
  ensureTenantPremiumCacheFresh,
  getTenantPremiumSync,
  serializePremiumPublic,
  isTenantPremiumActiveSync,
} = require("../MultiGuild/core/tenantPremium") as typeof import("../MultiGuild/core/tenantPremium");
const { defaultThankYouEmbedFieldsForGuild } = require("../Utils/Partner/partnershipThankYouEmbed") as typeof import("../Utils/Partner/partnershipThankYouEmbed");

const TEXT_CHANNEL_TYPES = new Set([0, 5]);
const VOICE_CHANNEL_TYPES = new Set([2, 13]);
const CATEGORY_TYPE = 4;

const REASON_MESSAGES = {
  protected_guild: "Questo server non può essere configurato da qui.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  invalid_channel: "Canale non valido.",
  invalid_role: "Ruolo non valido.",
  invalid_category: "Una o più categorie non sono valide.",
  empty_text: "Il testo non può essere vuoto.",
  too_long: "Testo troppo lungo (max 4000 caratteri).",
  same_as_badge_role: "Il ruolo manager non può coincidere con il badge.",
  same_as_manager_role: "Il ruolo badge non può coincidere con il manager.",
  missing_required: "Per completare il setup servono canale partnership e ruolo manager.",
  main_guild: "Il server principale non usa questa configurazione partnership.",
  bot_missing: "Il bot non è presente in questo server.",
  invalid_ping_threshold: "Soglia ping non valida (usa un numero ≥ 0 oppure lascia vuoto).",
  invalid_ping_delay: "Delay ping non valido (es. 5m, 1h, 0).",
  invalid_same_server_cooldown: "Rate limit non valido (es. 12h, 1d, oppure lascia vuoto).",
  custom_role_pair: "Ruolo custom e soglia membri devono essere impostati insieme.",
  invalid_blacklist_target: "Inserisci un ID server Discord valido oppure un invite.",
  self_blacklist: "Non puoi mettere in blacklist questo stesso server.",
  invalid_id: "ID server non valido.",
  premium_required:
    "Il messaggio di ringraziamento personalizzato richiede Vinili Premium.",
};

function reasonToMessage(reason?) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function serializePartnership(config?, guildId = null) {
  const cfg = config || {};
  const pings = cfg.pings || {};
  const embed = cfg.thankYouEmbed || {};
  const desc = cfg.partnerDesc || {};
  const defaults = defaultThankYouEmbedFieldsForGuild(guildId || cfg.guildId || null);
  return {
    partnershipsChannelId: cfg.partnershipsChannelId || null,
    logsChannelId: cfg.logsChannelId || null,
    pmCommandsChannelId: cfg.pmCommandsChannelId || null,
    pmCommandsCategoryIds: Array.isArray(cfg.pmCommandsCategoryIds) ? cfg.pmCommandsCategoryIds : [],
    partnerManagerRoleId: cfg.partnerManagerRoleId || null,
    managerBadgeRoleId: cfg.managerBadgeRoleId || null,
    skipManager: cfg.skipManager === true,
    manualPartnershipEnabled: cfg.manualPartnershipEnabled === true,
    managerLeaveAction: cfg.managerLeaveAction || null,
    sameServerCooldownMs: cfg.sameServerCooldownMs && cfg.sameServerCooldownMs > 0 ? cfg.sameServerCooldownMs : null,
    sameServerCooldownInput: (() => {
      const ms = cfg.sameServerCooldownMs;
      if (ms == null || !(ms > 0)) return "";
      try {
        return formatPingDelayForInput(ms);
      } catch {
        return "12h";
      }
    })(),
    setupCompleted: Boolean(
      cfg.legacy === true ||
        isPartnershipSetupComplete(cfg) ||
        (cfg.partnershipsChannelId && cfg.partnerManagerRoleId),
    ),
    setupCompletedAt: cfg.setupCompletedAt || null,
    invite: cfg.invite?.url
      ? { code: cfg.invite.code || null, url: cfg.invite.url, channelId: cfg.invite.channelId || null }
      : null,
    pings: {
      hereMembers: pings.hereMembers ?? null,
      everyoneMembers: pings.everyoneMembers ?? null,
      customRoleId: pings.customRoleId || null,
      customRoleMembers: pings.customRoleMembers ?? null,
      hereDelayMs: pings.hereDelayMs ?? null,
      everyoneDelayMs: pings.everyoneDelayMs ?? null,
      customRoleDelayMs: pings.customRoleDelayMs ?? null,
      hereDelayInput: (() => {
        if (pings.hereMembers == null && pings.hereDelayMs == null) return "";
        try {
          return formatPingDelayForInput(
            pings.hereDelayMs == null ? DEFAULT_CUSTOM_ROLE_PING_DELAY_MS : pings.hereDelayMs,
          );
        } catch {
          return pings.hereMembers != null ? "5m" : "";
        }
      })(),
      everyoneDelayInput: (() => {
        if (pings.everyoneMembers == null && pings.everyoneDelayMs == null) return "";
        try {
          return formatPingDelayForInput(
            pings.everyoneDelayMs == null ? DEFAULT_CUSTOM_ROLE_PING_DELAY_MS : pings.everyoneDelayMs,
          );
        } catch {
          return pings.everyoneMembers != null ? "5m" : "";
        }
      })(),
            customRoleDelayInput: (() => {
        const customActive = Boolean(pings.customRoleId && pings.customRoleMembers != null);
        if (!customActive && pings.customRoleDelayMs == null) return "";
        try {
          return formatPingDelayForInput(
            pings.customRoleDelayMs == null ? DEFAULT_CUSTOM_ROLE_PING_DELAY_MS : pings.customRoleDelayMs,
          );
        } catch {
          return customActive ? "5m" : "";
        }
      })(),
      configured: Boolean(pings.configured),
    },
    partnerDesc: {
      mode: desc.mode || null,
      channelId: desc.channelId || null,
      staticText: desc.staticText || null,
      configured: Boolean(desc.configured),
    },
    contentFilters: (() => {
      const f = normalizeContentFilters(cfg.contentFilters);
      return {
        stripMentions: f.stripMentions === true,
        stripMassMentions: f.stripMassMentions === true,
        stripNonInviteLinks: f.stripNonInviteLinks === true,
        stripCustomEmojis: f.stripCustomEmojis === true,
        stripInvisibleChars: f.stripInvisibleChars === true,
        stripSpoilers: f.stripSpoilers === true,
        stripExtraInvites: f.stripExtraInvites === true,
      };
    })(),
    thankYouEmbed: {
      enabled: embed.enabled === true,
      color: embed.color || null,
      authorIconUrl: embed.authorIconUrl || null,
      authorName: embed.authorName || null,
      title: embed.title || null,
      thumbnailUrl: embed.thumbnailUrl || null,
      description: embed.description || null,
      imageUrl: embed.imageUrl || null,
      footerText: embed.footerText || null,
      footerIconUrl: embed.footerIconUrl || null,
      timestampEnabled: embed.timestampEnabled !== false,
    },
    thankYouEmbedDefaults: {
      color: defaults.color || "",
      authorIconUrl: defaults.authorIconUrl || "",
      authorName: defaults.authorName || "",
      title: defaults.title || "",
      thumbnailUrl: defaults.thumbnailUrl || "",
      description: defaults.description || "",
      imageUrl: defaults.imageUrl || "",
      footerText: defaults.footerText || "",
      footerIconUrl: defaults.footerIconUrl || "",
      timestampEnabled: (defaults as any).timestampEnabled !== false,
    },
  };
}

async function resolveGuildOrFail(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  let guild = client?.guilds?.cache?.get(gid) || null;
  const needsHydrate =
    !guild ||
    guild.partial === true ||
    !guild.channels ||
    typeof guild.channels.fetch !== "function" ||
    !guild.roles ||
    typeof guild.roles.fetch !== "function";
  if (needsHydrate && typeof client?.guilds?.fetch === "function") {
    guild = (await client.guilds.fetch(gid).catch(() => null)) || guild;
  }
  if (!guild) return null;
  return guild;
}

async function listGuildPickerData(client?, guildId?, opts: Record<string, any> = {}) {
  const guild = await resolveGuildOrFail(client, guildId);
  if (!guild) return { textChannels: [], voiceChannels: [], categories: [], roles: [], emojis: [] };

      const force = opts.force === true;

  let channels = [];
  try {
    if (guild.channels?.cache?.size && !force) {
      channels = [...guild.channels.cache.values()];
    } else {
      if (force && guild.channels?.cache && typeof guild.channels.cache.clear === "function") {
        try {
          guild.channels.cache.clear();
        } catch (_) {}
      }
      const fetched = await guild.channels.fetch();
      channels = fetched && typeof fetched.values === "function" ? [...fetched.values()] : [];
      if (!channels.length && guild.channels?.cache?.size) {
        channels = [...guild.channels.cache.values()];
      }
    }
  } catch {
    channels = guild.channels?.cache?.size ? [...guild.channels.cache.values()] : [];
  }

  const channelPosition = (ch?) => {
    const raw = Number(ch?.rawPosition);
    if (Number.isFinite(raw)) return raw;
    const pos = Number(ch?.position);
    return Number.isFinite(pos) ? pos : 0;
  };
  const byDiscordOrder = (a?, b?) =>
    a.position - b.position || String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" });

  const textChannels = channels
    .filter((ch?) => TEXT_CHANNEL_TYPES.has(Number(ch?.type)))
    .map((ch?) => ({
      id: String(ch.id),
      name: String(ch.name || "canale"),
      parentId: ch.parentId ? String(ch.parentId) : null,
      kind: "text",
      position: channelPosition(ch),
    }))
    .sort(byDiscordOrder);

  const voiceChannels = channels
    .filter((ch?) => VOICE_CHANNEL_TYPES.has(Number(ch?.type)))
    .map((ch?) => ({
      id: String(ch.id),
      name: String(ch.name || "vocale"),
      parentId: ch.parentId ? String(ch.parentId) : null,
      kind: "voice",
      position: channelPosition(ch),
    }))
    .sort(byDiscordOrder);

  const categories = channels
    .filter((ch?) => Number(ch?.type) === CATEGORY_TYPE)
    .map((ch?) => ({
      id: String(ch.id),
      name: String(ch.name || "categoria"),
      position: channelPosition(ch),
    }))
    .sort(byDiscordOrder);

  let roles = [];
  try {
    let list = [];
    if (guild.roles?.cache?.size && !force) {
      list = [...guild.roles.cache.values()];
    } else {
      if (force && guild.roles?.cache && typeof guild.roles.cache.clear === "function") {
        try {
          guild.roles.cache.clear();
        } catch (_) {}
      }
      const roleCache = await guild.roles.fetch();
      list = roleCache && typeof roleCache.values === "function" ? [...roleCache.values()] : [];
      if (!list.length && guild.roles?.cache?.size) {
        list = [...guild.roles.cache.values()];
      }
    }
    roles = list
      .filter((r?) => r && String(r.id) !== String(guildId))
      .map((r?) => {
        let permissions = "0";
        try {
          permissions = String(r.permissions?.bitfield ?? r.permissions ?? 0n);
        } catch {
          permissions = "0";
        }
        let administrator = false;
        try {
          administrator = Boolean(r.permissions?.has?.(PermissionFlagsBits.Administrator));
          if (!administrator) {
            administrator = (BigInt(permissions) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
          }
        } catch {
          administrator = false;
        }
        return {
          id: String(r.id),
          name: String(r.name || "ruolo"),
          color: r.hexColor || null,
          position: Number(r.position) || 0,
          permissions,
          administrator,
          managed: Boolean(r.managed),
        };
      })
      .sort((a?, b?) => b.position - a.position || a.name.localeCompare(b.name, "it"));
  } catch {
    roles = [];
  }

  let emojis = [];
  try {
    let list = [];
    if (guild.emojis?.cache?.size && !force) {
      list = [...guild.emojis.cache.values()];
    } else if (typeof guild.emojis?.fetch === "function") {
      if (force && guild.emojis?.cache && typeof guild.emojis.cache.clear === "function") {
        try {
          guild.emojis.cache.clear();
        } catch (_) {}
      }
      const emojiCache = await guild.emojis.fetch();
      list = emojiCache && typeof emojiCache.values === "function" ? [...emojiCache.values()] : [];
      if (!list.length && guild.emojis?.cache?.size) {
        list = [...guild.emojis.cache.values()];
      }
    }

        if (!list.length) {
      const rest = client?.rest || client?._rest;
      if (rest && typeof rest.get === "function") {
        const { Routes } = require("discord.js") as typeof import("discord.js");
        const raw = await rest.get(Routes.guildEmojis(String(guildId))).catch(() => []);
        list = Array.isArray(raw) ? raw : [];
        if (guild.emojis?.cache?.set && list.length) {
          try {
            if (typeof guild.emojis.cache.clear === "function") guild.emojis.cache.clear();
          } catch (_) {}
          for (const e of list) {
            if (!e?.id) continue;
            const id = String(e.id);
            const animated = Boolean(e.animated);
            guild.emojis.cache.set(id, {
              id,
              name: String(e.name || "emoji"),
              animated,
              available: e.available !== false,
              imageURL: (options: Record<string, any> = {}) => {
                const size = Number(options?.size) || 48;
                const defaultExt = animated ? "gif" : "png";
                const ext =
                  String(options?.extension || defaultExt).replace(/^\./, "") || defaultExt;
                return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=${size}`;
              },
            });
          }
          list = [...guild.emojis.cache.values()];
        }
      }
    }

    emojis = list
      .filter((e?) => e && e.id && e.available !== false)
      .map((e?) => {
        const animated = Boolean(e.animated);
        const id = String(e.id);
        const name = String(e.name || "emoji");
                const ext = animated ? "gif" : "png";
        let url = null;
        try {
          url =
            typeof e.imageURL === "function"
              ? e.imageURL({ size: 48, extension: ext })
              : null;
        } catch {
          url = null;
        }
        if (!url || typeof url !== "string") {
          url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48`;
        } else {
          if (animated && /\.png(\?|$)/i.test(url)) {
            url = url.replace(/\.png(\?|$)/i, ".gif$1");
          } else if (!animated && /\.gif(\?|$)/i.test(url)) {
            url = url.replace(/\.gif(\?|$)/i, ".png$1");
          }
          if (!/[?&]size=/i.test(url)) url += (url.includes("?") ? "&" : "?") + "size=48";
        }
        return { id, name, animated, url };
      })
      .sort((a?, b?) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] listGuildPickerData emojis:", err?.message || err);
    emojis = [];
  }

  return { textChannels, voiceChannels, categories, roles, emojis };
}

async function maybeEnsureInvite(client?, guildId?, channelId?) {
  if (!channelId) return;
  try {
    const guild = await resolveGuildOrFail(client, guildId);
    if (!guild) return;
    const { ensurePartnershipChannelInvite } = require("../Services/Partner/partnershipInviteService") as typeof import("../Services/Partner/partnershipInviteService");
    await ensurePartnershipChannelInvite(guild, channelId);
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] ensurePartnershipChannelInvite:", err?.message || err);
  }
}

function parseOptionalId(value?) {
  if (value === null || value === undefined || value === "" || value === "off" || value === "null") {
    return { clear: true, id: null };
  }
  const id = String(value).trim();
  if (!/^\d{16,22}$/.test(id)) return { clear: false, id: null, invalid: true };
  return { clear: false, id };
}

async function getDashboardPartnership(client?, accessToken?, guildId?, opts: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  await refreshPartnershipConfigCache().catch(() => null);
  await ensureTenantPremiumCacheFresh().catch(() => null);
  const config = resolvePartnershipConfigSync(access.guildId) || getPartnershipConfigSync(access.guildId);
  const premium = isViniliFullFeatureGuild(access.guildId)
    ? { active: true, plan: "premium", until: null }
    : serializePremiumPublic(getTenantPremiumSync(access.guildId));
  let pickers = { textChannels: [], categories: [], roles: [] };
  try {
    pickers = await listGuildPickerData(client, access.guildId, {
      force: opts.forcePickers === true,
    });
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] listGuildPickerData:", err?.message || err);
  }

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    premium,
    partnership: serializePartnership(config, access.guildId),
    pickers,
  };
}

async function patchDashboardPartnership(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const gid = access.guildId;
  const patch = body && typeof body === "object" ? body : {};
  await refreshPartnershipConfigCache().catch(() => null);
  const { buildMainPartnershipMongoSeed, isMainPartnershipSettingsGuild } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
  const prev: any = getPartnershipConfigSync(gid) || (isMainPartnershipSettingsGuild(gid) ? buildMainPartnershipMongoSeed(gid) : null) || {};
  const configPatch: Record<string, any> = {};
  let channelForInvite = null;
  let clearDescCache = false;

  if (Object.prototype.hasOwnProperty.call(patch, "partnershipsChannelId")) {
    const parsed = parseOptionalId(patch.partnershipsChannelId);
    if (parsed.invalid) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
    configPatch.partnershipsChannelId = parsed.id;
    if (!parsed.id) {
      configPatch.invite = { code: null, url: null, channelId: null };
    } else {
      channelForInvite = parsed.id;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "logsChannelId")) {
    const parsed = parseOptionalId(patch.logsChannelId);
    if (parsed.invalid) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
    configPatch.logsChannelId = parsed.id;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "pmCommandsChannelId")) {
    const parsed = parseOptionalId(patch.pmCommandsChannelId);
    if (parsed.invalid) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
    configPatch.pmCommandsChannelId = parsed.id;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "pmCommandsCategoryIds")) {
    const raw = patch.pmCommandsCategoryIds;
    const list = Array.isArray(raw) ? raw : raw === null || raw === "" ? [] : [raw];
    const ids = [
      ...new Set(
        list
          .map((x?) => String(x || "").trim())
          .filter((id?) => /^\d{16,22}$/.test(id)),
      ),
    ];
    if (list.length && !ids.length) {
      return fail(400, "invalid_category", reasonToMessage("invalid_category"));
    }
    configPatch.pmCommandsCategoryIds = ids;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "partnerManagerRoleId")) {
    const parsed = parseOptionalId(patch.partnerManagerRoleId);
    if (parsed.invalid) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
    const badgeId =
      Object.prototype.hasOwnProperty.call(configPatch, "managerBadgeRoleId")
        ? configPatch.managerBadgeRoleId
        : prev.managerBadgeRoleId;
    if (parsed.id && badgeId && String(badgeId) === String(parsed.id)) {
      return fail(400, "same_as_badge_role", reasonToMessage("same_as_badge_role"));
    }
    configPatch.partnerManagerRoleId = parsed.id;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "managerBadgeRoleId")) {
    const parsed = parseOptionalId(patch.managerBadgeRoleId);
    if (parsed.invalid) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
    const managerId =
      Object.prototype.hasOwnProperty.call(configPatch, "partnerManagerRoleId")
        ? configPatch.partnerManagerRoleId
        : prev.partnerManagerRoleId;
    if (parsed.id && managerId && String(managerId) === String(parsed.id)) {
      return fail(400, "same_as_manager_role", reasonToMessage("same_as_manager_role"));
    }
    configPatch.managerBadgeRoleId = parsed.id;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "pings") && patch.pings && typeof patch.pings === "object") {
    const p = patch.pings;
    const next: Record<string, any> = {};

    if (Object.prototype.hasOwnProperty.call(p, "hereMembers")) {
      const parsed = parsePingMemberThresholdInput(p.hereMembers);
      if (Number.isNaN(parsed)) return fail(400, "invalid_ping_threshold", reasonToMessage("invalid_ping_threshold"));
      next.hereMembers = parsed;
    }
    if (Object.prototype.hasOwnProperty.call(p, "everyoneMembers")) {
      const parsed = parsePingMemberThresholdInput(p.everyoneMembers);
      if (Number.isNaN(parsed)) return fail(400, "invalid_ping_threshold", reasonToMessage("invalid_ping_threshold"));
      next.everyoneMembers = parsed;
    }
    if (Object.prototype.hasOwnProperty.call(p, "customRoleId")) {
      const parsed = parseOptionalId(p.customRoleId);
      if (parsed.invalid) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
      next.customRoleId = parsed.id;
    }
    if (Object.prototype.hasOwnProperty.call(p, "customRoleMembers")) {
      const parsed = parsePingMemberThresholdInput(p.customRoleMembers);
      if (Number.isNaN(parsed)) return fail(400, "invalid_ping_threshold", reasonToMessage("invalid_ping_threshold"));
      next.customRoleMembers = parsed;
    }

    const parseDelayPatch = (inputKey?, msKey?) => {
      if (
        !Object.prototype.hasOwnProperty.call(p, inputKey) &&
        !Object.prototype.hasOwnProperty.call(p, msKey)
      ) {
        return null;
      }
      const delayRaw =
        p[inputKey] != null && p[inputKey] !== ""
          ? p[inputKey]
          : p[msKey];
      if (delayRaw === null || delayRaw === undefined || delayRaw === "") {
        return { key: msKey, value: null };
      }
      if (typeof delayRaw === "number" && Number.isFinite(delayRaw)) {
        return { key: msKey, value: Math.max(0, Math.floor(delayRaw)) };
      }
      const parsed = parsePingDelayInput(delayRaw);
      if (Number.isNaN(parsed)) return { error: true };
      return { key: msKey, value: parsed };
    };

    for (const pair of [
      ["hereDelayInput", "hereDelayMs"],
      ["everyoneDelayInput", "everyoneDelayMs"],
      ["customRoleDelayInput", "customRoleDelayMs"],
    ]) {
      const parsedDelay = parseDelayPatch(pair[0], pair[1]);
      if (!parsedDelay) continue;
      if (parsedDelay.error) return fail(400, "invalid_ping_delay", reasonToMessage("invalid_ping_delay"));
      next[parsedDelay.key] = parsedDelay.value;
    }

    const preview = {
      ...(prev.pings || {}),
      ...next,
    };
    const hasCustomRole = Boolean(preview.customRoleId);
    const hasCustomMembers = preview.customRoleMembers !== null && preview.customRoleMembers !== undefined;
    if (hasCustomRole !== hasCustomMembers) {
      return fail(400, "custom_role_pair", reasonToMessage("custom_role_pair"));
    }

    configPatch.pings = normalizePings({ ...(prev.pings || {}), ...next });
  }

  if (Object.prototype.hasOwnProperty.call(patch, "partnerDesc") && patch.partnerDesc && typeof patch.partnerDesc === "object") {
    const d = patch.partnerDesc;
    const mode = String(d.mode || "").trim().toLowerCase();
    clearDescCache = true;
    if (mode === "clear" || mode === "none" || mode === "off") {
      configPatch.partnerDesc = {
        mode: null,
        channelId: null,
        staticText: null,
        sourceMessageId: null,
      };
    } else if (mode === "channel") {
      const parsed = parseOptionalId(d.channelId);
      if (parsed.invalid || !parsed.id) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
      configPatch.partnerDesc = {
        mode: "channel",
        channelId: parsed.id,
        staticText: null,
        sourceMessageId: null,
      };
    } else if (mode === "static") {
      const text = String(d.staticText || "").replace(/\r\n/g, "\n").trim();
      if (!text) return fail(400, "empty_text", reasonToMessage("empty_text"));
      if (text.length > 4000) return fail(400, "too_long", reasonToMessage("too_long"));
      configPatch.partnerDesc = {
        mode: "static",
        channelId: null,
        staticText: text,
        sourceMessageId: null,
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "thankYouEmbed") && patch.thankYouEmbed && typeof patch.thankYouEmbed === "object") {
    const ty = patch.thankYouEmbed;
    const enabled =
      Object.prototype.hasOwnProperty.call(ty, "enabled") || Object.prototype.hasOwnProperty.call(ty, "e")
        ? ty.enabled === true || ty.e === true
        : true;
    const turningOff = enabled === false;
    if (!turningOff) {
      await ensureTenantPremiumCacheFresh().catch(() => null);
      if (!isTenantPremiumActiveSync(gid) && !isViniliFullFeatureGuild(gid)) {
        return fail(402, "premium_required", reasonToMessage("premium_required"));
      }
    }
    configPatch.thankYouEmbed = normalizeThankYouEmbed({
      ...(prev.thankYouEmbed || {}),
      ...ty,
      enabled,
    });
  }

  if (Object.prototype.hasOwnProperty.call(patch, "skipManager")) {
    configPatch.skipManager = Boolean(patch.skipManager);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "manualPartnershipEnabled")) {
    configPatch.manualPartnershipEnabled = Boolean(patch.manualPartnershipEnabled);
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "contentFilters") &&
    patch.contentFilters &&
    typeof patch.contentFilters === "object"
  ) {
    configPatch.contentFilters = normalizeContentFilters({
      ...(prev.contentFilters || {}),
      ...patch.contentFilters,
    });
  }

  if (Object.prototype.hasOwnProperty.call(patch, "managerLeaveAction")) {
    configPatch.managerLeaveAction = normalizeLeaveAction(patch.managerLeaveAction);
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "sameServerCooldownInput") ||
    Object.prototype.hasOwnProperty.call(patch, "sameServerCooldownMs")
  ) {
    const delayRaw =
      patch.sameServerCooldownInput != null && patch.sameServerCooldownInput !== ""
        ? patch.sameServerCooldownInput
        : patch.sameServerCooldownMs;
    if (delayRaw === null || delayRaw === undefined || delayRaw === "") {
      configPatch.sameServerCooldownMs = null;
    } else if (typeof delayRaw === "number" && Number.isFinite(delayRaw)) {
      const n = Math.max(0, Math.floor(delayRaw));
      configPatch.sameServerCooldownMs = n === 0 ? null : Math.max(1000, n);
    } else {
      const parsed = parsePingDelayInput(delayRaw);
      if (Number.isNaN(parsed)) {
        return fail(400, "invalid_same_server_cooldown", reasonToMessage("invalid_same_server_cooldown"));
      }
      configPatch.sameServerCooldownMs = parsed === 0 ? null : Math.max(1000, parsed);
    }
  }

  if (Object.keys(configPatch).length) {
    const saved = await savePartnershipConfig(gid, configPatch);
    if (!saved?.ok) {
      return fail(400, saved?.reason || "save_failed", reasonToMessage(saved?.reason));
    }
  }

  if (clearDescCache) {
    try {
      const { clearTenantDescriptionCache } = require("../MultiGuild/services/Partner/tenantPartnerDescriptionService") as typeof import("../MultiGuild/services/Partner/tenantPartnerDescriptionService");
      clearTenantDescriptionCache(gid);
    } catch (_) {}
  }

  if (channelForInvite) {
        void maybeEnsureInvite(client, gid, channelForInvite);
  }

  if (patch.completeSetup === true) {
    const current = getPartnershipConfigSync(gid);
    if (!current?.partnershipsChannelId || !current?.partnerManagerRoleId) {
      return fail(400, "missing_required", reasonToMessage("missing_required"));
    }
    const setupResult = await completePartnershipSetup(gid, access.userId);
    if (!setupResult?.ok) {
      return fail(400, setupResult?.reason || "save_failed", reasonToMessage(setupResult?.reason));
    }
    void maybeEnsureInvite(client, gid, current.partnershipsChannelId);
  }

  const config = resolvePartnershipConfigSync(gid) || getPartnershipConfigSync(gid);
  await ensureTenantPremiumCacheFresh().catch(() => null);
  const premium = isViniliFullFeatureGuild(gid)
    ? { active: true, plan: "premium", until: null }
    : serializePremiumPublic(getTenantPremiumSync(gid));
    const objectiveFlags = [];
  if (config?.legacy === true || isPartnershipSetupComplete(config)) {
    objectiveFlags.push("setupDone");
  }
  if (config?.partnerDesc?.configured) {
    objectiveFlags.push("descSet");
  }
    if (config?.thankYouEmbed?.enabled === true && premium.active) {
    objectiveFlags.push("thankYouSet");
  }
  for (const flag of objectiveFlags) {
    void setTenantObjectiveFlag(client, gid, access.userId, flag).catch(() => null);
  }

  const out: Record<string, any> = {
    ok: true,
    status: 200,
    guildId: gid,
    premium,
    partnership: serializePartnership(config, gid),
    message: "Configurazione partnership salvata.",
  };
    if (patch.includePickers === true) {
    out.pickers = await listGuildPickerData(client, gid);
  }
  try {
    const { broadcastSitePartnershipChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
    broadcastSitePartnershipChanged({ guildId: gid, action: "save" });
  } catch (_) {}
  return out;
}

async function getDashboardPartnershipMigration(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const {
    getPartnershipHistoryMigrationStatus,
  } = require("../MultiGuild/services/Partner/tenantPartnershipHistoryMigrationService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipHistoryMigrationService");
  const status = await getPartnershipHistoryMigrationStatus(access.guildId);
  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(access.guildId);
  return {
    ...status,
    guildId: access.guildId,
    defaults: {
      partnershipsChannelId: config?.partnershipsChannelId || null,
      logsChannelId: config?.logsChannelId || null,
      partnerManagerRoleId: config?.partnerManagerRoleId || null,
    },
  };
}

async function startDashboardPartnershipMigration(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const payload = body && typeof body === "object" ? body : {};
  const mode = String(payload.mode || "configured").trim().toLowerCase() === "custom" ? "custom" : "configured";
  const channelParsed = parseOptionalId(payload.channelId);
  const logsParsed = parseOptionalId(payload.logsChannelId);
  const roleParsed = parseOptionalId(payload.roleId);
  if (channelParsed.invalid || logsParsed.invalid || roleParsed.invalid) {
    return fail(400, "invalid_channel", "Canale o ruolo non valido.");
  }

  const {
    enqueuePartnershipHistoryMigration,
    startPartnershipHistoryMigrationWorker,
  } = require("../MultiGuild/services/Partner/tenantPartnershipHistoryMigrationService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipHistoryMigrationService");

  try {
    startPartnershipHistoryMigrationWorker(client);
  } catch (_) {}

  return enqueuePartnershipHistoryMigration({
    guildId: access.guildId,
    requestedBy: access.userId,
    mode,
    channelId: channelParsed.id,
    logsChannelId: logsParsed.id,
    roleId: roleParsed.id,
    client,
  });
}

async function undoDashboardPartnershipMigration(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const {
    undoPartnershipHistoryMigration,
  } = require("../MultiGuild/services/Partner/tenantPartnershipHistoryMigrationService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipHistoryMigrationService");
  return undoPartnershipHistoryMigration(access.guildId, { requestedBy: access.userId });
}

async function assertTenantPartnershipAccess(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }
  return access;
}

async function resolveDashboardBlacklistTarget(rawInput?, ownerGuildId?) {
  const {
    normalizeTargetGuildId,
  } = require("../MultiGuild/services/Partner/tenantPartnershipBlacklistService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipBlacklistService");
  const { fetchInviteGuildMeta } = require("../Utils/Partner/partnershipBlacklistDisplay") as typeof import("../Utils/Partner/partnershipBlacklistDisplay");
  const input = String(rawInput || "").trim();
  if (!input) return { error: "invalid" };

  const directId = normalizeTargetGuildId(input);
  if (directId) {
    if (directId === String(ownerGuildId || "").trim()) return { error: "self" };
    return { guildId: directId, meta: {} };
  }

  const meta = await fetchInviteGuildMeta(input);
  if (!meta?.guildId) return { error: "invalid" };
  if (meta.guildId === String(ownerGuildId || "").trim()) return { error: "self" };
  return {
    guildId: meta.guildId,
    meta: {
      invite: meta.invite,
      guildName: meta.guildName,
      iconUrl: meta.iconUrl,
    },
  };
}

function serializeBlacklistEntry(row?, display = null) {
  const d = display && typeof display === "object" ? display : {};
  const addedAt = row?.addedAt ? new Date(row.addedAt) : null;
  return {
    guildId: String(row?.guildId || d.guildId || "").trim(),
    guildName: String(d.guildName || row?.guildName || "").trim() || null,
    iconUrl: String(d.iconUrl || row?.iconUrl || "").trim() || null,
    invite: String(d.invite || row?.invite || "").trim() || null,
    note: String(d.note != null ? d.note : row?.note || "").trim() || "",
    addedBy: String(row?.addedBy || "").trim() || null,
    addedAt: addedAt && !Number.isNaN(addedAt.getTime()) ? addedAt.toISOString() : null,
  };
}

async function getDashboardPartnershipBlacklist(client?, accessToken?, guildId?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const {
    listTenantPartnershipBlacklistGuilds,
  } = require("../MultiGuild/services/Partner/tenantPartnershipBlacklistService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipBlacklistService");
  const {
    resolvePartnershipBlacklistEntryDisplay,
  } = require("../Utils/Partner/partnershipBlacklistDisplay") as typeof import("../Utils/Partner/partnershipBlacklistDisplay");

  const rows = await listTenantPartnershipBlacklistGuilds(access.guildId, 200).catch(() => []);
  const inviteCache = new Map();
  const entries = [];
  for (const row of rows) {
    const display = await resolvePartnershipBlacklistEntryDisplay(client, row, inviteCache).catch(() => null);
    entries.push(serializeBlacklistEntry(row, display));
  }

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    entries,
  };
}

async function addDashboardPartnershipBlacklist(client?, accessToken?, guildId?, body?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const payload = body && typeof body === "object" ? body : {};
  const targetRaw = String(payload.target || payload.invite || payload.guildId || "").trim();
  const note = String(payload.note || "").trim().slice(0, 500);
  if (!targetRaw) {
    return fail(400, "invalid_blacklist_target", reasonToMessage("invalid_blacklist_target"));
  }

  const resolved = await resolveDashboardBlacklistTarget(targetRaw, access.guildId);
  if (!resolved || resolved.error === "invalid" || !resolved.guildId) {
    return fail(400, "invalid_blacklist_target", reasonToMessage("invalid_blacklist_target"));
  }
  if (resolved.error === "self") {
    return fail(400, "self_blacklist", reasonToMessage("self_blacklist"));
  }

  const {
    addTenantPartnershipBlacklistGuild,
    listTenantPartnershipBlacklistGuilds,
  } = require("../MultiGuild/services/Partner/tenantPartnershipBlacklistService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipBlacklistService");
  const {
    resolvePartnershipBlacklistEntryDisplay,
  } = require("../Utils/Partner/partnershipBlacklistDisplay") as typeof import("../Utils/Partner/partnershipBlacklistDisplay");

  const saved = await addTenantPartnershipBlacklistGuild(
    access.guildId,
    resolved.guildId,
    access.userId,
    note,
    resolved.meta || {},
  );
  if (!saved?.ok) {
    return fail(400, saved?.reason || "persist_failed", reasonToMessage(saved?.reason || "persist_failed"));
  }

  const rows = await listTenantPartnershipBlacklistGuilds(access.guildId, 200).catch(() => []);
  const entry = rows.find((row?) => String(row.guildId) === String(resolved.guildId)) || {
    guildId: resolved.guildId,
    addedBy: access.userId,
    note,
    addedAt: new Date(),
    ...(resolved.meta || {}),
  };
  const display = await resolvePartnershipBlacklistEntryDisplay(client, entry).catch(() => null);

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    entry: serializeBlacklistEntry(entry, display),
    message: "Server aggiunto alla blacklist.",
  };
}

async function removeDashboardPartnershipBlacklist(client?, accessToken?, guildId?, targetGuildId?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const {
    normalizeTargetGuildId,
    removeTenantPartnershipBlacklistGuild,
  } = require("../MultiGuild/services/Partner/tenantPartnershipBlacklistService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipBlacklistService");
  const targetId = normalizeTargetGuildId(targetGuildId);
  if (!targetId) {
    return fail(400, "invalid_id", reasonToMessage("invalid_id"));
  }

  const removed = await removeTenantPartnershipBlacklistGuild(access.guildId, targetId);
  if (!removed?.ok) {
    return fail(400, removed?.reason || "persist_failed", reasonToMessage(removed?.reason || "persist_failed"));
  }
  if (!removed.deleted) {
    return fail(404, "not_found", "Questo server non è in blacklist.");
  }

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    targetGuildId: targetId,
    message: "Server rimosso dalla blacklist.",
  };
}

async function leaveDashboardPartnership(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const gid = access.guildId;
  await refreshPartnershipConfigCache().catch(() => null);

  const {
    clearTenantPartnershipGuildData,
    hasPartnershipLeaveWork,
  } = require("../MultiGuild/services/Partner/tenantPartnershipLeaveService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipLeaveService");

  if (!(await hasPartnershipLeaveWork(gid))) {
    return {
      ok: true,
      status: 200,
      guildId: gid,
      cleared: false,
      partnership: serializePartnership(getPartnershipConfigSync(gid), gid),
      message: "Nessuna configurazione partnership da rimuovere.",
    };
  }

  const result: any = await clearTenantPartnershipGuildData(gid);
  if (!result?.ok) {
    return fail(400, result?.reason || "save_failed", reasonToMessage(result?.reason || "save_failed"));
  }

  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(gid);
  let pickers = { textChannels: [], categories: [], roles: [] };
  try {
    pickers = await listGuildPickerData(client, gid, { force: true });
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] leave listGuildPickerData:", err?.message || err);
  }

  return {
    ok: true,
    status: 200,
    guildId: gid,
    cleared: true,
    result: {
      hadConfig: Boolean(result.hadConfig),
      configRemoved: Boolean(result.configRemoved),
      joinStatsCleared: Boolean(result.joinStatsCleared),
      notificationsCleared: Boolean(result.notificationsCleared),
      blacklistCleared: Boolean(result.blacklistCleared),
    },
    partnership: serializePartnership(config, gid),
    pickers,
    message: "Configurazione partnership azzerata. Puoi rifare il setup.",
  };
}

const MAX_MANAGER_POINTS_AMOUNT = 10_000;

function serializePartnershipManager(member?, scores: Record<string, any> = {}) {
  const user = member?.user || null;
  const userId = String(member?.id || user?.id || "").trim();
  const username = String(user?.username || "").trim() || userId;
  const displayName = String(member?.displayName || user?.globalName || username).trim() || username;
  const { userAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
  return {
    userId,
    username,
    displayName,
    avatarUrl: userAvatarUrlDynamic(member || user, { size: 128 }) || null,
    points: Math.max(0, Math.floor(Number(scores.points) || 0)),
    total: Math.max(0, Math.floor(Number(scores.total) || 0)),
    daily: Math.max(0, Math.floor(Number(scores.daily) || 0)),
    weekly: Math.max(0, Math.floor(Number(scores.weekly) || 0)),
  };
}

async function resolveGuildForPartnershipApi(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  let guild = client?.guilds?.cache?.get(gid) || null;
    const needsHydrate =
    !guild ||
    guild.partial === true ||
    !guild.members ||
    typeof guild.members.fetch !== "function" ||
    !guild.roles ||
    typeof guild.roles.fetch !== "function";
  if (needsHydrate && typeof client?.guilds?.fetch === "function") {
    guild = (await client.guilds.fetch(gid).catch(() => null)) || guild;
  }
  if (!guild?.members || typeof guild.members.fetch !== "function") return null;
  return guild;
}

async function actorIsGuildAdministrator(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return false;
  if (!guild.members || typeof guild.members.fetch !== "function") return false;
  const member =
    guild.members.cache?.get?.(uid) ||
    (await guild.members.fetch(uid).catch(() => null));
  if (!member) return false;
  return Boolean(member.permissions?.has?.(PermissionFlagsBits.Administrator));
}

async function getDashboardPartnershipManagers(client?, accessToken?, guildId?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const { getPartnerManagerRoleId } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
  const { getUserPartnershipScoresForGuild } = require("../MultiGuild/services/Partner/tenantLeaderboardService") as typeof import("../MultiGuild/services/Partner/tenantLeaderboardService");

  const guild = await resolveGuildForPartnershipApi(client, access.guildId);
  if (!guild) {
    return fail(404, "guild_unavailable", "Server non disponibile al bot in questo momento.");
  }

  const roleId = String(getPartnerManagerRoleId(access.guildId) || "").trim();
  if (!roleId) {
    return fail(400, "missing_pm_role", "Configura prima il ruolo Partner Manager.");
  }

  await guild.members.fetch().catch(() => null);
  const role =
    guild.roles?.cache?.get?.(roleId) ||
    (typeof guild.roles?.fetch === "function"
      ? await guild.roles.fetch(roleId).catch(() => null)
      : null);
  if (!role) {
    return fail(400, "missing_pm_role", "Il ruolo Partner Manager non esiste più su questo server.");
  }

  let members = role.members
    ? Array.from(role.members.values()).filter((m?: any) => m && !m.user?.bot)
    : [];
  if (!members.length && guild.members?.cache?.size) {
    members = Array.from(guild.members.cache.values()).filter(
      (m?: any) => m && !m.user?.bot && m.roles?.cache?.has?.(roleId),
    );
  }

  const managers = [];
  for (const member of members) {
    const scores = await getUserPartnershipScoresForGuild(access.guildId, (member as any).id).catch(() => ({
      points: 0,
      total: 0,
      daily: 0,
      weekly: 0,
    }));
    managers.push(serializePartnershipManager(member, scores));
  }
  managers.sort(
    (a?, b?) =>
      b.points - a.points ||
      b.total - a.total ||
      String(a.displayName).localeCompare(String(b.displayName), "it"),
  );

  const canManagePoints = await actorIsGuildAdministrator(guild, access.userId);

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    canManagePoints,
    managers,
  };
}

async function adjustDashboardPartnershipManagerPoints(client?, accessToken?, guildId?, targetUserId?, body?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const { getPartnerManagerRoleId, memberHasPartnerManagerRole } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
  const {
    addPartnerPoints,
    removePartnerPoints,
    formatPartnerPointsChange,
  } = require("../Utils/Staff/partnerPointsUtils") as typeof import("../Utils/Staff/partnerPointsUtils");
  const { resolvePartnerPointsShown } = require("../Utils/Staff/partnerPointsDisplayUtils") as typeof import("../Utils/Staff/partnerPointsDisplayUtils");
  const {
    getUserPartnershipScoresForGuild,
    invalidateLeaderboardCache,
  } = require("../MultiGuild/services/Partner/tenantLeaderboardService") as typeof import("../MultiGuild/services/Partner/tenantLeaderboardService");

  const guild = await resolveGuildForPartnershipApi(client, access.guildId);
  if (!guild) {
    return fail(404, "guild_unavailable", "Server non disponibile al bot in questo momento.");
  }

  if (!(await actorIsGuildAdministrator(guild, access.userId))) {
    return fail(403, "admin_required", "Solo gli amministratori possono modificare i punti.");
  }

  const uid = String(targetUserId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) {
    return fail(400, "invalid_user", "Utente non valido.");
  }

  const payload = body && typeof body === "object" ? body : {};
  const action = String(payload.action || "").trim().toLowerCase();
  if (action !== "add" && action !== "remove") {
    return fail(400, "invalid_action", "Azione non valida (add|remove).");
  }
  const amount = Number.parseInt(String(payload.amount ?? "").trim(), 10);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_MANAGER_POINTS_AMOUNT) {
    return fail(
      400,
      "invalid_amount",
      `Inserisci un numero valido tra 1 e ${MAX_MANAGER_POINTS_AMOUNT}.`,
    );
  }

  const targetMember =
    guild.members.cache.get(uid) ||
    (await guild.members.fetch(uid).catch(() => null));
  if (!targetMember || targetMember.user?.bot) {
    return fail(404, "member_not_found", "Questo utente non è nel server.");
  }
  if (!memberHasPartnerManagerRole(targetMember, access.guildId)) {
    return fail(400, "not_partner_manager", "L’utente non ha il ruolo Partner Manager.");
  }

  let updated = null;
  if (action === "add") {
    updated = await addPartnerPoints(access.guildId, uid, amount, { client, guild });
    if (!updated) {
      return fail(500, "persist_failed", reasonToMessage("persist_failed"));
    }
  } else {
    updated = await removePartnerPoints(access.guildId, uid, amount);
    if (!updated) {
      return fail(400, "nothing_to_remove", "Nessun punto da rimuovere.");
    }
  }

  try {
    invalidateLeaderboardCache();
  } catch (_) {}

  const scores = await getUserPartnershipScoresForGuild(access.guildId, uid).catch(() => ({
    points: resolvePartnerPointsShown(updated?.staff),
    total: 0,
    daily: 0,
    weekly: 0,
  }));
  const removed = Number(updated?._partnerPointsRemoved);
  const effectiveAmount =
    action === "remove" && Number.isFinite(removed) && removed > 0 ? removed : amount;

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    points: scores.points,
    manager: serializePartnershipManager(targetMember, scores),
    message: formatPartnerPointsChange(action, effectiveAmount).replace(/`/g, ""),
  };
}

async function getDashboardPartnershipHistory(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const { listPartnerGuildHistory } = require("../Services/Partner/partnershipHistoryService") as typeof import("../Services/Partner/partnershipHistoryService");
  const {
    extractInviteCode,
    fetchInviteGuildMeta,
    getCachedInviteGuildMeta,
    isInviteFetchRateLimited,
  } = require("../Utils/Partner/partnershipBlacklistDisplay") as typeof import("../Utils/Partner/partnershipBlacklistDisplay");

  let raw;
  try {
    raw = await listPartnerGuildHistory(access.guildId, {
      days: query?.days,
      page: query?.page,
      pageSize: query?.pageSize || query?.limit,
    });
  } catch (err) {
    global.logger?.error?.("[DASH HISTORY] list failed:", err);
    return fail(500, "fetch_failed", "Impossibile caricare la cronologia.");
  }

  const isUsableGuildName = (value?) => {
    const name = String(value || "").trim();
    if (!name) return false;
    if (/^(server\s+sconosciuto|partner)$/i.test(name)) return false;
    if (/^discord\.gg\//i.test(name)) return false;
    return true;
  };

  let guildIconUrlFn = null;
  try {
    guildIconUrlFn = require("../Utils/Discord/guildDiscordIdentity").guildIconUrl;
  } catch {
    guildIconUrlFn = null;
  }

  const needsDiscordEnrich = (row?) => {
    const invite = String(row?.invite || "").trim();
    if (!invite) return false;
    if (!isUsableGuildName(row?.guildName)) return true;
    return false;
  };

  async function mapPool(items?, concurrency?, mapper?) {
    const list = Array.isArray(items) ? items : [];
    const out = new Array(list.length);
    let next = 0;
    const workers = Math.min(Math.max(1, concurrency), Math.max(1, list.length) || 1);
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (next < list.length) {
          const idx = next;
          next += 1;
          out[idx] = await mapper(list[idx], idx);
        }
      }),
    );
    return out;
  }

    const pageRows = raw.entries || [];
  const enrichTargets = pageRows.filter(needsDiscordEnrich);
  if (enrichTargets.length && !isInviteFetchRateLimited()) {
    let stopEnrich = false;
    await mapPool(enrichTargets, 2, async (row?) => {
      if (stopEnrich || isInviteFetchRateLimited()) return;
      const invite = String(row.invite || "").trim();
      const cached = getCachedInviteGuildMeta(invite);
      if (cached?.guildName) {
        if (!isUsableGuildName(row.guildName)) row.guildName = cached.guildName;
        if (!row.guildId && cached.guildId) row.guildId = cached.guildId;
        row._iconUrl = cached.iconUrl || null;
        return;
      }
      const out = { rateLimited: false };
      const meta = await fetchInviteGuildMeta(invite, {
        client,
        timeoutMs: 900,
        skipIfRateLimited: true,
        out,
      }).catch(() => null);
      if (out.rateLimited || isInviteFetchRateLimited()) {
        stopEnrich = true;
        return;
      }
      if (!meta) return;
      if (!isUsableGuildName(row.guildName) && isUsableGuildName(meta.guildName)) {
        row.guildName = String(meta.guildName).trim();
      }
      if (!row.guildId && meta.guildId) row.guildId = String(meta.guildId).trim();
      row._iconUrl = meta.iconUrl || null;

            setImmediate(() => {
        softPersistPartnerHistoryMeta(access.guildId, {
          invite,
          guildName: meta.guildName,
          partnerGuildId: meta.guildId,
        }).catch(() => {});
      });
    });
  }

  const entries = pageRows.map((row?) => {
    let guildName = isUsableGuildName(row.guildName) ? String(row.guildName).trim() : null;
    let invite = String(row.invite || "").trim() || null;
    let iconUrl = row._iconUrl || null;
    let partnerGuildId = String(row.guildId || "").trim() || null;

    if (partnerGuildId) {
      const cachedGuild = client?.guilds?.cache?.get(partnerGuildId) || null;
      if (cachedGuild) {
        if (!guildName) guildName = String(cachedGuild.name || "").trim() || null;
        if (!iconUrl && typeof guildIconUrlFn === "function") {
          try {
            iconUrl = guildIconUrlFn(cachedGuild, { size: 64 });
          } catch {
            iconUrl = null;
          }
        }
      }
    }

    if (!guildName && invite) {
      const cached = getCachedInviteGuildMeta(invite);
      if (cached && isUsableGuildName(cached.guildName)) {
        guildName = String(cached.guildName).trim();
        if (!iconUrl) iconUrl = cached.iconUrl || null;
        if (!partnerGuildId && cached.guildId) partnerGuildId = String(cached.guildId).trim();
      } else {
        const code = extractInviteCode(invite);
        if (code) guildName = `discord.gg/${code}`;
      }
    }

    return {
      guildId: partnerGuildId,
      count: row.count,
      lastAt: row.lastAt,
      firstAt: row.firstAt,
      guildName,
      iconUrl: iconUrl || null,
      invite,
    };
  });

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    days: raw.days == null ? null : raw.days,
    uniqueServers: raw.uniqueServers,
    totalPartnerships: raw.totalPartnerships,
    page: raw.page || 1,
    pageSize: raw.pageSize || 10,
    totalPages: raw.totalPages || 1,
    entries,
  };
}

async function softPersistPartnerHistoryMeta(guildId?, meta: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const guildName = String(meta?.guildName || "").trim();
  const partnerGuildId = String(meta?.partnerGuildId || "").trim();
  const invite = String(meta?.invite || "").trim();
  const code = extractInviteCodeFromInvite(invite);
  if (!gid || !guildName || !code) return;
  if (/^(server\s+sconosciuto|partner)$/i.test(guildName) || /^discord\.gg\//i.test(guildName)) return;

  const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
  const inviteRe = new RegExp(`discord(?:app)?\\.(?:gg|com)/(?:invite/)?${escapeRegExp(code)}`, "i");

  const docs = await ActivityUserProfile.find({
    guildId: gid,
    "staff.partnerActions.invite": { $regex: inviteRe },
  })
    .limit(40)
    .catch(() => []);

  for (const doc of docs || []) {
    const actions = Array.isArray(doc?.staff?.partnerActions) ? doc.staff.partnerActions : [];
    let changed = false;
    for (const action of actions) {
      if (!/^create$/i.test(String(action?.action || ""))) continue;
      const actionInvite = String(action?.invite || "");
      if (!inviteRe.test(actionInvite) && !actionInvite.toLowerCase().includes(code.toLowerCase())) continue;
      const currentName = String(action?.partner || "").trim();
      const nameIsPlaceholder =
        !currentName ||
        /^(server\s+sconosciuto|partner)$/i.test(currentName) ||
        /^discord\.gg\//i.test(currentName);
      if (nameIsPlaceholder) {
        action.partner = guildName;
        changed = true;
      }
      if (partnerGuildId && !String(action?.partnerGuildId || "").trim()) {
        action.partnerGuildId = partnerGuildId;
        changed = true;
      }
    }
    if (changed) {
      doc.markModified("staff");
      await doc.save().catch(() => {});
    }
  }
}

function extractInviteCodeFromInvite(invite?) {
  const { extractInviteCode } = require("../Utils/Partner/partnershipBlacklistDisplay") as typeof import("../Utils/Partner/partnershipBlacklistDisplay");
  return extractInviteCode(invite);
}

function escapeRegExp(value?) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export = {
  getDashboardPartnership,
  patchDashboardPartnership,
  leaveDashboardPartnership,
  getDashboardPartnershipMigration,
  startDashboardPartnershipMigration,
  undoDashboardPartnershipMigration,
  getDashboardPartnershipBlacklist,
  addDashboardPartnershipBlacklist,
  removeDashboardPartnershipBlacklist,
  getDashboardPartnershipManagers,
  adjustDashboardPartnershipManagerPoints,
  getDashboardPartnershipHistory,
  listGuildPickerData,
};

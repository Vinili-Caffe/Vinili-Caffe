/** Dashboard partnership: dati come li vede il sito. */
const { isPartnershipSetupComplete, normalizeContentFilters } = require("../../Partner/core/tenantPartnershipSettings") as typeof import("../../Partner/core/tenantPartnershipSettings");
const { formatPingDelayForInput, DEFAULT_CUSTOM_ROLE_PING_DELAY_MS } = require("../../Partner/runtime/partnershipPingUtils") as typeof import("../../Partner/runtime/partnershipPingUtils");
const { defaultThankYouEmbedFieldsForGuild } = require("../../Partner/runtime/partnershipThankYouEmbed") as typeof import("../../Partner/runtime/partnershipThankYouEmbed");

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
      draft: embed.draft || null,
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

function serializePartnershipManager(member?, scores: Record<string, any> = {}) {
  const user = member?.user || null;
  const userId = String(member?.id || user?.id || "").trim();
  const username = String(user?.username || "").trim() || userId;
  const displayName = String(member?.displayName || user?.globalName || username).trim() || username;
  const { userAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
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

function extractInviteCodeFromInvite(invite?) {
  const { extractInviteCode } = require("../../Partner/runtime/partnershipBlacklistDisplay") as typeof import("../../Partner/runtime/partnershipBlacklistDisplay");
  return extractInviteCode(invite);
}

function escapeRegExp(value?) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export = { reasonToMessage, fail, serializePartnership, serializeBlacklistEntry, serializePartnershipManager, extractInviteCodeFromInvite, escapeRegExp };

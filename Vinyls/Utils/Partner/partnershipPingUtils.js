const DEFAULT_CUSTOM_ROLE_PING_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_TENANT_PING_MEMBER_THRESHOLD = 0;

function parsePingDelayInput(raw) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text) return null;
  if (text === "0" || text === "0s" || text === "off" || text === "none" || text === "no") return 0;
  const match = text.match(/^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days)?$/);
  if (!match) return NaN;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return NaN;
  if (amount === 0) return 0;
  if (amount < 0) return NaN;
  const unit = match[2] || "m";
  const unitMs = {
    s: 1000,
    sec: 1000,
    secs: 1000,
    m: 60_000,
    min: 60_000,
    mins: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    hrs: 3_600_000,
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
  };
  const ms = amount * (unitMs[unit] || 60_000);
  return Math.max(1000, Math.floor(ms));
}

function formatPingDelayLabel(ms) {
  const value = Math.floor(Number(ms) || 0);
  if (!value || value < 1000) return null;
  if (value % 86_400_000 === 0) return `${value / 86_400_000}d`;
  if (value % 3_600_000 === 0) return `${value / 3_600_000}h`;
  if (value % 60_000 === 0) return `${value / 60_000}m`;
  return `${Math.round(value / 1000)}s`;
}

function formatPingDelayForInput(ms) {
  const value = Math.floor(Number(ms));
  if (value === 0) return "0";
  return formatPingDelayLabel(ms) || formatPingDelayLabel(DEFAULT_CUSTOM_ROLE_PING_DELAY_MS);
}

function resolveEffectiveDelayMs(raw, fallbackRaw = undefined) {
  const tryMs = (value) => {
    if (value === null || value === undefined) return null;
    const ms = Math.floor(Number(value));
    if (!Number.isFinite(ms)) return null;
    if (ms === 0) return 0;
    if (ms >= 1000) return ms;
    return null;
  };
  const primary = tryMs(raw);
  if (primary !== null) return primary;
  if (arguments.length >= 2) {
    const fallback = tryMs(fallbackRaw);
    if (fallback !== null) return fallback;
  }
  return DEFAULT_CUSTOM_ROLE_PING_DELAY_MS;
}

function resolveEffectiveCustomRoleDelayMs(pings) {
  return resolveEffectiveDelayMs(pings?.customRoleDelayMs);
}

function resolveEffectiveHereDelayMs(pings) {
  // Retrocompat: se manca delay dedicato, riusa quello custom (comportamento storico).
  return resolveEffectiveDelayMs(pings?.hereDelayMs, pings?.customRoleDelayMs);
}

function resolveEffectiveEveryoneDelayMs(pings) {
  return resolveEffectiveDelayMs(pings?.everyoneDelayMs, pings?.customRoleDelayMs);
}

function formatPingDelayDisplay(ms) {
  const value = Math.floor(Number(ms));
  if (value === 0) return "0";
  return formatPingDelayLabel(ms) || formatPingDelayLabel(DEFAULT_CUSTOM_ROLE_PING_DELAY_MS);
}

function parseIsoMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolvePingDelayDecision(lastAtValue, delayMs) {
  if (!delayMs || delayMs < 1000) return { shouldPing: true, reason: "no_delay" };
  const lastAt = parseIsoMs(lastAtValue);
  if (!lastAt) return { shouldPing: true, reason: "never_pinged" };

  const elapsed = Date.now() - lastAt;
  if (elapsed >= delayMs) {
    return { shouldPing: true, reason: "delay_elapsed" };
  }
  return {
    shouldPing: false,
    reason: "delay_active",
    retryAtMs: lastAt + delayMs,
  };
}

function resolveCustomRolePingDecision(pings) {
  const roleId = String(pings?.customRoleId || "").trim() || null;
  if (!roleId) return { roleId: null, shouldPing: false, reason: "no_role" };

  const delayMs = resolveEffectiveCustomRoleDelayMs(pings);
  const delayDecision = resolvePingDelayDecision(pings?.lastCustomRolePingAt, delayMs);
  return {
    roleId,
    shouldPing: delayDecision.shouldPing,
    reason: delayDecision.reason,
    retryAtMs: delayDecision.retryAtMs,
  };
}

function formatPingMemberThresholdForInput(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parsePingMemberThresholdInput(raw) {
  const text = String(raw || "").trim();
  if (!text || /^null$/i.test(text)) return null;
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

function normalizePartnerMemberCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 0) return null;
  return count;
}

function meetsMemberThreshold(threshold, memberCount, { allowUnknown = false } = {}) {
  if (threshold === null || threshold === undefined) return false;
  const count = normalizePartnerMemberCount(memberCount);
  // Conteggio sconosciuto: solo i caller espliciti (ping custom) possono fall-open.
  if (count === null) return Boolean(allowUnknown);
  return count >= Math.max(0, Math.floor(Number(threshold) || 0));
}

function resolvePartnershipPublishPings({
  partnerMemberCount = 0,
  pings = null,
  legacy = false,
  legacyPingRoleId = null,
} = {}) {
  const count = normalizePartnerMemberCount(partnerMemberCount);
  let pingHere = false;
  let pingEveryone = false;
  let notifyHere = false;
  let notifyEveryone = false;
  let customRoleDecision = { roleId: null, shouldPing: false, reason: "no_role" };

  if (legacy) {
    const roleId = String(legacyPingRoleId || pings?.customRoleId || "").trim() || null;
    customRoleDecision = {
      roleId,
      shouldPing: Boolean(roleId),
      reason: roleId ? "legacy_role" : "no_role",
    };
  } else {
    const cfg = pings && typeof pings === "object" ? pings : {};
    if (meetsMemberThreshold(cfg.hereMembers, count)) {
      // Soglia ok: mostra sempre @here; notifica solo se il ritardo è scaduto.
      pingHere = true;
      notifyHere = resolvePingDelayDecision(cfg.lastHerePingAt, resolveEffectiveHereDelayMs(cfg)).shouldPing;
    }
    if (meetsMemberThreshold(cfg.everyoneMembers, count)) {
      pingEveryone = true;
      notifyEveryone = resolvePingDelayDecision(
        cfg.lastEveryonePingAt,
        resolveEffectiveEveryoneDelayMs(cfg),
      ).shouldPing;
    }
    customRoleDecision = resolveCustomRolePingDecision(cfg);
    if (customRoleDecision.roleId) {
      if (cfg.customRoleMembers === null || cfg.customRoleMembers === undefined) {
        customRoleDecision = {
          roleId: customRoleDecision.roleId,
          shouldPing: false,
          reason: "members_not_configured",
        };
      } else if (!meetsMemberThreshold(cfg.customRoleMembers, count, { allowUnknown: false })) {
        customRoleDecision = {
          roleId: customRoleDecision.roleId,
          shouldPing: false,
          reason: count === null ? "member_count_unknown" : "below_member_threshold",
        };
      } else if (count === null && customRoleDecision.shouldPing) {
        customRoleDecision = {
          roleId: customRoleDecision.roleId,
          shouldPing: false,
          reason: "member_count_unknown",
        };
      }
    }
  }

  const showRoleReasons = new Set([
    "no_role",
    "members_not_configured",
    "below_member_threshold",
    "member_count_unknown",
  ]);
  const showCustomRole =
    Boolean(customRoleDecision.roleId) && !showRoleReasons.has(String(customRoleDecision.reason || ""));
  const customRoleId = showCustomRole ? customRoleDecision.roleId : null;
  const notifyCustomRoleId =
    showCustomRole && customRoleDecision.shouldPing ? customRoleDecision.roleId : null;

  return {
    partnerMemberCount: count,
    pingHere,
    pingEveryone,
    customRoleId,
    notifyHere: legacy ? pingHere : notifyHere,
    notifyEveryone: legacy ? pingEveryone : notifyEveryone,
    notifyCustomRoleId: legacy ? customRoleId : notifyCustomRoleId,
    customRoleDecision,
  };
}

function resolveNotifyFlags(pingPlan = {}) {
  return {
    notifyHere: pingPlan.notifyHere !== undefined ? Boolean(pingPlan.notifyHere) : Boolean(pingPlan.pingHere),
    notifyEveryone:
      pingPlan.notifyEveryone !== undefined ? Boolean(pingPlan.notifyEveryone) : Boolean(pingPlan.pingEveryone),
    notifyCustomRoleId:
      pingPlan.notifyCustomRoleId !== undefined
        ? String(pingPlan.notifyCustomRoleId || "").trim() || null
        : String(pingPlan.customRoleId || "").trim() || null,
  };
}

function buildPartnershipPingPrefix(pingPlan = {}, { includeRolePing = false } = {}) {
  const parts = [];
  if (pingPlan?.pingHere) parts.push("@here");
  if (pingPlan?.pingEveryone) parts.push("@everyone");
  if (includeRolePing && pingPlan?.customRoleId) {
    parts.push(`<@&${pingPlan.customRoleId}>`);
  }
  return parts.join(" ");
}

function formatPartnershipPingDisplay({
  pingHere = false,
  pingEveryone = false,
  pingRoleId = null,
} = {}) {
  const parts = [];
  if (pingHere) parts.push("@here");
  if (pingEveryone) parts.push("@everyone");
  const roleId = String(pingRoleId || "").trim() || null;
  if (roleId) parts.push(`<@&${roleId}>`);
  return parts.length ? parts.join(" ") : "`null`";
}

function prependPartnershipPingPrefix(content, pingPlan, options = {}) {
  const prefix = buildPartnershipPingPrefix(pingPlan, options);
  const body = String(content || "").trim();
  if (!prefix) return body;
  return body ? `${prefix}\n\n${body}` : prefix;
}

function normalizeExcludeUserIds(excludeUserIds) {
  if (!Array.isArray(excludeUserIds) || !excludeUserIds.length) return new Set();
  return new Set(
    excludeUserIds.map((id) => String(id || "").trim()).filter((id) => /^\d{16,20}$/.test(id)),
  );
}

function buildPartnershipPublishAllowedMentions(
  pingPlan,
  managerId = null,
  { excludeUserIds = [] } = {},
) {
  const excluded = normalizeExcludeUserIds(excludeUserIds);
  const { notifyHere, notifyEveryone, notifyCustomRoleId } = resolveNotifyFlags(pingPlan);
  const roles = [];
  const users = [];
  if (notifyCustomRoleId) roles.push(String(notifyCustomRoleId));
  if (managerId && !excluded.has(String(managerId))) users.push(String(managerId));
  const parse = notifyHere || notifyEveryone ? ["everyone"] : [];
  return { parse, roles, users };
}

function detectUsedPingsInContent(content, pingPlan = {}) {
  const text = String(content || "");
  const { notifyHere, notifyEveryone, notifyCustomRoleId } = resolveNotifyFlags(pingPlan);
  return {
    pingHere: Boolean(notifyHere && /\B@here\b/i.test(text)),
    pingEveryone: Boolean(notifyEveryone && /\B@everyone\b/i.test(text)),
    customRoleId:
      notifyCustomRoleId && text.includes(`<@&${notifyCustomRoleId}>`) ? notifyCustomRoleId : null,
  };
}

function extractMentionIdsFromContent(content) {
  const text = String(content || "");
  const users = [...text.matchAll(/<@!?(\d{16,20})>/g)].map((m) => m[1]);
  const roles = [...text.matchAll(/<@&(\d{16,20})>/g)].map((m) => m[1]);
  return {
    users: [...new Set(users.map(String))],
    roles: [...new Set(roles.map(String))],
  };
}

function buildPartnershipPublishAllowedMentionsFromContent(
  content,
  pingPlan = {},
  managerId = null,
  { excludeUserIds = [] } = {},
) {
  const excluded = normalizeExcludeUserIds(excludeUserIds);
  const { notifyCustomRoleId } = resolveNotifyFlags(pingPlan);
  const used = detectUsedPingsInContent(content, pingPlan);
  const extracted = extractMentionIdsFromContent(content);
  const silentRoleId =
    pingPlan.customRoleId && !notifyCustomRoleId ? String(pingPlan.customRoleId) : null;
  const roles = [
    ...new Set([
      ...(used.customRoleId ? [String(used.customRoleId)] : []),
      ...extracted.roles.filter((id) => id !== silentRoleId),
    ]),
  ];
  const users = [
    ...new Set([...(managerId ? [String(managerId)] : []), ...extracted.users]),
  ].filter((id) => !excluded.has(String(id)));
  const parse = used.pingHere || used.pingEveryone ? ["everyone"] : [];
  return { parse, roles, users };
}

function stripInvalidTenantSlashPartnershipMentions(description, pingPlan = {}) {
  let content = String(description || "");

  if (!pingPlan.pingHere) {
    content = content.replace(/\B@here\b/gi, "");
  }
  if (!pingPlan.pingEveryone) {
    content = content.replace(/\B@everyone\b/gi, "");
  }

  const configuredPingRoleId =
    String(pingPlan.customRoleId || pingPlan.customRoleDecision?.roleId || "").trim() || null;
  if (configuredPingRoleId && !pingPlan.customRoleId) {
    const roleMention = `<@&${configuredPingRoleId}>`;
    content = content.split(roleMention).join("");
  }

  return content;
}

function applyTenantSlashPartnershipPings(description, pingPlan = {}) {
  let content = stripInvalidTenantSlashPartnershipMentions(description, pingPlan);
  const used = detectUsedPingsInContent(content, pingPlan);
  const toAdd = [];

  if (pingPlan.pingHere && !used.pingHere) toAdd.push("@here");
  if (pingPlan.pingEveryone && !used.pingEveryone) toAdd.push("@everyone");
  if (pingPlan.customRoleId && !used.customRoleId) toAdd.push(`<@&${pingPlan.customRoleId}>`);

  if (!toAdd.length) return content;
  return content ? `${toAdd.join(" ")}\n\n${content}` : toAdd.join(" ");
}

module.exports = { DEFAULT_CUSTOM_ROLE_PING_DELAY_MS, DEFAULT_TENANT_PING_MEMBER_THRESHOLD, parsePingDelayInput, formatPingDelayLabel, formatPingDelayForInput, formatPingDelayDisplay, formatPingMemberThresholdForInput, parsePingMemberThresholdInput, resolveEffectiveDelayMs, resolveEffectiveCustomRoleDelayMs, resolveEffectiveHereDelayMs, resolveEffectiveEveryoneDelayMs, resolvePingDelayDecision, resolveCustomRolePingDecision, resolvePartnershipPublishPings, resolveNotifyFlags, buildPartnershipPingPrefix, formatPartnershipPingDisplay, prependPartnershipPingPrefix, buildPartnershipPublishAllowedMentions, buildPartnershipPublishAllowedMentionsFromContent, detectUsedPingsInContent, applyTenantSlashPartnershipPings };
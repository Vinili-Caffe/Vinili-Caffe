/**
 * Notifiche campanella sito per eventi staff: punti tolti, valutazioni, warn, pex/depex.
 */
const IDs = require("../Config/ids");
const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService");
const { collectHumanMemberIdsWithRole } = require("../Discord/threadRoleMembers");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  staffLadderRoleIds,
  staffRoleId,
} = require("../Staff/staffRoleHierarchy");

const RECIPIENT_CACHE_TTL_MS = 60_000;
const recipientCache = new Map();

function cacheGet(key) {
  const hit = recipientCache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.ids;
}

function cacheSet(key, ids) {
  recipientCache.set(key, { expiresAt: Date.now() + RECIPIENT_CACHE_TTL_MS, ids: [...ids] });
  return ids;
}

async function collectIdsForRoleIds(guild, roleIds) {
  const ids = new Set();
  const roles = [...new Set((roleIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  for (const roleId of roles) {
    const members = await collectHumanMemberIdsWithRole(guild, roleId, {
      logTag: "[siteStaffEventNotifications]",
    }).catch(() => []);
    for (const id of members || []) ids.add(String(id));
  }
  return [...ids];
}

async function getHighStaffRecipientUserIds(guild) {
  const guildId = String(guild?.id || "").trim();
  if (!guild || !guildId) return [];
  const cacheKey = `${guildId}:hs`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const ids = await collectIdsForRoleIds(guild, staffLadderRoleIds(STAFF_HIGH_STAFF_ELIGIBLE_KEYS));
  return cacheSet(
    cacheKey,
    ids.filter((id) => /^\d{16,22}$/.test(id)),
  );
}

async function getOrganicoViewerUserIds(guild) {
  const guildId = String(guild?.id || "").trim();
  if (!guild || !guildId) return [];
  const cacheKey = `${guildId}:organico`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const roleIds = [...staffLadderRoleIds(STAFF_HIGH_STAFF_ELIGIBLE_KEYS), staffRoleId("Director")].filter(Boolean);
  const ids = await collectIdsForRoleIds(guild, roleIds);
  return cacheSet(
    cacheKey,
    ids.filter((id) => /^\d{16,22}$/.test(id)),
  );
}

function formatRoleLabel(guild, roleIdOrName) {
  const raw = String(roleIdOrName || "").trim();
  if (!raw) return "Nessuno";
  if (/^\d{16,22}$/.test(raw)) {
    const name = guild?.roles?.cache?.get(raw)?.name;
    return name || raw;
  }
  return raw;
}

function memberDisplayName(member, userLike, fallbackId = "") {
  const fromMember = String(member?.displayName || member?.user?.globalName || member?.user?.username || "").trim();
  if (fromMember) return fromMember;
  const fromUser = String(
    userLike?.globalName || userLike?.displayName || userLike?.username || userLike?.tag || "",
  ).trim();
  if (fromUser) return fromUser;
  return String(fallbackId || userLike?.id || "").trim() || "Staff";
}

async function notifyUsers(guild, userIds, payload, excludeIds = []) {
  const guildId = String(guild?.id || payload?.guildId || IDs.guilds?.main || "").trim();
  if (!guildId) return 0;
  const exclude = new Set((excludeIds || []).map(String));
  const ids = [
    ...new Set(
      (userIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => /^\d{16,22}$/.test(id) && !exclude.has(id)),
    ),
  ];
  if (!ids.length) return 0;
  await Promise.all(
    ids.map((userId) =>
      enqueueSiteInAppNotification({
        guildId,
        userId,
        title: String(payload.title || "").trim().slice(0, 120),
        body: String(payload.body || "").trim().slice(0, 500),
        kind: payload.kind || "mod",
        openUrl: String(payload.openUrl || "").trim().slice(0, 400) || undefined,
        dedupeKey: String(payload.dedupeKey || "").trim().slice(0, 120) || undefined,
        dedupeWindowMs: payload.dedupeWindowMs ?? 86_400_000,
      }).catch(() => false),
    ),
  ).catch(() => null);
  return ids.length;
}

async function notifyPuntiToltiPending(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  if (!guild || !guildId) return 0;
  const pmUserId = String(opts.pmUserId || "").trim();
  const messageId = String(opts.messageId || "").trim();
  const pmName = String(opts.pmName || pmUserId).trim();
  const rule = String(opts.rule || "").trim().slice(0, 160);
  const reporterName = String(opts.reporterName || "").trim();
  const recipients = await getHighStaffRecipientUserIds(guild);
  return notifyUsers(guild, recipients, {
    title: "Punti tolti — segnalazione in attesa",
    body:
      (reporterName ? `${reporterName} ha segnalato ` : "Nuova segnalazione per ") +
      `${pmName}${rule ? `: ${rule}` : ""}. Conferma o nega in Punti tolti PM.`,
    kind: "mod",
    openUrl: "/staff/punti-tolti/",
    dedupeKey: messageId ? `pt-pending:${messageId}` : `pt-pending:${pmUserId}:${Date.now()}`,
  }, [pmUserId]);
}

async function notifyPuntiToltiReviewed(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  if (!guild || !guildId) return false;
  const reporterUserId = String(opts.reporterUserId || "").trim();
  if (!/^\d{16,22}$/.test(reporterUserId)) return false;
  const isConfirm = opts.isConfirm === true;
  const pmName = String(opts.pmName || opts.pmUserId || "PM").trim();
  const messageId = String(opts.messageId || "").trim();
  return notifyUsers(
    guild,
    [reporterUserId],
    {
      title: isConfirm ? "Punti tolti — rimozione confermata" : "Punti tolti — segnalazione negata",
      body: isConfirm
        ? `L'High Staff ha confermato la rimozione punti per ${pmName}.`
        : `L'High Staff ha negato la segnalazione punti per ${pmName}.`,
      kind: "mod",
      openUrl: "/staff/punti-tolti/",
      dedupeKey: messageId ? `pt-review:${messageId}:${isConfirm ? "ok" : "no"}` : undefined,
    },
  );
}

async function notifyPuntiToltiPointsRemoved(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  const pmUserId = String(opts.pmUserId || "").trim();
  if (!guild || !guildId || !/^\d{16,22}$/.test(pmUserId)) return false;
  const rule = String(opts.rule || "").trim().slice(0, 160);
  const actorName = String(opts.actorName || "Staff").trim();
  return notifyUsers(guild, [pmUserId], {
    title: "Punto partnership rimosso",
    body: `${actorName} ha registrato una rimozione punti${rule ? `: ${rule}` : ""}.`,
    kind: "mod",
    openUrl: "/staff/punti-tolti/",
    dedupeKey: opts.dedupeKey || `pt-removed:${pmUserId}:${String(opts.sourceHint || Date.now())}`,
  });
}

async function notifyStaffValutazione(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  const staffUserId = String(opts.staffUserId || "").trim();
  if (!guild || !guildId || !/^\d{16,22}$/.test(staffUserId)) return false;
  const kind = String(opts.kind || "negative").trim().toLowerCase() === "positive" ? "positive" : "negative";
  const reason = String(opts.reason || "").trim().slice(0, 200);
  const actorName = String(opts.actorName || "Staff").trim();
  const sectionId = String(opts.sectionId || "").trim();
  const isPositive = kind === "positive";
  return notifyUsers(guild, [staffUserId], {
    title: isPositive ? "Valutazione positiva" : "Valutazione negativa",
    body: `${actorName} ti ha dato una valutazione ${isPositive ? "positiva" : "negativa"}${sectionId ? ` #${sectionId}` : ""}${reason ? `: ${reason}` : ""}.`,
    kind: "mod",
    openUrl: "/staff/",
    dedupeKey: sectionId ? `val-${kind}:${staffUserId}:${sectionId}` : `val-${kind}:${staffUserId}:${Date.now()}`,
  });
}

async function notifyStaffWarn(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  const staffUserId = String(opts.staffUserId || "").trim();
  const warnCount = Math.max(0, Math.floor(Number(opts.warnCount) || 0));
  if (!guild || !guildId || !/^\d{16,22}$/.test(staffUserId) || warnCount <= 0) return 0;

  const staffName = String(opts.staffName || staffUserId).trim();
  const reason = String(opts.reason || "").trim().slice(0, 200);
  const actorName = String(opts.actorName || "Staff").trim();
  const needsDepexDecision = opts.needsDepexDecision === true;
  const isAutoFromNegatives = opts.isAutoFromNegatives === true;

  let sent = 0;
  sent += await notifyUsers(guild, [staffUserId], {
    title: `Warn staff #${warnCount}`,
    body: isAutoFromNegatives
      ? `Hai ricevuto il warn #${warnCount} dopo 3 valutazioni negative.`
      : `${actorName} ti ha assegnato il warn #${warnCount}${reason ? `: ${reason}` : ""}.`,
    kind: "mod",
    openUrl: "/staff/",
    dedupeKey: `warn:${staffUserId}:${warnCount}`,
  });

  if (needsDepexDecision || warnCount >= 2) {
    const hs = await getHighStaffRecipientUserIds(guild);
    sent += await notifyUsers(
      guild,
      hs,
      {
        title: needsDepexDecision ? "Warn staff — decidi depex" : `Warn staff #${warnCount}`,
        body: needsDepexDecision
          ? `${staffName} ha 2 warn staff: serve decidere se applicare un depex ora (Discord o Gestione).`
          : `${staffName} ha raggiunto ${warnCount} warn staff${isAutoFromNegatives ? " (da valutazioni negative)" : ""}.`,
        kind: "mod",
        openUrl: needsDepexDecision ? "/staff/gestione/" : "/staff/",
        dedupeKey: needsDepexDecision ? `warn-depex-prompt:${staffUserId}:${warnCount}` : `warn-hs:${staffUserId}:${warnCount}`,
      },
      [staffUserId],
    );
  }
  return sent;
}

async function notifyStaffPexDepex(opts = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  const targetUserId = String(opts.targetUserId || "").trim();
  if (!guild || !guildId || !/^\d{16,22}$/.test(targetUserId)) return 0;

  const kind = String(opts.kind || "").trim().toLowerCase() === "depex" ? "depex" : "pex";
  const kindLabel = kind === "pex" ? "Pex" : "Depex";
  const fromLabel = formatRoleLabel(guild, opts.oldRoleId);
  const toLabel = formatRoleLabel(guild, opts.newRoleId);
  const reason = String(opts.reason || "").trim().slice(0, 200);
  const actorUserId = String(opts.actorUserId || "").trim();
  const actorName = String(opts.actorName || "Staff").trim();
  const targetName = String(opts.targetName || targetUserId).trim();
  const sourceHint = String(opts.sourceHint || opts.dedupeHint || "").trim();
  const dedupeKey =
    String(opts.dedupeKey || "").trim() ||
    `staff-${kind}:${targetUserId}:${String(opts.oldRoleId || "")}:${String(opts.newRoleId || "")}:${sourceHint || "x"}`;

  let sent = 0;
  sent += await notifyUsers(guild, [targetUserId], {
    title: `${kindLabel} staff`,
    body: `${fromLabel} → ${toLabel}${reason ? `. ${reason}` : ""}`,
    kind: kind === "pex" ? "success" : "mod",
    openUrl: "/staff/",
    dedupeKey: `${dedupeKey}:target`,
  });

  const viewers = await getOrganicoViewerUserIds(guild);
  sent += await notifyUsers(
    guild,
    viewers,
    {
      title: `${kindLabel}: ${targetName}`,
      body: `${actorName}: ${fromLabel} → ${toLabel}${reason ? `. ${reason}` : ""}`,
      kind: "mod",
      openUrl: `/staff/organico/?userId=${encodeURIComponent(targetUserId)}`,
      dedupeKey: `${dedupeKey}:team`,
    },
    [targetUserId, actorUserId],
  );
  return sent;
}

module.exports = {
  notifyPuntiToltiPending,
  notifyPuntiToltiReviewed,
  notifyPuntiToltiPointsRemoved,
  notifyStaffValutazione,
  notifyStaffWarn,
  notifyStaffPexDepex,
  memberDisplayName,
  formatRoleLabel,
};

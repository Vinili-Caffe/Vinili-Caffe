const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { enqueueSiteInAppNotification } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const { collectHumanMemberIdsWithRole } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  staffLadderRoleIds,
  staffRoleId,
} = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");

const RECIPIENT_CACHE_TTL_MS = 60_000;
const recipientCache = new Map();

/** Preferenze sito: kind `staff` → gruppo "Eventi staff" (staffKindGroup1). */
const STAFF_KIND = "staff";

function cacheGet(key?) {
  const hit = recipientCache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.ids;
}

function cacheSet(key?, ids?) {
  recipientCache.set(key, { expiresAt: Date.now() + RECIPIENT_CACHE_TTL_MS, ids: [...ids] });
  return ids;
}

async function collectIdsForRoleIds(guild?, roleIds?) {
  const ids = new Set();
  const roles = [...new Set((roleIds || []).map((id?) => String(id || "").trim()).filter(Boolean))];
  for (const roleId of roles) {
    const members = await collectHumanMemberIdsWithRole(guild, roleId, {
      logTag: "[siteStaffEventNotifications]",
    }).catch(() => []);
    for (const id of members || []) ids.add(String(id));
  }
  return [...ids];
}

async function getHighStaffRecipientUserIds(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guild || !guildId) return [];
  const cacheKey = `${guildId}:hs`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const ids = await collectIdsForRoleIds(guild, staffLadderRoleIds(STAFF_HIGH_STAFF_ELIGIBLE_KEYS));
  return cacheSet(
    cacheKey,
    ids.filter((id?) => /^\d{16,22}$/.test((id as any))),
  );
}

async function getOrganicoViewerUserIds(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guild || !guildId) return [];
  const cacheKey = `${guildId}:organico`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const roleIds = [...staffLadderRoleIds(STAFF_HIGH_STAFF_ELIGIBLE_KEYS), staffRoleId("Director")].filter(Boolean);
  const ids = await collectIdsForRoleIds(guild, roleIds);
  return cacheSet(
    cacheKey,
    ids.filter((id?) => /^\d{16,22}$/.test((id as any))),
  );
}

function formatRoleLabel(guild?, roleIdOrName?) {
  const raw = String(roleIdOrName || "").trim();
  if (!raw) return "Nessuno";
  if (/^\d{16,22}$/.test(raw)) {
    const name = guild?.roles?.cache?.get(raw)?.name;
    return name || raw;
  }
  return raw;
}

function memberDisplayName(member?, userLike?, fallbackId = "") {
  const fromMember = String(member?.displayName || member?.user?.globalName || member?.user?.username || "").trim();
  if (fromMember) return fromMember;
  const fromUser = String(
    userLike?.globalName || userLike?.displayName || userLike?.username || userLike?.tag || "",
  ).trim();
  if (fromUser) return fromUser;
  return String(fallbackId || userLike?.id || "").trim() || "Staff";
}

async function notifyUsers(guild?, userIds?, payload?, excludeIds = []) {
  const guildId = String(guild?.id || payload?.guildId || IDs.guilds?.main || "").trim();
  if (!guildId) return 0;
  const exclude = new Set((excludeIds || []).map(String));
  const ids = [
    ...new Set(
      (userIds || [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{16,22}$/.test(id) && !exclude.has(id)),
    ),
  ];
  if (!ids.length) return 0;
  await Promise.all(
    ids.map((userId?) =>
      enqueueSiteInAppNotification({
        guildId,
        userId,
        title: String(payload.title || "").trim().slice(0, 120),
        body: String(payload.body || "").trim().slice(0, 500),
        kind: payload.kind || STAFF_KIND,
        channel: payload.channel,
        openUrl: String(payload.openUrl || "").trim().slice(0, 400) || undefined,
        dedupeKey: String(payload.dedupeKey || "").trim().slice(0, 120) || undefined,
        dedupeWindowMs: payload.dedupeWindowMs ?? 86_400_000,
      }).catch(() => false),
    ),
  ).catch(() => null);
  return ids.length;
}

function puntiToltiProfileOpenUrl(pmUserId?) {
  const uid = String(pmUserId || "").trim();
  /* partnerPtChrono1 / ptNotifProfile1: fuori inbox → card Partner sul profilo */
  if (/^\d{16,22}$/.test(uid)) {
    return `/user/?id=${encodeURIComponent(uid)}&tab=staff&staffOpen=pm-punti-tolti`;
  }
  return "/user/?tab=staff&staffOpen=pm-punti-tolti";
}

async function notifyPuntiToltiPending(opts: Record<string, any> = {}) {
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
      `${pmName}${rule ? `: ${rule}` : ""}. Conferma o nega dalla card Partner sul profilo.`,
    kind: STAFF_KIND,
    openUrl: puntiToltiProfileOpenUrl(pmUserId),
    dedupeKey: messageId ? `pt-pending:${messageId}` : `pt-pending:${pmUserId}:${Date.now()}`,
  }, [pmUserId]);
}

async function notifyPuntiToltiReviewed(opts: Record<string, any> = {}) {
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
      kind: STAFF_KIND,
      /* notifCats3 / ptNotifProfile1: profilo Partner (non inbox). */
      channel: "inbox",
      openUrl: puntiToltiProfileOpenUrl(opts.pmUserId),
      dedupeKey: messageId ? `pt-review:${messageId}:${isConfirm ? "ok" : "no"}` : undefined,
    },
  );
}

async function notifyPuntiToltiPointsRemoved(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  const pmUserId = String(opts.pmUserId || "").trim();
  if (!guild || !guildId || !/^\d{16,22}$/.test(pmUserId)) return false;
  const rule = String(opts.rule || "").trim().slice(0, 160);
  const actorName = String(opts.actorName || "Staff").trim();
  return notifyUsers(guild, [pmUserId], {
    title: "Punto partnership rimosso",
    body: `${actorName} ha registrato una rimozione punti${rule ? `: ${rule}` : ""}.`,
    kind: STAFF_KIND,
    /* notifCats3 / ptNotifProfile1: profilo Partner (non inbox). */
    channel: "inbox",
    openUrl: puntiToltiProfileOpenUrl(pmUserId),
    dedupeKey: opts.dedupeKey || `pt-removed:${pmUserId}:${String(opts.sourceHint || Date.now())}`,
  });
}

async function notifyStaffValutazione(opts: Record<string, any> = {}) {
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
    kind: STAFF_KIND,
    openUrl: "/staff/",
    dedupeKey: sectionId ? `val-${kind}:${staffUserId}:${sectionId}` : `val-${kind}:${staffUserId}:${Date.now()}`,
  });
}

async function notifyStaffValutazioneRemoved(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  const staffUserId = String(opts.staffUserId || "").trim();
  if (!guild || !guildId || !/^\d{16,22}$/.test(staffUserId)) return false;
  const kind = String(opts.kind || "negative").trim().toLowerCase() === "positive" ? "positive" : "negative";
  const reason = String(opts.reason || "").trim().slice(0, 200);
  const actorName = String(opts.actorName || "Staff").trim();
  const sectionId = String(opts.sectionId || opts.removeId || "").trim();
  const isPositive = kind === "positive";
  return notifyUsers(guild, [staffUserId], {
    title: isPositive ? "Valutazione positiva rimossa" : "Valutazione negativa rimossa",
    body: `${actorName} ha rimosso una valutazione ${isPositive ? "positiva" : "negativa"}${sectionId ? ` #${sectionId}` : ""}${reason ? `: ${reason}` : ""}.`,
    kind: STAFF_KIND,
    openUrl: "/staff/",
    dedupeKey: sectionId
      ? `val-rm-${kind}:${staffUserId}:${sectionId}`
      : `val-rm-${kind}:${staffUserId}:${Date.now()}`,
  });
}

async function notifyStaffWarn(opts: Record<string, any> = {}) {
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
    kind: STAFF_KIND,
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
        kind: STAFF_KIND,
        openUrl: needsDepexDecision
          ? `/user/?id=${encodeURIComponent(staffUserId)}&tab=staff&manage=1`
          : "/staff/",
        dedupeKey: needsDepexDecision ? `warn-depex-prompt:${staffUserId}:${warnCount}` : `warn-hs:${staffUserId}:${warnCount}`,
      },
      [staffUserId],
    );
  }
  return sent;
}

async function notifyStaffWarnRemoved(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  const staffUserId = String(opts.staffUserId || "").trim();
  if (!guild || !guildId || !/^\d{16,22}$/.test(staffUserId)) return false;
  const removeId = String(opts.removeId || opts.warnId || "").trim();
  const reason = String(opts.reason || "").trim().slice(0, 200);
  const actorName = String(opts.actorName || "Staff").trim();
  const warnCountAfter = Math.max(0, Math.floor(Number(opts.warnCountAfter) || 0));
  return notifyUsers(guild, [staffUserId], {
    title: removeId ? `Warn staff #${removeId} rimosso` : "Warn staff rimosso",
    body: `${actorName} ha rimosso un warn staff${reason ? `: ${reason}` : ""}${
      Number.isFinite(warnCountAfter) ? `. Ora ne hai ${warnCountAfter}.` : "."
    }`,
    kind: STAFF_KIND,
    openUrl: "/staff/",
    dedupeKey: removeId ? `warn-rm:${staffUserId}:${removeId}` : `warn-rm:${staffUserId}:${Date.now()}`,
  });
}

async function notifyStaffPexDepex(opts: Record<string, any> = {}) {
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
    kind: STAFF_KIND,
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
      kind: STAFF_KIND,
      /* notifPexTeamInbox1: team "Pex: Name" → Staff inbox (Avvisi), not Personali → Eventi staff */
      channel: "inbox",
      /* organicoPexNotifCine1: senza ?userId= (filtrava a 1 + rompeva cine su tutti i device) */
      openUrl: "/staff/organico/",
      dedupeKey: `${dedupeKey}:team`,
    },
    [targetUserId, actorUserId],
  );
  return sent;
}

const RESOCONTO_ACTION_LABELS = Object.freeze({
  nl: "Nessuna azione",
  rc: "Richiamo",
  vp: "Valutazione positiva",
  vn: "Valutazione negativa",
  px: "Pex",
  dp: "Depex",
  batch: "Azioni multiple",
});

async function notifyResocontoOutcome(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || "").trim();
  const staffUserId = String(opts.staffUserId || opts.targetUserId || "").trim();
  if (!guild || !guildId || !/^\d{16,22}$/.test(staffUserId)) return false;

  const actionKey = String(opts.actionKey || "").trim().toLowerCase();
  // vp/vn/px/dp already have dedicated notifs; only cover gaps (nl/rc/batch/other)
  if (["vp", "vn", "px", "dp"].includes(actionKey)) return false;

  const actionLabel =
    String(opts.actionLabel || "").trim() ||
    RESOCONTO_ACTION_LABELS[actionKey] ||
    (actionKey ? actionKey.toUpperCase() : "Esito resoconto");
  const reason = String(opts.reason || opts.statusText || "").trim().slice(0, 200);
  const actorName = String(opts.actorName || "Staff").trim();
  const messageId = String(opts.messageId || "").trim();

  return notifyUsers(guild, [staffUserId], {
    title: `Resoconto: ${actionLabel}`,
    body: `${actorName} ha chiuso il tuo resoconto con «${actionLabel}»${reason ? `: ${reason}` : ""}.`,
    kind: STAFF_KIND,
    openUrl: "/staff/",
    dedupeKey: messageId
      ? `resoconto-out:${messageId}:${actionKey || "x"}`
      : `resoconto-out:${staffUserId}:${actionKey || "x"}:${Date.now()}`,
  });
}

export = {
  STAFF_KIND,
  getHighStaffRecipientUserIds,
  notifyUsers,
  notifyPuntiToltiPending,
  notifyPuntiToltiReviewed,
  notifyPuntiToltiPointsRemoved,
  notifyStaffValutazione,
  notifyStaffValutazioneRemoved,
  notifyStaffWarn,
  notifyStaffWarnRemoved,
  notifyStaffPexDepex,
  notifyResocontoOutcome,
  memberDisplayName,
};

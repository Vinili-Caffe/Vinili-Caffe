/**
 * In-app inbox notifications for staff weekly compiti.
 * Marker: staffCompitiNotif1
 */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  getHighStaffRecipientUserIds,
  notifyUsers,
  memberDisplayName,
  STAFF_KIND,
} = require("./siteStaffEventNotifications") as typeof import("./siteStaffEventNotifications");
const { removeInboxItemByDedupeKey } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");

const OPEN_URL = "/staff/compiti/";
const DEDUPE_DAY_MS = 86_400_000;

function compitiOpenUrl(userId?) {
  const uid = String(userId || "").trim();
  if (/^\d{17,20}$/.test(uid)) return `${OPEN_URL}?userId=${encodeURIComponent(uid)}`;
  return OPEN_URL;
}

function taskLabelFromMeta(tasksMeta?, taskId?) {
  const id = String(taskId || "").trim();
  const row = Array.isArray(tasksMeta) ? tasksMeta.find((t?) => String(t?.id || "") === id) : null;
  return String(row?.label || id || "compito").trim() || "compito";
}

function submitDedupeKey(weekKey?, workerUserId?) {
  return `compiti:submit:${String(weekKey || "").trim()}:${String(workerUserId || "").trim()}`;
}

async function clearCompitiSubmitNotifs(guild?, weekKey?, workerUserId?) {
  const recipients = await getHighStaffRecipientUserIds(guild).catch(() => []);
  const key = submitDedupeKey(weekKey, workerUserId);
  await Promise.all(
    recipients.map((uid?) => removeInboxItemByDedupeKey(uid, key).catch(() => false)),
  ).catch(() => null);
}

/** High Staff: new submission awaiting review. */
async function notifyCompitiSubmitted(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  if (!guild || !guildId) return 0;
  const workerUserId = String(opts.workerUserId || "").trim();
  const weekKey = String(opts.weekKey || "").trim();
  if (!/^\d{17,20}$/.test(workerUserId) || !weekKey) return 0;
  const workerName = String(
    opts.workerName || memberDisplayName(opts.workerMember, opts.workerUser, workerUserId),
  ).trim();
  const taskLabel = String(opts.taskLabel || "compito").trim();
  const auto = Boolean(opts.auto);
  const recipients = await getHighStaffRecipientUserIds(guild);
  return notifyUsers(
    guild,
    recipients,
    {
      title: auto ? "Compito automatico da revisionare" : "Compito da revisionare",
      body: auto
        ? `${workerName}: trigger automatico «${taskLabel}» (${weekKey}). Conferma o rifiuta su Compiti.`
        : `${workerName} ha inviato «${taskLabel}» (${weekKey}). Apri Compiti per Confermare o Rifiutare.`,
      kind: STAFF_KIND,
      channel: "inbox",
      openUrl: compitiOpenUrl(workerUserId),
      dedupeKey: submitDedupeKey(weekKey, workerUserId),
      dedupeWindowMs: DEDUPE_DAY_MS * 8,
    },
    [workerUserId, String(opts.actorUserId || "").trim()].filter(Boolean),
  );
}

/** Worker: HS approved. */
async function notifyCompitiApproved(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const workerUserId = String(opts.workerUserId || "").trim();
  const weekKey = String(opts.weekKey || "").trim();
  if (!guild || !guildId || !/^\d{17,20}$/.test(workerUserId) || !weekKey) return 0;
  const reviewerName = String(opts.reviewerName || "High Staff").trim();
  const taskLabel = String(opts.taskLabel || "compito").trim();
  await clearCompitiSubmitNotifs(guild, weekKey, workerUserId);
  return notifyUsers(guild, [workerUserId], {
    title: "Compito approvato",
    body: `${reviewerName} ha confermato «${taskLabel}» (${weekKey}). Valutazione positiva registrata.`,
    kind: STAFF_KIND,
    channel: "inbox",
    openUrl: OPEN_URL,
    dedupeKey: `compiti:approve:${weekKey}:${workerUserId}`,
    dedupeWindowMs: DEDUPE_DAY_MS * 14,
  });
}

/**
 * Worker: rejected.
 * softRetry=true → still before Sunday 18 (can retry).
 */
async function notifyCompitiRejected(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const workerUserId = String(opts.workerUserId || "").trim();
  const weekKey = String(opts.weekKey || "").trim();
  if (!guild || !guildId || !/^\d{17,20}$/.test(workerUserId) || !weekKey) return 0;
  const softRetry = opts.softRetry === true;
  const skipNegative = opts.skipNegative === true;
  const reviewerName = String(opts.reviewerName || "High Staff").trim();
  const taskLabel = String(opts.taskLabel || "compito").trim();
  await clearCompitiSubmitNotifs(guild, weekKey, workerUserId);
  let body;
  if (softRetry) {
    body = `${reviewerName} ha rifiutato «${taskLabel}» (${weekKey}). Puoi riprovare entro domenica ore 18.`;
  } else if (skipNegative) {
    body = `${reviewerName} ha rifiutato «${taskLabel}» (${weekKey}). Settimana chiusa senza valutazione negativa.`;
  } else {
    body = `${reviewerName} ha rifiutato «${taskLabel}» (${weekKey}). Settimana chiusa: valutazione negativa.`;
  }
  return notifyUsers(guild, [workerUserId], {
    title: softRetry ? "Compito da rifare" : "Compito rifiutato",
    body,
    kind: STAFF_KIND,
    channel: "inbox",
    openUrl: OPEN_URL,
    dedupeKey: `compiti:reject:${softRetry ? "soft" : "final"}:${weekKey}:${workerUserId}`,
    dedupeWindowMs: DEDUPE_DAY_MS * 14,
  });
}

/** Worker: missed Sunday 18 (draft/rejected left open). */
async function notifyCompitiMissed(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const workerUserId = String(opts.workerUserId || "").trim();
  const weekKey = String(opts.weekKey || "").trim();
  if (!guild || !guildId || !/^\d{17,20}$/.test(workerUserId) || !weekKey) return 0;
  const skipNegative = opts.skipNegative === true;
  return notifyUsers(guild, [workerUserId], {
    title: "Compito non completato",
    body: skipNegative
      ? `Non hai completato il compito settimanale (${weekKey}) entro domenica ore 18. Nessuna valutazione negativa (settimana soft launch).`
      : `Non hai completato il compito settimanale (${weekKey}) entro domenica ore 18. Valutazione negativa applicata.`,
    kind: STAFF_KIND,
    channel: "inbox",
    openUrl: OPEN_URL,
    dedupeKey: `compiti:miss:${weekKey}:${workerUserId}`,
    dedupeWindowMs: DEDUPE_DAY_MS * 14,
  });
}

/** Worker: still submitted after Sunday 24 → system auto-reject. */
async function notifyCompitiAutoFailed(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const workerUserId = String(opts.workerUserId || "").trim();
  const weekKey = String(opts.weekKey || "").trim();
  if (!guild || !guildId || !/^\d{17,20}$/.test(workerUserId) || !weekKey) return 0;
  await clearCompitiSubmitNotifs(guild, weekKey, workerUserId);
  return notifyUsers(guild, [workerUserId], {
    title: "Compito scaduto in revisione",
    body: `La revisione di «${String(opts.taskLabel || "compito").trim()}» (${weekKey}) non è arrivata in tempo. Impostato come non completato.`,
    kind: STAFF_KIND,
    channel: "inbox",
    openUrl: OPEN_URL,
    dedupeKey: `compiti:autofail:${weekKey}:${workerUserId}`,
    dedupeWindowMs: DEDUPE_DAY_MS * 14,
  });
}

/** Worker: reminder within 24h of Sunday 18 if still draft/rejected. */
async function notifyCompitiDeadlineSoon(opts: Record<string, any> = {}) {
  const guild = opts.guild;
  const guildId = String(guild?.id || opts.guildId || IDs.guilds?.main || "").trim();
  const workerUserId = String(opts.workerUserId || "").trim();
  const weekKey = String(opts.weekKey || "").trim();
  if (!guild || !guildId || !/^\d{17,20}$/.test(workerUserId) || !weekKey) return 0;
  return notifyUsers(guild, [workerUserId], {
    title: "Scadenza compiti — domenica 18:00",
    body: `Hai ancora tempo fino a domenica ore 18 (Roma) per inviare il compito settimanale (${weekKey}).`,
    kind: STAFF_KIND,
    channel: "inbox",
    openUrl: OPEN_URL,
    dedupeKey: `compiti:due:${weekKey}:${workerUserId}`,
    dedupeWindowMs: DEDUPE_DAY_MS * 3,
  });
}

export = {
  taskLabelFromMeta,
  notifyCompitiSubmitted,
  notifyCompitiApproved,
  notifyCompitiRejected,
  notifyCompitiMissed,
  notifyCompitiAutoFailed,
  notifyCompitiDeadlineSoon,
};

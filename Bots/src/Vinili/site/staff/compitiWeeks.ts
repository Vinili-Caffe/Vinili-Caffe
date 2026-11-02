/** Compiti staff: settimane salvate per utente (pulizia, valutazioni, bozze vuote). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { ALLOWED_TASK_IDS, isAutoTask } = require("./siteStaffCompitiCatalog") as typeof import("./siteStaffCompitiCatalog");
const { weekKeysInRomeMonth } = require("./compitiCalendar") as typeof import("./compitiCalendar");
const { MAX_PROOFS } = require("./compitiProofs") as typeof import("./compitiProofs");

/** Label storici per task rimossi dal catalogo. */
const LEGACY_TASK_LABELS = Object.freeze({
  invite_users: "Invitare utenti (storico)",
  boost_or_vip: "Boost o VIP (storico)",
});
/** bug: isKnownTaskId usava LEGACY_TASK_IDS senza che esistesse (errore su ogni compito fuori catalogo). */
const LEGACY_TASK_IDS = new Set(Object.keys(LEGACY_TASK_LABELS));

const MAX_WEEKS = 16;
const MAX_NOTE = 1200;
const REASON_OK = "Compito settimanale completato";
const REASON_FAIL = "Compito settimanale non completato";
/** Soft launch: niente valutazione automatica negativa in queste settimane (miss/rifiuto). */
const SKIP_NEGATIVE_VAL_WEEK_KEYS = new Set(["2026-W37", "2026-W38"]);
/* Marker: compitiSwapGrace1 — swap 1/mese + bonus staffer + grace nuovi staff */

function shouldSkipNegativeValutazione(weekKey?) {
  return SKIP_NEGATIVE_VAL_WEEK_KEYS.has(String(weekKey || "").trim());
}

const STATUS = Object.freeze({
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  MISSED: "missed",
  /** Nuovo staff pexato in settimana: niente compito fino al lunedì successivo. */
  SKIPPED: "skipped",
});

function emptyWeek() {
  return {
    taskId: "",
    done: false,
    note: "",
    proofs: [],
    status: STATUS.DRAFT,
    submittedAt: 0,
    reviewedAt: 0,
    reviewedBy: "",
    valutazioneApplied: false,
    autoSubmitted: false,
    updatedAt: 0,
  };
}

function isKnownTaskId(taskId?) {
  const id = String(taskId || "").trim();
  return ALLOWED_TASK_IDS.has(id) || LEGACY_TASK_IDS.has(id);
}

function sanitizeWeekEntry(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  // migrate multi-task byTask → single selected
  let taskId = String(src.taskId || "").trim();
  let note = String(src.note == null ? "" : src.note).slice(0, MAX_NOTE);
  let done = Boolean(src.done);
  let proofs = Array.isArray(src.proofs) ? src.proofs : [];
  let status = String(src.status || "").trim();
  if (!Object.values(STATUS).includes(status)) {
    status = done ? STATUS.SUBMITTED : STATUS.DRAFT;
  }
  if (!taskId && src.byTask && typeof src.byTask === "object") {
    const ids = Object.keys(src.byTask);
    const prefer = ids.find((id?) => src.byTask[id]?.done) || ids[0] || "";
    if (isKnownTaskId(prefer)) {
      taskId = prefer;
      const hit = src.byTask[prefer] || {};
      done = Boolean(hit.done);
      note = String(hit.note || "").slice(0, MAX_NOTE);
      if (done) status = STATUS.SUBMITTED;
    }
  }
  if (taskId && !isKnownTaskId(taskId)) {
    /* compitiStatusLabel1: non cancellare taskId su settimane già chiuse/inviate (storico) */
    const closed =
      status === STATUS.APPROVED ||
      status === STATUS.SUBMITTED ||
      status === STATUS.MISSED ||
      status === STATUS.REJECTED ||
      status === STATUS.SKIPPED;
    if (!closed) taskId = "";
  }
  proofs = proofs
    .filter((p?) => p && p.url)
    .slice(0, MAX_PROOFS)
    .map((p?) => ({
      id: String(p.id || "").slice(0, 32),
      name: String(p.name || "prova").slice(0, 80),
      mime: String(p.mime || "").slice(0, 80),
      url: String(p.url || "").slice(0, 400),
    }));
  return {
    taskId,
    done: Boolean(done) || status === STATUS.SUBMITTED || status === STATUS.APPROVED,
    note,
    proofs,
    status,
    submittedAt: Number(src.submittedAt) || 0,
    reviewedAt: Number(src.reviewedAt) || 0,
    reviewedBy: String(src.reviewedBy || "").trim(),
    valutazioneApplied: Boolean(src.valutazioneApplied),
    autoSubmitted: Boolean(src.autoSubmitted),
    updatedAt: Number(src.updatedAt) || 0,
  };
}

function sanitizeWeekMap(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(src)) {
    const key = String(k || "").trim();
    if (!/^\d{4}-W\d{2}$/.test(key)) continue;
    out[key] = sanitizeWeekEntry(v);
  }
  return out;
}

function pruneWeekMap(map?, keepKey?) {
  const keys = Object.keys(map || {});
  if (keys.length <= MAX_WEEKS) return map;
  keys.sort((a?, b?) => {
    const ua = Number(map[a]?.updatedAt) || 0;
    const ub = Number(map[b]?.updatedAt) || 0;
    if (ua !== ub) return ub - ua;
    return String(b).localeCompare(String(a));
  });
  const keep = new Set(keys.slice(0, MAX_WEEKS));
  if (keepKey) keep.add(String(keepKey));
  const out: Record<string, any> = {};
  for (const k of Object.keys(map)) {
    if (keep.has(k)) out[k] = map[k];
  }
  return out;
}

async function loadMap(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select("profile.siteStaffCompiti")
    .lean()
    .catch(() => null);
  return sanitizeWeekMap(doc?.profile?.siteStaffCompiti || {});
}

async function saveMap(guildId?, userId?, map?) {
  await ActivityUserProfile.updateOne(
    { guildId: String(guildId || ""), userId: String(userId || "") },
    {
      $setOnInsert: { guildId: String(guildId || ""), userId: String(userId || "") },
      $set: { "profile.siteStaffCompiti": map },
    },
    { upsert: true },
  ).catch(() => null);
}

/** Bozze vuote lasciate dal vecchio assign week-locked → niente spunta fantasma.
 *  compitiAutoPickKeep1: i compiti auto selezionati (niente note/prove) NON sono ghost —
 *  altrimenti il GET Compiti cancellava la scelta e tryAutoSubmit falliva con not_selected.
 */
function isGhostDraftEntry(raw?) {
  const e = sanitizeWeekEntry(raw || emptyWeek());
  if (e.taskId && isAutoTask(e.taskId)) return false;
  return (
    e.status === STATUS.DRAFT &&
    Boolean(e.taskId) &&
    !String(e.note || "").trim() &&
    !(Array.isArray(e.proofs) && e.proofs.length) &&
    !e.submittedAt &&
    !e.autoSubmitted
  );
}

async function clearGhostDraftPicks(guildId?, userId?, monthKey?) {
  const map = await loadMap(guildId, userId);
  let changed = false;
  for (const wk of weekKeysInRomeMonth(monthKey)) {
    if (!isGhostDraftEntry(map[wk])) continue;
    const entry = sanitizeWeekEntry(map[wk] || emptyWeek());
    entry.taskId = "";
    entry.updatedAt = Date.now();
    map[wk] = entry;
    changed = true;
  }
  if (changed) await saveMap(guildId, userId, pruneWeekMap(map));
  return map;
}

/**
 * Migration one-shot disabled (compitiNoWipeOnSwitch1).
 * Old path wiped autoSubmitted/submitted entries on every HS profile load
 * until plan.revertedAutoPick1 — that reset proofs when switching staff.
 */
async function revertUnreviewedRandomAutoPicks(guildId?, userId?, monthKey?, weekKey?, plan?) {
  return { map: await loadMap(guildId, userId), plan };
}

async function applyValutazione(client?, guildId?, userId?, type?, weekKey?) {
  try {
    if (type === "negative" && shouldSkipNegativeValutazione(weekKey)) {
      return { ok: true, skipped: true };
    }
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    const { ensureAutoValutazione } = require("../../Staff/services/staffAutoValutazioniService") as typeof import("../../Staff/services/staffAutoValutazioniService");
    const key = `staff_compiti:${weekKey}`;
    const reason = type === "positive" ? REASON_OK : REASON_FAIL;
    const out = await ensureAutoValutazione(guild, member, key, type, reason);
    return Boolean(out?.ok);
  } catch (err) {
    global.logger?.warn?.("[COMPITI] valutazione", err?.message || err);
    return false;
  }
}

export = { LEGACY_TASK_LABELS, MAX_NOTE, shouldSkipNegativeValutazione, STATUS, emptyWeek, sanitizeWeekEntry, pruneWeekMap, loadMap, saveMap, clearGhostDraftPicks, revertUnreviewedRandomAutoPicks, applyValutazione };

const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const crypto = require("node:crypto") as typeof import("node:crypto");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const {
  assertWebsiteStaffAccess,
  normalizeHeaderSecret,
} = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const {
  accountUsername,
  userAvatarUrlDynamic,
  discordDefaultAvatarUrl,
} = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { memberIsHighStaffEligible } = require("../Staff/staffRoleHierarchy") as typeof import("../Staff/staffRoleHierarchy");
const { remapRoleIdForward } = require("../Config/emergencyRoleIdRemap") as typeof import("../Config/emergencyRoleIdRemap");
const {
  parseViewAsFromReq,
  canUseViewAs,
  compitiRoleOverride,
} = require("./siteViewAsPreview") as typeof import("./siteViewAsPreview");
const {
  notifyCompitiSubmitted,
  notifyCompitiApproved,
  notifyCompitiRejected,
  notifyCompitiMissed,
  notifyCompitiAutoFailed,
  notifyCompitiDeadlineSoon,
  taskLabelFromMeta,
} = require("./siteStaffCompitiNotifications") as typeof import("./siteStaffCompitiNotifications");
const { memberDisplayName } = require("./siteStaffEventNotifications") as typeof import("./siteStaffEventNotifications");
const {
  TASKS_META,
  ALLOWED_TASK_IDS,
  isAutoTask,
  publicTasksMeta,
  taskById,
} = require("./siteStaffCompitiCatalog") as typeof import("./siteStaffCompitiCatalog");

/** siteLiveAll1 */
function emitCompitiRealtime(extras: Record<string, any> = {}) {
  try {
    const { broadcastSiteStaffCompitiChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
    broadcastSiteStaffCompitiChanged(extras);
  } catch (_) {}
  try {
    const uid = String(extras.userId || "").trim();
    if (/^\d{16,22}$/.test(uid)) {
      const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi") as typeof import("./siteStaffProfileApi");
      clearStaffProfileCacheForUser(uid, { action: extras.action || "compiti" });
    }
  } catch (_) {}
}

/** Label storici per task rimossi dal catalogo. */
const LEGACY_TASK_LABELS = Object.freeze({
  invite_users: "Invitare utenti (storico)",
  boost_or_vip: "Boost o VIP (storico)",
});

function displayTaskLabel(taskId?, status?) {
  const id = String(taskId || "").trim();
  if (!id) {
    if (status === STATUS.APPROVED) return "Compito confermato";
    if (status === STATUS.SUBMITTED) return "In revisione";
    if (status === STATUS.MISSED) return "Non completato";
    if (status === STATUS.REJECTED) return "Rifiutato";
    if (status === STATUS.SKIPPED) return "Esonero (nuovo staff)";
    return "Nessun compito";
  }
  const meta = taskById(id);
  if (meta?.label) return meta.label;
  if (LEGACY_TASK_LABELS[id]) return LEGACY_TASK_LABELS[id];
  return id;
}

const MAX_WEEKS = 16;
const MAX_NOTE = 1200;
const MAX_PROOFS = 4;
const MAX_PROOF_BYTES = 3 * 1024 * 1024;
const ALLOWED_PROOF_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
]);
const UPLOAD_ROOT = path.resolve(__dirname, "../../../Data/uploads/staff-compiti");
const FILE_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const REASON_OK = "Compito settimanale completato";
const REASON_FAIL = "Compito settimanale non completato";
/** Soft launch: niente valutazione automatica negativa in queste settimane (miss/rifiuto). */
const SKIP_NEGATIVE_VAL_WEEK_KEYS = new Set(["2026-W37", "2026-W38"]);
/* Marker: compitiSwapGrace1 — swap 1/mese + bonus staffer + grace nuovi staff */

function shouldSkipNegativeValutazione(weekKey?) {
  return SKIP_NEGATIVE_VAL_WEEK_KEYS.has(String(weekKey || "").trim());
}

function isoWeekThursdayUtc(year?, week?) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const thursday = new Date(jan4);
  thursday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7 + 3);
  return thursday;
}

/** Quante settimane ISO (giovedì in mese) ci sono in YYYY-MM — tipicamente 4 o 5, a volte 3. */
function isoWeeksInMonthKey(monthKey?) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!m) return 4;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  let count = 0;
  // ISO weeks can spill across years; scan previous year week 48..53 and current 1..53
  for (const y of [year - 1, year]) {
    for (let w = 1; w <= 53; w++) {
      const thu = isoWeekThursdayUtc(y, w);
      if (thu.getUTCFullYear() === year && thu.getUTCMonth() + 1 === month) count += 1;
    }
  }
  return Math.max(3, Math.min(6, count || 4));
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

/** 1 scambio gratis / mese compiti; bonus da Staffer della settimana restano in banca. */
const MONTHLY_SWAP_BASE = 1;

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function romeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type?) => {
    const hit = parts.find((p?) => p.type === type);
    return hit ? hit.value : "";
  };
  return {
    y: Number(get("year")) || 0,
    m: Number(get("month")) || 0,
    d: Number(get("day")) || 0,
    weekday: String(get("weekday") || ""),
    hour: Number(get("hour")) || 0,
    minute: Number(get("minute")) || 0,
  };
}

function currentRomeIsoWeekKey(date = new Date()) {
  const { y, m, d } = romeParts(date);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function romeMonthKey(date = new Date()) {
  const { y, m } = romeParts(date);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Sunday 18:00 Europe/Rome of the ISO week containing `date`. */
function sundaySubmitDeadlineMs(date = new Date()) {
  const { y, m, d } = romeParts(date);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utc.getUTCDay() || 7; // Mon=1..Sun=7
  const toSun = 7 - dayNum;
  utc.setUTCDate(utc.getUTCDate() + toSun);
  // Interpret as Rome local Sunday 18:00 via formatter offset approximation:
  // Build ISO string as Rome wall time then parse with offset from formatter.
  const ymd = `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
  return romeWallTimeToUtcMs(ymd, 18, 0);
}

/** Sunday 24:00 Rome = Monday 00:00 Rome after that Sunday. */
function sundayReviewDeadlineMs(date = new Date()) {
  const submit = sundaySubmitDeadlineMs(date);
  // +6 hours from 18:00 → 24:00
  return submit + 6 * 60 * 60 * 1000;
}

function romeWallTimeToUtcMs(ymd?, hour?, minute?) {
  // Use iterative approach: guess UTC and adjust to match Rome wall clock
  let guess = Date.parse(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+01:00`);
  if (!Number.isFinite(guess)) guess = Date.parse(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  for (let i = 0; i < 4; i++) {
    const p = romeParts(new Date(guess));
    const want = `${ymd} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const got = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    if (want === got) return guess;
    const wantMs = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), hour, minute);
    const gotMs = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute);
    guess += wantMs - gotMs;
  }
  return guess;
}

function fileAccessSecret() {
  return String(process.env.VC_SITE_UPLOAD_FILE_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function createFileToken(weekKey?, userId?, fileName?) {
  const wk = String(weekKey || "").trim();
  const uid = String(userId || "").trim();
  const name = String(fileName || "").trim();
  if (!wk || !uid || !name) return "";
  const exp = Date.now() + FILE_TOKEN_TTL_MS;
  const payload = `${wk}:${uid}:${name}:${exp}`;
  const sig = crypto.createHmac("sha256", fileAccessSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyFileToken(st?, weekKey?, userId?, fileName?) {
  try {
    const raw = Buffer.from(String(st || ""), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 5) return false;
    const [wk, uid, name, expStr, sig] = parts;
    if (wk !== String(weekKey) || uid !== String(userId) || name !== String(fileName)) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const payload = `${wk}:${uid}:${name}:${expStr}`;
    const expect = crypto.createHmac("sha256", fileAccessSecret()).update(payload).digest("base64url");
    return sig === expect;
  } catch (_) {
    return false;
  }
}

function ensureUploadDir(weekKey?, userId?) {
  const dir = path.join(UPLOAD_ROOT, String(weekKey), String(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parseDataUrl(raw?) {
  const s = String(raw || "").trim();
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(s);
  if (!m) return null;
  const mime = String(m[1] || "").toLowerCase();
  if (!ALLOWED_PROOF_MIME.has(mime)) return null;
  let buf;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch (_) {
    return null;
  }
  if (!buf.length || buf.length > MAX_PROOF_BYTES) return null;
  return { mime, buffer: buf };
}

function extForMime(mime?) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/plain") return "txt";
  return "jpg";
}

function saveProofs(weekKey?, userId?, imagesInput?) {
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const out = [];
  const dir = ensureUploadDir(weekKey, userId);
  for (let i = 0; i < list.length && out.length < MAX_PROOFS; i++) {
    const item = list[i];
    if (item && typeof item === "object" && item.url && !String(item.url).startsWith("data:")) {
      // keep existing proof reference
      out.push({
        id: String(item.id || crypto.randomBytes(6).toString("hex")),
        name: String(item.name || "prova").slice(0, 80),
        mime: String(item.mime || "application/octet-stream").slice(0, 80),
        url: String(item.url),
      });
      continue;
    }
    const parsed = parseDataUrl(typeof item === "string" ? item : item?.dataUrl || item?.url || "");
    if (!parsed) continue;
    const id = crypto.randomBytes(6).toString("hex");
    const name = `${id}.${extForMime(parsed.mime)}`;
    fs.writeFileSync(path.join(dir, name), parsed.buffer);
    const url = `/webhooks/site-staff-compiti/files/${encodeURIComponent(weekKey)}/${encodeURIComponent(userId)}/${encodeURIComponent(name)}`;
    out.push({ id, name, mime: parsed.mime, url });
  }
  return out;
}

function withProofTokens(weekKey?, userId?, proofs?) {
  return (proofs || []).map((p?) => {
    const name = String(p.name || "").trim() || String(p.url || "").split("?")[0].split("/").pop() || "";
    const baseUrl = String(p.url || "").split("?")[0];
    const st = createFileToken(weekKey, userId, name);
    const url = st && baseUrl ? `${baseUrl}?st=${encodeURIComponent(st)}` : baseUrl || p.url;
    return { ...p, name: name || p.name, url };
  });
}

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

function weekKeysInRomeMonth(monthKey?) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!m) return [];
  const year = Number(m[1]);
  const month = Number(m[2]);
  const keys = [];
  for (const y of [year - 1, year]) {
    for (let w = 1; w <= 53; w++) {
      const thu = isoWeekThursdayUtc(y, w);
      if (thu.getUTCFullYear() === year && thu.getUTCMonth() + 1 === month) {
        keys.push(`${y}-W${String(w).padStart(2, "0")}`);
      }
    }
  }
  keys.sort();
  return keys;
}

function prevRomeMonthKey(monthKey?) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!m) return "";
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1;
  if (mo < 1) {
    mo = 12;
    y -= 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

function firstWeekKeyOfRomeMonth(monthKey?) {
  return weekKeysInRomeMonth(monthKey)[0] || "";
}

function isFirstIsoWeekOfRomeMonth(date = new Date()) {
  const mk = romeMonthKey(date);
  return currentRomeIsoWeekKey(date) === firstWeekKeyOfRomeMonth(mk);
}

function monthKeyForWeekKey(weekKey?) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!m) return "";
  const thursday = isoWeekThursdayUtc(Number(m[1]), Number(m[2]));
  return `${thursday.getUTCFullYear()}-${String(thursday.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** compitiMonthBridge1: mese compiti = mese del giovedì ISO (non calendario Rome).
 *  Evita buco nell'ultima settimana che contiene già il 1° del mese successivo. */
function compitiActiveMonthKey(weekKey = "") {
  const wk = String(weekKey || currentRomeIsoWeekKey() || "").trim();
  return monthKeyForWeekKey(wk) || romeMonthKey();
}

function dateKeysForIsoWeekKey(weekKey?) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!m) return [];
  const year = Number(m[1]);
  const week = Number(m[2]);
  const thu = isoWeekThursdayUtc(year, week);
  const monday = new Date(thu);
  monday.setUTCDate(thu.getUTCDate() - 3);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

function shuffleInPlace(arr?) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function drawDistinctMonthTasks(excludeSet?, n?) {
  const all = TASKS_META.map((t?) => t.id);
  const want = Math.max(0, Math.min(Number(n) || 0, all.length));
  const primary = shuffleInPlace(all.filter((id?) => !excludeSet.has(id)));
  const picked = [];
  for (const id of primary) {
    if (picked.length >= want) break;
    picked.push(id);
  }
  if (picked.length < want) {
    const rest = shuffleInPlace(all.filter((id?) => !picked.includes(id)));
    for (const id of rest) {
      if (picked.length >= want) break;
      picked.push(id);
    }
  }
  return picked.slice(0, want);
}

function sanitizePlanEntry(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const byWeekSrc = src.byWeek && typeof src.byWeek === "object" && !Array.isArray(src.byWeek) ? src.byWeek : {};
  const byWeek: Record<string, any> = {};
  for (const [wk, tid] of Object.entries(byWeekSrc)) {
    if (!/^\d{4}-W\d{2}$/.test(wk)) continue;
    const id = String(tid || "").trim();
    if (!ALLOWED_TASK_IDS.has(id)) continue;
    byWeek[wk] = id;
  }
  let taskIds = [];
  if (Array.isArray(src.taskIds)) {
    for (const tid of src.taskIds) {
      const id = String(tid || "").trim();
      if (ALLOWED_TASK_IDS.has(id) && !taskIds.includes(id)) taskIds.push(id);
    }
  }
  // Migrate old week-locked plans → selectable month pool.
  if (!taskIds.length && Object.keys(byWeek).length) {
    for (const tid of Object.values(byWeek)) {
      const id = String(tid || "").trim();
      if (ALLOWED_TASK_IDS.has(id) && !taskIds.includes(id)) taskIds.push(id);
    }
  }
  return {
    assignedAt: Number(src.assignedAt) || 0,
    taskIds,
    byWeek,
    swapUsedCount: Math.max(0, Math.min(99, Math.floor(Number(src.swapUsedCount) || 0))),
  };
}

function sanitizePlanMap(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out: Record<string, any> = {};
  for (const [mk, v] of Object.entries(src)) {
    if (!/^\d{4}-\d{2}$/.test(mk)) continue;
    out[mk] = sanitizePlanEntry(v);
  }
  return out;
}

function planPoolIds(plan?) {
  const ids = Array.isArray(plan?.taskIds) ? plan.taskIds.map((x?) => String(x || "").trim()) : [];
  const out = [];
  for (const id of ids) {
    if (ALLOWED_TASK_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  if (out.length) return out;
  const byWeek = plan?.byWeek && typeof plan.byWeek === "object" ? plan.byWeek : {};
  for (const tid of Object.values(byWeek)) {
    const id = String(tid || "").trim();
    if (ALLOWED_TASK_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function collectPrevMonthTaskIds(planMap?, weekMap?, prevMk?) {
  const set = new Set();
  const plan = planMap?.[prevMk];
  for (const tid of planPoolIds(plan)) set.add(tid);
  for (const [wk, entry] of Object.entries(weekMap || {})) {
    if (!entry?.taskId || !ALLOWED_TASK_IDS.has(entry.taskId)) continue;
    if (monthKeyForWeekKey(wk) === prevMk) set.add(entry.taskId);
  }
  return set;
}

/** Locked = task del pool già usati in altre settimane del mese (entry reali). */
function lockedTaskIdsForMonth(map?, monthKey?, currentWeekKey = "", plan = null) {
  const locked = new Set();
  const cur = String(currentWeekKey || "");
  const pool = new Set(planPoolIds(plan));
  for (const [wk, entry] of Object.entries(map || {})) {
    if (!entry?.taskId || !ALLOWED_TASK_IDS.has(entry.taskId)) continue;
    if (monthKeyForWeekKey(wk) !== monthKey) continue;
    if (wk === cur) continue;
    const st = entry.status;
    // Current-week-style open states on other weeks still consume the task id.
    if (pool.size && !pool.has(entry.taskId)) continue;
    if (
      st === STATUS.APPROVED ||
      st === STATUS.MISSED ||
      st === STATUS.SUBMITTED ||
      st === STATUS.REJECTED ||
      st === STATUS.DRAFT
    ) {
      if (entry.taskId) locked.add(entry.taskId);
    }
  }
  return [...locked];
}

function monthCompletedWeekCount(map?, monthKey?) {
  const weeks = weekKeysInRomeMonth(monthKey);
  let n = 0;
  for (const wk of weeks) {
    const st = map?.[wk]?.status;
    if (st === STATUS.APPROVED || st === STATUS.MISSED || st === STATUS.SKIPPED) n += 1;
  }
  return n;
}

function planSwapsLeft(plan?, bonus = 0) {
  const used = Math.max(0, Math.floor(Number(plan?.swapUsedCount) || 0));
  const baseLeft = Math.max(0, MONTHLY_SWAP_BASE - used);
  const bonusLeft = Math.max(0, Math.floor(Number(bonus) || 0));
  return baseLeft + bonusLeft;
}

function pickRandomPoolReplacement(poolIds?, preferExclude = null) {
  const pool = new Set((poolIds || []).map((x?) => String(x || "").trim()).filter(Boolean));
  const extra = preferExclude instanceof Set ? preferExclude : new Set();
  const all = TASKS_META.map((t?) => t.id);
  let candidates = all.filter((id?) => !pool.has(id) && !extra.has(id));
  if (!candidates.length) candidates = all.filter((id?) => !pool.has(id));
  if (!candidates.length) return "";
  return candidates[Math.floor(Math.random() * candidates.length)] || "";
}

function buildIdentityFromMember(member?, user?) {
  const userId = String(member?.id || user?.id || "").trim();
  const avatarUrl =
    userAvatarUrlDynamic(member, { size: 128 }) ||
    userAvatarUrlDynamic(user, { size: 128 }) ||
    discordDefaultAvatarUrl(user || { id: userId }, { size: 128 });
  return {
    userId,
    displayName:
      String(member?.displayName || user?.globalName || user?.username || "Staff").trim() || "Staff",
    username: accountUsername(user) || String(user?.username || "").trim() || "",
    avatarUrl,
  };
}

function memberHasRoleKey(member?, key?) {
  const id = remapRoleIdForward(String(IDs.roles?.[key] || "")) || String(IDs.roles?.[key] || "");
  return Boolean(id && member?.roles?.cache?.has?.(id));
}

/** Operativo: Helper/Mod/Senior/Director. Non High Staff. Solo-PM esclusi (PM+staff ok). Marker: compitiPmStaffOk1 */
function isCompitiWorkerMember(member?) {
  if (!member) return false;
  if (memberIsHighStaffEligible(member)) return false;
  return (
    memberHasRoleKey(member, "Helper") ||
    memberHasRoleKey(member, "Mod") ||
    memberHasRoleKey(member, "SeniorModerator") ||
    memberHasRoleKey(member, "Director")
  );
}

function isHighStaffViewer(member?) {
  return memberIsHighStaffEligible(member);
}

function pillForStatus(status?, hasTask?, { canRetry = false } = {}) {
  if (status === STATUS.APPROVED) return { label: "Completato", kind: "done" };
  if (status === STATUS.SKIPPED) return { label: "Esonero", kind: "done" };
  if (status === STATUS.MISSED) return { label: "Non completato", kind: "fail" };
  if (status === STATUS.REJECTED && canRetry) return { label: "Da rifare", kind: "retry" };
  if (status === STATUS.REJECTED) return { label: "Non completato", kind: "fail" };
  if (status === STATUS.SUBMITTED) return { label: "In revisione", kind: "review" };
  if (hasTask) return { label: "Da fare", kind: "todo" };
  return { label: "Da fare", kind: "todo" };
}

function publicProgress(weekKey?, userId?, entry?, lockedIds?, monthKey?, map?, deadlines = null, plan = null) {
  const e = sanitizeWeekEntry(entry || {});
  const pool = planPoolIds(plan);
  const effectiveTaskId = e.taskId;
  const auto = isAutoTask(effectiveTaskId);
  const submitOpen = deadlines ? Boolean(deadlines.submitOpen) : true;
  const canRetry = e.status === STATUS.REJECTED && submitOpen && !auto;
  const pill = pillForStatus(e.status, Boolean(effectiveTaskId), { canRetry });
  const weeksInMonth = weekKeysInRomeMonth(monthKey);
  return {
    weekKey,
    taskId: effectiveTaskId,
    assignedTaskId: effectiveTaskId,
    done: e.done,
    note: e.note,
    proofs: withProofTokens(weekKey, userId, e.proofs),
    status: e.status,
    submittedAt: e.submittedAt,
    reviewedAt: e.reviewedAt,
    autoSubmitted: Boolean(e.autoSubmitted),
    isAuto: auto,
    canRetry,
    pill,
    lockedTaskIds: lockedIds,
    monthDistinct: monthCompletedWeekCount(map, monthKey),
    monthRequired: weeksInMonth.length || isoWeeksInMonthKey(monthKey),
    monthRule: "pool_pick",
    poolTaskIds: pool,
  };
}

function buildPublicPlan(monthKey?, plan?, map?, currentWeekKey?, swapBonus = 0) {
  const pool = planPoolIds(plan);
  const tasks = pool.map((taskId?) => {
    const meta = taskById(taskId);
    return {
      id: taskId,
      label: meta?.label || taskId,
      auto: Boolean(meta?.auto),
    };
  });
  const used = Math.max(0, Math.floor(Number(plan?.swapUsedCount) || 0));
  const bonus = Math.max(0, Math.floor(Number(swapBonus) || 0));
  return {
    monthKey,
    assignedAt: Number(plan?.assignedAt) || 0,
    taskIds: pool,
    tasks,
    weekKey: currentWeekKey,
    weeksInMonth: weekKeysInRomeMonth(monthKey).length,
    swapUsedCount: used,
    swapBonus: bonus,
    swapsLeft: planSwapsLeft(plan, bonus),
    swapBase: MONTHLY_SWAP_BASE,
    /** Mese compiti = mese del giovedì ISO: pool fisso, niente re-roll all'1 calendario. */
    monthBridgeNote:
      "Il pool resta quello del mese compiti (giovedì ISO). L'ultima settimana a cavallo non si ri-tira all'1.",
  };
}

function buildMonthEntries(monthKey?, userId?, map?, plan?, deadlines?, currentWeekKey?) {
  const weeks = weekKeysInRomeMonth(monthKey);
  const cur = String(currentWeekKey || "");
  return weeks.map((wk?) => {
    const entry = sanitizeWeekEntry(map?.[wk] || emptyWeek());
    const locked = lockedTaskIdsForMonth(map, monthKey, wk, plan).filter((id?) => id !== entry.taskId);
    const progress = publicProgress(wk, userId, entry, locked, monthKey, map, deadlines, plan);
    const meta = taskById(progress.taskId);
    const isCurrent = wk === cur;
    const isFuture = Boolean(cur && wk > cur);
    return {
      weekKey: wk,
      isCurrent,
      isFuture,
      taskId: progress.taskId,
      label: displayTaskLabel(progress.taskId, progress.status),
      auto: Boolean(meta?.auto),
      status: progress.status,
      pill: progress.pill,
      note: progress.note,
      proofs: progress.proofs,
      autoSubmitted: progress.autoSubmitted,
      submittedAt: progress.submittedAt,
      reviewedAt: progress.reviewedAt,
      canRetry: progress.canRetry,
      isAuto: progress.isAuto,
    };
  });
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

async function loadPlanMap(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select("profile.siteStaffCompitiPlan")
    .lean()
    .catch(() => null);
  return sanitizePlanMap(doc?.profile?.siteStaffCompitiPlan || {});
}

async function savePlanMap(guildId?, userId?, plans?) {
  await ActivityUserProfile.updateOne(
    { guildId: String(guildId || ""), userId: String(userId || "") },
    {
      $setOnInsert: { guildId: String(guildId || ""), userId: String(userId || "") },
      $set: { "profile.siteStaffCompitiPlan": plans },
    },
    { upsert: true },
  ).catch(() => null);
}

async function loadSwapBonus(guildId?, userId?, monthKey = "") {
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select(
      "profile.siteStaffCompitiSwapBonus profile.siteStaffCompitiSwapBonusWeek profile.siteStaffCompitiSwapBonusMonth",
    )
    .lean()
    .catch(() => null);
  const bonus = Math.max(0, Math.floor(Number(doc?.profile?.siteStaffCompitiSwapBonus) || 0));
  const weekKey = String(doc?.profile?.siteStaffCompitiSwapBonusWeek || "").trim();
  const storedMonth = String(doc?.profile?.siteStaffCompitiSwapBonusMonth || "").trim();
  /* stafferMonthBridge1: legacy senza month → mese della weekKey (o mese compiti attivo). */
  const effectiveMonth =
    (/^\d{4}-\d{2}$/.test(storedMonth) && storedMonth) ||
    monthKeyForWeekKey(weekKey) ||
    "";
  const active = String(monthKey || compitiActiveMonthKey(weekKey) || "").trim();
  if (active && effectiveMonth && effectiveMonth !== active) {
    return { bonus: 0, weekKey, monthKey: effectiveMonth, expired: true };
  }
  return {
    bonus,
    weekKey,
    monthKey: effectiveMonth || active,
    expired: false,
  };
}

async function saveSwapBonusState(guildId?, userId?, { bonus, weekKey = "", monthKey = "" } = {}) {
  const set = {
    "profile.siteStaffCompitiSwapBonus": Math.max(0, Math.floor(Number(bonus) || 0)),
  };
  if (weekKey) set["profile.siteStaffCompitiSwapBonusWeek"] = String(weekKey);
  if (monthKey) set["profile.siteStaffCompitiSwapBonusMonth"] = String(monthKey);
  await ActivityUserProfile.updateOne(
    { guildId: String(guildId || ""), userId: String(userId || "") },
    {
      $setOnInsert: { guildId: String(guildId || ""), userId: String(userId || "") },
      $set: set,
    },
    { upsert: true },
  ).catch(() => null);
}

/** +1 scambio compiti Staffer della settimana: solo mese della weekKey (1× weekKey). */
async function grantCompitiSwapBonus(guildId?, userId?, amount = 1, { weekKey = "", monthKey = "" } = {}) {
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (!add || !guildId || !userId) return { ok: false, swapBonus: 0, granted: 0 };
  const wk = String(weekKey || "").trim();
  const mk =
    String(monthKey || "").trim() ||
    monthKeyForWeekKey(wk) ||
    compitiActiveMonthKey(wk);
  const cur = await loadSwapBonus(guildId, userId, mk);
  if (wk && cur.weekKey === wk && Number(cur.bonus || 0) > 0 && !cur.expired) {
    return { ok: true, swapBonus: cur.bonus, granted: 0, skipped: true, monthKey: mk };
  }
  /* compitiSwapSchema1: se week match ma bonus 0 (strict drop storico) → ri-grant. */
  const next =
    cur.expired || !Number(cur.bonus || 0)
      ? add
      : wk && cur.weekKey === wk
        ? Math.max(Number(cur.bonus || 0), add)
        : Number(cur.bonus || 0) + add;
  await saveSwapBonusState(guildId, userId, { bonus: next, weekKey: wk || cur.weekKey, monthKey: mk });
  const granted = Math.max(0, next - Math.max(0, Number(cur.expired ? 0 : cur.bonus) || 0));
  return { ok: true, swapBonus: next, granted: granted || (next > 0 ? add : 0), monthKey: mk };
}

/** Se ha ancora il ruolo Staffer della settimana, assicura il +1 swap del week corrente. */
async function ensureStafferCompitiSwapBonus(client?, guildId?, userId?, monthKey = "") {
  try {
    const roleId = String(IDs.roles?.StafferDellaSettimana || "").trim();
    if (!roleId || !guildId || !userId) {
      return loadSwapBonus(guildId, userId, monthKey);
    }
    const guild =
      client?.guilds?.cache?.get?.(guildId) ||
      (await client?.guilds?.fetch?.(guildId).catch(() => null));
    const member =
      guild?.members?.cache?.get?.(userId) ||
      (await guild?.members?.fetch?.(userId).catch(() => null));
    if (!member?.roles?.cache?.has?.(roleId)) {
      return loadSwapBonus(guildId, userId, monthKey);
    }
    const {
      getStaffWeekKeyNow,
      resolveStafferBonusMonthKey,
    } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
    const weekKey = getStaffWeekKeyNow();
    const mk = resolveStafferBonusMonthKey({ weekKey, monthKey });
    await grantCompitiSwapBonus(guildId, userId, 1, { weekKey, monthKey: mk });
    return loadSwapBonus(guildId, userId, monthKey || mk);
  } catch (_) {
    return loadSwapBonus(guildId, userId, monthKey);
  }
}

/**
 * Nuovo staff pexato (Member→staff) nella settimana Mon–Sun Rome corrente:
 * niente miss/VN compiti fino al lunedì successivo.
 */
async function isNewStaffCompitiGrace({ guildId, userId, member = null, now = new Date() } = {}) {
  try {
    const {
      getCurrentResocontoPexWeekWindowUtc,
      wasFirstStaffPromotionFromMemberInWindow,
      resolveStaffRole,
    } = require("../../Services/Staff/weeklyStaffResocontoService") as typeof import("../../Services/Staff/weeklyStaffResocontoService");
    const { getStaffDoc } = require("../Staff/valutazionePanelActions") as typeof import("../Staff/valutazionePanelActions");
    const { ensureStaff } = require("../Staff/staffDocUtils") as typeof import("../Staff/staffDocUtils");
    const staffRoleId = member ? resolveStaffRole(member) : null;
    if (!staffRoleId) return false;
    const window = getCurrentResocontoPexWeekWindowUtc(now);
    const profileDoc = await getStaffDoc(guildId, userId);
    if (!profileDoc) return false;
    const staffDoc = ensureStaff(profileDoc);
    return wasFirstStaffPromotionFromMemberInWindow(
      staffDoc,
      staffRoleId,
      window.windowStart,
      window.windowEndExclusive,
    );
  } catch (_) {
    return false;
  }
}

async function seedWeekEntryFromPlan() {
  // Pool pick: non forzare un task sulla settimana.
  return null;
}

async function ensureMonthPlanForUser(guildId?, userId?, { monthKey = "", weekKey = "", force = false } = {}) {
  const mk = monthKey || romeMonthKey();
  const weekKeys = weekKeysInRomeMonth(mk);
  if (!weekKeys.length) return null;

  const plans = await loadPlanMap(guildId, userId);
  const existing = plans[mk];
  const existingPool = planPoolIds(existing);
  if (existingPool.length >= weekKeys.length && !force) {
    // Persist migrated taskIds if we only had byWeek.
    if (!Array.isArray(existing.taskIds) || !existing.taskIds.length || Object.keys(existing.byWeek || {}).length) {
      existing.taskIds = existingPool;
      existing.byWeek = {};
      plans[mk] = existing;
      await savePlanMap(guildId, userId, plans);
    }
    return existing;
  }

  const weekMap = await loadMap(guildId, userId);
  const exclude = collectPrevMonthTaskIds(plans, weekMap, prevRomeMonthKey(mk));
  const drawn = drawDistinctMonthTasks(exclude, weekKeys.length);
  const plan = { assignedAt: Date.now(), taskIds: drawn, byWeek: {}, swapUsedCount: 0 };
  plans[mk] = plan;
  await savePlanMap(guildId, userId, plans);
  return plan;
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
    const { ensureAutoValutazione } = require("../../Services/Staff/staffAutoValutazioniService") as typeof import("../../Services/Staff/staffAutoValutazioniService");
    const key = `staff_compiti:${weekKey}`;
    const reason = type === "positive" ? REASON_OK : REASON_FAIL;
    const out = await ensureAutoValutazione(guild, member, key, type, reason);
    return Boolean(out?.ok);
  } catch (err) {
    global.logger?.warn?.("[COMPITI] valutazione", err?.message || err);
    return false;
  }
}

const workerMembersCache = new Map(); // guildId -> { at, members }

const COMPITI_WORKER_RANK_KEYS = Object.freeze([
  "Director",
  "SeniorModerator",
  "Mod",
  "Helper",
]);

function compitiWorkerRank(member?) {
  for (let i = 0; i < COMPITI_WORKER_RANK_KEYS.length; i++) {
    if (memberHasRoleKey(member, COMPITI_WORKER_RANK_KEYS[i])) return i;
  }
  return COMPITI_WORKER_RANK_KEYS.length + 1;
}

function scanWorkerMembers(guild?) {
  const out = [];
  if (!guild?.members?.cache) return out;
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (!isCompitiWorkerMember(member)) continue;
    out.push(member);
  }
  out.sort((a?, b?) => {
    const ra = compitiWorkerRank(a);
    const rb = compitiWorkerRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.displayName || a.user?.username || "").localeCompare(
      String(b.displayName || b.user?.username || ""),
      "it",
      { sensitivity: "base" },
    );
  });
  return out;
}

async function listWorkerMembers(client?, guildId?, { force = false } = {}) {
  const cached = workerMembersCache.get(guildId);
  // compitiStaffListFull1: partial Discord cache often has only a few workers —
  // never trust a warm short list without a prior full fetch.
  if (
    !force &&
    cached &&
    cached.fetchedFull &&
    Date.now() - cached.at < 90_000 &&
    Array.isArray(cached.members) &&
    cached.members.length > 0
  ) {
    return cached.members;
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return cached?.members || [];

  let out = scanWorkerMembers(guild);
  let fetchedFull = Boolean(cached?.fetchedFull);
  const needFull =
    force ||
    !fetchedFull ||
    out.length < 3 ||
    guild.members.cache.size < 80;
  if (needFull) {
    try {
      await guild.members.fetch({ withPresences: false });
      fetchedFull = true;
    } catch (_) {}
    out = scanWorkerMembers(guild);
  }
  workerMembersCache.set(guildId, { at: Date.now(), members: out, fetchedFull });
  return out;
}

function deadlinesPayload(now = new Date()) {
  const submitMs = sundaySubmitDeadlineMs(now);
  const reviewMs = sundayReviewDeadlineMs(now);
  return {
    submitDeadlineMs: submitMs,
    reviewDeadlineMs: reviewMs,
    submitOpen: Date.now() < submitMs,
    reviewOpen: Date.now() < reviewMs,
  };
}

function resolveCompitiRoles(viewer?, req?) {
  let highStaff = isHighStaffViewer(viewer);
  let workerSelf = isCompitiWorkerMember(viewer);
  let viewAs = null;
  /* Prefer header override (Founder already validated in assert); works even on shimmed member. */
  const preset = parseViewAsFromReq(req);
  const over = preset ? compitiRoleOverride(preset) : null;
  if (over) {
    viewAs = preset;
    if (over.deny) {
      return { highStaff: false, workerSelf: false, viewAs, deny: true };
    }
    highStaff = Boolean(over.highStaff);
    workerSelf = Boolean(over.workerSelf);
  }
  return { highStaff, workerSelf, viewAs, deny: false };
}

async function handleSiteStaffCompitiGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const guildId = resolveGuildId(client) || String(access.member?.guild?.id || "").trim();
    const viewer = access.member;
    const viewerUser = viewer?.user || access.user;
    const viewerId = String(viewer?.id || viewerUser?.id || "").trim();
    const roles = resolveCompitiRoles(viewer, req);
    const highStaff = roles.highStaff;
    const workerSelf = roles.workerSelf;
    const weekKey = currentRomeIsoWeekKey();
    const monthKey = compitiActiveMonthKey(weekKey);
    const deadlines = deadlinesPayload();

    if (roles.deny || (!highStaff && !workerSelf)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: roles.viewAs
          ? `Preview (${roles.viewAs}): niente accesso ai compiti.`
          : "I compiti settimanali sono riservati allo staff operativo.",
        viewAs: roles.viewAs || null,
      });
    }

    const skipStaffList =
      highStaff &&
      (String(req.query?.skipStaffList || "") === "1" || String(req.query?.skipStaffList || "") === "true");

    let staffList = null;
    if (highStaff && !skipStaffList) {
      // compitiPhoneLoad1: force solo se cache non full — force:true ad ogni GET rallentava il telefono
      const cachedWorkers = workerMembersCache.get(guildId);
      const forceFull = !(cachedWorkers && cachedWorkers.fetchedFull);
      const members = await listWorkerMembers(client, guildId, { force: forceFull });
      staffList = members.map((m?) => buildIdentityFromMember(m, m.user));
    }

    let targetId = viewerId;
    if (highStaff) {
      const q = String(req.query?.userId || "").trim();
      if (/^\d{17,20}$/.test(q)) {
        targetId = q;
      } else if (Array.isArray(staffList) && staffList[0]?.userId) {
        /* HS default: primo staffer in lista, mai il viewer */
        targetId = staffList[0].userId;
      } else {
        /* compitiFirstStaffer1: anche con skipStaffList (prima paint veloce) */
        const cached = workerMembersCache.get(guildId);
        const fromCache = Array.isArray(cached?.members) ? cached.members[0] : null;
        let firstId = fromCache
          ? String(fromCache?.user?.id || fromCache?.id || "").trim()
          : "";
        if (!/^\d{17,20}$/.test(firstId)) {
          try {
            const guild =
              client.guilds.cache.get(guildId) ||
              (await client.guilds.fetch(guildId).catch(() => null));
            const quick = guild ? scanWorkerMembers(guild) : [];
            firstId = quick[0] ? String(quick[0].user?.id || quick[0].id || "").trim() : "";
          } catch (_) {
            firstId = "";
          }
        }
        if (/^\d{17,20}$/.test(firstId)) targetId = firstId;
      }
    }

    let plan = await ensureMonthPlanForUser(guildId, targetId, { monthKey, weekKey });
    await clearGhostDraftPicks(guildId, targetId, monthKey);
    const reverted = await revertUnreviewedRandomAutoPicks(guildId, targetId, monthKey, weekKey, plan);
    plan = reverted.plan || plan;
    const mapFresh = reverted.map || (await loadMap(guildId, targetId));
    const entry = sanitizeWeekEntry(mapFresh[weekKey] || emptyWeek());
    const lockedForUi = lockedTaskIdsForMonth(mapFresh, monthKey, weekKey, plan).filter(
      (id?) => id !== entry.taskId,
    );

    let identity;
    if (highStaff && targetId !== viewerId) {
      const fromList = Array.isArray(staffList)
        ? staffList.find((s?) => s.userId === targetId)
        : null;
      if (fromList) {
        identity = fromList;
      } else {
        // compitiPhoneLoad1: riusa cache workers (skipStaffList) prima di un fetch Discord extra
        const cached = workerMembersCache.get(guildId);
        const hit = Array.isArray(cached?.members)
          ? cached.members.find((m?) => String(m?.user?.id || m?.id || "") === String(targetId))
          : null;
        if (hit) {
          identity = buildIdentityFromMember(hit, hit.user);
        } else {
          try {
            const guild = await client.guilds.fetch(guildId);
            let m = guild.members.cache.get(targetId) || null;
            if (!m) m = await guild.members.fetch(targetId);
            identity = buildIdentityFromMember(m, m.user);
          } catch (_) {
            identity = { userId: targetId, displayName: "Staff", username: "", avatarUrl: "" };
          }
        }
      }
    } else {
      identity = buildIdentityFromMember(viewer, viewerUser);
    }

    const progress = publicProgress(
      weekKey,
      targetId,
      entry,
      lockedForUi,
      monthKey,
      mapFresh,
      deadlines,
      plan,
    );
    const monthEntries = buildMonthEntries(monthKey, targetId, mapFresh, plan, deadlines, weekKey);
    const swapBonus = (await ensureStafferCompitiSwapBonus(client, guildId, targetId, monthKey)).bonus;

    let graceMember = null;
    if (targetId === viewerId) {
      graceMember = viewer;
    } else {
      try {
        const guild =
          client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
        graceMember =
          guild?.members?.cache?.get?.(targetId) ||
          (await guild?.members?.fetch?.(targetId).catch(() => null)) ||
          null;
      } catch (_) {
        graceMember = null;
      }
    }
    const newStaffGraceActive = await isNewStaffCompitiGrace({
      guildId,
      userId: targetId,
      member: graceMember,
    });

    res.setHeader("Cache-Control", "private, no-store");
    const payload: Record<string, any> = {
      ok: true,
      weekKey,
      monthKey,
      mode: highStaff ? "highstaff" : "staff",
      canSubmit: workerSelf && !highStaff,
      canReview: highStaff,
      viewerId,
      targetUserId: targetId,
      deadlines,
      tasks: publicTasksMeta(),
      plan: buildPublicPlan(monthKey, plan, mapFresh, weekKey, swapBonus),
      monthEntries,
      progress,
      identity,
      newStaffGrace: {
        active: Boolean(newStaffGraceActive),
        message: newStaffGraceActive
          ? "Sei stato pexato questa settimana: il compito non è obbligatorio fino a lunedì prossimo."
          : "",
      },
    };
    if (roles.viewAs) {
      payload.viewAs = roles.viewAs;
      payload.viewAsActive = true;
    }
    if (Array.isArray(staffList)) payload.staffList = staffList;
    return res.status(200).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-compiti get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffCompitiPost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const guildId = resolveGuildId(client) || String(access.member?.guild?.id || "").trim();
    const viewer = access.member;
    const viewerId = String(viewer?.id || access.user?.id || "").trim();
    const roles = resolveCompitiRoles(viewer, req);
    const highStaff = roles.highStaff;
    const workerSelf = roles.workerSelf;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "save").trim();
    const weekKey = currentRomeIsoWeekKey();
    const monthKey = compitiActiveMonthKey(weekKey);
    const deadlines = deadlinesPayload();

    if (roles.deny) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: `Preview (${roles.viewAs}): niente azioni sui compiti.`,
        viewAs: roles.viewAs,
      });
    }

    if (action === "review") {
      if (!highStaff) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "Solo High Staff può revisionare." });
      }
      const targetId = String(body.userId || "").trim();
      const decision = String(body.decision || "").trim(); // approve | reject
      if (!/^\d{17,20}$/.test(targetId) || (decision !== "approve" && decision !== "reject")) {
        return res.status(400).json({ ok: false, error: "invalid", message: "Revisione non valida." });
      }
      const bodyWeek = String(body.weekKey || "").trim();
      const reviewWeekKey =
        /^(\d{4})-W(\d{2})$/.test(bodyWeek) && bodyWeek <= weekKey ? bodyWeek : weekKey;
      const map = await loadMap(guildId, targetId);
      const entry = sanitizeWeekEntry(map[reviewWeekKey] || emptyWeek());
      if (entry.status !== STATUS.SUBMITTED) {
        return res.status(400).json({ ok: false, error: "not_submitted", message: "Nessuna prova da revisionare." });
      }
      entry.reviewedAt = Date.now();
      entry.reviewedBy = viewerId;
      entry.updatedAt = Date.now();

      /* compitiReviewUnlock1: prima salva+rispondi; valutazione/notif in background (niente UI bloccata) */
      let reviewGrace = false;
      try {
        const guildForGrace =
          client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
        const targetMember =
          guildForGrace?.members?.cache?.get?.(targetId) ||
          (await guildForGrace?.members?.fetch?.(targetId).catch(() => null)) ||
          null;
        reviewGrace = await isNewStaffCompitiGrace({
          guildId,
          userId: targetId,
          member: targetMember,
        });
      } catch (_) {
        reviewGrace = false;
      }
      const needPositiveVal = decision === "approve" && !entry.valutazioneApplied;
      const needNegativeVal =
        decision !== "approve" &&
        !deadlines.submitOpen &&
        !entry.valutazioneApplied &&
        !reviewGrace;

      if (decision === "approve") {
        entry.status = STATUS.APPROVED;
        entry.done = true;
      } else if (deadlines.submitOpen) {
        // Reject with time left → staff can retry same/other task until Sunday 18:00.
        entry.status = STATUS.REJECTED;
        entry.done = false;
        entry.valutazioneApplied = false;
      } else {
        // Past Sunday 18 → final reject + negative (unless grace week).
        entry.status = STATUS.REJECTED;
        entry.done = false;
      }

      map[reviewWeekKey] = entry;
      await saveMap(guildId, targetId, pruneWeekMap(map, reviewWeekKey));

      const planAfter = (await loadPlanMap(guildId, targetId))[monthKey] || null;
      const swapBonusAfter = (await loadSwapBonus(guildId, targetId, monthKey)).bonus;
      const currentEntry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
      const locked = lockedTaskIdsForMonth(map, monthKey, weekKey, planAfter).filter(
        (id?) => id !== currentEntry.taskId,
      );
      res.status(200).json({
        ok: true,
        weekKey,
        progress: publicProgress(weekKey, targetId, currentEntry, locked, monthKey, map, deadlines, planAfter),
        monthEntries: buildMonthEntries(monthKey, targetId, map, planAfter, deadlines, weekKey),
        plan: buildPublicPlan(monthKey, planAfter, map, weekKey, swapBonusAfter),
      });
      emitCompitiRealtime({ userId: targetId, weekKey, action: decision === "approve" ? "approve" : "reject" });

      setImmediate(() => {
        Promise.resolve()
          .then(async () => {
            if (needPositiveVal) {
              const ok = await applyValutazione(client, guildId, targetId, "positive", reviewWeekKey);
              if (ok) {
                entry.valutazioneApplied = true;
                map[reviewWeekKey] = entry;
                await saveMap(guildId, targetId, pruneWeekMap(map, reviewWeekKey));
              }
            } else if (needNegativeVal) {
              const ok = await applyValutazione(client, guildId, targetId, "negative", reviewWeekKey);
              if (ok) {
                entry.valutazioneApplied = true;
                map[reviewWeekKey] = entry;
                await saveMap(guildId, targetId, pruneWeekMap(map, reviewWeekKey));
              }
            }
            if (!roles.viewAs) {
              const guild =
                viewer?.guild ||
                client?.guilds?.cache?.get?.(guildId) ||
                (await client?.guilds?.fetch?.(guildId).catch(() => null));
              const taskLabel = taskLabelFromMeta(TASKS_META, entry.taskId);
              const reviewerName = memberDisplayName(viewer, viewer?.user || access.user, viewerId);
              if (decision === "approve") {
                await notifyCompitiApproved({
                  guild,
                  guildId,
                  workerUserId: targetId,
                  weekKey: reviewWeekKey,
                  taskLabel,
                  reviewerName,
                });
              } else {
                await notifyCompitiRejected({
                  guild,
                  guildId,
                  workerUserId: targetId,
                  weekKey: reviewWeekKey,
                  taskLabel,
                  reviewerName,
                  softRetry: Boolean(deadlines.submitOpen),
                  skipNegative:
                    shouldSkipNegativeValutazione(reviewWeekKey) || Boolean(reviewGrace),
                });
              }
            }
          })
          .catch((errBg?) => {
            global.logger?.warn?.(
              "[WEBHOOK] site-staff-compiti review bg:",
              errBg?.message || errBg,
            );
          });
      });
      return;
    }

    // Staff save/submit — any day until Sunday 18:00
    if (!workerSelf || highStaff) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "High Staff non svolge i compiti: revisiona quelli dello staff.",
      });
    }

    if (action === "swap_one") {
      const replaceTaskId = String(body.taskId || body.replaceTaskId || "").trim();
      if (!ALLOWED_TASK_IDS.has(replaceTaskId)) {
        return res.status(400).json({
          ok: false,
          error: "invalid_task",
          message: "Scegli un compito del pool da sostituire.",
        });
      }
      let plan = (await loadPlanMap(guildId, viewerId))[monthKey] || null;
      if (!planPoolIds(plan).length) {
        plan = await ensureMonthPlanForUser(guildId, viewerId, { monthKey, weekKey });
      }
      const pool = planPoolIds(plan);
      if (!pool.includes(replaceTaskId)) {
        return res.status(400).json({
          ok: false,
          error: "not_in_pool",
          message: "Quel compito non è nel tuo pool di questo mese.",
        });
      }
      let bonusState = await loadSwapBonus(guildId, viewerId, monthKey);
      let bonus = bonusState.bonus;
      if (planSwapsLeft(plan, bonus) < 1) {
        return res.status(400).json({
          ok: false,
          error: "no_swaps",
          message: "Nessuno scambio rimasto questo mese (1 base + bonus Staffer della settimana).",
        });
      }
      const map = await loadMap(guildId, viewerId);
      const locked = new Set(lockedTaskIdsForMonth(map, monthKey, weekKey, plan));
      const curEntry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
      if (locked.has(replaceTaskId) && curEntry.taskId !== replaceTaskId) {
        return res.status(400).json({
          ok: false,
          error: "task_locked",
          message: "Quel compito è già usato in un'altra settimana: non si può cambiare.",
        });
      }
      if (
        curEntry.taskId === replaceTaskId &&
        (curEntry.status === STATUS.SUBMITTED ||
          curEntry.status === STATUS.APPROVED ||
          curEntry.status === STATUS.MISSED ||
          curEntry.status === STATUS.SKIPPED)
      ) {
        return res.status(400).json({
          ok: false,
          error: "task_locked",
          message: "Non puoi cambiare un compito già inviato o chiuso.",
        });
      }
      const plans = await loadPlanMap(guildId, viewerId);
      const exclude = collectPrevMonthTaskIds(plans, map, prevRomeMonthKey(monthKey));
      const replacement = pickRandomPoolReplacement(pool, exclude);
      if (!replacement) {
        return res.status(400).json({
          ok: false,
          error: "no_replacement",
          message: "Nessun altro compito disponibile da sorteggiare.",
        });
      }
      const used = Math.max(0, Math.floor(Number(plan.swapUsedCount) || 0));
      if (used < MONTHLY_SWAP_BASE) {
        plan.swapUsedCount = used + 1;
      } else {
        bonus = Math.max(0, bonus - 1);
        await saveSwapBonusState(guildId, viewerId, {
          bonus,
          weekKey: bonusState.weekKey,
          monthKey,
        });
      }
      plan.taskIds = pool.map((id?) => (id === replaceTaskId ? replacement : id));
      plan.byWeek = {};
      plans[monthKey] = sanitizePlanEntry(plan);
      await savePlanMap(guildId, viewerId, plans);
      plan = plans[monthKey];

      if (curEntry.taskId === replaceTaskId && curEntry.status === STATUS.DRAFT) {
        curEntry.taskId = "";
        curEntry.updatedAt = Date.now();
        map[weekKey] = curEntry;
        await saveMap(guildId, viewerId, pruneWeekMap(map, weekKey));
      } else if (curEntry.taskId === replaceTaskId && curEntry.status === STATUS.REJECTED) {
        curEntry.taskId = "";
        curEntry.updatedAt = Date.now();
        map[weekKey] = curEntry;
        await saveMap(guildId, viewerId, pruneWeekMap(map, weekKey));
      }

      const mapFresh = await loadMap(guildId, viewerId);
      const entryFresh = sanitizeWeekEntry(mapFresh[weekKey] || emptyWeek());
      const lockedFresh = lockedTaskIdsForMonth(mapFresh, monthKey, weekKey, plan).filter(
        (id?) => id !== entryFresh.taskId,
      );
      emitCompitiRealtime({ userId: viewerId, weekKey, action: "swap" });
      return res.status(200).json({
        ok: true,
        weekKey,
        swapped: { from: replaceTaskId, to: replacement },
        plan: buildPublicPlan(monthKey, plan, mapFresh, weekKey, bonus),
        progress: publicProgress(
          weekKey,
          viewerId,
          entryFresh,
          lockedFresh,
          monthKey,
          mapFresh,
          deadlines,
          plan,
        ),
        monthEntries: buildMonthEntries(monthKey, viewerId, mapFresh, plan, deadlines, weekKey),
        message: `Compito sostituito: ora hai «${taskById(replacement)?.label || replacement}».`,
      });
    }

    // Staff save/submit — any day until Sunday 18:00
    if (!workerSelf || highStaff) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "High Staff non svolge i compiti: revisiona quelli dello staff.",
      });
    }

    let plan = (await loadPlanMap(guildId, viewerId))[monthKey] || null;
    if (!planPoolIds(plan).length) {
      plan = await ensureMonthPlanForUser(guildId, viewerId, { monthKey, weekKey });
    }
    const pool = planPoolIds(plan);
    if (!pool.length) {
      return res.status(400).json({
        ok: false,
        error: "no_plan",
        message: "Nessun pool di compiti assegnato per questo mese.",
      });
    }

    const map = await loadMap(guildId, viewerId);
    const entry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
    if (entry.status === STATUS.APPROVED || entry.status === STATUS.MISSED) {
      return res.status(400).json({ ok: false, error: "locked", message: "Questa settimana è già chiusa." });
    }
    if (entry.status === STATUS.REJECTED && !deadlines.submitOpen) {
      return res.status(400).json({
        ok: false,
        error: "deadline",
        message: "Scadenza domenica ore 18: non puoi più riprovare.",
      });
    }
    if (entry.status === STATUS.SUBMITTED) {
      return res.status(400).json({ ok: false, error: "submitted", message: "Già inviato in revisione." });
    }
    if (!deadlines.submitOpen) {
      return res.status(400).json({
        ok: false,
        error: "deadline",
        message: "Scadenza domenica ore 18: non puoi più inviare.",
      });
    }

    const taskId = String(body.taskId || "").trim();
    if (!pool.includes(taskId)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_task",
        message: "Scegli uno dei compiti del pool di questo mese.",
      });
    }
    const locked = lockedTaskIdsForMonth(map, monthKey, weekKey, plan).filter((id?) => id !== entry.taskId);
    if (locked.includes(taskId) && entry.taskId !== taskId) {
      return res.status(400).json({
        ok: false,
        error: "task_used",
        message: "Questo compito è già stato usato in un'altra settimana di questo mese.",
      });
    }

    const note = String(body.note == null ? "" : body.note).slice(0, MAX_NOTE);
    const submit = Boolean(body.submit) || Boolean(body.done);
    if (submit && isAutoTask(taskId)) {
      return res.status(400).json({
        ok: false,
        error: "auto_task",
        message: "Questo compito si completa da solo quando scatta il trigger. Puoi solo selezionarlo.",
      });
    }
    const proofsInput = Array.isArray(body.proofs) ? body.proofs : Array.isArray(body.images) ? body.images : [];
    let proofs = entry.proofs || [];
    if (proofsInput.length) {
      proofs = saveProofs(weekKey, viewerId, proofsInput);
    }

    entry.taskId = taskId;
    entry.note = note;
    entry.proofs = proofs;
    entry.done = submit;
    entry.updatedAt = Date.now();
    entry.reviewedAt = 0;
    entry.reviewedBy = "";
    entry.autoSubmitted = false;
    if (submit) {
      if (!note.trim() && proofs.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "proof_required",
          message: "Per inviare serve una nota e/o almeno una prova (foto/file).",
        });
      }
      entry.status = STATUS.SUBMITTED;
      entry.submittedAt = Date.now();
    } else {
      entry.status = STATUS.DRAFT;
    }

    map[weekKey] = entry;
    await saveMap(guildId, viewerId, pruneWeekMap(map, weekKey));

    if (submit && !roles.viewAs) {
      try {
        const guild =
          viewer?.guild ||
          client?.guilds?.cache?.get?.(guildId) ||
          (await client?.guilds?.fetch?.(guildId).catch(() => null));
        await notifyCompitiSubmitted({
          guild,
          guildId,
          workerUserId: viewerId,
          workerMember: viewer,
          workerUser: viewer?.user || access.user,
          weekKey,
          taskLabel: taskLabelFromMeta(TASKS_META, taskId),
          actorUserId: viewerId,
        });
      } catch (errNotif) {
        global.logger?.warn?.("[WEBHOOK] site-staff-compiti submit notif:", errNotif?.message || errNotif);
      }
    }

    emitCompitiRealtime({
      userId: viewerId,
      weekKey,
      action: String(req.body?.action || req.body?.mode || "save").trim().toLowerCase() || "save",
    });
    return res.status(200).json({
      ok: true,
      weekKey,
      plan: buildPublicPlan(monthKey, plan, map, weekKey, (await loadSwapBonus(guildId, viewerId, monthKey)).bonus),
      progress: publicProgress(weekKey, viewerId, entry, locked, monthKey, map, deadlines, plan),
      identity: buildIdentityFromMember(viewer, viewer.user || access.user),
      deadlines,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-compiti post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffCompitiFileGet(client?, req?, res?) {
  try {
    const weekKey = decodeURIComponent(String(req.params.weekKey || ""));
    const userId = decodeURIComponent(String(req.params.userId || ""));
    const fileName = decodeURIComponent(String(req.params.fileName || ""));
    if (!/^\d{4}-W\d{2}$/.test(weekKey) || !/^\d{17,20}$/.test(userId) || !fileName || fileName.includes("..")) {
      return res.status(400).end();
    }
    const st = String(req.query.st || "");
    if (!verifyFileToken(st, weekKey, userId, fileName)) {
      return res.status(403).end();
    }
    const fp = path.join(UPLOAD_ROOT, weekKey, userId, path.basename(fileName));
    if (!fp.startsWith(path.join(UPLOAD_ROOT, weekKey, userId))) return res.status(400).end();
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.sendFile(fp);
  } catch (_) {
    return res.status(500).end();
  }
}

/**
 * Deadline tick: Sunday 18 miss + Sunday 24 auto-fail pending reviews.
 * Safe to call every minute from bot-scheduler.
 */
async function tickStaffCompitiDeadlines(client?) {
  const guildId = resolveGuildId(client);
  if (!guildId) return { ok: false };
  const now = Date.now();
  const weekKey = currentRomeIsoWeekKey();
  const submitMs = sundaySubmitDeadlineMs();
  const reviewMs = sundayReviewDeadlineMs();
  const dueSoonMs = submitMs - 24 * 60 * 60 * 1000;
  const members = await listWorkerMembers(client, guildId);
  let missed = 0;
  let autoFail = 0;
  let dueSoon = 0;
  const guild =
    client?.guilds?.cache?.get?.(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));

  for (const member of members) {
    const userId = member.id;
    const map = await loadMap(guildId, userId);
    const entry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
    let changed = false;
    const grace = await isNewStaffCompitiGrace({
      guildId,
      userId,
      member,
      now: new Date(now),
    });

    if (
      guild &&
      !grace &&
      now >= dueSoonMs &&
      now < submitMs &&
      (entry.status === STATUS.DRAFT || entry.status === STATUS.REJECTED) &&
      !isAutoTask(entry.taskId)
    ) {
      try {
        const n = await notifyCompitiDeadlineSoon({
          guild,
          guildId,
          workerUserId: userId,
          weekKey,
        });
        if (n) dueSoon += 1;
      } catch (_) {}
    }

    if (now >= submitMs && (entry.status === STATUS.DRAFT || entry.status === STATUS.REJECTED)) {
      if (grace) {
        entry.status = STATUS.SKIPPED;
        entry.updatedAt = now;
        entry.valutazioneApplied = true;
        map[weekKey] = entry;
        changed = true;
      } else {
        entry.status = STATUS.MISSED;
        entry.updatedAt = now;
        if (!entry.valutazioneApplied) {
          const ok = await applyValutazione(client, guildId, userId, "negative", weekKey);
          entry.valutazioneApplied = Boolean(ok);
        }
        map[weekKey] = entry;
        changed = true;
        missed += 1;
        try {
          await notifyCompitiMissed({
            guild,
            guildId,
            workerUserId: userId,
            weekKey,
            skipNegative: shouldSkipNegativeValutazione(weekKey),
          });
        } catch (_) {}
      }
    } else if (now >= reviewMs && entry.status === STATUS.SUBMITTED) {
      entry.status = STATUS.REJECTED;
      entry.reviewedAt = now;
      entry.reviewedBy = "system";
      entry.updatedAt = now;
      if (!entry.valutazioneApplied) {
        if (grace || shouldSkipNegativeValutazione(weekKey)) {
          entry.valutazioneApplied = true;
        } else {
          const ok = await applyValutazione(client, guildId, userId, "negative", weekKey);
          entry.valutazioneApplied = Boolean(ok);
        }
      }
      map[weekKey] = entry;
      changed = true;
      autoFail += 1;
      try {
        await notifyCompitiAutoFailed({
          guild,
          guildId,
          workerUserId: userId,
          weekKey,
          taskLabel: taskLabelFromMeta(TASKS_META, entry.taskId),
        });
      } catch (_) {}
    }

    if (changed) await saveMap(guildId, userId, pruneWeekMap(map, weekKey));
  }

  return { ok: true, weekKey, missed, autoFail, dueSoon };
}

/**
 * Idempotent monthly assignment on first ISO week of Rome month + invite auto-check.
 */
async function tickStaffCompitiAssignments(client?) {
  const guildId = resolveGuildId(client);
  if (!guildId) return { ok: false };
  const weekKey = currentRomeIsoWeekKey();
  const monthKey = compitiActiveMonthKey(weekKey);
  const members = await listWorkerMembers(client, guildId);
  let assigned = 0;
  let skipped = 0;

  // Assign plans any time a worker is missing one (idempotent); bulk create preferred in first week.
  for (const member of members) {
    const userId = member.id;
    const plans = await loadPlanMap(guildId, userId);
    if (planPoolIds(plans[monthKey]).length) {
      skipped += 1;
      continue;
    }
    await ensureMonthPlanForUser(guildId, userId, { monthKey, weekKey });
    assigned += 1;
  }

  let inviteHits = 0;
  try {
    inviteHits = await tickInviteActiveCompiti(client, { guildId, members, weekKey });
  } catch (err) {
    global.logger?.warn?.("[COMPITI] invite auto", err?.message || err);
  }

  return { ok: true, monthKey, weekKey, assigned, skipped, inviteHits };
}

/**
 * Auto-submit current-week compito when trigger fires. HS must still approve.
 * Marker: compitiAutoSubmit1
 */
async function tryAutoSubmitCompito(client?, opts: Record<string, any> = {}) {
  const guildId = String(opts.guildId || resolveGuildId(client) || "").trim();
  const userId = String(opts.userId || "").trim();
  const taskId = String(opts.taskId || "").trim();
  const weekKey = String(opts.weekKey || currentRomeIsoWeekKey()).trim();
  const evidence = String(opts.evidence || opts.note || "").trim().slice(0, MAX_NOTE);
  if (!guildId || !/^\d{17,20}$/.test(userId) || !ALLOWED_TASK_IDS.has(taskId) || !/^\d{4}-W\d{2}$/.test(weekKey)) {
    return { ok: false, error: "invalid" };
  }
  if (!isAutoTask(taskId)) return { ok: false, error: "not_auto" };

  const monthKey = compitiActiveMonthKey(weekKey);
  let plan = (await loadPlanMap(guildId, userId))[monthKey] || null;
  if (!planPoolIds(plan).length) {
    plan = await ensureMonthPlanForUser(guildId, userId, { monthKey, weekKey });
  }
  const pool = planPoolIds(plan);
  if (!pool.includes(taskId)) {
    return { ok: false, error: "not_in_pool" };
  }

  const deadlines = deadlinesPayload();
  if (!deadlines.submitOpen && weekKey === currentRomeIsoWeekKey()) {
    return { ok: false, error: "deadline" };
  }

  const map = await loadMap(guildId, userId);
  const entry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
  if (
    entry.status === STATUS.SUBMITTED ||
    entry.status === STATUS.APPROVED ||
    entry.status === STATUS.MISSED
  ) {
    return { ok: false, error: "already_locked", status: entry.status };
  }
  // Deve aver scelto QUESTO compito per la settimana: niente auto-pick a caso.
  if (String(entry.taskId || "") !== taskId) {
    return { ok: false, error: "not_selected_this_week" };
  }
  const locked = lockedTaskIdsForMonth(map, monthKey, weekKey, plan);
  if (locked.includes(taskId) && entry.taskId !== taskId) {
    return { ok: false, error: "task_used" };
  }
  entry.taskId = taskId;
  entry.note = evidence || entry.note || `Completamento automatico: ${taskById(taskId)?.label || taskId}`;
  entry.proofs = entry.proofs || [];
  entry.status = STATUS.SUBMITTED;
  entry.done = true;
  entry.autoSubmitted = true;
  entry.submittedAt = Date.now();
  entry.reviewedAt = 0;
  entry.reviewedBy = "";
  entry.updatedAt = Date.now();
  map[weekKey] = entry;
  await saveMap(guildId, userId, pruneWeekMap(map, weekKey));

  try {
    const guild =
      client?.guilds?.cache?.get?.(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
    await notifyCompitiSubmitted({
      guild,
      guildId,
      workerUserId: userId,
      weekKey,
      taskLabel: taskLabelFromMeta(TASKS_META, taskId),
      auto: true,
    });
  } catch (err) {
    global.logger?.warn?.("[COMPITI] auto-submit notif", err?.message || err);
  }

  return { ok: true, weekKey, taskId, status: STATUS.SUBMITTED };
}

/**
 * invite_active: invitato dallo staff con ≥100 msg o ≥2h vocali nella settimana ISO corrente.
 */
async function tickInviteActiveCompiti(client?, opts: Record<string, any> = {}) {
  const guildId = String(opts.guildId || resolveGuildId(client) || "").trim();
  if (!guildId) return 0;
  const weekKey = String(opts.weekKey || currentRomeIsoWeekKey()).trim();
  const members = Array.isArray(opts.members) ? opts.members : await listWorkerMembers(client, guildId);
  const dateKeys = dateKeysForIsoWeekKey(weekKey);
  if (!dateKeys.length) return 0;

  let hits = 0;
  for (const member of members) {
    const staffId = String(member?.id || "").trim();
    if (!staffId) continue;
    const plan = (await loadPlanMap(guildId, staffId))[compitiActiveMonthKey(weekKey)] || null;
    if (!planPoolIds(plan).includes("invite_active")) continue;
    const map = await loadMap(guildId, staffId);
    const entry = sanitizeWeekEntry(map[weekKey] || emptyWeek());
    if (String(entry.taskId || "") !== "invite_active") continue;
    if (entry.status === STATUS.SUBMITTED || entry.status === STATUS.APPROVED || entry.status === STATUS.MISSED) {
      continue;
    }

    const invitees = await ActivityUserProfile.find({
      guildId,
      "profile.inviteTrack.inviterId": staffId,
      "profile.inviteTrack.active": { $ne: false },
    })
      .select("userId profile.totals.daily")
      .lean()
      .catch(() => []);

    let best = null;
    for (const doc of invitees || []) {
      const daily = doc?.profile?.totals?.daily;
      if (!daily || typeof daily !== "object") continue;
      let text = 0;
      let voice = 0;
      for (const dk of dateKeys) {
        const row = daily[dk];
        if (!row || typeof row !== "object") continue;
        text += Math.max(0, Number(row.textCount || row.text || 0));
        voice += Math.max(0, Number(row.voiceSeconds || row.voice || 0));
      }
      if (text >= 100 || voice >= 2 * 3600) {
        best = { userId: String(doc.userId || ""), text, voice };
        break;
      }
    }
    if (!best) continue;

    const out = await tryAutoSubmitCompito(client, {
      guildId,
      userId: staffId,
      taskId: "invite_active",
      weekKey,
      evidence: `Invitato ${best.userId}: ${best.text} msg / ${(best.voice / 3600).toFixed(1)}h vocali (${weekKey})`,
    });
    if (out?.ok) hits += 1;
  }
  return hits;
}

/* apiWarmSwr2: full guild.members.fetch per workers list (cold staff compiti) */
async function warmSiteStaffCompitiWorkersCache(client?) {
  try {
    const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    if (!guildId) return null;
    return await listWorkerMembers(client, guildId, { force: true });
  } catch (err) {
    global.logger?.warn?.("[site-staff-compiti] warm workers:", err?.message || err);
    return null;
  }
}

export = {
  handleSiteStaffCompitiGet,
  handleSiteStaffCompitiPost,
  handleSiteStaffCompitiFileGet,
  tickStaffCompitiDeadlines,
  tickStaffCompitiAssignments,
  tickInviteActiveCompiti,
  tryAutoSubmitCompito,
  ensureMonthPlanForUser,
  grantCompitiSwapBonus,
  isNewStaffCompitiGrace,
  ALLOWED_TASK_IDS,
  TASKS_META,
  publicTasksMeta,
  currentRomeIsoWeekKey,
  romeMonthKey,
  weekKeysInRomeMonth,
  REASON_OK,
  REASON_FAIL,
  warmSiteStaffCompitiWorkersCache,
};

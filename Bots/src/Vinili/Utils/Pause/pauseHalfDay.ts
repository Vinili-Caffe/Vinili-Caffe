/** Pause: mezze giornate (mattina / pomeriggio), richiesta in giornata e limiti settimanali/mensili.
 *  Una mezza giornata vale 0,5 giorni del budget; mattina + pomeriggio dello stesso giorno = 1 giorno.
 *  Nel resoconto settimanale due mezze giornate della stessa settimana valgono un giorno intero; una da sola non conta. */
const { MS_PER_DAY, parseItalianDate, getTodayUtc } = require("./pauseDates") as typeof import("./pauseDates");

const HALF_DAY_WEIGHT = 0.5;
const HALF_DAY_LABELS = { mattina: "Mattina (fino alle 14)", pomeriggio: "Pomeriggio/sera (dalle 14)" };
/** Ora di Roma (in minuti) entro cui si può chiedere quella fascia per oggi. */
const HALF_DAY_SAME_DAY_CUTOFF_MIN = { mattina: 9 * 60, pomeriggio: 14 * 60 };
/** Uguali per oggi e per gli altri giorni. 1 a settimana: la seconda nella stessa settimana
 *  (che nel resoconto fa un giorno intero) va approvata a mano. */
const HALF_DAY_LIMITS = { week: 1, month: 4 };

function normalizeHalfDay(raw?) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "mattina" || v === "am" || v === "mattino") return "mattina";
  if (v === "pomeriggio" || v === "pm" || v === "sera" || v === "pomeriggio/sera") return "pomeriggio";
  return null;
}

function isHalfDayPause(pause?) {
  return Boolean(normalizeHalfDay(pause?.halfDay));
}

function halfDayLabel(slot?) {
  const s = normalizeHalfDay(slot);
  return s ? HALF_DAY_LABELS[s] : "";
}

function romeNowMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p?) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p?) => p.type === "minute")?.value || 0);
  return h * 60 + m;
}

/** Per oggi si può chiedere solo una fascia non ancora iniziata. */
function canRequestHalfDayToday(slot?, now = new Date()) {
  const s = normalizeHalfDay(slot);
  if (!s) return false;
  return romeNowMinutes(now) < HALF_DAY_SAME_DAY_CUTOFF_MIN[s];
}

function isoWeekStartMs(dayUtc?) {
  const dow = (dayUtc.getUTCDay() + 6) % 7;
  return dayUtc.getTime() - dow * MS_PER_DAY;
}

/** Giorni scalati da una mezza giornata (0 se non è ancora iniziata, è festivo o è stata annullata prima). */
function halfDayScaledDays(pause?, todayUtc = getTodayUtc(), effectiveDays = 1) {
  const day = parseItalianDate(pause?.dataRichiesta);
  if (!day || !effectiveDays) return 0;
  if (pause.status === "accepted") return todayUtc >= day ? HALF_DAY_WEIGHT : 0;
  if (pause.status === "cancelled") return Number(pause.giorniUsati) > 0 ? HALF_DAY_WEIGHT : 0;
  return 0;
}

/** Richieste di mezza giornata ancora valide (non rifiutate), una sola per gruppo "Entrambi". */
function listHalfDayRequests(pauses?, excludeIds = new Set()) {
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(pauses) ? pauses : []) {
    if (!p || !isHalfDayPause(p)) continue;
    if (p.status === "rejected") continue;
    if (p.status === "cancelled" && !(Number(p.giorniUsati) > 0)) continue;
    if (excludeIds.has(String(p._id || ""))) continue;
    const key = String(p.pauseGroupId || p._id || "");
    if (seen.has(key)) continue;
    seen.add(key);
    const day = parseItalianDate(p.dataRichiesta);
    if (day) out.push({ day });
  }
  return out;
}

/** Avvisi sui limiti delle mezze giornate (stile "Requisiti non rispettati"). */
function getHalfDayLimitWarnings(pauses?, { day, excludePauseIds = [] }: any = {}) {
  if (!day) return [];
  const list = listHalfDayRequests(pauses, new Set((excludePauseIds || []).map(String)));
  const weekStart = isoWeekStartMs(day);
  const inWeek = list.filter((r?) => isoWeekStartMs(r.day) === weekStart);
  const inMonth = list.filter(
    (r?) => r.day.getUTCFullYear() === day.getUTCFullYear() && r.day.getUTCMonth() === day.getUTCMonth(),
  );
  const out = [];
  if (inWeek.length >= HALF_DAY_LIMITS.week) {
    out.push(`**Mezze giornate a settimana:** già ${inWeek.length} su ${HALF_DAY_LIMITS.week} in questa settimana.`);
  }
  if (inMonth.length >= HALF_DAY_LIMITS.month) {
    out.push(`**Mezze giornate al mese:** già ${inMonth.length} su ${HALF_DAY_LIMITS.month} in questo mese.`);
  }
  return out;
}

/** Blocchi: stessa fascia già chiesta, giorno già coperto da una pausa intera, o mezza giornata attaccata a una pausa intera. */
function getHalfDayConflict(pauses?, { day, slot }: any = {}) {
  const ms = day?.getTime?.();
  if (!Number.isFinite(ms)) return null;
  for (const p of Array.isArray(pauses) ? pauses : []) {
    if (!p || (p.status !== "pending" && p.status !== "accepted")) continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    if (isHalfDayPause(p)) {
      if (start.getTime() === ms && normalizeHalfDay(p.halfDay) === slot) {
        return "Hai già chiesto questa mezza giornata.";
      }
      continue;
    }
    if (ms >= start.getTime() && ms <= end.getTime()) return "Quel giorno sei già in pausa.";
    if (ms === start.getTime() - MS_PER_DAY || ms === end.getTime() + MS_PER_DAY) {
      return "Non puoi attaccare una mezza giornata a una pausa intera: allunga la pausa invece.";
    }
  }
  return null;
}

/** Pause accettate per le regole del resoconto: una mezza giornata da sola non conta,
 *  due mezze giornate nella stessa settimana (anche in giorni diversi) valgono un giorno intero,
 *  messo sul giorno della seconda. */
function pausesForWeeklyRules(pauses?) {
  const list = Array.isArray(pauses) ? pauses : [];
  const out = [];
  const weeks = new Map();
  for (const p of list) {
    if (!p) continue;
    if (!isHalfDayPause(p)) {
      out.push(p);
      continue;
    }
    if (p.status !== "accepted") continue;
    const day = parseItalianDate(p.dataRichiesta);
    if (!day) continue;
    /* "Entrambi" crea due pause uguali (Staff + PM): contano una volta per ruolo */
    const key = `${isoWeekStartMs(day)}|${String(p.ruolo || p.ruoloRichiesto || "")}`;
    const entry = weeks.get(key) || { halves: new Map() };
    entry.halves.set(`${day.getTime()}|${normalizeHalfDay(p.halfDay)}`, { pause: p, ms: day.getTime() });
    weeks.set(key, entry);
  }
  for (const { halves } of weeks.values()) {
    if (halves.size < 2) continue;
    const latest = [...halves.values()].sort((a?, b?) => b.ms - a.ms)[0].pause;
    const full = typeof latest.toObject === "function" ? latest.toObject() : { ...latest };
    full.halfDay = null;
    full.dataRitorno = full.dataRichiesta;
    out.push(full);
  }
  return out;
}

export = {
  HALF_DAY_WEIGHT,
  HALF_DAY_LIMITS,
  normalizeHalfDay,
  isHalfDayPause,
  halfDayLabel,
  canRequestHalfDayToday,
  halfDayScaledDays,
  getHalfDayLimitWarnings,
  getHalfDayConflict,
  pausesForWeeklyRules,
};

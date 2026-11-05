"use strict";
const { romeYmd } = require("./starWarsEventConfig") as typeof import("./starWarsEventConfig");

const FEATURES = Object.freeze({
  SMISTAMENTO: "smistamento",
  AVVENTO: "avvento",
  ECONOMY: "economy",
  MINIGAME_PODRACE: "minigame_podrace",
  MINIGAME_SCOMMESSA: "minigame_scommessa",
  MINIGAME_SCOVA: "minigame_scova_pianeta",
  MINIGAME_ORDINE66: "minigame_ordine66",
  MINIGAME_CACCIATORE: "minigame_cacciatore_taglie",
  MINIGAME_ATTACCA_BASE: "minigame_attacca_base",
  MINIGAME_CACCIA_EWOK: "minigame_caccia_ewok",
  MINIGAME_PROTEGGI: "minigame_proteggi_convoglio",
  EVENT_PODRACING_CHAMP: "event_podracing_championship",
  EVENT_ACCADEMIA: "event_accademia",
  EVENT_KYBER: "event_kyber",
  EVENT_PUZZLE_KESSEL: "event_puzzle_kessel",
  GAME_CONQUISTA: "game_conquista_sistema",
  GAME_COLLEZIONA_PG: "game_colleziona_pg",
  GAME_RELIQUIE: "game_colleziona_reliquie",
  GAME_OLOCRON: "game_caccia_olocron",
});

const EPOCHS = Object.freeze({
  CLONE_WARS: "clone_wars",
  CIVIL_WAR: "civil_war",
  SEQUEL: "sequel",
});

const ECONOMY_PHASE = Object.freeze({
  I: 1,
  II: 2,
  III: 3,
});


const DAY_ROWS = Object.freeze([
  { date: "2026-12-01", at: "00:00", advent: 1, epoch: EPOCHS.CLONE_WARS, on: [FEATURES.AVVENTO], note: "Calendario dell'Avvento" },
  { date: "2026-12-01", at: "12:00", on: [FEATURES.SMISTAMENTO], note: "Smistamento" },
  { date: "2026-12-02", advent: 2 },
  { date: "2026-12-03", at: "12:00", advent: 3, on: [FEATURES.MINIGAME_PODRACE], note: "Attivazione Gara di Podracer" },
  { date: "2026-12-04", at: "12:00", advent: 4, on: [FEATURES.EVENT_PODRACING_CHAMP], note: "Podracing Championship" },
  { date: "2026-12-05", at: "21:00", advent: 5, film: "Star Wars: La minaccia fantasma" },
  { date: "2026-12-06", advent: 6 },
  { date: "2026-12-07", advent: 7 },
  { date: "2026-12-08", advent: 8 },
  { date: "2026-12-09", at: "12:00", advent: 9, off: [FEATURES.EVENT_PODRACING_CHAMP], note: "Termine Podracing Championship" },
  { date: "2026-12-10", at: "12:00", advent: 10, on: [FEATURES.MINIGAME_CACCIATORE], note: "Cacciatore di taglie" },
  { date: "2026-12-11", advent: 11 },
  { date: "2026-12-12", at: "21:00", advent: 12, film: "Star Wars: L'attacco dei cloni" },
  { date: "2026-12-13", advent: 13, on: [FEATURES.MINIGAME_SCOMMESSA], economyPhase: ECONOMY_PHASE.I, note: "Scommessa Podracer + Economia I attiva" },
  { date: "2026-12-14", advent: 14 },
  { date: "2026-12-15", advent: 15 },
  { date: "2026-12-16", at: "12:00", advent: 16, off: [FEATURES.MINIGAME_CACCIATORE], note: "Termine Cacciatore di taglie" },
  { date: "2026-12-17", advent: 17 },
  { date: "2026-12-18", at: "12:00", advent: 18, off: [FEATURES.MINIGAME_PODRACE, FEATURES.MINIGAME_SCOMMESSA], note: "Termine Podrace + Scommessa Podracer" },
  { date: "2026-12-19", at: "21:00", advent: 19, film: "Star Wars: La vendetta dei Sith" },
  { date: "2026-12-20", advent: 20 },
  { date: "2026-12-21", at: "12:00", advent: 21, on: [FEATURES.MINIGAME_SCOVA], note: "Scova il pianeta" },
  { date: "2026-12-22", advent: 22 },
  { date: "2026-12-23", advent: 23 },
  { date: "2026-12-24", at: "12:00", advent: 24, on: [FEATURES.MINIGAME_ORDINE66], note: "Ordine 66" },
  { date: "2026-12-25", advent: 25 },
  { date: "2026-12-26" },
  { date: "2026-12-27" },
  { date: "2026-12-28" },
  { date: "2026-12-29" },
  { date: "2026-12-30", at: "12:00", off: [FEATURES.MINIGAME_ORDINE66], note: "Termine Ordine 66" },
  { date: "2026-12-31", economyPhase: null, note: "Disattivazione Economia I" },
  { date: "2027-01-01", epoch: EPOCHS.CIVIL_WAR, note: "Smistamento → Impero / Ribellione" },
  { date: "2027-01-02", at: "21:00", film: "Star Wars: Rogue One" },
  { date: "2027-01-03", at: "12:00", on: [FEATURES.EVENT_KYBER], note: "Miniera Kyber" },
  { date: "2027-01-04" },
  { date: "2027-01-05", at: "12:00", off: [FEATURES.EVENT_KYBER], note: "Termine Miniera Kyber" },
  { date: "2027-01-06" },
  { date: "2027-01-07" },
  { date: "2027-01-08", at: "12:00", off: [FEATURES.MINIGAME_SCOVA], note: "Termine Scova il pianeta" },
  { date: "2027-01-09", at: "21:00", film: "Star Wars: Una nuova speranza" },
  { date: "2027-01-10", economyPhase: ECONOMY_PHASE.II, note: "Economia II attiva" },
  { date: "2027-01-11", at: "12:00", on: [FEATURES.MINIGAME_ATTACCA_BASE], note: "Attacca la base" },
  { date: "2027-01-12", at: "12:00", on: [FEATURES.GAME_CONQUISTA], note: "Conquista il sistema" },
  { date: "2027-01-13", at: "12:00", on: [FEATURES.EVENT_ACCADEMIA], note: "Accademia" },
  { date: "2027-01-14" },
  { date: "2027-01-15" },
  { date: "2027-01-16", at: "21:00", film: "Star Wars: L'impero colpisce ancora" },
  { date: "2027-01-17", at: "12:00", off: [FEATURES.MINIGAME_ATTACCA_BASE], note: "Termine Attacca la base" },
  { date: "2027-01-18" },
  { date: "2027-01-19" },
  { date: "2027-01-20" },
  { date: "2027-01-21" },
  { date: "2027-01-22", at: "12:00", off: [FEATURES.EVENT_ACCADEMIA], note: "Termine Accademia" },
  { date: "2027-01-23", at: "21:00", film: "Star Wars: Il ritorno dello Jedi" },
  { date: "2027-01-24", at: "12:00", on: [FEATURES.MINIGAME_CACCIA_EWOK], note: "Caccia all'Ewok" },
  { date: "2027-01-25", at: "12:00", on: [FEATURES.GAME_COLLEZIONA_PG], note: "Colleziona PG" },
  { date: "2027-01-26" },
  { date: "2027-01-27", at: "12:00", off: [FEATURES.MINIGAME_CACCIA_EWOK], note: "Termine Caccia Ewok" },
  { date: "2027-01-28", economyPhase: null, note: "Termine economia II" },
  { date: "2027-01-29", epoch: EPOCHS.SEQUEL, note: "Smistamento → Primo Ordine / Nuova Repubblica" },
  { date: "2027-01-30", at: "21:00", film: "Star Wars: Il risveglio della forza" },
  { date: "2027-01-31" },
  { date: "2027-02-01" },
  { date: "2027-02-02" },
  { date: "2027-02-03", at: "12:00", off: [FEATURES.GAME_CONQUISTA], on: [FEATURES.EVENT_PUZZLE_KESSEL], note: "Termine Conquista il sistema + Puzzle" },
  { date: "2027-02-04", economyPhase: ECONOMY_PHASE.III, note: "Economia III attiva" },
  { date: "2027-02-05" },
  { date: "2027-02-06" },
  { date: "2027-02-07", at: "12:00", on: [FEATURES.GAME_RELIQUIE], note: "Colleziona le reliquie" },
  { date: "2027-02-08", at: "12:00", off: [FEATURES.EVENT_PUZZLE_KESSEL], note: "Termine Puzzle" },
  { date: "2027-02-09", at: "12:00", on: [FEATURES.MINIGAME_PROTEGGI], note: "Proteggi convoglio" },
  { date: "2027-02-10" },
  { date: "2027-02-11", at: "12:00", on: [FEATURES.GAME_OLOCRON], note: "Olocron in rotazione" },
  { date: "2027-02-12" },
  { date: "2027-02-13", at: "21:00", film: "Star Wars: Gli ultimi Jedi" },
  { date: "2027-02-14" },
  { date: "2027-02-15" },
  { date: "2027-02-16" },
  { date: "2027-02-17", at: "12:00", on: [FEATURES.MINIGAME_ATTACCA_BASE], note: "Attacca la base II Fase" },
  { date: "2027-02-18", at: "12:00", off: [FEATURES.GAME_OLOCRON], note: "Termine Olocron" },
  { date: "2027-02-19", economyPhase: null, note: "Termine economia III" },
  { date: "2027-02-20", at: "21:00", film: "Star Wars: L'ascesa di Skywalker" },
  { date: "2027-02-21", at: "12:00", off: [FEATURES.GAME_RELIQUIE], note: "Termine Reliquie" },
  { date: "2027-02-22", at: "12:00", off: [FEATURES.GAME_COLLEZIONA_PG], note: "Termine Colleziona PG" },
  { date: "2027-02-23", at: "12:00", off: [FEATURES.MINIGAME_ATTACCA_BASE], note: "Termine Attacca la base" },
  { date: "2027-02-24", at: "12:00", on: [FEATURES.MINIGAME_SCOVA, FEATURES.MINIGAME_ORDINE66], note: "Ripristino Scova il pianeta + Ordine 66" },
  { date: "2027-02-25" },
  { date: "2027-02-26", at: "12:00", off: [FEATURES.MINIGAME_SCOVA, FEATURES.MINIGAME_ORDINE66], note: "Termine ripristino Scova il pianeta + Ordine 66" },
  { date: "2027-02-27", at: "12:00", off: [FEATURES.MINIGAME_PROTEGGI], note: "Termine Proteggi convoglio" },
  { date: "2027-02-28" },
]);

const BY_DATE = new Map();
for (const r of DAY_ROWS) {
  const d = String(r.date || "").trim();
  if (!d || BY_DATE.has(d)) continue;
  BY_DATE.set(d, Object.freeze({ ...r }));
}

function normalizeAt(at?) {
  const s = String(at || "00:00").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return "00:00";
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function rowStamp(row?) {
  return `${String(row?.date || "").trim()}T${normalizeAt(row?.at)}`;
}

function romeDateTimeStamp(now = new Date(), timeZone = "Europe/Rome") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((p?) => p.type !== "literal")
      .map((p?) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function listCalendarDays() {
  return DAY_ROWS.slice();
}

function getCalendarDay(isoDate?) {
  return BY_DATE.get(String(isoDate || "").trim()) || null;
}

function adventSlotForRomeDate(now = new Date()) {
  const { year, month, day } = romeYmd(now);
  if (year !== 2026 || month !== 12) return null;
  if (day < 1 || day > 25) return null;
  return day;
}

function resolveFeatureStateAtStamp(stamp?) {
  const active = new Set();
  let epoch = null;
  let economyPhase = null;
  let economyOn = false;
  const target = String(stamp || "").trim();

  for (const row of DAY_ROWS) {
    if (rowStamp(row) > target) break;
    if (row.epoch) epoch = row.epoch;
    if (Object.prototype.hasOwnProperty.call(row, "economyPhase")) {
      if (row.economyPhase == null) {
        economyOn = false;
        economyPhase = null;
      } else {
        economyOn = true;
        economyPhase = row.economyPhase;
      }
    }
    for (const f of row.on || []) active.add(f);
    for (const f of row.off || []) active.delete(f);
    if (String(row.date || "") >= "2026-12-26") active.delete(FEATURES.AVVENTO);
  }

  if (economyOn) active.add(FEATURES.ECONOMY);
  else active.delete(FEATURES.ECONOMY);

  return {
    date: target.slice(0, 10),
    stamp: target,
    epoch,
    economyPhase,
    economyOn,
    features: [...active].sort(),
  };
}

function resolveFeatureStateAt(isoDate?) {
  const d = String(isoDate || "").trim();
  return resolveFeatureStateAtStamp(`${d}T23:59`);
}

function resolveFeatureStateNow(now = new Date()) {
  return resolveFeatureStateAtStamp(romeDateTimeStamp(now));
}

function isCalendarFeatureActive(featureKey?, now = new Date()) {
  const key = String(featureKey || "").trim();
  if (!key) return false;
  const state = resolveFeatureStateNow(now);
  return (state.features || []).includes(key);
}

/** Righe calendario per uno slot avvento (1–25 dic 2026). */
function rowsForAdventDay(adventDay?) {
  const n = Math.floor(Number(adventDay));
  if (!Number.isFinite(n) || n < 1 || n > 25) return [];
  const date = `2026-12-${String(n).padStart(2, "0")}`;
  return DAY_ROWS.filter((r?) => Number(r.advent) === n || String(r.date || "") === date);
}

/** Attività del giorno avvento: note, film, feature on/off (dal calendario evento). */
function getAdventDayActivity(adventDay?) {
  const n = Math.floor(Number(adventDay));
  if (!Number.isFinite(n) || n < 1 || n > 25) return null;
  const date = `2026-12-${String(n).padStart(2, "0")}`;
  const rows = rowsForAdventDay(n);
  const notes: string[] = [];
  const on: string[] = [];
  const off: string[] = [];
  let film: string | null = null;
  let economyPhase: number | null = null;
  let at: string | null = null;
  for (const r of rows) {
    if (r.note) notes.push(String(r.note));
    if (r.film && !film) film = String(r.film);
    if (r.at && !at) at = normalizeAt(r.at);
    for (const f of (r.on || []) as readonly string[]) on.push(f);
    for (const f of (r.off || []) as readonly string[]) off.push(f);
    if (Object.prototype.hasOwnProperty.call(r, "economyPhase") && r.economyPhase != null) {
      economyPhase = r.economyPhase;
    }
  }
  return {
    advent: n,
    date,
    at,
    note: notes.length ? [...new Set(notes)].join(" · ") : null,
    film,
    on: [...new Set(on)],
    off: [...new Set(off)],
    economyPhase,
  };
}

/** Prima attivazione di una feature sul calendario. */
function featureUnlockMeta(featureKey?) {
  const key = String(featureKey || "").trim();
  if (!key) return null;
  for (const row of DAY_ROWS) {
    const ons = (row.on || []) as readonly string[];
    if (ons.includes(key)) {
      return {
        date: String(row.date || ""),
        advent: row.advent != null ? Number(row.advent) : null,
        note: row.note ? String(row.note) : null,
        at: row.at ? normalizeAt(row.at) : null,
      };
    }
  }
  return null;
}

/**
 * Feature già sbloccata almeno una volta (resta true anche dopo off calendario).
 * Per collezioni hub: mostra da unlock fino a fine evento.
 */
function isFeatureUnlockedPersistent(featureKey?, now = new Date()) {
  const meta = featureUnlockMeta(featureKey);
  if (!meta?.date) return false;
  const unlockStamp = `${meta.date}T${normalizeAt(meta.at)}`;
  return unlockStamp <= romeDateTimeStamp(now);
}

export = {
  FEATURES,
  EPOCHS,
  ECONOMY_PHASE,
  DAY_ROWS,
  listCalendarDays,
  getCalendarDay,
  adventSlotForRomeDate,
  resolveFeatureStateAt,
  resolveFeatureStateNow,
  resolveFeatureStateAtStamp,
  romeDateTimeStamp,
  isCalendarFeatureActive,
  getAdventDayActivity,
  featureUnlockMeta,
  isFeatureUnlockedPersistent,
  rowsForAdventDay,
};

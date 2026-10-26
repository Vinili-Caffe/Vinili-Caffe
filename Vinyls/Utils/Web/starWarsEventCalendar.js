/**
 * Calendario operativo Star Wars (da CALENDARIO EVENTO.pdf).
 * Ogni giorno: attivazioni/termini feature + slot avvento (1–25 dic).
 * Lo scheduler leggerà questo; Fase 0 = solo sorgente verità.
 */
"use strict";

const { romeYmd } = require("./starWarsEventConfig");

/** @typedef {"on"|"off"} FeatureToggle */

/**
 * Feature keys stabili (bot/sito).
 * epoch: fazione attiva per smistamento / shop.
 */
const FEATURES = Object.freeze({
  SMISTAMENTO: "smistamento",
  AVVENTO: "avvento",
  ECONOMY: "economy",
  MINIGAME_PODRACE: "minigame_podrace",
  MINIGAME_SCOMMESSA: "minigame_scommessa",
  MINIGAME_SCOVA: "minigame_scova_pianeta",
  MINIGAME_ORDINE66: "minigame_ordine66",
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
  CLONE_WARS: "clone_wars", // Repubblica / Separatisti
  CIVIL_WAR: "civil_war", // Impero / Ribellione
  SEQUEL: "sequel", // Nuovo Ordine / Nuova Repubblica
});

const ECONOMY_PHASE = Object.freeze({
  I: 1,
  II: 2,
  III: 3,
});

/**
 * Giorni con eventi (ISO Europe/Rome date). Campi:
 * - advent: 1..25 | null
 * - epoch: EPOCHS.* (se cambia)
 * - economyPhase: 1|2|3|null + economyOn bool via on/off
 * - on / off: string[] FEATURES
 * - film: titolo opzionale
 * - note: stringa staff
 */
const DAY_ROWS = Object.freeze([
  { date: "2026-12-01", advent: 1, epoch: EPOCHS.CLONE_WARS, on: [FEATURES.SMISTAMENTO, FEATURES.AVVENTO], note: "Attivazione smistamento Repubblica/Separatisti" },
  { date: "2026-12-02", advent: 2 },
  { date: "2026-12-03", advent: 3, on: [FEATURES.MINIGAME_PODRACE], note: "Attivazione Gara di Podracer" },
  { date: "2026-12-04", advent: 4, on: [FEATURES.EVENT_PODRACING_CHAMP], note: "Podracing Championship" },
  { date: "2026-12-05", advent: 5, film: "Star Wars: La minaccia fantasma" },
  { date: "2026-12-06", advent: 6 },
  { date: "2026-12-07", advent: 7 },
  { date: "2026-12-08", advent: 8 },
  { date: "2026-12-09", advent: 9, off: [FEATURES.EVENT_PODRACING_CHAMP], note: "Termine Podracing Championship" },
  { date: "2026-12-10", advent: 10 },
  { date: "2026-12-11", advent: 11 },
  { date: "2026-12-12", advent: 12, off: [FEATURES.MINIGAME_PODRACE], film: "Star Wars: L'attacco dei cloni", note: "Termine Gara Podracer" },
  { date: "2026-12-13", advent: 13, on: [FEATURES.MINIGAME_SCOMMESSA], economyPhase: ECONOMY_PHASE.I, note: "Scommessa Podracer + economia I ON" },
  { date: "2026-12-14", advent: 14, on: [FEATURES.EVENT_ACCADEMIA], note: "Accademia Militare" },
  { date: "2026-12-15", advent: 15 },
  { date: "2026-12-16", advent: 16 },
  { date: "2026-12-17", advent: 17 },
  { date: "2026-12-18", advent: 18, off: [FEATURES.MINIGAME_SCOMMESSA], note: "Termine Scommessa" },
  { date: "2026-12-19", advent: 19, film: "Star Wars: La vendetta dei Sith" },
  { date: "2026-12-20", advent: 20, off: [FEATURES.EVENT_ACCADEMIA], note: "Termine Accademia" },
  { date: "2026-12-21", advent: 21, on: [FEATURES.MINIGAME_SCOVA], note: "Scova il pianeta" },
  { date: "2026-12-22", advent: 22 },
  { date: "2026-12-23", advent: 23 },
  { date: "2026-12-24", advent: 24, on: [FEATURES.MINIGAME_ORDINE66], note: "Ordine 66" },
  { date: "2026-12-25", advent: 25 },
  { date: "2026-12-26" },
  { date: "2026-12-27" },
  { date: "2026-12-28" },
  { date: "2026-12-29" },
  { date: "2026-12-30", off: [FEATURES.MINIGAME_ORDINE66], note: "Termine Ordine 66" },
  { date: "2026-12-31", economyPhase: null, note: "Disattivazione economia I" },
  { date: "2027-01-01", epoch: EPOCHS.CIVIL_WAR, note: "Smistamento → Impero / Ribellione" },
  { date: "2027-01-02", film: "Star Wars: Rogue One" },
  { date: "2027-01-03", on: [FEATURES.EVENT_KYBER], note: "Estrazione Kyber" },
  { date: "2027-01-04" },
  { date: "2027-01-05", off: [FEATURES.EVENT_KYBER], note: "Termine Kyber" },
  { date: "2027-01-06" },
  { date: "2027-01-07" },
  { date: "2027-01-08", off: [FEATURES.MINIGAME_SCOVA], note: "Termine Scova il pianeta" },
  { date: "2027-01-09", film: "Star Wars: Una nuova speranza" },
  { date: "2027-01-10", economyPhase: ECONOMY_PHASE.II, note: "Economia II ON" },
  { date: "2027-01-11", on: [FEATURES.MINIGAME_ATTACCA_BASE], note: "Attacca la base" },
  { date: "2027-01-12", on: [FEATURES.GAME_CONQUISTA], note: "Conquista il sistema" },
  { date: "2027-01-13", on: [FEATURES.EVENT_ACCADEMIA], note: "Accademia Militare (II)" },
  { date: "2027-01-14" },
  { date: "2027-01-15" },
  { date: "2027-01-16", film: "Star Wars: L'impero colpisce ancora" },
  { date: "2027-01-17", off: [FEATURES.MINIGAME_ATTACCA_BASE], note: "Termine Attacca la base" },
  { date: "2027-01-18" },
  { date: "2027-01-19" },
  { date: "2027-01-20" },
  { date: "2027-01-21" },
  { date: "2027-01-22", off: [FEATURES.EVENT_ACCADEMIA], note: "Termine Accademia" },
  { date: "2027-01-23", film: "Star Wars: Il ritorno dello Jedi" },
  { date: "2027-01-24", on: [FEATURES.MINIGAME_CACCIA_EWOK], note: "Caccia all'Ewok" },
  { date: "2027-01-25", on: [FEATURES.GAME_COLLEZIONA_PG], note: "Colleziona PG" },
  { date: "2027-01-26" },
  { date: "2027-01-27", off: [FEATURES.MINIGAME_CACCIA_EWOK], note: "Termine Caccia Ewok" },
  { date: "2027-01-28", economyPhase: null, note: "Termine economia II" },
  { date: "2027-01-29", epoch: EPOCHS.SEQUEL, note: "Smistamento → Nuovo Ordine / Nuova Repubblica" },
  { date: "2027-01-30", film: "Star Wars: Il risveglio della forza" },
  { date: "2027-01-31" },
  { date: "2027-02-01" },
  { date: "2027-02-02" },
  { date: "2027-02-03", off: [FEATURES.GAME_CONQUISTA], on: [FEATURES.EVENT_PUZZLE_KESSEL], note: "Termine Conquista + Puzzle di Kessel" },
  { date: "2027-02-04", economyPhase: ECONOMY_PHASE.III, note: "Economia III ON" },
  { date: "2027-02-05" },
  { date: "2027-02-06" },
  { date: "2027-02-07", on: [FEATURES.GAME_RELIQUIE], note: "Colleziona le reliquie" },
  { date: "2027-02-08", off: [FEATURES.EVENT_PUZZLE_KESSEL], note: "Termine Puzzle Kessel" },
  { date: "2027-02-09", on: [FEATURES.MINIGAME_PROTEGGI], note: "Proteggi convoglio" },
  { date: "2027-02-10" },
  { date: "2027-02-11", on: [FEATURES.GAME_OLOCRON], note: "Caccia all'Olocron" },
  { date: "2027-02-12" },
  { date: "2027-02-13", film: "Star Wars: Gli ultimi Jedi" },
  { date: "2027-02-14" },
  { date: "2027-02-15" },
  { date: "2027-02-16" },
  { date: "2027-02-17", on: [FEATURES.MINIGAME_ATTACCA_BASE], note: "Attacca la base (bis)" },
  { date: "2027-02-18", off: [FEATURES.GAME_OLOCRON], note: "Termine Olocron" },
  { date: "2027-02-19", economyPhase: null, note: "Termine economia III" },
  { date: "2027-02-20", film: "Star Wars: L'ascesa di Skywalker" },
  { date: "2027-02-21", off: [FEATURES.GAME_RELIQUIE], note: "Termine Reliquie" },
  { date: "2027-02-22", off: [FEATURES.GAME_COLLEZIONA_PG], note: "Termine Colleziona PG" },
  { date: "2027-02-23", off: [FEATURES.MINIGAME_ATTACCA_BASE], note: "Termine Attacca la base" },
  {
    date: "2027-02-24",
    on: [FEATURES.MINIGAME_SCOVA, FEATURES.MINIGAME_ORDINE66, FEATURES.MINIGAME_PROTEGGI],
    note: "Ripristino Scova + Ordine 66 + Convoglio",
  },
  { date: "2027-02-25" },
  { date: "2027-02-26" },
  { date: "2027-02-27", off: [FEATURES.MINIGAME_PROTEGGI], note: "Termine Proteggi convoglio" },
  { date: "2027-02-28" },
]);

const BY_DATE = new Map(DAY_ROWS.map((r) => [r.date, Object.freeze({ ...r })]));

function listCalendarDays() {
  return DAY_ROWS.slice();
}

function getCalendarDay(isoDate) {
  return BY_DATE.get(String(isoDate || "").trim()) || null;
}

function adventSlotForRomeDate(now = new Date()) {
  const { year, month, day } = romeYmd(now);
  if (year !== 2026 || month !== 12) return null;
  if (day < 1 || day > 25) return null;
  return day;
}

/**
 * Stato feature aggregato fino a `isoDate` incluso (per scheduler / status API).
 */
function resolveFeatureStateAt(isoDate) {
  const active = new Set();
  let epoch = null;
  let economyPhase = null;
  let economyOn = false;

  for (const row of DAY_ROWS) {
    if (row.date > isoDate) break;
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
    if (row.date >= "2026-12-26") active.delete(FEATURES.AVVENTO);
  }

  if (economyOn) active.add(FEATURES.ECONOMY);
  else active.delete(FEATURES.ECONOMY);

  return {
    date: isoDate,
    epoch,
    economyPhase,
    economyOn,
    features: [...active].sort(),
  };
}

function resolveFeatureStateNow(now = new Date()) {
  const { iso } = romeYmd(now);
  return resolveFeatureStateAt(iso);
}

module.exports = {
  FEATURES,
  EPOCHS,
  ECONOMY_PHASE,
  DAY_ROWS,
  listCalendarDays,
  getCalendarDay,
  adventSlotForRomeDate,
  resolveFeatureStateAt,
  resolveFeatureStateNow,
};

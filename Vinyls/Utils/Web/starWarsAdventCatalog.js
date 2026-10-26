/**
 * Calendario avvento Star Wars 2026 — 25 giorni (catalogo premi).
 * Claim/casse: da collegare a inventory + API sito.
 */

const ADVENT_EVENT_KEY = "starwars_2026";

const CRATE_LABELS = Object.freeze({
  omega: "Cassa Omega",
  alpha: "Cassa Alpha",
  beta: "Cassa Beta",
  avvento: "Cassa Avvento",
  militare: "Cassa Militare",
  militare_plus: "Cassa Militare+",
  militare_op: "Cassa Militare OP",
  casuale: "Cassa Casuale",
});

function crate(crateId, qty = 1) {
  return { type: "crate", crateId, qty: Math.max(1, Number(qty) || 1) };
}

function credits(amount) {
  return { type: "premium_credits", amount: Math.max(0, Math.floor(Number(amount) || 0)) };
}

function day(n, rewards, label) {
  return Object.freeze({
    day: n,
    label: String(label || "").trim(),
    rewards: Object.freeze(rewards.map((r) => Object.freeze({ ...r }))),
  });
}

/** Ordine staff (giorno 1 → 25). */
const ADVENT_DAYS = Object.freeze([
  day(1, [crate("omega")], "Cassa Omega"),
  day(2, [crate("casuale")], "Casuale"),
  day(3, [crate("avvento")], "Cassa Avvento"),
  day(4, [crate("beta")], "Cassa Beta"),
  day(5, [crate("casuale", 2), crate("avvento")], "Casuale 2 + Cassa Avvento"),
  day(6, [crate("casuale")], "Casuale"),
  day(7, [crate("alpha")], "Cassa Alpha"),
  day(8, [crate("casuale", 2), crate("omega")], "Casuale 2 + Cassa Omega"),
  day(9, [crate("avvento")], "Cassa Avvento"),
  day(10, [crate("beta")], "Cassa Beta"),
  day(11, [crate("casuale")], "Casuale"),
  day(12, [crate("avvento"), crate("alpha")], "Cassa Avvento + Cassa Alpha"),
  day(13, [crate("casuale", 2)], "Casuale 2"),
  day(14, [crate("militare")], "Militare"),
  day(15, [crate("avvento"), crate("militare_plus")], "Cassa Avvento + Cassa Militare+"),
  day(16, [crate("militare_op")], "Militare OP"),
  day(17, [crate("beta")], "Cassa Beta"),
  day(18, [crate("avvento")], "Cassa Avvento"),
  day(19, [crate("militare")], "Militare"),
  day(20, [crate("casuale", 2)], "Casuale 2"),
  day(21, [crate("avvento")], "Cassa Avvento"),
  day(22, [crate("militare_plus")], "Militare+"),
  day(23, [crate("casuale", 2)], "Casuale 2"),
  day(24, [crate("militare_op")], "Militare OP"),
  day(25, [crate("militare_op"), credits(1000)], "Cassa Militare OP + 1.000 crediti"),
]);

function getAdventDay(dayNum) {
  const d = Math.floor(Number(dayNum));
  if (!Number.isFinite(d) || d < 1 || d > 25) return null;
  return ADVENT_DAYS[d - 1] || null;
}

function listAdventDays() {
  return ADVENT_DAYS.slice();
}

module.exports = {
  ADVENT_EVENT_KEY,
  CRATE_LABELS,
  ADVENT_DAYS,
  getAdventDay,
  listAdventDays,
};

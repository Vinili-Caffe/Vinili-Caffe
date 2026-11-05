/**
 * Tabelle loot casse (ranges da PDF).
 * Moneta: crediti OPPURE exp (+ eventuale utility).
 * Casuale: crediti E exp, mai oggetti (range da pool alpha/beta/omega/avvento).
 * Militari: truppe (+ eventuale utility).
 */
"use strict";

const { rollUtilityItemDrop } = require("./starWarsUtilityItemsCatalog") as typeof import("./starWarsUtilityItemsCatalog");

const TABLES = Object.freeze({
  alpha: { credits: [10000, 110000], exp: [5000, 55000] },
  beta: { credits: [110000, 200000], exp: [55000, 95000] },
  omega: { credits: [200000, 280000], exp: [95000, 135000] },
  lunare: { credits: [280000, 350000], exp: [135000, 175000] },
  solare: { credits: [350000, 410000], exp: [175000, 215000] },
  planetario: { credits: [410000, 460000], exp: [215000, 255000] },
  nebulare: { credits: [460000, 500000], exp: [255000, 295000] },
  galattico: { credits: [500000, 530000], exp: [295000, 335000] },
  avvento: { credits: [5000, 55000], exp: [2500, 27500] },
  /* casuale = range roll tra alpha/beta/omega/avvento, ma sempre crediti+exp */
  casuale_pool: ["alpha", "beta", "omega", "avvento"],
  militare: { troopsTier1: 2 },
  militare_plus: { modes: ["t1_t2", "t3"] },
  militare_op: { modes: ["t2_t3", "t2_x2", "t1_t3", "t4"] },
});

function randInt(a?, b?) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Crediti OPPURE exp (50/50). */
function rollCreditsOrExp(table?) {
  const pick = Math.random() < 0.5 ? "credits" : "exp";
  const [lo, hi] = table[pick];
  const amount = randInt(lo, hi);
  return pick === "credits" ? { credits: amount, exp: 0 } : { credits: 0, exp: amount };
}

/** Crediti E exp (cassa casuale). */
function rollCreditsAndExp(table?) {
  const [cLo, cHi] = table.credits;
  const [eLo, eHi] = table.exp;
  return { credits: randInt(cLo, cHi), exp: randInt(eLo, eHi) };
}

function itemsFromRoll(crateId?) {
  const itemId = rollUtilityItemDrop(crateId);
  return itemId ? { [itemId]: 1 } : null;
}

function resolveCrateId(crateId?) {
  return String(crateId || "").trim();
}

/**
 * @returns {{ ok, error?, resolvedCrate?, credits?, exp?, troops?, items?, note? }}
 */
function openCrateLoot(crateId?) {
  const id = resolveCrateId(crateId);

  /* Casuale: range da pool, sempre crediti+exp, mai oggetti. */
  if (id === "casuale") {
    const pool = TABLES.casuale_pool;
    const tier = pool[Math.floor(Math.random() * pool.length)] || "alpha";
    const table = TABLES[tier];
    if (!table?.credits) return { ok: false, error: "unknown_crate" };
    const roll = rollCreditsAndExp(table);
    return {
      ok: true,
      resolvedCrate: id,
      tier,
      ...roll,
      troops: null,
      items: null,
      note: null,
    };
  }

  if (id === "militare") {
    return {
      ok: true,
      resolvedCrate: id,
      credits: 0,
      exp: 0,
      troops: { tier1: 2 },
      items: itemsFromRoll(id),
      note: "2 truppe TIER 1",
    };
  }
  if (id === "militare_plus") {
    const mode = Math.random() < 0.5 ? "t1_t2" : "t3";
    if (mode === "t3") {
      return {
        ok: true,
        resolvedCrate: id,
        credits: 0,
        exp: 0,
        troops: { tier3: 1 },
        items: itemsFromRoll(id),
        note: "1 truppa TIER 3",
      };
    }
    return {
      ok: true,
      resolvedCrate: id,
      credits: 0,
      exp: 0,
      troops: { tier1: 1, tier2: 1 },
      items: itemsFromRoll(id),
      note: "1 TIER1 + 1 TIER2",
    };
  }
  if (id === "militare_op") {
    const modes = [
      { troops: { tier2: 1, tier3: 1 }, note: "1 TIER2 + 1 TIER3" },
      { troops: { tier2: 2 }, note: "2 TIER2" },
      { troops: { tier1: 1, tier3: 1 }, note: "1 TIER1 + 1 TIER3" },
      { troops: { tier4: 1 }, note: "1 TIER4" },
    ];
    const pick = modes[Math.floor(Math.random() * modes.length)];
    return {
      ok: true,
      resolvedCrate: id,
      credits: 0,
      exp: 0,
      items: itemsFromRoll(id),
      ...pick,
    };
  }

  const table = TABLES[id];
  if (!table || !table.credits) {
    return { ok: false, error: "unknown_crate" };
  }
  const roll = rollCreditsOrExp(table);
  return {
    ok: true,
    resolvedCrate: id,
    ...roll,
    troops: null,
    items: itemsFromRoll(id),
  };
}

export = {
  TABLES,
  openCrateLoot,
  resolveCrateId,
};

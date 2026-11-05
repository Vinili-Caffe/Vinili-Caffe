/**
 * Progressione livelli evento SW (solo EXP evento, non EXP profilo).
 * Milestone ogni 10 livelli (1, 10, …, 110) con premi casse + crediti.
 */
"use strict";

const MAX_LEVEL = 110;

/** @type {readonly { level: number, title: string, expRequired: number, crates: readonly { id: string, qty: number }[], credits: number }[]} */
const LEVEL_MILESTONES = Object.freeze([
  {
    level: 1,
    title: "Recluta",
    expRequired: 1_000,
    crates: Object.freeze([{ id: "alpha", qty: 1 }]),
    credits: 1_000,
  },
  {
    level: 10,
    title: "Soldato",
    expRequired: 55_000,
    crates: Object.freeze([
      { id: "alpha", qty: 1 },
      { id: "beta", qty: 1 },
    ]),
    credits: 1_000,
  },
  {
    level: 20,
    title: "Veterano",
    expRequired: 210_000,
    crates: Object.freeze([
      { id: "omega", qty: 1 },
      { id: "lunare", qty: 1 },
    ]),
    credits: 1_000,
  },
  {
    level: 30,
    title: "Elite",
    expRequired: 465_000,
    crates: Object.freeze([
      { id: "solare", qty: 1 },
      { id: "planetario", qty: 1 },
    ]),
    credits: 1_000,
  },
  {
    level: 40,
    title: "Eroe",
    expRequired: 820_000,
    crates: Object.freeze([
      { id: "nebulare", qty: 1 },
      { id: "galattico", qty: 1 },
    ]),
    credits: 1_000,
  },
  {
    level: 50,
    title: "Leggenda",
    expRequired: 1_275_000,
    crates: Object.freeze([{ id: "galattico", qty: 1 }]),
    credits: 1_000,
  },
  {
    level: 60,
    title: "Campione",
    expRequired: 1_830_000,
    crates: Object.freeze([{ id: "galattico", qty: 1 }]),
    credits: 1_000,
  },
  {
    level: 70,
    title: "Maestro",
    expRequired: 2_485_000,
    crates: Object.freeze([{ id: "galattico", qty: 1 }]),
    credits: 1_000,
  },
  {
    level: 80,
    title: "Comandante",
    expRequired: 3_240_000,
    crates: Object.freeze([{ id: "galattico", qty: 1 }]),
    credits: 1_000,
  },
  {
    level: 90,
    title: "Signore della galassia",
    expRequired: 4_095_000,
    crates: Object.freeze([{ id: "galattico", qty: 1 }]),
    credits: 1_000,
  },
  {
    level: 100,
    title: "Ascendente",
    expRequired: 5_050_000,
    crates: Object.freeze([{ id: "galattico", qty: 1 }]),
    credits: 1_000,
  },
  {
    level: 110,
    title: "Leggenda della galassia",
    expRequired: 6_105_000,
    crates: Object.freeze([{ id: "galattico", qty: 1 }]),
    credits: 1_000,
  },
]);

/** EXP cumulativa richiesta per raggiungere ogni livello 1..110 (interpolata tra milestone). */
const EXP_FOR_LEVEL = (() => {
  const out = new Array(MAX_LEVEL + 1).fill(0);
  out[0] = 0;
  for (let i = 0; i < LEVEL_MILESTONES.length; i++) {
    const cur = LEVEL_MILESTONES[i];
    const prev = i === 0 ? { level: 0, expRequired: 0 } : LEVEL_MILESTONES[i - 1];
    out[cur.level] = cur.expRequired;
    const span = cur.level - prev.level;
    if (span <= 1) continue;
    const expSpan = cur.expRequired - prev.expRequired;
    for (let L = prev.level + 1; L < cur.level; L++) {
      const t = (L - prev.level) / span;
      out[L] = Math.floor(prev.expRequired + expSpan * t);
    }
  }
  return Object.freeze(out);
})();

function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function expRequiredForLevel(level?) {
  const L = Math.min(MAX_LEVEL, Math.max(0, safeInt(level)));
  return safeInt(EXP_FOR_LEVEL[L]);
}

/** Livello da EXP evento cumulativa (0 se sotto Recluta). */
function levelFromEventExp(exp?) {
  const e = safeInt(exp);
  let level = 0;
  for (let L = 1; L <= MAX_LEVEL; L++) {
    if (e >= EXP_FOR_LEVEL[L]) level = L;
    else break;
  }
  return level;
}

function milestoneAtOrBelow(level?) {
  const L = safeInt(level);
  let hit = null;
  for (const m of LEVEL_MILESTONES) {
    if (m.level <= L) hit = m;
    else break;
  }
  return hit;
}

function rankTitleForLevel(level?) {
  const m = milestoneAtOrBelow(level);
  return m ? m.title : "Non classificato";
}

function milestonesBetween(prevLevel?, newLevel?) {
  const from = safeInt(prevLevel);
  const to = safeInt(newLevel);
  if (to <= from) return [];
  return LEVEL_MILESTONES.filter((m?) => m.level > from && m.level <= to);
}

function publicLevelProgress(exp?, pgLevel?) {
  const e = safeInt(exp);
  const level = Math.max(safeInt(pgLevel), levelFromEventExp(e));
  const title = rankTitleForLevel(level);
  const curReq = expRequiredForLevel(level);
  const nextLevel = level >= MAX_LEVEL ? null : level + 1;
  const nextReq = nextLevel == null ? null : expRequiredForLevel(nextLevel);
  const into = Math.max(0, e - curReq);
  const span = nextReq == null ? 1 : Math.max(1, nextReq - curReq);
  const pct = nextReq == null ? 100 : Math.min(100, Math.floor((into / span) * 100));
  return {
    level,
    title,
    exp: e,
    expToNext: nextReq == null ? 0 : Math.max(0, nextReq - e),
    nextLevel,
    nextReq,
    progressPct: pct,
    maxLevel: MAX_LEVEL,
  };
}

function publicLevelCatalog() {
  return LEVEL_MILESTONES.map((m?) => ({
    level: m.level,
    title: m.title,
    expRequired: m.expRequired,
    credits: m.credits,
    crates: m.crates.map((c?) => ({ ...c })),
  }));
}

export = {
  MAX_LEVEL,
  LEVEL_MILESTONES,
  EXP_FOR_LEVEL,
  expRequiredForLevel,
  levelFromEventExp,
  milestoneAtOrBelow,
  rankTitleForLevel,
  milestonesBetween,
  publicLevelProgress,
  publicLevelCatalog,
};

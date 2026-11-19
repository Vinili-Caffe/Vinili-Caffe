/** Simulatore livelli: stessa curva e stesso combine multi del bot (expLevels / expMultipliers). */

export type LevelCurveSegment = { upTo: number; base: number; from: number; perLevel: number };
export type LevelCurve = {
  firstThreshold: number;
  roundTo: number;
  minStepAdd: number;
  segments: LevelCurveSegment[];
};

export type LevelsSimCatalogRole = {
  key: string;
  roleId: string;
  label: string;
  multiplier: number;
  kind: "boost" | "status" | "donor";
};

export type LevelsSimConfig = {
  messageExp: number;
  voiceExpPerMinute: number;
  messageCooldownSec: number;
  maxCombinedMultiplier: number;
  globalMultiplier: number;
  levelCurve: LevelCurve;
  catalog: LevelsSimCatalogRole[];
};

export const DEFAULT_LEVEL_CURVE: LevelCurve = {
  firstThreshold: 100,
  roundTo: 50,
  minStepAdd: 110,
  segments: [
    { upTo: 10, base: 120, from: 1, perLevel: 25 },
    { upTo: 30, base: 380, from: 10, perLevel: 55 },
    { upTo: 60, base: 1600, from: 30, perLevel: 120 },
    { upTo: 10000, base: 5200, from: 60, perLevel: 210 },
  ],
};

/** Catalogo ruoli bonus “visibili” (stessi id del profilo / officialGuildIds). */
export const DEFAULT_SIM_CATALOG: LevelsSimCatalogRole[] = [
  { key: "booster", roleId: "1329497467481493607", label: "Booster", multiplier: 2, kind: "boost" },
  { key: "double", roleId: "1544830850552823849", label: "Double Booster", multiplier: 3, kind: "boost" },
  { key: "mvp", roleId: "1544830832227782699", label: "MVP", multiplier: 2, kind: "status" },
  { key: "donator", roleId: "1544830864565735515", label: "Donator", multiplier: 4, kind: "donor" },
  { key: "vip", roleId: "1544830866616754257", label: "VIP", multiplier: 5, kind: "donor" },
  { key: "vipplus", roleId: "1544830868575625276", label: "VIP+", multiplier: 6, kind: "donor" },
];

export const DEFAULT_LEVELS_SIM: LevelsSimConfig = {
  messageExp: 2,
  voiceExpPerMinute: 5,
  messageCooldownSec: 0,
  maxCombinedMultiplier: 8,
  globalMultiplier: 1,
  levelCurve: DEFAULT_LEVEL_CURVE,
  catalog: DEFAULT_SIM_CATALOG,
};

function roundToNearest(value: number, roundTo = 50) {
  const step = Math.max(1, Math.floor(roundTo || 50));
  return Math.round(Number(value || 0) / step) * step;
}

function getLevelStep(level: number, curve: LevelCurve) {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  const segments = Array.isArray(curve.segments) ? curve.segments : DEFAULT_LEVEL_CURVE.segments;
  for (const seg of segments) {
    if (safeLevel <= Number(seg.upTo)) {
      const from = Math.max(0, Math.floor(Number(seg.from) || 0));
      return Math.max(0, Math.floor(Number(seg.base) || 0) + (safeLevel - from) * Math.floor(Number(seg.perLevel) || 0));
    }
  }
  const last = segments[segments.length - 1];
  if (!last) return 0;
  const from = Math.max(0, Math.floor(Number(last.from) || 0));
  return Math.max(0, Math.floor(Number(last.base) || 0) + (safeLevel - from) * Math.floor(Number(last.perLevel) || 0));
}

/** EXP totale necessari per raggiungere `level` (soglia cumulativa). */
export function getTotalExpForLevel(level: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE) {
  const firstThreshold = Math.max(1, Math.floor(Number(curve.firstThreshold) || 100));
  const minStepAdd = Math.max(0, Math.floor(Number(curve.minStepAdd) || 110));
  const roundTo = Math.max(1, Math.floor(Number(curve.roundTo) || 50));
  const targetLevel = Math.max(0, Math.floor(Number(level) || 0));
  if (targetLevel <= 0) return 0;
  let threshold = firstThreshold;
  for (let l = 1; l < targetLevel; l += 1) {
    threshold = roundToNearest(threshold + Math.max(minStepAdd, getLevelStep(l, curve)), roundTo);
  }
  return threshold;
}

/** Come `combineWeeklyExpMultiplier` sul bot: globale + (ruolo − 1), capped. */
export function combineMultiplier(globalMultiplier: number, roleMultiplier: number, maxCombined = 8) {
  const safeGlobal = Number.isFinite(globalMultiplier) && globalMultiplier > 0 ? globalMultiplier : 1;
  const safeRole = Number.isFinite(roleMultiplier) && roleMultiplier > 0 ? roleMultiplier : 1;
  const roleBonus = Math.max(0, safeRole - 1);
  const cap = Number.isFinite(maxCombined) && maxCombined >= 1 ? maxCombined : 8;
  return Math.min(cap, Math.max(1, safeGlobal + roleBonus));
}

export function dailyExpBase(messagesPerDay: number, voiceHoursPerDay: number, cfg: Pick<LevelsSimConfig, "messageExp" | "voiceExpPerMinute">) {
  const msgs = Math.max(0, Number(messagesPerDay) || 0);
  const mins = Math.max(0, (Number(voiceHoursPerDay) || 0) * 60);
  return msgs * Math.max(0, cfg.messageExp) + mins * Math.max(0, cfg.voiceExpPerMinute);
}

export type LevelEta = {
  xpNeeded: number;
  dailyXp: number;
  days: number;
  alreadyThere: boolean;
  zeroDaily: boolean;
};

export function estimateLevelEta(opts: {
  currentExp: number;
  targetLevel: number;
  messagesPerDay: number;
  voiceHoursPerDay: number;
  multiplier: number;
  cfg: LevelsSimConfig;
}): LevelEta {
  const targetXp = getTotalExpForLevel(opts.targetLevel, opts.cfg.levelCurve);
  const xpNeeded = Math.max(0, targetXp - Math.max(0, Math.floor(opts.currentExp)));
  const base = dailyExpBase(opts.messagesPerDay, opts.voiceHoursPerDay, opts.cfg);
  const dailyXp = base * Math.max(0.01, opts.multiplier);
  if (xpNeeded <= 0) return { xpNeeded: 0, dailyXp, days: 0, alreadyThere: true, zeroDaily: false };
  if (dailyXp <= 0) return { xpNeeded, dailyXp: 0, days: Infinity, alreadyThere: false, zeroDaily: true };
  return { xpNeeded, dailyXp, days: xpNeeded / dailyXp, alreadyThere: false, zeroDaily: false };
}

/** Testo stile Sollary: “17 giorni” / “19 ore”. */
export function formatEta(days: number): { amount: number; unit: string; label: string } {
  if (!Number.isFinite(days) || days <= 0) return { amount: 0, unit: "", label: "subito" };
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return { amount: hours, unit: hours === 1 ? "ora" : "ore", label: `${hours} ${hours === 1 ? "ora" : "ore"}` };
  }
  if (days < 1.5) return { amount: 1, unit: "giorno", label: "1 giorno" };
  const d = Math.ceil(days);
  return { amount: d, unit: "giorni", label: `${d.toLocaleString("it-IT")} giorni` };
}

export function normalizeLevelsSim(raw: unknown, fallbackGlobal = 1): LevelsSimConfig {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const curveRaw = r.levelCurve && typeof r.levelCurve === "object" ? (r.levelCurve as Record<string, unknown>) : {};
  const segmentsIn = Array.isArray(curveRaw.segments) ? curveRaw.segments : DEFAULT_LEVEL_CURVE.segments;
  const segments: LevelCurveSegment[] = [];
  for (const row of segmentsIn) {
    const s = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const upTo = Math.floor(Number(s.upTo));
    const base = Math.floor(Number(s.base));
    const from = Math.floor(Number(s.from));
    const perLevel = Math.floor(Number(s.perLevel));
    if (![upTo, base, from, perLevel].every(Number.isFinite)) continue;
    segments.push({ upTo, base, from, perLevel });
  }
  const catalogIn = Array.isArray(r.catalog) ? r.catalog : DEFAULT_SIM_CATALOG;
  const catalog: LevelsSimCatalogRole[] = [];
  for (const row of catalogIn) {
    const s = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const roleId = String(s.roleId || "").trim();
    const label = String(s.label || "").trim();
    const multiplier = Number(s.multiplier);
    const key = String(s.key || roleId || label).trim();
    const kind = s.kind === "boost" || s.kind === "status" || s.kind === "donor" ? s.kind : "status";
    if (!/^\d{16,20}$/.test(roleId) || !label || !(multiplier > 0)) continue;
    catalog.push({ key, roleId, label, multiplier, kind });
  }
  const globalMultiplier = Number(r.globalMultiplier);
  return {
    messageExp: Math.max(0, Math.floor(Number(r.messageExp ?? DEFAULT_LEVELS_SIM.messageExp))),
    voiceExpPerMinute: Math.max(0, Math.floor(Number(r.voiceExpPerMinute ?? DEFAULT_LEVELS_SIM.voiceExpPerMinute))),
    messageCooldownSec: Math.max(0, Math.floor(Number(r.messageCooldownSec ?? 0))),
    maxCombinedMultiplier: Math.max(1, Number(r.maxCombinedMultiplier ?? 8) || 8),
    globalMultiplier: Number.isFinite(globalMultiplier) && globalMultiplier > 0 ? globalMultiplier : Math.max(0.1, fallbackGlobal || 1),
    levelCurve: {
      firstThreshold: Math.max(1, Math.floor(Number(curveRaw.firstThreshold ?? 100))),
      roundTo: Math.max(1, Math.floor(Number(curveRaw.roundTo ?? 50))),
      minStepAdd: Math.max(0, Math.floor(Number(curveRaw.minStepAdd ?? 110))),
      segments: segments.length ? segments : DEFAULT_LEVEL_CURVE.segments,
    },
    catalog: catalog.length ? catalog : DEFAULT_SIM_CATALOG,
  };
}

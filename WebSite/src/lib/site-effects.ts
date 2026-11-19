/** Preferenze effetti sito (stesse chiavi del WebSite vecchio dove esistevano). */

/**
 * Override localStorage (`vc_*_force`) solo dopo hydration.
 * Leggerli al primo paint client ≠ SSR → React #418 (SOON/badge/nav diversi).
 */
let seasonForcesReady = false;
const seasonForceListeners = new Set<() => void>();

export function enableSeasonForces() {
  if (seasonForcesReady) return;
  seasonForcesReady = true;
  for (const fn of seasonForceListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeSeasonForces(fn: () => void) {
  seasonForceListeners.add(fn);
  return () => {
    seasonForceListeners.delete(fn);
  };
}

function seasonForce(key: string): boolean {
  if (!seasonForcesReady) return false;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function romeParts(now: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    return {
      y: Number(parts.find((p) => p.type === "year")?.value),
      m: Number(parts.find((p) => p.type === "month")?.value),
      d: Number(parts.find((p) => p.type === "day")?.value),
      h: Number(parts.find((p) => p.type === "hour")?.value),
    };
  } catch {
    return {
      y: now.getFullYear(),
      m: now.getMonth() + 1,
      d: now.getDate(),
      h: now.getHours(),
    };
  }
}

/** Stagione Halloween (Rome): 15 ott → 2 nov alle 12 (chiusura evento, come il bot) — FX + musica home. */
export function isHalloweenSeason(now = new Date()): boolean {
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m === 10 && d >= 15) return true;
  if (m === 11 && (d === 1 || (d === 2 && h < 12))) return true;
  return false;
}

/**
 * Natale (Rome): domenica 22 nov alle 12 → 7 gen alle 12.
 * Override test: localStorage `vc_christmas_force` = 1.
 */
export function isChristmasSeason(now = new Date()): boolean {
  /* Capodanno e Befana vivono dentro gli effetti di Natale: forzarli accende anche la stagione */
  if (seasonForce("vc_christmas_force") || seasonForce("vc_newyear_force") || seasonForce("vc_befana_force")) return true;
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m === 11 && (d > 22 || (d === 22 && h >= 12))) return true;
  if (m === 12) return true;
  if (m === 1 && (d < 7 || (d === 7 && h < 12))) return true;
  return false;
}

/**
 * Capodanno (Rome): 1 gen 00:00 → 7 gen 12:00 — fuochi + «Buon Anno».
 * Override test: localStorage `vc_newyear_force` = 1.
 */
export function isNewYearSeason(now = new Date()): boolean {
  if (seasonForce("vc_newyear_force")) return true;
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m !== 1) return false;
  if (d >= 1 && d < 7) return true;
  if (d === 7 && h < 12) return true;
  return false;
}

/**
 * Befana / Epifania (Rome): 6 gen 00:00 → 7 gen 12:00.
 * Override test: localStorage `vc_befana_force` = 1.
 */
export function isBefanaSeason(now = new Date()): boolean {
  if (seasonForce("vc_befana_force")) return true;
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m !== 1) return false;
  if (d === 6) return true;
  if (d === 7 && h < 12) return true;
  return false;
}

/**
 * Pagina /albero/ (Rome): 15 dic 12:00 → 25 dic 12:00.
 * Override test: localStorage `vc_albero_force` = 1.
 */
export function isAlberoSeason(now = new Date()): boolean {
  if (seasonForce("vc_albero_force")) return true;
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m !== 12) return false;
  if (d > 15 && d < 25) return true;
  if (d === 15 && h >= 12) return true;
  if (d === 25 && h < 12) return true;
  return false;
}

/**
 * Vinili Wrapped (Rome): 10 dic alle 12 → 7 gen alle 12.
 * Override test: localStorage `vc_wrapped_force` = 1.
 */
export function isWrappedSeason(now = new Date()): boolean {
  if (seasonForce("vc_wrapped_force")) return true;
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m === 12 && (d > 10 || (d === 10 && h >= 12))) return true;
  if (m === 1 && (d < 7 || (d === 7 && h < 12))) return true;
  return false;
}

/**
 * Buoni propositi (Rome): 28 dic 12:00 → 4 gen 00:00.
 * A mezzanotte del 4 gen i post bruciano e la pagina torna Confessionale.
 * Override test: localStorage `vc_propositi_force` = 1.
 */
export function isPropositiSeason(now = new Date()): boolean {
  if (seasonForce("vc_propositi_force")) return true;
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m === 12 && (d > 28 || (d === 28 && h >= 12))) return true;
  if (m === 1 && d >= 1 && d < 4) return true;
  return false;
}

export const EFFECT_KEYS = {
  cursorTrail: "vc_cursor_trail",
  cursorLight: "vc_cursor_light",
  typeSfx: "vc_type_sfx",
  typeSfxVol: "vc_type_sfx_vol",
  ptr: "vc_ptr",
  halloweenFx: "vc_halloween_fx",
  christmasFx: "vc_christmas_fx",
  /** Policy globale motion: auto | respect | enhance | off — vedi `device-fx.ts`. */
  fxMotion: "vc_fx_motion",
} as const;

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** `true` = attivo. Valori off: 0 / off / false. Assente = defaultOn. */
export function effectEnabled(key: string, defaultOn = true): boolean {
  const raw = String(lsGet(key) ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false") return false;
  if (raw === "1" || raw === "on" || raw === "true") return true;
  return defaultOn;
}

export function setEffectEnabled(key: string, on: boolean) {
  lsSet(key, on ? "1" : "0");
}

export function typeSfxVolume(): number {
  const raw = lsGet(EFFECT_KEYS.typeSfxVol);
  if (raw == null || String(raw).trim() === "") return 0.7;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(1, Math.max(0, n > 1 ? n / 100 : n));
}

export function isDesktopPointer(): boolean {
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return false;
    if (window.matchMedia("(hover: none)").matches && (navigator.maxTouchPoints || 0) > 0) {
      return false;
    }
  } catch {
    return true;
  }
  return true;
}

export function isTouchUi(): boolean {
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
    }
  } catch {
    /* ignore */
  }
  return (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
}

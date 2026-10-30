/** Preferenze effetti sito (stesse chiavi del WebSite vecchio dove esistevano). */

/** Stagione Halloween (Rome): 15 ott → 2 nov alle 12 (chiusura evento, come il bot) — FX + musica home. */
export function isHalloweenSeason(now = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    if (!y || !m || !d) return false;
    if (m === 10 && d >= 15) return true;
    if (m === 11 && (d === 1 || (d === 2 && h < 12))) return true;
    return false;
  } catch {
    const m = now.getMonth() + 1;
    const d = now.getDate();
    return (m === 10 && d >= 15) || (m === 11 && (d === 1 || (d === 2 && now.getHours() < 12)));
  }
}

export const EFFECT_KEYS = {
  cursorTrail: "vc_cursor_trail",
  cursorLight: "vc_cursor_light",
  typeSfx: "vc_type_sfx",
  typeSfxVol: "vc_type_sfx_vol",
  ptr: "vc_ptr",
  halloweenFx: "vc_halloween_fx",
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

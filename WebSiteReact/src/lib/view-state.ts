/**
 * Ripristino lean path → scroll/hash (F5 / back-forward / PTR / PWA reopen).
 * Chiavi compatibili col vecchio sito: vc_pwa_view_state_v1 + vc-pwa-resume.
 *
 * bootMidFlashKill1: navigate fresco (anche SPA / telefono) → SEMPRE top,
 * mai mid-page da session (anti “parte dal basso”) — eccezione: resume PWA.
 */

export const VIEW_STATE_KEY = "vc_pwa_view_state_v1";
export const PWA_RESUME_KEY = "vc-pwa-resume";
export const PWA_SHELL_KEY = "vc-pwa-shell";
export const PWA_UI_RESTORE_KEY = "vc_pwa_ui_restore_v1";

export type ViewState = {
  v: 1;
  path: string;
  y: number;
  hash: string;
  at: number;
};

declare global {
  interface Window {
    __vcViewStateRestoring?: boolean;
    __vcBootUnlock?: () => void;
    __vcDiscardScrollRestore?: number;
    __vcPwaResumePending?: number;
    __vcOauthCallbackPending?: number;
    __vcPwaColdApp?: boolean;
  }
}

export function navType(): string {
  try {
    const list = performance.getEntriesByType?.("navigation");
    const n = list && (list[0] as PerformanceNavigationTiming | undefined);
    if (n?.type) return String(n.type);
  } catch {
    /* ignore */
  }
  return "navigate";
}

export function isStandalonePwa(): boolean {
  try {
    const mq = (m: string) => window.matchMedia(`(display-mode: ${m})`).matches;
    if (mq("standalone") || mq("fullscreen") || mq("minimal-ui") || mq("window-controls-overlay")) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true;
  } catch {
    return false;
  }
}

export function wasPwaShell(): boolean {
  if (isStandalonePwa()) return true;
  try {
    return localStorage.getItem(PWA_SHELL_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPwaShell() {
  if (!isStandalonePwa()) return;
  try {
    localStorage.setItem(PWA_SHELL_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function normalizePath(pathname = ""): string {
  const p = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1) || "/";
  return p || "/";
}

export function readViewState(): ViewState | null {
  try {
    const raw = localStorage.getItem(VIEW_STATE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as ViewState;
    if (!j || j.v !== 1 || typeof j.path !== "string") return null;
    return j;
  } catch {
    return null;
  }
}

/** Path con trailing slash (come resume del sito vecchio). */
export function resumePathFromLocation(pathname = "", search = "", hash = ""): string {
  let p = String(pathname || "/").replace(/\/index\.html$/i, "") || "/";
  if (p !== "/" && !p.endsWith("/")) p += "/";
  const q = (() => {
    try {
      const u = new URLSearchParams(String(search || "").replace(/^\?/, ""));
      ["code", "state", "error", "error_description", "access_token", "token_type", "expires_in", "app"].forEach((k) =>
        u.delete(k),
      );
      const out = u.toString();
      return out ? `?${out}` : "";
    } catch {
      return "";
    }
  })();
  let h = String(hash || "");
  if (h.includes("access_token=")) h = "";
  if (h.length > 80) h = "";
  return `${p}${q}${h}`;
}

/* pwaExtReturn1: /vote e /faq devono poter riprendere dopo Top.gg/Discadia (prima andavi in home). */
const RESUME_BLOCK = /^(?:\/oauth)|\/accesso-richiesto\/?$/i;

export function writePwaResume(fullPath: string) {
  if (!isStandalonePwa() && !wasPwaShell()) return;
  markPwaShell();
  const raw = String(fullPath || "");
  if (!raw.startsWith("/")) return;
  const only = normalizePath(raw);
  if (RESUME_BLOCK.test(only) || only.startsWith("/oauth")) return;
  try {
    // non sovrascrivere una pagina utile con "/" su cold-start icona
    if (only === "/") {
      const cold =
        Boolean(window.__vcPwaColdApp) ||
        (() => {
          try {
            const at = Number(sessionStorage.getItem("vc-pwa-cold-app") || "0") || 0;
            return at > 0 && Date.now() - at < 20_000;
          } catch {
            return false;
          }
        })();
      let left = false;
      try {
        left = sessionStorage.getItem("vc-pwa-left-start") === "1" || sessionStorage.getItem("vc_nav_explicit") === "1";
      } catch {
        /* ignore */
      }
      if (cold && !left) return;
    } else {
      try {
        sessionStorage.setItem("vc-pwa-left-start", "1");
      } catch {
        /* ignore */
      }
    }
    const qi = raw.indexOf("?");
    const hi = raw.indexOf("#");
    const search = qi >= 0 ? `?${raw.slice(qi + 1).split("#")[0]}` : "";
    const hash = hi >= 0 ? `#${raw.slice(hi + 1)}` : "";
    const p = resumePathFromLocation(only === "/" ? "/" : `${only}/`, search, hash);
    localStorage.setItem(PWA_RESUME_KEY, JSON.stringify({ p, t: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function writeViewState(partial: Partial<ViewState> & { path: string }) {
  try {
    const next: ViewState = {
      v: 1,
      path: normalizePath(partial.path),
      y: Math.max(0, Math.floor(Number(partial.y) || 0)),
      hash: String(partial.hash || ""),
      at: Date.now(),
    };
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(next));
    writePathScroll(next);
  } catch {
    /* ignore */
  }
}

/* scrollPerPath1: posizione di OGNI pagina visitata nella sessione, così "indietro" di più passi
   (anche dopo un sito esterno) riporta ogni pagina al suo punto, non solo l'ultima. */
const PATH_SCROLL_KEY = "vc_scroll_by_path_v1";

function writePathScroll(st: ViewState) {
  try {
    const map = JSON.parse(sessionStorage.getItem(PATH_SCROLL_KEY) || "{}") as Record<string, ViewState>;
    map[st.path] = st;
    const keys = Object.keys(map).sort((a, b) => map[b].at - map[a].at);
    for (const k of keys.slice(40)) delete map[k];
    sessionStorage.setItem(PATH_SCROLL_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function readPathScroll(path: string): ViewState | null {
  try {
    const map = JSON.parse(sessionStorage.getItem(PATH_SCROLL_KEY) || "{}") as Record<string, ViewState>;
    return map[normalizePath(path)] || null;
  } catch {
    return null;
  }
}

function isPtrReload(): boolean {
  try {
    return sessionStorage.getItem("vc_ptr_reload_v1") === "1";
  } catch {
    return false;
  }
}

export function isPwaUiRestorePending(): boolean {
  try {
    if (window.__vcPwaResumePending) return true;
    return sessionStorage.getItem(PWA_UI_RESTORE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPwaUiRestorePending() {
  try {
    window.__vcPwaResumePending = 0;
    sessionStorage.removeItem(PWA_UI_RESTORE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Solo F5 / back-forward / PTR / reopen PWA.
 * Mai su navigate fresco (link, SPA, login return) — salvo resume PWA.
 */
export function shouldRestore(saved: ViewState | null, path: string): boolean {
  if (!saved) return false;
  if (window.__vcDiscardScrollRestore && !isPwaUiRestorePending()) return false;
  if (normalizePath(saved.path) !== normalizePath(path)) return false;
  if (Date.now() - saved.at > 7 * 24 * 60 * 60 * 1000) return false;

  // indietro/avanti (anche tornando da un sito esterno) e ricarica: si torna al punto, home compresa
  const type = navType();
  if (type === "reload" || type === "back_forward") return true;
  if (isPtrReload()) return true;

  const home = normalizePath(path) === "/";
  if (home) return false;
  // reopen PWA: cold-start → redirect ultima pagina (nav type = navigate)
  if (isPwaUiRestorePending() && (isStandalonePwa() || wasPwaShell())) return true;
  return false;
}

export function maxScrollY(): number {
  const el = document.documentElement;
  const body = document.body;
  const max = Math.max(el.scrollHeight, body?.scrollHeight || 0) - window.innerHeight;
  return Math.max(0, max);
}

/**
 * Riporta lo scroll a `y` anche se la pagina si allunga dopo (dati caricati in ritardo): insegue la posizione
 * per qualche secondo con salti istantanei (lo smooth del sito animerebbe e si interromperebbe).
 * Se nel frattempo l'utente scorre/tocca/preme un tasto, smette subito. Chiama `done` alla fine.
 */
export function chaseScroll(y: number, done?: () => void, maxMs = 6000) {
  const start = performance.now();
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(ev, stop, true);
    done?.();
  };
  for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(ev, stop, { capture: true, passive: true });
  const step = () => {
    if (stopped) return;
    if (
      document.documentElement.classList.contains("vc-boot-hold") ||
      document.documentElement.classList.contains("vc-route-hold")
    ) {
      window.setTimeout(step, 40);
      return;
    }
    const max = maxScrollY();
    // Anti flash footer: se la pagina è ancora corta (solo chrome), aspetta il contenuto
    if (y > 80 && max < Math.min(y, 160) && performance.now() - start < maxMs) {
      window.setTimeout(step, 80);
      return;
    }
    const target = Math.min(y, max);
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo({ top: target, behavior: "instant" as ScrollBehavior });
    if (maxScrollY() >= y || performance.now() - start > maxMs) {
      // ultimo assestamento dopo un frame (immagini/font)
      window.setTimeout(() => {
        if (!stopped && Math.abs(window.scrollY - Math.min(y, maxScrollY())) > 2)
          window.scrollTo({ top: Math.min(y, maxScrollY()), behavior: "instant" as ScrollBehavior });
        stop();
      }, 120);
      return;
    }
    window.setTimeout(step, 80);
  };
  step();
}

/** Forza top e scarta un eventuale restore mid-page (navigazione client). */
export function forceScrollTop() {
  try {
    window.__vcDiscardScrollRestore = 1;
    window.__vcViewStateRestoring = false;
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  } catch {
    /* ignore */
  }
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";

/** Same key as WebSite/js/vc-theme.js — shared when same origin. */
export const THEME_PREF_KEY = "vc-theme-pref";
const CHROME_PREFS_API = "/webhooks/site-chrome-prefs";
const THEME_COLOR_LIGHT = "#efe6dc";
/** Finestra PWA (SITE_THEME_COLOR / roast) — non l’accent embed Discord. */
const THEME_COLOR_DARK = "#1a110c";

export type ThemePref = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

type ThemeState = {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (pref: ThemePref) => void;
  /** Toggle resolved light ↔ dark (stores explicit light|dark, like the old footer switch). */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

function normalizePref(raw: unknown): ThemePref {
  const p = String(raw || "")
    .trim()
    .toLowerCase();
  if (p === "light" || p === "dark" || p === "auto") return p;
  return "auto";
}

function systemIsDark(): boolean {
  try {
    return Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  } catch {
    return true;
  }
}

export function resolvePref(pref: ThemePref): ResolvedTheme {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  return systemIsDark() ? "dark" : "light";
}

function readStoredPref(): ThemePref {
  try {
    return normalizePref(localStorage.getItem(THEME_PREF_KEY) || "auto");
  } catch {
    return "auto";
  }
}

function writeStoredPref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_PREF_KEY, pref);
  } catch {}
}

function applyDom(pref: ThemePref, resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute("data-vc-theme-pref", pref);
  root.setAttribute("data-vc-theme", resolved);
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", resolved === "light" ? THEME_COLOR_LIGHT : THEME_COLOR_DARK);
  } catch {}
}

/** Inline boot (layout): runs before paint to avoid dark flash when pref is light. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=String(localStorage.getItem("${THEME_PREF_KEY}")||"auto").toLowerCase();if(p!=="light"&&p!=="dark"&&p!=="auto")p="auto";var light=p==="light"||(p!=="dark"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches);var t=light?"light":"dark";var r=document.documentElement;r.setAttribute("data-vc-theme-pref",p);r.setAttribute("data-vc-theme",t);r.setAttribute("data-theme",t);r.style.colorScheme=t;}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { token, ready: authReady } = useAuth();
  const [pref, setPrefState] = useState<ThemePref>("auto");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");
  const applyingRemote = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((next: ThemePref) => {
    const r = resolvePref(next);
    setPrefState(next);
    setResolved(r);
    applyDom(next, r);
    return r;
  }, []);

  const publishChrome = useCallback(
    (next: ThemePref) => {
      if (applyingRemote.current || !token) return;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        pushTimer.current = null;
        fetch(CHROME_PREFS_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "omit",
          keepalive: true,
          body: JSON.stringify({ prefs: { theme: next, updatedAt: Date.now() } }),
        }).catch(() => {});
      }, 700);
    },
    [token],
  );

  const setPref = useCallback(
    (raw: ThemePref) => {
      const next = normalizePref(raw);
      writeStoredPref(next);
      apply(next);
      publishChrome(next);
    },
    [apply, publishChrome],
  );

  const toggle = useCallback(() => {
    const next: ThemePref = resolvePref(pref) === "dark" ? "light" : "dark";
    setPref(next);
  }, [pref, setPref]);

  // Boot from localStorage + system preference listener
  useEffect(() => {
    apply(readStoredPref());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStoredPref() === "auto") apply("auto");
    };
    mq.addEventListener?.("change", onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_PREF_KEY || e.newValue == null) return;
      applyingRemote.current = true;
      try {
        apply(normalizePref(e.newValue));
      } finally {
        applyingRemote.current = false;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener?.("change", onChange);
      window.removeEventListener("storage", onStorage);
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [apply]);

  // Sync with site-chrome-prefs when logged in (same as vc-theme.js + vc-chrome-sync.js)
  useEffect(() => {
    if (!authReady || !token) return;
    let cancelled = false;
    fetch(CHROME_PREFS_API, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "omit",
    })
      .then(async (r) => {
        if (!r.ok || cancelled) return;
        const body = (await r.json()) as { ok?: boolean; prefs?: { theme?: string }; anonymous?: boolean };
        if (cancelled || body.anonymous) return;
        const remote = normalizePref(body.prefs?.theme);
        if (body.prefs?.theme && (body.prefs.theme === "light" || body.prefs.theme === "dark" || body.prefs.theme === "auto")) {
          if (remote !== readStoredPref()) {
            applyingRemote.current = true;
            try {
              writeStoredPref(remote);
              apply(remote);
            } finally {
              applyingRemote.current = false;
            }
          }
          return;
        }
        // Server has no theme → push local (themeSync1 migrate)
        const local = readStoredPref();
        publishChrome(local);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authReady, token, apply, publishChrome]);

  const value = useMemo(
    () => ({ pref, resolved, setPref, toggle }),
    [pref, resolved, setPref, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme fuori da <ThemeProvider>");
  return ctx;
}

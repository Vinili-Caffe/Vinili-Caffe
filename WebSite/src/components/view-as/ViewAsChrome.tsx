"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Briefcase, Coffee, Eye, Gem, LifeBuoy, LogOut, Shield, Star, UserRound, X } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  VIEW_AS_PRESETS,
  applyViewAs,
  clearViewAsIfDenied,
  closeViewAsBar,
  isViewAsBarOpen,
  probeViewAsGate,
  readRealToken,
  readViewAs,
  readViewAsProbe,
  setChromeAllowed,
  setViewAsBarOpen,
  subscribeChromeAllowed,
  subscribeViewAs,
  viewAsAllowedSticky,
  viewAsLabel,
  writeViewAsProbe,
  chromeAllowedNow,
  type ViewAsPreset,
} from "@/lib/view-as";

const ICONS: Record<string, ReactNode> = {
  "": <UserRound className="size-3.5" aria-hidden />,
  logout: <LogOut className="size-3.5" aria-hidden />,
  member: <Coffee className="size-3.5" aria-hidden />,
  helper: <LifeBuoy className="size-3.5" aria-hidden />,
  mod: <Shield className="size-3.5" aria-hidden />,
  senior: <Shield className="size-3.5" aria-hidden />,
  director: <Star className="size-3.5" aria-hidden />,
  highstaff: <Gem className="size-3.5" aria-hidden />,
  pm: <Briefcase className="size-3.5" aria-hidden />,
};

type Chrome = { launch: boolean; bar: boolean };
const ChromeCtx = createContext<Chrome>({ launch: false, bar: false });

export function useViewAsChrome() {
  return useContext(ChromeCtx);
}

function useViewAsSnapshot() {
  const mode = useSyncExternalStore(subscribeViewAs, readViewAs, () => "");
  const barOpen = useSyncExternalStore(subscribeViewAs, isViewAsBarOpen, () => false);
  return { mode, barOpen };
}

function Item({ preset, current, onPick }: { preset: ViewAsPreset; current: string; onPick: () => void }) {
  const selected = preset.id === current;
  return (
    <li role="none">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onPick}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-crema hover:bg-caramel/15",
          selected && "bg-caramel/20",
        )}
      >
        {ICONS[preset.id] || ICONS[""]}
        <span className="min-w-0 flex-1">{preset.label}</span>
        {preset.group === "real" ? (
          <span className="rounded-full bg-caramel/15 px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wide text-sand ring-1 ring-caramel/30">
            Default
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** Barra in cima + probe site-staff-access. Montata da SiteShell. */
export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  const snap = useViewAsSnapshot();
  const allowed = useSyncExternalStore(subscribeChromeAllowed, chromeAllowedNow, () => false);
  const [menu, setMenu] = useState(false);
  const listId = useId();

  useEffect(() => {
    if (!ready) return;
    const token = readRealToken();
    if (!token) {
      writeViewAsProbe("");
      if (readViewAs() || viewAsAllowedSticky()) clearViewAsIfDenied();
      setChromeAllowed(false);
      return;
    }
    const cached = readViewAsProbe();
    if (cached === "deny" && !readViewAs()) {
      setChromeAllowed(false);
      return;
    }
    if (cached === "allow" || viewAsAllowedSticky() || readViewAs()) setChromeAllowed(true);
    if (cached === "allow") return;
    let alive = true;
    probeViewAsGate().then((gate) => {
      if (!alive) return;
      if (gate === "allow") {
        try {
          sessionStorage.setItem("vc_view_as_allowed", "1");
        } catch {
          /* ignore */
        }
        writeViewAsProbe("allow");
        setChromeAllowed(true);
        return;
      }
      if (gate === "deny") {
        const had = Boolean(readViewAs());
        writeViewAsProbe("deny");
        clearViewAsIfDenied();
        setChromeAllowed(false);
        if (had) location.reload();
        return;
      }
      setChromeAllowed(viewAsAllowedSticky() || Boolean(readViewAs()));
    });
    return () => {
      alive = false;
    };
  }, [ready]);

  const showBar = allowed && snap.barOpen;

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!showBar) {
      root.style.removeProperty("--vc-view-as-h");
      root.removeAttribute("data-vc-view-as");
      document.body.style.paddingTop = "";
      return;
    }
    root.setAttribute("data-vc-view-as", snap.mode || "real");
    const bar = document.getElementById("vc-view-as-bar");
    const px = Math.max(40, Math.ceil(bar?.getBoundingClientRect().height || 50));
    root.style.setProperty("--vc-view-as-h", `${px}px`);
    document.body.style.paddingTop = `${px}px`;
  }, [showBar, snap.mode, menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node | null;
      if (!node) return;
      const bar = document.getElementById("vc-view-as-bar");
      if (bar && !bar.contains(node)) setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menu]);

  const groups: { key: ViewAsPreset["group"]; label: string }[] = [
    { key: "guest", label: "Ospite" },
    { key: "user", label: "Utente" },
    { key: "staff", label: "Staff" },
  ];

  return (
    <ChromeCtx.Provider value={{ launch: allowed && !showBar, bar: showBar }}>
      {showBar && (
        <div
          id="vc-view-as-bar"
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-[80] border-b border-sand/15 bg-roast/95 pt-[env(safe-area-inset-top)] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          <div className="mx-auto flex min-h-12 max-w-6xl flex-wrap items-center justify-center gap-2 px-3 py-1.5">
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-sand/80">Anteprima</span>
            <div className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={menu}
                aria-controls={listId}
                aria-label="Vedi come"
                onClick={() => setMenu((o) => !o)}
                className="relative inline-flex min-w-40 items-center gap-2 rounded-full bg-white/5 py-1.5 pl-3 pr-8 text-left text-sm font-semibold text-crema ring-1 ring-white/15 hover:bg-caramel/15 hover:ring-caramel/40"
              >
                {ICONS[snap.mode] || ICONS[""]}
                <span>{viewAsLabel(snap.mode)}</span>
                <span className="pointer-events-none absolute right-3 top-1/2 size-1.5 -translate-y-[70%] rotate-45 border-b border-r border-sand" aria-hidden />
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.ul
                    id={listId}
                    role="listbox"
                    aria-label="Vedi come"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute left-1/2 z-10 mt-2 max-h-72 w-64 -translate-x-1/2 overflow-auto rounded-2xl bg-gradient-to-b from-mocha to-roast p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.55)] ring-1 ring-sand/25 sm:left-0 sm:translate-x-0"
                  >
                    {VIEW_AS_PRESETS.filter((p) => p.group === "real").map((p) => (
                      <Item key="real" preset={p} current={snap.mode} onPick={() => (setMenu(false), applyViewAs(p.id))} />
                    ))}
                    {groups.map((g) => (
                      <li key={g.key} role="presentation" className="mt-1">
                        <p className="px-2 pb-0.5 pt-1.5 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-caramel/80">{g.label}</p>
                        <ul>
                          {VIEW_AS_PRESETS.filter((p) => p.group === g.key).map((p) => (
                            <Item key={p.id} preset={p} current={snap.mode} onPick={() => (setMenu(false), applyViewAs(p.id))} />
                          ))}
                        </ul>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full bg-white/5 text-crema ring-1 ring-white/15 hover:bg-caramel/15 hover:ring-caramel/40"
              aria-label="Chiudi anteprima"
              title="Chiudi anteprima"
              onClick={() => {
                setMenu(false);
                closeViewAsBar();
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
      {children}
    </ChromeCtx.Provider>
  );
}

/** Occhio in navbar. Solo fondatore, e solo a barra chiusa. */
export function ViewAsLaunch() {
  const { launch } = useViewAsChrome();
  if (!launch || !readRealToken()) return null;
  return (
    <button
      type="button"
      id="vc-view-as-launch"
      aria-label="Apri anteprima ruoli"
      title="Anteprima"
      onClick={() => setViewAsBarOpen(true)}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-crema/8 text-crema ring-1 ring-crema/15 transition-colors hover:bg-crema/15"
    >
      <Eye className="size-[1.15rem] text-ember" strokeWidth={2.25} />
      <span className="sr-only">Anteprima</span>
    </button>
  );
}

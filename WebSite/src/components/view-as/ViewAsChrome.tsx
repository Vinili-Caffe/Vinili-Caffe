"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, LogOut, RotateCcw, Search, UserRound, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  applyViewAs,
  clearViewAsIfDenied,
  closeViewAsBar,
  isViewAsBarOpen,
  loadViewAsRoles,
  probeViewAsGate,
  readRealToken,
  readViewAs,
  readViewAsProbe,
  rememberRoleNames,
  rolesViewAsMode,
  setChromeAllowed,
  setViewAsBarOpen,
  subscribeChromeAllowed,
  subscribeViewAs,
  viewAsAllowedSticky,
  viewAsLabel,
  viewAsRoleIds,
  writeViewAsProbe,
  chromeAllowedNow,
  type ViewAsRole,
} from "@/lib/view-as";

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

function modeIcon(mode: string): ReactNode {
  if (!mode) return <UserRound className="size-3.5" aria-hidden />;
  if (mode === "logout") return <LogOut className="size-3.5" aria-hidden />;
  return <Users className="size-3.5" aria-hidden />;
}

/**
 * Selettore "Visualizza come" (come su Discord): Reale, Ospite non loggato, oppure una combinazione
 * di ruoli veri del server. Il bot applica i ruoli scelti a tutto il sito per le tue richieste.
 */
function RolePicker({ mode, onClose, listId }: { mode: string; onClose: () => void; listId: string }) {
  const [roles, setRoles] = useState<ViewAsRole[] | null>(null);
  const [realIds, setRealIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(viewAsRoleIds(mode) || []));

  useEffect(() => {
    let off = false;
    void loadViewAsRoles().then((r) => {
      if (off) return;
      if (!r.ok) return setError(r.message);
      setRoles(r.roles);
      setRealIds(r.realRoleIds);
    });
    return () => {
      off = true;
    };
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (roles || []).filter((r) => !needle || r.name.toLowerCase().includes(needle));
  }, [roles, q]);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = () => {
    const ids = [...picked];
    const names: Record<string, string> = {};
    for (const r of roles || []) if (picked.has(r.id)) names[r.id] = r.name;
    rememberRoleNames(names);
    onClose();
    applyViewAs(rolesViewAsMode(ids));
  };

  return (
    <motion.div
      id={listId}
      role="dialog"
      aria-label="Visualizza il sito come"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="absolute left-1/2 z-10 mt-2 flex max-h-[min(34rem,80vh)] w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-mocha to-roast shadow-[0_18px_44px_rgba(0,0,0,0.55)] ring-1 ring-sand/25"
    >
      <div className="space-y-1 border-b border-sand/10 p-1.5">
        <button
          type="button"
          onClick={() => (onClose(), applyViewAs(""))}
          className={cn("flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-crema hover:bg-caramel/15", !mode && "bg-caramel/20")}
        >
          <UserRound className="size-3.5" aria-hidden /> <span className="flex-1">Reale</span>
          {!mode ? <Check className="size-4 text-ember" aria-hidden /> : null}
        </button>
        <button
          type="button"
          onClick={() => (onClose(), applyViewAs("logout"))}
          className={cn("flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-crema hover:bg-caramel/15", mode === "logout" && "bg-caramel/20")}
        >
          <LogOut className="size-3.5" aria-hidden /> <span className="flex-1">Ospite (non loggato)</span>
          {mode === "logout" ? <Check className="size-4 text-ember" aria-hidden /> : null}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-caramel/80">Ruoli del server</p>
        <span className="text-[0.7rem] tabular-nums text-crema/60">{picked.size} scelti</span>
      </div>
      <div className="px-2 pb-1.5">
        <label className="relative block">
          <span className="sr-only">Cerca un ruolo</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-crema/50" aria-hidden />
          <input
            name="view-as-role-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca un ruolo…"
            className="w-full rounded-lg bg-espresso/70 py-1.5 pl-8 pr-2 text-sm text-crema outline-none ring-1 ring-sand/15 placeholder:text-crema/45 focus:ring-caramel/50"
          />
        </label>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5" role="listbox" aria-multiselectable aria-label="Ruoli da simulare">
        {error ? (
          <li className="px-2.5 py-4 text-center text-sm text-crema/60">{error}</li>
        ) : !roles ? (
          Array.from({ length: 7 }, (_, i) => (
            <li key={i} className="flex items-center gap-2.5 px-2.5 py-2">
              <span className="size-4 animate-pulse rounded bg-crema/[0.08]" />
              <span className="h-3.5 flex-1 animate-pulse rounded bg-crema/[0.07]" style={{ width: `${70 - i * 6}%` }} />
            </li>
          ))
        ) : shown.length === 0 ? (
          <li className="px-2.5 py-4 text-center text-sm text-crema/60">Nessun ruolo trovato.</li>
        ) : (
          shown.map((r) => {
            const on = picked.has(r.id);
            return (
              <li key={r.id} role="option" aria-selected={on}>
                <button type="button" onClick={() => toggle(r.id)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-crema/[0.05]", on && "bg-caramel/12")}>
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded ring-1", on ? "bg-caramel text-espresso ring-caramel" : "ring-sand/30")} aria-hidden>
                    {on ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color || "rgb(153 170 181)" }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-crema" style={r.color ? { color: r.color } : undefined}>
                    {r.name}
                  </span>
                  {realIds.includes(r.id) ? <span className="shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide text-crema/50">tuo</span> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex items-center gap-2 border-t border-sand/10 p-2">
        <button
          type="button"
          onClick={() => setPicked(new Set(realIds))}
          disabled={!roles}
          title="Parti dai tuoi ruoli veri"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-crema/70 ring-1 ring-sand/15 hover:text-crema disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" aria-hidden /> I miei
        </button>
        <button type="button" onClick={() => setPicked(new Set())} disabled={!picked.size} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-crema/70 ring-1 ring-sand/15 hover:text-crema disabled:opacity-40">
          Nessuno
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!roles}
          className="ml-auto rounded-lg bg-gradient-to-r from-caramel to-ember px-3 py-1.5 text-xs font-bold text-ink disabled:opacity-40"
        >
          {picked.size ? `Visualizza con ${picked.size} ${picked.size === 1 ? "ruolo" : "ruoli"}` : "Solo @everyone"}
        </button>
      </div>
    </motion.div>
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
    root.setAttribute("data-vc-view-as", snap.mode ? (viewAsRoleIds(snap.mode) ? "roles" : snap.mode) : "real");
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

  const active = Boolean(snap.mode);

  return (
    <ChromeCtx.Provider value={{ launch: allowed && !showBar, bar: showBar }}>
      {showBar && (
        <div
          id="vc-view-as-bar"
          role="status"
          aria-live="polite"
          className={cn(
            "fixed inset-x-0 top-0 z-[80] border-b pt-[env(safe-area-inset-top)] shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
            active ? "border-caramel/40 bg-gradient-to-r from-[#3a2412] via-roast to-[#3a2412]" : "border-sand/15 bg-roast/95",
          )}
        >
          <div className="mx-auto flex min-h-12 max-w-6xl flex-wrap items-center justify-center gap-2 px-3 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-sand/80">
              <Eye className="size-3.5 text-ember" aria-hidden />
              {active ? "Stai visualizzando il sito come" : "Anteprima"}
            </span>
            <div className="relative">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={menu}
                aria-controls={listId}
                aria-label="Scegli come visualizzare il sito"
                onClick={() => setMenu((o) => !o)}
                className="relative inline-flex min-w-40 items-center gap-2 rounded-full bg-white/5 py-1.5 pl-3 pr-8 text-left text-sm font-semibold text-crema ring-1 ring-white/15 hover:bg-caramel/15 hover:ring-caramel/40"
              >
                {modeIcon(snap.mode)}
                <span className="max-w-[14rem] truncate">{viewAsLabel(snap.mode)}</span>
                <span className="pointer-events-none absolute right-3 top-1/2 size-1.5 -translate-y-[70%] rotate-45 border-b border-r border-sand" aria-hidden />
              </button>
              <AnimatePresence>{menu ? <RolePicker mode={snap.mode} listId={listId} onClose={() => setMenu(false)} /> : null}</AnimatePresence>
            </div>
            {active ? (
              <button
                type="button"
                onClick={() => applyViewAs("")}
                className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-crema ring-1 ring-white/15 hover:bg-caramel/15 hover:ring-caramel/40"
              >
                Torna reale
              </button>
            ) : null}
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
      aria-label="Visualizza il sito come un ruolo"
      title="Visualizza come…"
      onClick={() => setViewAsBarOpen(true)}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-crema/8 text-crema ring-1 ring-crema/15 transition-colors hover:bg-crema/15"
    >
      <Eye className="size-[1.15rem] text-ember" strokeWidth={2.25} />
      <span className="sr-only">Visualizza come</span>
    </button>
  );
}

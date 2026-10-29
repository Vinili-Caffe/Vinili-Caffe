"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EFFECT_KEYS, effectEnabled, isTouchUi } from "@/lib/site-effects";
import { cn } from "@/lib/cn";

const THRESHOLD = 62;
const MAX_PULL = 118;
const PTR_KEY = "vc_ptr_reload_v1";
const SCROLL_KEY = "vc_ptr_scroll_v1";

function resisted(dy: number) {
  return (1 - Math.exp(-Math.max(0, dy) / 150)) * MAX_PULL;
}

function windowAtTop() {
  const y = window.pageYOffset || document.documentElement.scrollTop || 0;
  try {
    if (window.visualViewport && Number(window.visualViewport.offsetTop || 0) > 1) return false;
  } catch {
    /* ignore */
  }
  return y <= 4;
}

function canPullFrom(target: EventTarget | null) {
  let el = target instanceof Node ? (target.nodeType === 3 ? target.parentElement : (target as Element)) : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const st = window.getComputedStyle(el);
    const oy = st.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 2) {
      if (el.scrollTop > 4) return false;
    }
    el = el.parentElement;
  }
  return windowAtTop();
}

function shouldIgnore(target: EventTarget | null) {
  const node = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!node) return false;
  if (node.closest("input, textarea, select, [contenteditable='true'], [role='slider'], .vc-no-ptr")) {
    return true;
  }
  if (node.closest("button, [role='button'], summary")) return true;
  const ae = document.activeElement;
  if (ae && /^(input|textarea|select)$/i.test(ae.tagName)) return true;
  if (ae && (ae as HTMLElement).isContentEditable) return true;
  return false;
}

/** Disco vinile minimale (Tailwind) per il cue PTR. */
function PtrVinyl({ spinning }: { spinning: boolean }) {
  return (
    <div
      className={cn(
        "relative size-14 rounded-full",
        spinning && "animate-[spin_0.85s_linear_infinite]",
      )}
      aria-hidden
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,transparent_0_0.46rem,#1a120e_0.46rem_0.64rem,transparent_0.65rem),repeating-radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06)_0_1px,transparent_1px_3px),radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.16),transparent_42%),radial-gradient(circle_at_50%_50%,#2a1c16_0_38%,#120c0a_62%,#070504_100%)] shadow-[0_10px_26px_rgba(0,0,0,0.46),0_0_0_1px_rgba(212,168,136,0.34)]" />
      <span className="absolute inset-[28%] rounded-full bg-gradient-to-br from-[#ead4c0] via-[#d4a888] to-[#6f4e37] shadow-[inset_0_0_0_1px_rgba(80,48,28,0.28)]" />
      <span className="absolute left-1/2 top-1/2 size-[0.46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0b0705]" />
    </div>
  );
}

/**
 * Pull-to-refresh mobile con disco vinile. Off: `localStorage.vc_ptr = "0"`.
 */
export function PullToRefresh() {
  const reduce = useReducedMotion();
  const [pull, setPull] = useState(0);
  const [armed, setArmed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [visible, setVisible] = useState(false);
  const refreshingRef = useRef(false);
  const tracking = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const pullRef = useRef(0);
  const armedRef = useRef(false);
  const moveBound = useRef(false);

  const resetUi = useCallback(() => {
    tracking.current = false;
    pullRef.current = 0;
    armedRef.current = false;
    setPull(0);
    setArmed(false);
    setVisible(false);
  }, []);

  const triggerReload = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setVisible(true);
    setArmed(false);
    try {
      const y = Math.round(window.pageYOffset || document.documentElement.scrollTop || 0);
      if (y >= 2) {
        sessionStorage.setItem(
          SCROLL_KEY,
          JSON.stringify({ p: location.pathname, y, t: Date.now() }),
        );
      }
      sessionStorage.setItem(PTR_KEY, "1");
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      location.reload();
    }, 220);
  }, []);

  // Cue vinile post-reload + restore scroll
  useEffect(() => {
    if (!effectEnabled(EFFECT_KEYS.ptr, true)) return;
    try {
      if (sessionStorage.getItem(PTR_KEY) !== "1") return;
      sessionStorage.removeItem(PTR_KEY);
      refreshingRef.current = true;
      setRefreshing(true);
      setVisible(true);
      const t = window.setTimeout(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        setVisible(false);
        try {
          const raw = sessionStorage.getItem(SCROLL_KEY);
          if (!raw) return;
          const data = JSON.parse(raw) as { p?: string; y?: number };
          sessionStorage.removeItem(SCROLL_KEY);
          const y = Math.round(Number(data.y) || 0);
          if (y >= 2 && data.p === location.pathname) window.scrollTo(0, y);
        } catch {
          /* ignore */
        }
      }, 700);
      return () => window.clearTimeout(t);
    } catch {
      /* ignore */
    }
  }, []);

  // Gesture listeners (touch only)
  useEffect(() => {
    if (!effectEnabled(EFFECT_KEYS.ptr, true)) return;
    if (!isTouchUi()) return;

    let onTouchMove: ((ev: TouchEvent) => void) | null = null;

    const unbindMove = () => {
      if (!moveBound.current || !onTouchMove) return;
      moveBound.current = false;
      document.removeEventListener("touchmove", onTouchMove, true);
    };

    onTouchMove = (ev: TouchEvent) => {
      if (!tracking.current || refreshingRef.current || !ev.touches || ev.touches.length !== 1) return;
      if (shouldIgnore(ev.target)) {
        unbindMove();
        resetUi();
        return;
      }
      const t = ev.touches[0]!;
      const dy = t.clientY - start.current.y;
      const dx = t.clientX - start.current.x;
      if (Math.abs(dx) > Math.abs(dy) + 10 && pullRef.current < 8) {
        unbindMove();
        resetUi();
        return;
      }
      if (dy <= 0) {
        unbindMove();
        resetUi();
        return;
      }
      if (!canPullFrom(ev.target) && pullRef.current < 8) {
        unbindMove();
        resetUi();
        return;
      }
      const next = resisted(dy);
      if (dy > 6 && ev.cancelable) ev.preventDefault();
      pullRef.current = next;
      armedRef.current = next >= THRESHOLD;
      setPull(next);
      setArmed(next >= THRESHOLD);
      setVisible(next > 2);
    };

    const onStart = (ev: TouchEvent) => {
      if (refreshingRef.current || !ev.touches || ev.touches.length !== 1) return;
      if (shouldIgnore(ev.target) || !canPullFrom(ev.target)) return;
      const t = ev.touches[0]!;
      tracking.current = true;
      start.current = { x: t.clientX, y: t.clientY };
      pullRef.current = 0;
      armedRef.current = false;
      if (!moveBound.current && onTouchMove) {
        moveBound.current = true;
        document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
      }
    };

    const onEnd = () => {
      if (!tracking.current && !moveBound.current) return;
      tracking.current = false;
      unbindMove();
      if (armedRef.current && pullRef.current >= THRESHOLD * 0.86) {
        triggerReload();
        return;
      }
      resetUi();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onEnd, { passive: true, capture: true });

    try {
      document.documentElement.style.setProperty("overscroll-behavior-y", "none");
    } catch {
      /* ignore */
    }

    return () => {
      unbindMove();
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd, true);
      document.removeEventListener("touchcancel", onEnd, true);
      try {
        document.documentElement.style.removeProperty("overscroll-behavior-y");
      } catch {
        /* ignore */
      }
    };
  }, [resetUi, triggerReload]);

  const show = visible || refreshing;
  const rot = reduce ? 0 : pull * 3.05;
  const scale = 0.86 + Math.min(1, pull / THRESHOLD) * 0.18;
  const offsetY = refreshing ? 6 : Math.max(0, pull * 0.95) - 90;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+4.85rem)] z-[110120] flex w-24 flex-col items-center gap-1.5"
          initial={{ opacity: 0, x: "-50%", y: -90 }}
          animate={{ opacity: 1, x: "-50%", y: offsetY }}
          exit={{ opacity: 0, x: "-50%", y: -90 }}
          transition={{ duration: refreshing || reduce ? 0.28 : 0, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            animate={
              refreshing && !reduce
                ? { scale: [0.55, 1.04, 1], rotate: 0 }
                : { scale, rotate: rot }
            }
            transition={
              refreshing
                ? { duration: 0.42, ease: [0.22, 1.2, 0.36, 1] }
                : { duration: 0 }
            }
          >
            <PtrVinyl spinning={refreshing && !reduce} />
          </motion.div>
          <p
            className={cn(
              "m-0 max-w-40 text-center text-[0.7rem] font-bold uppercase tracking-wide text-crema/90",
              armed && "text-[#ead4c0]",
            )}
          >
            {refreshing ? "Aggiornamento" : armed ? "Rilascia" : "Aggiorna"}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

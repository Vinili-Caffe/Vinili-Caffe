"use client";

import { useLayoutEffect } from "react";

export type BodyScrollLockOpts = {
  /** Se true, lock solo sotto breakpoint lg (1023px) — overlay mobile. */
  mobileOnly?: boolean;
  /** Media query custom (default max-width: 1023px quando mobileOnly). */
  mediaQuery?: string;
};

let lockCount = 0;
let lockedY = 0;

function scrollbarGap(): number {
  try {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  } catch {
    return 0;
  }
}

function applyLock() {
  if (lockCount !== 1) return;
  lockedY = Math.max(0, Math.floor(window.scrollY || window.pageYOffset || 0));
  const gap = scrollbarGap();
  const root = document.documentElement;
  root.style.setProperty("overflow", "hidden");
  root.style.setProperty("overscroll-behavior", "none");
  // position:fixed + top: evita jump “va in basso poi torna su” all’apertura overlay
  document.body.style.setProperty("position", "fixed");
  document.body.style.setProperty("top", `-${lockedY}px`);
  document.body.style.setProperty("left", "0");
  document.body.style.setProperty("right", "0");
  document.body.style.setProperty("width", "100%");
  document.body.style.setProperty("overflow", "hidden");
  if (gap > 0) {
    root.style.setProperty("padding-right", `${gap}px`);
    document.body.style.setProperty("padding-right", `${gap}px`);
  }
}

function clearLock() {
  const root = document.documentElement;
  const y = lockedY;
  root.style.removeProperty("overflow");
  root.style.removeProperty("overscroll-behavior");
  root.style.removeProperty("padding-right");
  document.body.style.removeProperty("position");
  document.body.style.removeProperty("top");
  document.body.style.removeProperty("left");
  document.body.style.removeProperty("right");
  document.body.style.removeProperty("width");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  lockedY = 0;
  try {
    window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
    document.documentElement.scrollTop = y;
    document.body.scrollTop = y;
  } catch {
    try {
      window.scrollTo(0, y);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Lock scroll body con ref-count.
 * useLayoutEffect: applica PRIMA del paint (niente flash scroll/footer).
 */
export function useBodyScrollLock(active: boolean, opts: BodyScrollLockOpts = {}) {
  const mobileOnly = opts.mobileOnly === true;
  const mq = opts.mediaQuery || "(max-width: 1023px)";

  useLayoutEffect(() => {
    if (!active) return;

    let held = false;
    const acquire = () => {
      if (held) return;
      held = true;
      lockCount += 1;
      applyLock();
    };
    const release = () => {
      if (!held) return;
      held = false;
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) clearLock();
    };

    if (!mobileOnly) {
      acquire();
      return () => release();
    }

    const mql = window.matchMedia(mq);
    const sync = () => {
      if (mql.matches) acquire();
      else release();
    };
    sync();
    mql.addEventListener("change", sync);
    return () => {
      mql.removeEventListener("change", sync);
      release();
    };
  }, [active, mobileOnly, mq]);
}

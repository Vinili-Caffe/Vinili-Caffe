"use client";

import { useEffect } from "react";

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
  if (lockCount === 1) {
    lockedY = Math.max(0, Math.floor(window.scrollY || window.pageYOffset || 0));
    const gap = scrollbarGap();
    const root = document.documentElement;
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    // position:fixed sul body: evita jump/footer flash quando sparisce lo scroll
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    if (gap > 0) {
      root.style.paddingRight = `${gap}px`;
      document.body.style.paddingRight = `${gap}px`;
    }
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
  try {
    window.scrollTo(0, y);
  } catch {
    /* ignore */
  }
  lockedY = 0;
}

/**
 * Lock scroll body con ref-count (dialog + sheet + ticket overlay non si pestano).
 * Usa position:fixed + restore Y (niente flash footer / salto altezza).
 */
export function useBodyScrollLock(active: boolean, opts: BodyScrollLockOpts = {}) {
  const mobileOnly = opts.mobileOnly === true;
  const mq = opts.mediaQuery || "(max-width: 1023px)";

  useEffect(() => {
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

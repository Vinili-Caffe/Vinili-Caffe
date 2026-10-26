"use client";

import { useEffect } from "react";

export type BodyScrollLockOpts = {
  /** Se true, lock solo sotto breakpoint lg (1023px) — overlay mobile. */
  mobileOnly?: boolean;
  /** Media query custom (default max-width: 1023px quando mobileOnly). */
  mediaQuery?: string;
};

let lockCount = 0;

function applyLock() {
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function clearLock() {
  document.documentElement.style.removeProperty("overflow");
  document.body.style.removeProperty("overflow");
}

/**
 * Lock scroll body con ref-count (dialog + sheet + ticket overlay non si pestano).
 * Cleanup sempre con removeProperty (niente restore di "hidden" stale).
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

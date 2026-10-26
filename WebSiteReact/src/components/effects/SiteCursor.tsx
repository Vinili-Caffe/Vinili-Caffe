"use client";

import { useEffect } from "react";
import { isDesktopPointer } from "@/lib/site-effects";

/** Abilita cursore PNG custom su pointer fine. */
export function SiteCursor() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      root.classList.toggle("vc-site-cursor-ok", isDesktopPointer());
    };
    sync();
    const mq = window.matchMedia("(pointer: fine)");
    mq.addEventListener?.("change", sync);
    window.addEventListener("resize", sync, { passive: true });
    return () => {
      root.classList.remove("vc-site-cursor-ok");
      mq.removeEventListener?.("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);
  return null;
}

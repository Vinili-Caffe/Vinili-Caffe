"use client";

import { useEffect, useRef, useState } from "react";
import { useChromeOpenListener } from "@/lib/chrome-open";

const HIDE_AFTER_MS = 2200;
const REVEAL_ZONE_PX = 90;
const TOP_SAFE_PX = 120;

/**
 * Navbar che si toglie di mezzo.
 * - PC (mouse): dopo un paio di secondi sale via; torna appena il mouse va in cima, ci passa sopra o col tab da tastiera.
 * - Telefono (touch): sparisce scorrendo in giù, torna appena scorri un po' in su.
 * In cima alla pagina, con un menu aperto o col focus dentro resta sempre visibile.
 */
export function useAutoHideNav(headerRef: React.RefObject<HTMLElement | null>, forceShow: boolean) {
  const [hidden, setHidden] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const hovering = useRef(false);

  useEffect(() => useChromeOpenListener(setChromeOpen), []);

  useEffect(() => {
    if (forceShow || chromeOpen) setHidden(false);
  }, [forceShow, chromeOpen]);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const pinned = () =>
      window.scrollY <= TOP_SAFE_PX ||
      forceShow ||
      chromeOpen ||
      hovering.current ||
      Boolean(headerRef.current?.contains(document.activeElement));

    const clear = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const armHide = () => {
      clear();
      timer.current = window.setTimeout(() => {
        if (!pinned()) setHidden(true);
      }, HIDE_AFTER_MS);
    };
    const show = () => {
      setHidden(false);
      armHide();
    };

    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (y <= TOP_SAFE_PX) {
        clear();
        setHidden(false);
        return;
      }
      if (fine.matches) {
        if (!hidden) armHide();
        return;
      }
      // touch: giù nasconde, su (anche poco) mostra
      if (dy > 6 && !pinned()) setHidden(true);
      else if (dy < -4) setHidden(false);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !fine.matches) return;
      if (e.clientY <= REVEAL_ZONE_PX) show();
    };

    const header = headerRef.current;
    const enter = () => {
      hovering.current = true;
      clear();
      setHidden(false);
    };
    const leave = () => {
      hovering.current = false;
      armHide();
    };
    const focusIn = () => {
      clear();
      setHidden(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    header?.addEventListener("pointerenter", enter);
    header?.addEventListener("pointerleave", leave);
    header?.addEventListener("focusin", focusIn);
    if (window.scrollY > TOP_SAFE_PX && fine.matches) armHide();

    return () => {
      clear();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointermove", onMove);
      header?.removeEventListener("pointerenter", enter);
      header?.removeEventListener("pointerleave", leave);
      header?.removeEventListener("focusin", focusIn);
    };
  }, [headerRef, forceShow, chromeOpen, hidden]);

  return hidden;
}

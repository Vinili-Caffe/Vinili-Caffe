"use client";

import { useEffect } from "react";

/** Chiude un pannello aperto quando l’utente scrolla la pagina. */
export function useCloseOnScroll(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 2) return;
      lastY = y;
      onClose();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open, onClose]);
}

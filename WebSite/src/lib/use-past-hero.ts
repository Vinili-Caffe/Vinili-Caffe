"use client";

import { useEffect, useState } from "react";

/**
 * True quando l’hero (`[data-vc-hero]`) è uscito dallo schermo.
 * Senza hero in pagina: sempre false (angoli restano visibili).
 */
export function usePastHero(offsetPx = 64): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const update = () => {
      const hero = document.querySelector("[data-vc-hero]");
      if (!hero) {
        setPast(false);
        return;
      }
      const bottom = hero.getBoundingClientRect().bottom;
      setPast(bottom < offsetPx);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [offsetPx]);

  return past;
}

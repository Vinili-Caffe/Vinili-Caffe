"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

const Ctx = createContext(false);

/** true sotto SiteShell chrome="evento": Navbar/Footer usano le pagine evento. */
export function EventoChromeProvider({ active, children }: { active: boolean; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    if (active) root.setAttribute("data-vc-evento", "1");
    else root.removeAttribute("data-vc-evento");
    return () => root.removeAttribute("data-vc-evento");
  }, [active]);
  return <Ctx.Provider value={active}>{children}</Ctx.Provider>;
}

export function useEventoChrome() {
  return useContext(Ctx);
}

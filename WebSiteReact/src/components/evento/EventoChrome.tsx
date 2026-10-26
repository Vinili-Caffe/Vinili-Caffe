"use client";

import { createContext, useContext, type ReactNode } from "react";

const Ctx = createContext(false);

/** true sotto SiteShell chrome="evento": Navbar/Footer usano le pagine evento. */
export function EventoChromeProvider({ active, children }: { active: boolean; children: ReactNode }) {
  return <Ctx.Provider value={active}>{children}</Ctx.Provider>;
}

export function useEventoChrome() {
  return useContext(Ctx);
}

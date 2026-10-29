"use client";

import { cn } from "@/lib/cn";

/** Linea sotto i link nav/footer: appare in hover e resta se attivo. */
export function navUnderlineClass(active?: boolean) {
  return cn(
    "relative inline-flex items-center gap-1.5 px-3.5 py-2 text-sm transition-colors",
    "text-crema/70 hover:text-crema",
    "after:pointer-events-none after:absolute after:inset-x-3 after:bottom-1 after:h-[1.5px] after:origin-left after:rounded-full",
    "after:bg-gradient-to-r after:from-caramel after:via-ember after:to-caramel",
    "after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.22,1,0.36,1)]",
    active ? "text-crema after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100",
  );
}

export function footerUnderlineClass(active?: boolean) {
  return cn(
    "relative inline-block text-sm text-crema/60 transition-colors hover:text-crema",
    "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:rounded-full",
    "after:bg-gradient-to-r after:from-caramel/80 after:to-ember/80",
    "after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.22,1,0.36,1)]",
    active ? "text-crema after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100",
  );
}

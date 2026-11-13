"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { page } from "@/lib/site";

/** Pagina spostata: porta subito a quella nuova (export statico, niente redirect lato server). */
export function MovedRedirect({ to, label }: { to: string; label: string }) {
  useEffect(() => {
    window.location.replace(page(to));
  }, [to]);
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-crema/60">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

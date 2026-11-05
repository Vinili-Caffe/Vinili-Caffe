"use client";

import { useEffect } from "react";
import { page } from "@/lib/site";

const HUB = page("/evento/");

/** Avvento vive sull’hub — vecchio URL → Centro di comando. */
export default function EventoAvventoRedirectPage() {
  useEffect(() => {
    window.location.replace(HUB);
  }, []);

  return (
    <main className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-crema/70">L&apos;avvento è nel Centro di comando…</p>
      <a href={HUB} className="mt-3 text-sm font-semibold text-caramel underline underline-offset-2">
        Vai all&apos;hub
      </a>
    </main>
  );
}

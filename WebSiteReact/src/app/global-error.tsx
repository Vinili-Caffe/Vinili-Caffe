"use client";

import "./globals.css";
import { useEffect } from "react";
import { hardReload, canAutoRecoverStaleChunk } from "@/lib/stale-chunk-recovery";

/** Gli errori presi qui non passano da window.onerror: senza questo non finirebbero nel registro. */
function reportBoundaryError(error: Error & { digest?: string }) {
  try {
    const message = `${error?.name || "Error"}: ${error?.message || ""}${error?.digest ? ` (digest ${error.digest})` : ""}`;
    const body = JSON.stringify({ kind: "boundary", message: message.slice(0, 400), stack: String(error?.stack || "").slice(0, 1500), url: location.pathname + location.search });
    if (!navigator.sendBeacon?.("/webhooks/site-client-error", new Blob([body], { type: "application/json" }))) {
      void fetch("/webhooks/site-client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* il registro non deve mai rompere la pagina */
  }
}

/**
 * Pagina d'errore del sito (al posto di "This page couldn't load" di Next).
 * Quasi sempre è la versione vecchia rimasta in cache dopo un deploy: un hard reload (SW + cache) la sistema,
 * quindi lo si tenta subito (al massimo una volta al minuto) per qualsiasi errore; la pagina resta solo se si ripete.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportBoundaryError(error);
    if (!canAutoRecoverStaleChunk()) return;
    void hardReload();
  }, [error]);

  return (
    <html lang="it">
      <body className="flex min-h-dvh items-center justify-center bg-espresso px-6 text-crema">
        <main className="max-w-md text-center">
          <p className="font-script text-4xl text-caramel">Ops…</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">La pagina non si è caricata</h1>
          <p className="mt-3 text-crema/65">Succede soprattutto subito dopo un aggiornamento del sito. Ricarica e torna tutto a posto.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                void hardReload("/");
              }}
              className="rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-semibold text-ink"
            >
              Ricarica
            </button>
            <button type="button" onClick={() => reset()} className="rounded-full px-6 py-3 font-semibold text-crema/80 ring-1 ring-sand/25 hover:bg-crema/8">
              Riprova
            </button>
            <a href="/" className="rounded-full px-6 py-3 font-semibold text-crema/80 ring-1 ring-sand/25 hover:bg-crema/8">
              Torna alla home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}

"use client";

import "./globals.css";
import { useEffect } from "react";

const STALE_CHUNK = /ChunkLoadError|Failed to load chunk|Loading chunk [\w-]+ failed|Importing a module script failed|error loading dynamically imported module/i;
const STALE_RELOAD_KEY = "vc_stale_chunk_reload_at";

/**
 * Pagina d'errore del sito (al posto di "This page couldn't load" di Next).
 * Se manca un pezzo di codice della versione vecchia (dopo una pubblicazione) si ricarica da sola, una volta al minuto.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const text = `${error?.name || ""} ${error?.message || ""}`;
    if (!STALE_CHUNK.test(text)) return;
    try {
      const last = Number(sessionStorage.getItem(STALE_RELOAD_KEY) || 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    window.location.reload();
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
              onClick={() => window.location.reload()}
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

"use client";

import { useEffect } from "react";

/** Rumore che non dipende dal sito: estensioni, richieste annullate, avvisi innocui del browser. */
const IGNORE = [
  /ResizeObserver loop/i,
  /AbortError|signal is aborted/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /^Script error\.?$/i,
  /Load failed|NetworkError|Failed to fetch/i,
  /play\(\) request was interrupted|NotAllowedError/i,
  /unchecked runtime\.lasterror|could not establish connection|receiving end does not exist|message channel closed/i,
  /websocket connection to .* failed/i,
  /insertBefore|removeChild/i,
  /powerPreference|no available adapters/i,
];

/**
 * Registro errori: gli errori JavaScript dei visitatori finiscono nel log del bot
 * (/webhooks/site-client-error → logs/site-client-errors.log). Niente dati personali: testo, pagina, browser.
 * Al massimo 10 per pagina e mai due volte lo stesso.
 */
export function ErrorReporter() {
  useEffect(() => {
    const sent = new Set<string>();
    const send = (kind: string, message: string, stack?: string) => {
      const msg = String(message || "").trim();
      if (!msg || IGNORE.some((r) => r.test(msg) || (stack && r.test(stack)))) return;
      if (sent.size >= 10 || sent.has(msg)) return;
      sent.add(msg);
      const body = JSON.stringify({ kind, message: msg.slice(0, 400), stack: String(stack || "").slice(0, 1500), url: location.pathname + location.search });
      try {
        const blob = new Blob([body], { type: "application/json" });
        if (!navigator.sendBeacon?.("/webhooks/site-client-error", blob)) {
          void fetch("/webhooks/site-client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
        }
      } catch {
        /* il registro non deve mai rompere la pagina */
      }
    };
    const onError = (e: ErrorEvent) => send("error", e.message || String(e.error), e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string | undefined;
      send("promise", typeof r === "string" ? r : r?.message || String(r), typeof r === "object" ? r?.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

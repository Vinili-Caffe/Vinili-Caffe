/**
 * Riga nel log del sito (/webhooks/site-client-error → logs/site-client-errors.log), come errori e vitals.
 * Per capire cosa succede davvero sui telefoni (pagine che si ricaricano, ecc.). Niente dati personali.
 */
export function reportSiteEvent(kind: string, message: string, detail?: Record<string, unknown>) {
  try {
    const body = JSON.stringify({
      kind: kind.slice(0, 20),
      message: String(message || "").slice(0, 400),
      stack: detail ? JSON.stringify(detail).slice(0, 1500) : "",
      url: location.pathname + location.search,
    });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/webhooks/site-client-error", blob)) {
      void fetch("/webhooks/site-client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

"use client";

import { useEffect } from "react";

/**
 * Metriche reali dei visitatori (LCP, INP, CLS, FCP) con il "perché": quale elemento è arrivato tardi,
 * quale clic ha risposto lento e in che parte (attesa, codice, disegno), cosa si è spostato.
 * Vercel Speed Insights sul piano gratuito mostra solo il punteggio totale: questo dice cosa correggere.
 * Solo le misure non buone, una per metrica per pagina, nel registro del sito
 * (/webhooks/site-client-error, kind "vitals" → logs/site-client-errors.log). Niente dati personali.
 */
/* SiteShell si rimonta a ogni pagina: le metriche si registrano una volta per caricamento */
let started = false;

export function VitalsReporter() {
  useEffect(() => {
    if (started) return;
    started = true;
    const device = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768 ? "telefono" : "pc";
    const send = (name: string, value: number, rating: string, detail: Record<string, unknown>) => {
      const body = JSON.stringify({
        kind: "vitals",
        message: `${name} ${name === "CLS" ? value.toFixed(3) : Math.round(value)} ${rating} ${device}`,
        stack: JSON.stringify(detail).slice(0, 1500),
        url: location.pathname,
      });
      try {
        if (!navigator.sendBeacon?.("/webhooks/site-client-error", new Blob([body], { type: "application/json" }))) {
          void fetch("/webhooks/site-client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
        }
      } catch {
        /* il registro non deve mai rompere la pagina */
      }
    };
    const round = (n?: number) => (typeof n === "number" ? Math.round(n) : undefined);

    void import("web-vitals/attribution").then(({ onLCP, onINP, onCLS, onFCP }) => {
      onLCP((m) => {
        if (m.rating === "good") return;
        const a = m.attribution;
        send("LCP", m.value, m.rating, {
          target: a.target,
          url: a.url?.slice(-120),
          ttfb: round(a.timeToFirstByte),
          loadDelay: round(a.resourceLoadDelay),
          loadTime: round(a.resourceLoadDuration),
          renderDelay: round(a.elementRenderDelay),
        });
      });
      onINP((m) => {
        if (m.rating === "good") return;
        const a = m.attribution;
        const s = a.longestScript?.entry;
        send("INP", m.value, m.rating, {
          target: a.interactionTarget,
          type: a.interactionType,
          inputDelay: round(a.inputDelay),
          processing: round(a.processingDuration),
          presentation: round(a.presentationDelay),
          loadState: a.loadState,
          script: s ? `${s.invoker || ""} ${String(s.sourceURL || "").slice(-80)} ${String(s.sourceFunctionName || "")}`.trim() : undefined,
          scriptMs: round(a.totalScriptDuration),
          layoutMs: round(a.totalStyleAndLayoutDuration),
        });
      }, { reportAllChanges: false });
      onCLS((m) => {
        if (m.rating === "good") return;
        const a = m.attribution;
        send("CLS", m.value, m.rating, {
          target: a.largestShiftTarget,
          shift: a.largestShiftValue?.toFixed(3),
          at: round(a.largestShiftTime),
          loadState: a.loadState,
        });
      });
      onFCP((m) => {
        if (m.rating === "good") return;
        const a = m.attribution;
        send("FCP", m.value, m.rating, { ttfb: round(a.timeToFirstByte), firstByteToFcp: round(a.firstByteToFCP), loadState: a.loadState });
      });
    }).catch(() => {});
  }, []);
  return null;
}

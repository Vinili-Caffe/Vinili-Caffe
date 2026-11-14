import { reportSiteEvent } from "./site-report";

/**
 * Misura un cambio pagina partito da un link: quanto ci mette l'indirizzo a cambiare,
 * quanto hanno impiegato i dati della pagina (index.txt) e quanto il telefono è rimasto bloccato a lavorare.
 * Se supera SLOW_MS finisce nel log del sito come "nav-slow" (niente dati personali).
 */
const SLOW_MS = 2500;
const GIVE_UP_MS = 30_000;

let active: { stop: () => void } | null = null;

function standalone() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  } catch {
    return false;
  }
}

export function startNavProbe(from: string, to: string, pathKey: (h: string) => string) {
  active?.stop();
  const t0 = performance.now();
  let busy = 0;
  let longest = 0;
  let obs: PerformanceObserver | null = null;
  try {
    obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        busy += e.duration;
        longest = Math.max(longest, e.duration);
      }
    });
    obs.observe({ type: "longtask", buffered: false });
  } catch {
    obs = null;
  }
  let hiddenDuring = document.visibilityState !== "visible";
  const onVis = () => {
    if (document.visibilityState !== "visible") hiddenDuring = true;
  };
  document.addEventListener("visibilitychange", onVis);

  const target = pathKey(to);
  const tick = window.setInterval(() => {
    const now = pathKey(`${location.pathname}${location.search}${location.hash}`);
    const dt = performance.now() - t0;
    if (now === target || now !== from) return finish(dt, now === target ? "ok" : "altrove");
    if (dt > GIVE_UP_MS) finish(dt, "mai");
  }, 100);

  function stop() {
    window.clearInterval(tick);
    obs?.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    if (active?.stop === stop) active = null;
  }

  function finish(dt: number, esito: string) {
    stop();
    if (dt < SLOW_MS || hiddenDuring) return;
    const path = to.split(/[?#]/)[0].replace(/\/?$/, "/");
    const rsc = performance
      .getEntriesByType("resource")
      .filter((e) => e.name.includes(`${path}index.txt`) && e.startTime >= t0 - 50)
      .map((e) => e as PerformanceResourceTiming)[0];
    const nav = navigator as Navigator & { connection?: { effectiveType?: string }; deviceMemory?: number };
    reportSiteEvent("nav-slow", `cambio pagina lento: ${Math.round(dt)} ms verso ${to}`, {
      from,
      esito,
      ms: Math.round(dt),
      datiMs: rsc ? Math.round(rsc.responseEnd - rsc.startTime) : null,
      datiStato: rsc ? rsc.responseStatus || null : "mai arrivati",
      lavoroMs: Math.round(busy),
      bloccoPiuLungoMs: Math.round(longest),
      app: standalone(),
      conn: nav.connection?.effectiveType || null,
      ram: nav.deviceMemory || null,
      cpu: navigator.hardwareConcurrency || null,
    });
  }

  active = { stop };
}

/** Ricarica della pagina fatta dal sito (non dall'utente): nel log col motivo. */
export function reportHardReload(reason: string, detail?: Record<string, unknown>) {
  reportSiteEvent("hard-reload", `il sito ricarica la pagina: ${reason}`, { app: standalone(), ...(detail || {}) });
}

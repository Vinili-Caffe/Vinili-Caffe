import { reportSiteEvent } from "./site-report";

/**
 * Misura un cambio pagina partito da un link: quanto ci mette l'indirizzo a cambiare,
 * quanto hanno impiegato i dati della pagina (index.txt) e quanto il telefono è rimasto bloccato a lavorare.
 * Se supera SLOW_MS finisce nel log del sito come "nav-slow" (niente dati personali).
 */
const SLOW_MS = 2500;
const GIVE_UP_MS = 30_000;

let active: { stop: () => void; snapshot: () => Record<string, unknown> } | null = null;

/** Cosa sta aspettando la pagina adesso: dati della pagina nuova, fogli di stile non ancora caricati, file in arrivo. */
function waitingFor(to: string, t0: number) {
  const path = to.split(/[?#]/)[0].replace(/\/?$/, "/");
  const res = performance.getEntriesByType("resource").filter((e) => e.startTime >= t0 - 50) as PerformanceResourceTiming[];
  const rsc = res.find((e) => e.name.includes(`${path}index.txt`));
  const css = [...document.querySelectorAll('link[rel="stylesheet"]')] as HTMLLinkElement[];
  const cssPending = css.filter((l) => !l.sheet).map((l) => (l.getAttribute("href") || "").split("/").pop()?.slice(0, 40));
  return {
    datiMs: rsc ? Math.round(rsc.responseEnd - rsc.startTime) : null,
    datiStato: rsc ? rsc.responseStatus || 0 : "mai arrivati",
    fileArrivati: res.length,
    fileLenti: res
      .filter((e) => e.duration > 2000)
      .slice(0, 5)
      .map((e) => `${e.name.replace(location.origin, "").slice(0, 50)} ${Math.round(e.duration)}ms`),
    stiliTotali: css.length,
    stiliInAttesa: cssPending.slice(0, 6),
    visibile: document.visibilityState,
  };
}

/** Istantanea del cambio pagina in corso (per la riga "nav-reload" prima di forzare). */
export function navProbeSnapshot() {
  return active?.snapshot() || null;
}

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

  active = {
    stop,
    snapshot: () => ({
      ...waitingFor(to, t0),
      lavoroMs: Math.round(busy),
      bloccoPiuLungoMs: Math.round(longest),
      app: standalone(),
      ram: (navigator as Navigator & { deviceMemory?: number }).deviceMemory || null,
      cpu: navigator.hardwareConcurrency || null,
    }),
  };
}

/** Ricarica della pagina fatta dal sito (non dall'utente): nel log col motivo. */
export function reportHardReload(reason: string, detail?: Record<string, unknown>) {
  reportSiteEvent("hard-reload", `il sito ricarica la pagina: ${reason}`, { app: standalone(), ...(detail || {}) });
}

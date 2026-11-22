"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { ComponentProps, MouseEvent, PointerEvent } from "react";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { reportSiteEvent } from "@/lib/site-report";
import { navProbeSnapshot, startNavProbe } from "@/lib/nav-probe";
import { stripLocale, useUrlLocale, withLocale } from "@/lib/locale-path";

type Props = Omit<ComponentProps<"a">, "href"> & { href: string };

/** Un solo fallback hard-nav attivo: click rapidi non devono lasciar scattare assign verso path vecchi. */
let softFailTimer = 0;
let softTickTimer = 0;

function clearSoftFallback() {
  if (softFailTimer) window.clearTimeout(softFailTimer);
  if (softTickTimer) window.clearInterval(softTickTimer);
  softFailTimer = 0;
  softTickTimer = 0;
}

function withTrailingSlash(path: string) {
  let p = String(path || "/");
  if (p !== "/" && !p.endsWith("/")) p = `${p}/`;
  return p;
}

function pathKey(href: string) {
  try {
    const u = new URL(href, typeof location !== "undefined" ? location.origin : "https://www.viniliecaffe.it");
    /* la lingua nell'indirizzo (/en/…) non conta: è la stessa pagina */
    const p = withTrailingSlash(stripLocale(u.pathname || "/"));
    return `${p}${u.search}${u.hash}`;
  } catch {
    return href;
  }
}

/**
 * Percorsi interni (`/…`) → navigazione client (Link); URL esterni → `<a>`.
 * Hard assign solo se dopo ~12s la SPA non ha mosso l’URL (niente reload aggressivo).
 * Prima erano 4s: su telefono la prima apertura di una pagina spesso ci mette di più,
 * e il sito ricaricava tutto invece di aspettare (sembrava che il menu "non portasse").
 *
 * localeSoftNav1: Next soft-nav verso `/it/faq/` (o `/en/…`) finisce in 404 perché l’export
 * statico ha solo `/faq/`. Il Link usa il path italiano; i18n rimette la lingua con replaceState.
 * Hard reload / nuova scheda usano l’URL con lingua (rewrite Vercel).
 */
const HARD_FALLBACK_MS = 12_000;
/** Se entro questo tempo i dati della pagina nuova (index.txt) non sono nemmeno arrivati, inutile aspettare 12 s. */
const NO_DATA_FALLBACK_MS = 3_500;

/**
 * App installata su iPhone/iPad: lì Safari lascia appesa la richiesta dei dati della pagina nuova
 * (log del sito: "dati mai arrivati", stili caricati, telefono fermo) e ogni cambio pagina restava bloccato 12 s.
 * In quell'app i link fanno un caricamento normale della pagina, che invece funziona.
 */
function isIosInstalledApp() {
  try {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (!ios) return false;
    return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  } catch {
    return false;
  }
}

/** I dati della pagina di destinazione sono arrivati dopo il click? (path senza lingua) */
function pageDataArrived(destBare: string, since: number) {
  try {
    const path = withTrailingSlash(stripLocale(new URL(destBare, location.origin).pathname || "/"));
    return performance.getEntriesByType("resource").some((e) => e.name.includes(`${path}index.txt`) && e.startTime >= since - 50);
  } catch {
    return true;
  }
}

export function SmartLink({ href: rawHref, onClick, onPointerDown, ...rest }: Props) {
  const prefetch = useFxCap("prefetch");
  const router = useRouter();
  const urlLocale = useUrlLocale();
  /* soft-nav Next = path italiano; href “vero” con lingua per hard load / nuova scheda */
  const bare = rawHref.startsWith("/") ? withTrailingSlash(stripLocale(rawHref)) : rawHref;
  const hrefLocale = rawHref.startsWith("/") ? withLocale(bare, urlLocale) : rawHref;
  const href = bare;

  if (!href.startsWith("/")) {
    return <a href={href} onClick={onClick} {...rest} />;
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const destSoft = href;
    const destHard = hrefLocale;
    const destKey = pathKey(destSoft);
    const fromKey = pathKey(`${location.pathname}${location.search}${location.hash}`);
    if (destKey === fromKey) return;

    clearSoftFallback();

    if (isIosInstalledApp()) {
      e.preventDefault();
      try {
        sessionStorage.setItem("vc-pwa-inapp-nav", String(Date.now()));
      } catch {
        /* ignore */
      }
      location.assign(destHard);
      return;
    }

    startNavProbe(fromKey, destSoft, pathKey);
    const clickedAt = performance.now();
    try {
      /* pwaInAppNav1: navigazione dentro l'app — la home non deve "riprendere" la pagina di prima */
      sessionStorage.setItem("vc-pwa-inapp-nav", String(Date.now()));
    } catch {
      /* ignore */
    }

    softTickTimer = window.setInterval(() => {
      const now = pathKey(`${location.pathname}${location.search}${location.hash}`);
      if (now !== fromKey) return clearSoftFallback();
      /* dati della pagina mai arrivati: si carica subito la pagina invece di aspettare 12 s */
      if (performance.now() - clickedAt > NO_DATA_FALLBACK_MS && !pageDataArrived(destSoft, clickedAt)) {
        reportSiteEvent("nav-reload", `dati della pagina mai arrivati dopo ${NO_DATA_FALLBACK_MS / 1000}s, carico ${destHard}`, {
          from: fromKey,
          online: navigator.onLine,
          ...(navProbeSnapshot() || {}),
        });
        clearSoftFallback();
        try {
          location.assign(destHard);
        } catch {
          /* ignore */
        }
      }
    }, 80);

    softFailTimer = window.setTimeout(() => {
      softFailTimer = 0;
      if (softTickTimer) {
        window.clearInterval(softTickTimer);
        softTickTimer = 0;
      }
      const now = pathKey(`${location.pathname}${location.search}${location.hash}`);
      if (now !== fromKey) return;
      /* Soft nav bloccata: hard load verso la destinazione cliccata (mai verso home a caso). */
      /* nel log del sito: quante volte succede e su che dispositivi (telefoni lenti?) */
      reportSiteEvent("nav-reload", `navigazione ferma dopo ${HARD_FALLBACK_MS / 1000}s, ricarico ${destHard}`, {
        from: fromKey,
        online: navigator.onLine,
        conn: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType || null,
        ...(navProbeSnapshot() || {}),
      });
      try {
        location.assign(destHard);
      } catch {
        /* ignore */
      }
    }, HARD_FALLBACK_MS);
  };

  /* appena tocchi il link la pagina inizia a caricare (anche dove il precaricamento è spento) */
  const handlePointerDown = (e: PointerEvent<HTMLAnchorElement>) => {
    onPointerDown?.(e);
    if (!prefetch) {
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    }
  };

  return <Link href={href} prefetch={prefetch} onClick={handleClick} onPointerDown={handlePointerDown} {...rest} />;
}

export const MotionLink = motion.create(SmartLink);

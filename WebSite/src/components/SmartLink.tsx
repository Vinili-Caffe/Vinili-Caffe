"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { ComponentProps, MouseEvent, PointerEvent } from "react";
import { useFxCap } from "@/components/effects/DeviceFxProvider";

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

function pathKey(href: string) {
  try {
    const u = new URL(href, typeof location !== "undefined" ? location.origin : "https://www.viniliecaffe.it");
    let p = u.pathname || "/";
    if (p !== "/" && !p.endsWith("/")) p = `${p}/`;
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
 */
const HARD_FALLBACK_MS = 12_000;

export function SmartLink({ href, onClick, onPointerDown, ...rest }: Props) {
  const prefetch = useFxCap("prefetch");
  const router = useRouter();

  if (!href.startsWith("/")) {
    return <a href={href} onClick={onClick} {...rest} />;
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const dest = href;
    const destKey = pathKey(dest);
    const fromKey = pathKey(`${location.pathname}${location.search}${location.hash}`);
    if (destKey === fromKey) return;

    clearSoftFallback();
    try {
      /* pwaInAppNav1: navigazione dentro l'app — la home non deve "riprendere" la pagina di prima */
      sessionStorage.setItem("vc-pwa-inapp-nav", String(Date.now()));
    } catch {
      /* ignore */
    }

    softTickTimer = window.setInterval(() => {
      const now = pathKey(`${location.pathname}${location.search}${location.hash}`);
      if (now !== fromKey) clearSoftFallback();
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
      try {
        location.assign(dest);
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

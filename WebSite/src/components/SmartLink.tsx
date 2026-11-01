"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { ComponentProps, MouseEvent } from "react";
import { useFxCap } from "@/components/effects/DeviceFxProvider";

type Props = Omit<ComponentProps<"a">, "href"> & { href: string };

/**
 * Percorsi interni (`/…`) → navigazione client (Link); URL esterni → `<a>`.
 * Hard assign solo se dopo ~2.5s la SPA non ha mosso l’URL (niente reload aggressivo a 450ms).
 */
export function SmartLink({ href, onClick, ...rest }: Props) {
  const prefetch = useFxCap("prefetch");

  if (!href.startsWith("/")) {
    return <a href={href} onClick={onClick} {...rest} />;
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const dest = href;
    const from = `${location.pathname}${location.search}${location.hash}`;
    let done = false;
    const clear = () => {
      done = true;
      window.clearInterval(tick);
      window.clearTimeout(fail);
    };
    const tick = window.setInterval(() => {
      const now = `${location.pathname}${location.search}${location.hash}`;
      if (now !== from) clear();
    }, 80);
    const fail = window.setTimeout(() => {
      if (done) return;
      clear();
      const now = `${location.pathname}${location.search}${location.hash}`;
      if (now !== from) return;
      try {
        /* pwaInAppNav1: navigazione dentro l'app, non un'apertura: la home non deve "riprendere" la pagina di prima */
        sessionStorage.setItem("vc-pwa-inapp-nav", String(Date.now()));
      } catch {
        /* ignore */
      }
      try {
        location.assign(dest);
      } catch {
        /* ignore */
      }
    }, 2500);
  };

  return <Link href={href} prefetch={prefetch} onClick={handleClick} {...rest} />;
}

export const MotionLink = motion.create(SmartLink);

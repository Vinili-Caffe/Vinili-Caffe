"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { ComponentProps, MouseEvent } from "react";
import { useFxCap } from "@/components/effects/DeviceFxProvider";

type Props = Omit<ComponentProps<"a">, "href"> & { href: string };

/**
 * Percorsi interni (`/…`) → navigazione client (Link); URL esterni → `<a>`.
 * Se Soft nav non parte (drawer che smonta il Link, static export stallato) → hard assign.
 * Prefetch off se cap prefetch=false (saveData / rete lenta).
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
    window.setTimeout(() => {
      const now = `${location.pathname}${location.search}${location.hash}`;
      if (now !== from) return;
      try {
        location.assign(dest);
      } catch {
        /* ignore */
      }
    }, 450);
  };

  return <Link href={href} prefetch={prefetch} onClick={handleClick} {...rest} />;
}

export const MotionLink = motion.create(SmartLink);

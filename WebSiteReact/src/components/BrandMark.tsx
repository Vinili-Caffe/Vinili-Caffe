"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { SmartLink } from "./SmartLink";
import { HeaderNameMarquee } from "./effects/HeaderNameMarquee";

const FALLBACK = "/images/logo-disco.png";
const FALLBACK_NAME = "VINILI & CAFFÈ";

/**
 * Logo guild Discord + wordmark come il nome server (sans, non display serif).
 * Il testo viene da discord-invite.json quando disponibile.
 * `navUnderline`: in navbar — home = linea sempre (segue marquee); altre pagine = solo hover.
 */
export function BrandMark({ className, navUnderline }: { className?: string; navUnderline?: boolean }) {
  const pathname = usePathname() || "/";
  const [icon, setIcon] = useState(FALLBACK);
  const [name, setName] = useState(FALLBACK_NAME);
  const isHome = pathname === "/" || pathname === "";

  useEffect(() => {
    let alive = true;
    fetch("/discord-invite.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        const guild = j.guild || j;
        const id = String(guild?.id || "").trim();
        const hash = String(guild?.icon || "").trim();
        const gName = String(guild?.name || "").trim();
        if (gName) setName(gName);
        if (!id || !hash) return;
        /* speedRes1: sempre PNG still — GIF Discord in nav = LCP/CPU su pagine senza hero. */
        setIcon(`https://cdn.discordapp.com/icons/${id}/${hash}.png?size=128`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const underline = navUnderline ? (isHome ? "always" : "hover") : false;
  const cut = name.indexOf("•");
  const main = (cut > 0 ? name.slice(0, cut) : name).trim();
  const tagline = cut > 0 ? name.slice(cut + 1).trim() : "";

  return (
    <SmartLink
      href="/"
      className={cn("group relative z-[1] flex h-10 min-w-0 items-center gap-2", className)}
      aria-current={isHome ? "page" : undefined}
    >
      <motion.img
        key={icon}
        src={icon}
        alt=""
        className="size-10 shrink-0 rounded-full bg-crema/10 object-cover ring-1 ring-crema/15"
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        onError={() => setIcon(FALLBACK)}
      />
      {/* Mobile: solo wordmark (la tagline usciva dall’header e finiva sotto pill/contenuto). */}
      <span className="flex min-w-0 max-w-[9.5rem] flex-col justify-center gap-0.5 overflow-hidden sm:max-w-[14rem] lg:max-xl:hidden">
        <HeaderNameMarquee
          text={main}
          underline={underline}
          className="min-w-0 font-sans text-sm font-medium uppercase leading-none tracking-[0.04em] text-crema"
        />
        {tagline ? (
          <span className="mt-0.5 hidden truncate font-sans text-[0.62rem] font-medium uppercase leading-none tracking-[0.12em] text-crema/50 sm:block">
            {tagline}
          </span>
        ) : null}
      </span>
    </SmartLink>
  );
}

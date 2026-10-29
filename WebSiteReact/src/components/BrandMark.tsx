"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { SmartLink } from "./SmartLink";
import { HeaderNameMarquee } from "./effects/HeaderNameMarquee";

/** Logo brand statico (stesso asset delle icone PWA) — niente rotazione. */
const LOGO = "/images/logo-disco.png";
const FALLBACK_NAME = "VINILI & CAFFÈ";

/**
 * Logo + wordmark come il nome server (sans, non display serif).
 * Il testo viene da discord-invite.json quando disponibile.
 * `navUnderline`: in navbar — home = linea sempre (segue marquee); altre pagine = solo hover.
 */
export function BrandMark({ className, navUnderline }: { className?: string; navUnderline?: boolean }) {
  const pathname = usePathname() || "/";
  const [name, setName] = useState(FALLBACK_NAME);
  const isHome = pathname === "/" || pathname === "";

  useEffect(() => {
    let alive = true;
    fetch("/discord-invite.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        const guild = j.guild || j;
        const gName = String(guild?.name || "").trim();
        if (gName) setName(gName);
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-full bg-crema/10 object-cover ring-1 ring-crema/15"
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

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { cdnUrl } from "@/lib/site";
import { SmartLink } from "./SmartLink";
import { HeaderNameMarquee } from "./effects/HeaderNameMarquee";

const FALLBACK = cdnUrl("/images/logo-disco.png");
const FALLBACK_NAME = "VINILI & CAFFÈ";

/**
 * Logo guild Discord (GIF animata se il server ce l’ha) + wordmark.
 * Niente rotazione CSS: l’animazione è quella del logo Discord.
 * `navUnderline`: home = linea sempre; altre pagine = solo hover.
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
        /* hash `a_…` = icona animata Discord → GIF */
        const ext = hash.startsWith("a_") ? "gif" : "png";
        setIcon(`https://cdn.discordapp.com/icons/${id}/${hash}.${ext}?size=128`);
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
        key={icon}
        src={icon}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-full bg-crema/10 object-cover ring-1 ring-crema/15"
        onError={() => setIcon(FALLBACK)}
      />
      {/* Mobile: solo wordmark */}
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

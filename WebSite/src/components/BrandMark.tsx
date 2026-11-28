"use client";

import { useEffect, useState } from "react";
import { useSitePathname } from "@/lib/locale-path";
import { cn } from "@/lib/cn";
import { cdnUrl } from "@/lib/site";
import { SmartLink } from "./SmartLink";
import { HeaderNameMarquee } from "./effects/HeaderNameMarquee";

const FALLBACK = cdnUrl("/images/logo-disco.png");
const FALLBACK_NAME = "📀 VINILI & CAFFÈ ☕";
/** Brand Discord: disco/tazza + varianti stagionali (Babbo/neve/albero…). */
const KEEP_BRAND_EMOJI = new Set(["📀", "☕", "🎅", "❄", "🎄", "✨", "🎁", "🎃"]);
/**
 * Dingbat Unicode (U+26xx/27xx): senza VS16 (U+FE0F) il browser li disegna come testo
 * monocolore (es. ❄ bianco invece di ❄️ emoji). Santa 🎅 non serve VS16.
 */
function withEmojiPresentation(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x2600 && cp <= 0x27bf) return `${ch}\uFE0F`;
  return ch;
}

/**
 * Discord usa lettere “decorative” (es. ɑ al posto di a) che con `uppercase`
 * diventano glifi fuori dal subset Inter → tofu/quadratino su “CAFFÈ”.
 * Tiene le emoji brand (📀☕ e stagionali); toglie le altre decorative.
 */
function scrubDiscordText(raw: string): string {
  return String(raw || "")
    .replace(/\u0251/g, "a") // ɑ
    .replace(/\u2C6D/g, "A") // Ɑ
    /* Togli ZWSP + text-style VS15; FE0F lo rimettiamo sotto dove serve. */
    .replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, "")
    .normalize("NFKC")
    .normalize("NFC")
    .replace(/\p{Extended_Pictographic}/gu, (ch) =>
      KEEP_BRAND_EMOJI.has(ch) ? withEmojiPresentation(ch) : "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function splitGuildBrand(raw: string): { main: string; tagline: string } {
  const cleaned = scrubDiscordText(raw);
  const cut = cleaned.indexOf("•");
  const left = (cut > 0 ? cleaned.slice(0, cut) : cleaned).trim();
  const right = cut > 0 ? cleaned.slice(cut + 1).trim() : "";
  if (/vinili\s*&\s*caff/i.test(left)) {
    /* \uFE0F opzionale: emoji dingbat (❄️) altrimenti il match sul suffix fallisce. */
    const prefix = (left.match(/^(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u) || [""])[0];
    const suffix = (left.match(/(?:\s*\p{Extended_Pictographic}\uFE0F?)+$/u) || [""])[0];
    const main = `${prefix}VINILI & CAFFÈ${suffix}`.replace(/\s+/g, " ").trim();
    return {
      main: main || FALLBACK_NAME,
      tagline: right,
    };
  }
  return { main: left || FALLBACK_NAME, tagline: right };
}

/**
 * Logo guild Discord (GIF animata se il server ce l’ha) + wordmark.
 * Niente rotazione CSS: l’animazione è quella del logo Discord.
 * `navUnderline`: home = linea sempre; altre pagine = solo hover.
 */
export function BrandMark({ className, navUnderline }: { className?: string; navUnderline?: boolean }) {
  const pathname = useSitePathname() || "/";
  const [icon, setIcon] = useState(FALLBACK);
  const [main, setMain] = useState(FALLBACK_NAME);
  const [tagline, setTagline] = useState("");
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
        if (gName) {
          const parts = splitGuildBrand(gName);
          setMain(parts.main);
          setTagline(parts.tagline);
        }
        if (!id || !hash) return;
        /* hash `a_…` = icona animata: WebP animato a 80px (la GIF a 128px pesava ~400 KB in ogni pagina per un logo da 40px) */
        const animated = hash.startsWith("a_") ? "&animated=true" : "";
        setIcon(`https://cdn.discordapp.com/icons/${id}/${hash}.webp?size=80${animated}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const underline = navUnderline ? (isHome ? "always" : "hover") : false;

  return (
    <SmartLink
      href="/"
      className={cn("group relative z-[1] flex h-10 min-w-0 items-center gap-2", className)}
      aria-current={isHome ? "page" : undefined}
    >
      { }
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
          className="min-w-0 font-sans text-sm font-medium uppercase leading-none tracking-[0.04em] text-crema [font-variant-ligatures:none]"
        />
        {tagline ? (
          <span className="mt-0.5 hidden truncate font-sans text-[0.62rem] font-medium uppercase leading-none tracking-[0.12em] text-crema/50 [font-variant-ligatures:none] sm:block">
            {tagline}
          </span>
        ) : null}
      </span>
    </SmartLink>
  );
}

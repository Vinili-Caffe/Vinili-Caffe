import { Fragment } from "react";
import { cn } from "@/lib/cn";

/** `<:nome:id>` / `<a:nome:id>` (emoji custom Discord) dentro testi che arrivano dal bot. */
const CUSTOM_EMOJI = /<(a?):([A-Za-z0-9_~]{1,64}):(\d{15,22})>/g;

export function discordEmojiUrl(id: string, animated = false, size = 48) {
  if (animated) return `https://cdn.discordapp.com/emojis/${id}.webp?size=${size}&animated=true`;
  return `https://cdn.discordapp.com/emojis/${id}.webp?size=${size}&quality=lossless`;
}

/** Testo semplice: le emoji custom diventano `:nome:` (per title, aria-label, notifiche di sistema). */
export function plainEmojiText(text: string | null | undefined): string {
  return String(text ?? "").replace(CUSTOM_EMOJI, (_m, _a, name: string) => `:${name}:`);
}

/* Bandiere (due "regional indicator"): Windows le mostra come lettere (IT, GB…), quindi immagine Twemoji. */
const FLAG = /[🇦-🇿]{2}/u;
const TOKENS = /<(a?):([A-Za-z0-9_~]{1,64}):(d{15,22})>|([🇦-🇿]{2})/gu;

export function twemojiUrl(emoji: string) {
  const cps = Array.from(emoji)
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((h) => h !== "fe0f");
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${cps.join("-")}.svg`;
}

/** Bandiera come immagine (con il testo originale se l'immagine non carica). */
export function FlagEmoji({ flag, className }: { flag: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={twemojiUrl(flag)}
      alt={flag}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("inline-block size-[1.15em] object-contain align-[-0.2em]", className)}
      onError={(e) => e.currentTarget.replaceWith(document.createTextNode(flag))}
    />
  );
}

/** Testo con le emoji custom di Discord (e le bandiere) disegnate come immagini; il resto resta testo normale. */
export function EmojiText({ text, className, emojiClassName }: { text: string | null | undefined; className?: string; emojiClassName?: string }) {
  const s = String(text ?? "");
  if (!s.includes("<") && !FLAG.test(s)) return className ? <span className={className}>{s}</span> : <>{s}</>;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKENS)) {
    const at = m.index ?? 0;
    if (at > last) out.push(<Fragment key={`t${at}`}>{s.slice(last, at)}</Fragment>);
    if (m[4]) {
      out.push(<FlagEmoji key={`f${at}`} flag={m[4]} className={emojiClassName} />);
      last = at + m[0].length;
      continue;
    }
    const id = m[3];
    const animated = m[1] === "a";
    out.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`e${at}`}
        src={discordEmojiUrl(id, animated)}
        alt={`:${m[2]}:`}
        title={`:${m[2]}:`}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn("inline-block size-[1.2em] object-contain align-[-0.22em]", emojiClassName)}
        onError={(e) => {
          const el = e.currentTarget;
          if (el.getAttribute("data-fallback")) {
            el.style.display = "none";
            return;
          }
          el.setAttribute("data-fallback", "1");
          el.src = `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=48`;
        }}
      />,
    );
    last = at + m[0].length;
  }
  if (last < s.length) out.push(<Fragment key="tail">{s.slice(last)}</Fragment>);
  return className ? <span className={className}>{out}</span> : <>{out}</>;
}

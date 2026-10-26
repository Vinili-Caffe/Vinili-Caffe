import { Fragment } from "react";
import { cn } from "@/lib/cn";

/** `<:nome:id>` / `<a:nome:id>` (emoji custom Discord) dentro testi che arrivano dal bot. */
const CUSTOM_EMOJI = /<(a?):([A-Za-z0-9_~]{1,64}):(\d{15,22})>/g;

export function discordEmojiUrl(id: string, animated = false, size = 48) {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=${size}`;
}

/** Testo semplice: le emoji custom diventano `:nome:` (per title, aria-label, notifiche di sistema). */
export function plainEmojiText(text: string | null | undefined): string {
  return String(text ?? "").replace(CUSTOM_EMOJI, (_m, _a, name: string) => `:${name}:`);
}

/** Testo con le emoji custom di Discord disegnate come immagini; il resto resta testo normale. */
export function EmojiText({ text, className, emojiClassName }: { text: string | null | undefined; className?: string; emojiClassName?: string }) {
  const s = String(text ?? "");
  if (!s.includes("<")) return className ? <span className={className}>{s}</span> : <>{s}</>;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(CUSTOM_EMOJI)) {
    const at = m.index ?? 0;
    if (at > last) out.push(<Fragment key={`t${at}`}>{s.slice(last, at)}</Fragment>);
    out.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`e${at}`}
        src={discordEmojiUrl(m[3], m[1] === "a")}
        alt={`:${m[2]}:`}
        title={`:${m[2]}:`}
        loading="lazy"
        draggable={false}
        className={cn("inline-block size-[1.2em] object-contain align-[-0.22em]", emojiClassName)}
      />,
    );
    last = at + m[0].length;
  }
  if (last < s.length) out.push(<Fragment key="tail">{s.slice(last)}</Fragment>);
  return className ? <span className={className}>{out}</span> : <>{out}</>;
}

"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmojiText } from "./EmojiText";

// Markdown di Discord reso con elementi React (niente HTML grezzo): **grassetto**, *corsivo*, __sottolineato__,
// ~~barrato~~, `codice` / ``doppi``, ```blocchi```, ||spoiler||, > citazioni, link, <@utente>, <@&ruolo>, <#canale>, <:emoji:id>.
/* discordMdCrlfFix1: `\r` residuo (CRLF) spezzava endsWith("||") e i header `# ` → || e # grezzi. */
/* discordMdInlineCodeFix1: `` `testo` `` lasciava i ` esterni; ora N backtick come Discord + placeholder. */

/** `light`: testo su sfondo chiaro (menzioni più scure, link leggibili). */
type Names = { users?: Record<string, string>; roles?: Record<string, string>; channels?: Record<string, string>; light?: boolean };

function discordEmojiSrc(id: string, animated: boolean, size = 48, preferGif = false) {
  if (animated && preferGif) return `https://cdn.discordapp.com/emojis/${id}.gif?size=${size}`;
  if (animated) return `https://cdn.discordapp.com/emojis/${id}.webp?size=${size}&animated=true`;
  return `https://cdn.discordapp.com/emojis/${id}.webp?size=${size}&quality=lossless`;
}

function DiscordEmojiImg({ id, name, animated }: { id: string; name: string; animated: boolean }) {
  return (
     
    <img
      src={discordEmojiSrc(id, animated)}
      alt={`:${name}:`}
      title={`:${name}:`}
      className="inline size-[1.375em] align-bottom object-contain"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={(e) => {
        const el = e.currentTarget;
        const tried = el.getAttribute("data-fallback");
        if (!tried) {
          el.setAttribute("data-fallback", "1");
          el.src = discordEmojiSrc(id, animated, 48, true);
          return;
        }
        el.style.display = "none";
      }}
    />
  );
}

/**
 * Markdown inline senza i backtick: il codice si estrae prima (stile Discord),
 * altrimenti `` `testo` `` lascia i ` esterni visibili mentre applica comunque <code>.
 * Niente capturing group interni: `split` li includerebbe nei pezzi.
 */
const INLINE =
  /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|\|\|[\s\S]+?\|\||\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\(\s*<?(?:https?:)?\/\/[^)\s>]+>?\s*\)|<t:\d{9,12}(?::[tTdDfFR])?>|<a?:[a-zA-Z0-9_~]+:\d+>|<@!?\d+>|<@&\d+>|<#\d+>|https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

/** Placeholder che non collide col markdown Discord (niente `*_~|[]<>`). */
const CODE_PH = (i: number) => `\uE000c${i}\uE001`;
const CODE_PH_RE = /\uE000c(\d+)\uE001/g;

/**
 * Come Discord: N backtick di apertura, stesso N in chiusura; dentro possono esserci meno backtick.
 * Sostituisce gli span con placeholder così `__…``code``…__` resta un pezzo solo per underline/bold.
 */
function extractInlineCode(text: string): { text: string; codes: string[] } {
  const codes: string[] = [];
  let i = 0;
  let out = "";
  const s = String(text || "");
  while (i < s.length) {
    if (s[i] !== "`") {
      const start = i;
      while (i < s.length && s[i] !== "`") i += 1;
      out += s.slice(start, i);
      continue;
    }
    let n = 0;
    while (i + n < s.length && s[i + n] === "`") n += 1;
    let j = i + n;
    let close = -1;
    while (j < s.length) {
      if (s[j] !== "`") {
        j += 1;
        continue;
      }
      let m = 0;
      while (j + m < s.length && s[j + m] === "`") m += 1;
      if (m === n) {
        close = j;
        break;
      }
      j += m;
    }
    if (close < 0) {
      out += s.slice(i, i + n);
      i += n;
      continue;
    }
    const idx = codes.length;
    codes.push(s.slice(i + n, close));
    out += CODE_PH(idx);
    i = close + n;
  }
  return { text: out, codes };
}

function formatTs(unix: string, style?: string): string {
  const ms = Number(unix) * 1000;
  if (!Number.isFinite(ms)) return unix;
  const d = new Date(ms);
  const date = d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (style === "t") return time;
  if (style === "T") return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (style === "d") return d.toLocaleDateString("it-IT");
  if (style === "D") return date;
  if (style === "R") {
    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });
    const sec = Math.round(abs / 1000);
    if (sec < 60) return rtf.format(diff < 0 ? -sec : sec, "second");
    const min = Math.round(sec / 60);
    if (min < 60) return rtf.format(diff < 0 ? -min : min, "minute");
    const hr = Math.round(min / 60);
    if (hr < 48) return rtf.format(diff < 0 ? -hr : hr, "hour");
    const day = Math.round(hr / 24);
    return rtf.format(diff < 0 ? -day : day, "day");
  }
  return `${date} ${time}`;
}

function Spoiler({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <span
      tabIndex={0}
      role="button"
      onClick={(e) => e.currentTarget.classList.add("revealed")}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.classList.add("revealed")}
      className={cn(
        "cursor-pointer rounded px-0.5 text-transparent transition-colors [&.revealed]:text-inherit",
        light ? "bg-espresso/30 [&.revealed]:bg-espresso/10" : "bg-crema/25 [&.revealed]:bg-crema/10",
      )}
      title="Clicca per rivelare"
    >
      {children}
    </span>
  );
}

function normalizeDiscordText(raw: string): string {
  return String(raw || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u2016/g, "||")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&vert;|&#124;/gi, "|");
}

function isSpoilerToken(p: string): boolean {
  const t = p.trim();
  return t.startsWith("||") && t.endsWith("||") && t.length > 4;
}

/** Espande solo i placeholder codice in foglie già senza altro markdown. */
function expandCodeLeaves(text: string, codes: string[], key: string): ReactNode[] {
  if (!text.includes("\uE000")) return [<EmojiText key={key} text={text} />];
  const parts = text.split(CODE_PH_RE);
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const chunk = parts[i];
    if (i % 2 === 1) {
      const idx = Number(chunk);
      out.push(
        <code key={`${key}-code-${i}`} className="break-all rounded bg-black/30 px-1 py-0.5 font-mono text-[0.85em]">
          {Number.isFinite(idx) ? codes[idx] ?? "" : ""}
        </code>,
      );
      continue;
    }
    if (chunk) out.push(<EmojiText key={`${key}-t${i}`} text={chunk} />);
  }
  return out;
}

function inlineMarkdown(text: string, codes: string[], names: Names, key: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (!p) return null;
    if (p.startsWith("***") && p.endsWith("***") && p.length > 6)
      return (
        <strong key={k} className="font-semibold">
          <em>{inlineMarkdown(p.slice(3, -3), codes, names, k)}</em>
        </strong>
      );
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={k} className="font-semibold">{inlineMarkdown(p.slice(2, -2), codes, names, k)}</strong>;
    if (p.startsWith("__") && p.endsWith("__") && p.length > 4) return <u key={k}>{inlineMarkdown(p.slice(2, -2), codes, names, k)}</u>;
    if (p.startsWith("~~") && p.endsWith("~~") && p.length > 4) return <s key={k}>{inlineMarkdown(p.slice(2, -2), codes, names, k)}</s>;
    if (isSpoilerToken(p)) {
      const inner = p.trim().slice(2, -2);
      return (
        <Spoiler key={k} light={names.light}>
          {inlineMarkdown(inner, codes, names, k)}
        </Spoiler>
      );
    }
    if (((p.startsWith("*") && p.endsWith("*")) || (p.startsWith("_") && p.endsWith("_"))) && p.length > 2) return <em key={k}>{inlineMarkdown(p.slice(1, -1), codes, names, k)}</em>;
    const mdLink = p.match(/^\[([^\]]+)\]\(\s*<?((?:https?:)?\/\/[^)\s>]+)>?\s*\)$/i);
    if (mdLink) {
      const href = mdLink[2].startsWith("//") ? `https:${mdLink[2]}` : mdLink[2];
      return (
        <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className={names.light ? "text-[#1f5fbf] underline underline-offset-2" : "text-[#8ab4f8] underline underline-offset-2"}>
          {inlineMarkdown(mdLink[1], codes, names, k)}
        </a>
      );
    }
    const ts = p.match(/^<t:(\d{9,12})(?::([tTdDfFR]))?>$/);
    if (ts)
      return (
        <time key={k} dateTime={new Date(Number(ts[1]) * 1000).toISOString()} className={names.light ? "rounded bg-black/10 px-1 font-medium" : "rounded bg-crema/10 px-1 font-medium"} title={formatTs(ts[1], "f")}>
          {formatTs(ts[1], ts[2])}
        </time>
      );
    const emoji = p.match(/^<(a?):([a-zA-Z0-9_~]+):(\d+)>$/);
    if (emoji) return <DiscordEmojiImg key={k} id={emoji[3]} name={emoji[2]} animated={Boolean(emoji[1])} />;
    const user = p.match(/^<@!?(\d+)>$/);
    if (user) return <span key={k} className={names.light ? "rounded bg-[#5865f2]/15 px-1 font-semibold text-[#3c46b8]" : "rounded bg-[#5865f2]/25 px-1 font-medium text-[#c9cdfb]"}>@{names.users?.[user[1]] ?? "utente"}</span>;
    const role = p.match(/^<@&(\d+)>$/);
    if (role) return <span key={k} className={names.light ? "rounded bg-[#5865f2]/15 px-1 font-semibold text-[#3c46b8]" : "rounded bg-[#5865f2]/25 px-1 font-medium text-[#c9cdfb]"}>@{names.roles?.[role[1]] ?? "ruolo"}</span>;
    const ch = p.match(/^<#(\d+)>$/);
    if (ch) return <span key={k} className={names.light ? "rounded bg-[#5865f2]/15 px-1 font-semibold text-[#3c46b8]" : "rounded bg-[#5865f2]/25 px-1 font-medium text-[#c9cdfb]"}>#{names.channels?.[ch[1]] ?? "canale"}</span>;
    if (/^https?:\/\//.test(p))
      return (
        <a key={k} href={p} target="_blank" rel="noopener noreferrer nofollow" className={names.light ? "break-all text-[#1f5fbf] underline underline-offset-2" : "break-all text-[#8ab4f8] underline underline-offset-2"}>
          {p}
        </a>
      );
    const leaves = expandCodeLeaves(p, codes, k);
    return leaves.length === 1 ? leaves[0] : <Fragment key={k}>{leaves}</Fragment>;
  });
}

/** Prima estrae `codice` / ``doppi`` (placeholder), poi il resto del markdown sul testo mascherato. */
function inline(text: string, names: Names, key = "i"): ReactNode[] {
  const { text: masked, codes } = extractInlineCode(text);
  return inlineMarkdown(masked, codes, names, key);
}

export function DiscordContent({ text, names = {}, className }: { text: string; names?: Names; className?: string }) {
  const normalized = normalizeDiscordText(text);
  // prima i blocchi di codice, poi riga per riga (citazioni e titoli)
  const blocks = normalized.split(/(```[\s\S]*?```)/g);
  return (
    <div className={cn("min-w-0 max-w-full break-words [overflow-wrap:anywhere]", className)}>
      {blocks.map((b, bi) => {
        if (b.startsWith("```") && b.endsWith("```") && b.length >= 6) {
          const body = b.slice(3, -3).replace(/^[a-z0-9+-]*\n/i, "");
          return (
            <pre
              key={bi}
              className="my-1 max-w-full whitespace-pre-wrap break-all rounded-lg bg-black/35 p-3 font-mono text-[0.82em] leading-relaxed [overflow-wrap:anywhere]"
            >
              {body}
            </pre>
          );
        }
        const lines = b.split("\n");
        const nodes: ReactNode[] = [];
        for (let li = 0; li < lines.length; ) {
          const line = lines[li];
          const k = `${bi}-${li}`;
          const q = line.match(/^>\s?(.*)$/);
          /* Citazioni consecutive = un solo blocco (come Discord), senza <br> extra tra le righe. */
          if (q) {
            const quoteBodies: string[] = [];
            while (li < lines.length) {
              const qm = lines[li].match(/^>\s?(.*)$/);
              if (!qm) break;
              quoteBodies.push(qm[1]);
              li += 1;
            }
            nodes.push(
              <span
                key={k}
                className={names.light ? "block border-l-4 border-espresso/25 pl-3 text-espresso/70" : "block border-l-4 border-crema/25 pl-3 text-crema/80"}
              >
                {quoteBodies.map((body, qi) => (
                  <Fragment key={`${k}-q-${qi}`}>
                    {qi > 0 ? <br /> : null}
                    {inline(body, names, `${k}-q-${qi}`)}
                  </Fragment>
                ))}
              </span>,
            );
            continue;
          }
          const sub = line.match(/^-#\s+(.+)$/);
          if (sub) {
            nodes.push(
              <span key={k} className={names.light ? "block text-xs text-espresso/55" : "block text-xs text-crema/55"}>
                {inline(sub[1], names, k)}
              </span>,
            );
            li += 1;
            continue;
          }
          const h = line.match(/^(#{1,3})\s+(.+)$/);
          if (h) {
            nodes.push(
              <span key={k} className={h[1].length === 1 ? "block text-lg font-bold" : "block font-bold"}>
                {inline(h[2], names, k)}
              </span>,
            );
            li += 1;
            continue;
          }
          /* Righe inline: <br> solo tra di loro (i block sopra vanno già a capo da soli). */
          const nextIsBlock =
            li + 1 < lines.length && (/^>\s?/.test(lines[li + 1]) || /^-#\s+/.test(lines[li + 1]) || /^#{1,3}\s+/.test(lines[li + 1]));
          nodes.push(
            <Fragment key={k}>
              {inline(line, names, k)}
              {li < lines.length - 1 && !nextIsBlock ? <br /> : null}
            </Fragment>,
          );
          li += 1;
        }
        return <Fragment key={bi}>{nodes}</Fragment>;
      })}
    </div>
  );
}

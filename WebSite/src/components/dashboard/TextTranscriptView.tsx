"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Hash } from "lucide-react";
import { DiscordContent } from "@/components/discord/DiscordContent";
import type { GuildEmoji } from "@/components/ui/emoji-picker";
import { cn } from "@/lib/cn";
import { loadGuildEmojis } from "@/lib/personalizza";
import { parseTextTranscript, restoreEmojiNames, type TextMessage } from "@/lib/transcript-text";

const PALETTE = ["#e8a87c", "#85c1e9", "#a3d9a5", "#f5b7b1", "#c39bd3", "#f9e79f", "#76d7c4", "#f0b27a"];
function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const isImageUrl = (u: string) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u) || /media\.discordapp\.net|cdn\.discordapp\.com\/attachments/i.test(u);

function fmtTime(d: Date | null) {
  if (!d) return "";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

let emojiCache: GuildEmoji[] | null = null;

/**
 * Transcript salvato solo come testo (ticket vecchi), mostrato come una chat Discord:
 * autore, ora, markdown, embed con la barra colorata, allegati. Le emoji salvate come `:nome:`
 * tornano immagini se esistono ancora nel server.
 */
export function TextTranscriptView({ text, token, className }: { text: string; token?: string | null; className?: string }) {
  const parsed = useMemo(() => parseTextTranscript(text), [text]);
  const [emojis, setEmojis] = useState<GuildEmoji[]>(() => emojiCache || []);

  useEffect(() => {
    if (emojiCache || !token) return;
    let off = false;
    void loadGuildEmojis(token).then((list) => {
      emojiCache = list;
      if (!off) setEmojis(list);
    });
    return () => {
      off = true;
    };
  }, [token]);

  const byName = useMemo(() => {
    const m = new Map<string, { id: string; animated?: boolean }>();
    for (const e of emojis) {
      if (!e?.id || !e.name) continue;
      m.set(e.name, e);
      if (!m.has(e.name.toLowerCase())) m.set(e.name.toLowerCase(), e);
    }
    return m;
  }, [emojis]);

  if (!parsed) {
    return (
      <div className={cn("p-5", className)}>
        <DiscordContent text={restoreEmojiNames(text, byName)} className="text-sm leading-relaxed text-[#dbdee1]" />
      </div>
    );
  }

  const fix = (s: string) => restoreEmojiNames(s, byName);

  return (
    <div className={cn("bg-[#313338] text-[#dbdee1]", className)}>
      {parsed.channel ? (
        <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-black/30 bg-[#313338]/95 px-4 py-3 backdrop-blur">
          <Hash className="size-4 shrink-0 text-[#80848e]" aria-hidden />
          <span className="truncate font-semibold text-white">
            <DiscordContent text={fix(parsed.channel)} className="inline" />
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-[#949ba4]">
            <FileText className="size-3.5" aria-hidden /> {parsed.messages.length} messaggi
          </span>
        </div>
      ) : null}
      <ol className="py-2">
        {parsed.messages.map((m, i) => (
          <MessageRow key={m.id} m={m} prev={parsed.messages[i - 1]} fix={fix} />
        ))}
      </ol>
    </div>
  );
}

function MessageRow({ m, prev, fix }: { m: TextMessage; prev?: TextMessage; fix: (s: string) => string }) {
  /* come Discord: messaggi dello stesso autore a pochi minuti di distanza stanno nello stesso gruppo */
  const grouped = Boolean(prev && prev.author === m.author && m.at && prev.at && m.at.getTime() - prev.at.getTime() < 7 * 60 * 1000);
  const color = colorFor(m.author);
  return (
    <li className={cn("group flex gap-4 px-4 py-0.5 hover:bg-black/[0.06]", !grouped && "mt-3")}>
      <div className="w-10 shrink-0">
        {!grouped ? (
          <span className="flex size-10 items-center justify-center rounded-full text-sm font-bold text-[#1e1f22]" style={{ background: color }} aria-hidden>
            {(m.author.replace(/^[^a-zA-Z0-9]+/, "").charAt(0) || "?").toUpperCase()}
          </span>
        ) : (
          <span className="block pt-1 text-right text-[0.62rem] text-[#949ba4] opacity-0 group-hover:opacity-100">
            {m.at ? m.at.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped ? (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold" style={{ color }}>
              {m.author}
            </span>
            {m.bot ? <span className="rounded bg-[#5865f2] px-1 py-px text-[0.6rem] font-bold uppercase text-white">Bot</span> : null}
            <span className="text-xs text-[#949ba4]">{fmtTime(m.at)}</span>
          </p>
        ) : null}
        {m.content ? <DiscordContent text={fix(m.content)} className="text-[0.95rem] leading-relaxed" /> : null}
        {m.embeds.map((e, j) => (
          <div key={j} className="mt-1.5 flex max-w-xl overflow-hidden rounded bg-[#2b2d31]">
            <span className="w-1 shrink-0 bg-[#d49150]" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1.5 px-3 py-2.5">
              {e.title ? <DiscordContent text={fix(e.title)} className="font-semibold text-white" /> : null}
              {e.description ? <DiscordContent text={fix(e.description)} className="text-sm leading-relaxed" /> : null}
              {e.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.image} alt="" loading="lazy" className="mt-1 max-h-72 rounded object-contain" onError={(ev) => (ev.currentTarget.style.display = "none")} />
              ) : null}
            </div>
            {e.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.thumbnail} alt="" loading="lazy" className="m-3 size-16 shrink-0 rounded object-cover" onError={(ev) => (ev.currentTarget.style.display = "none")} />
            ) : null}
          </div>
        ))}
        {m.attachments.map((url) =>
          isImageUrl(url) ? (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1.5 block w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Allegato"
                loading="lazy"
                className="max-h-72 max-w-full rounded-lg object-contain"
                onError={(ev) => {
                  const a = ev.currentTarget.parentElement;
                  if (a) a.textContent = "Allegato non più disponibile";
                }}
              />
            </a>
          ) : (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1.5 flex w-fit max-w-full items-center gap-2 rounded-lg bg-[#2b2d31] px-3 py-2 text-sm text-[#00a8fc] ring-1 ring-black/20">
              <FileText className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{decodeURIComponent(url.split("/").pop()?.split("?")[0] || "Allegato")}</span>
            </a>
          ),
        )}
        {m.stickers.map((s) => (
          <p key={s} className="mt-1 text-xs italic text-[#949ba4]">
            Sticker: {s.split(" ")[0]}
          </p>
        ))}
      </div>
    </li>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Hash } from "lucide-react";
import { DiscordContent } from "@/components/discord/DiscordContent";
import type { GuildEmoji } from "@/components/ui/emoji-picker";
import { cn } from "@/lib/cn";
import { loadGuildEmojis } from "@/lib/personalizza";
import { buildEmojiNameMap, parseTextTranscript, restoreEmojiNames, type TextMessage } from "@/lib/transcript-text";

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
const BOT_AVATAR = "/webhooks/site-bot-avatar?size=64";

async function loadTranscriptAvatars(transcriptToken: string, accessToken: string): Promise<Record<string, string>> {
  try {
    const r = await fetch(`/ticket-transcript/${encodeURIComponent(transcriptToken)}/avatars`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      credentials: "omit",
      cache: "no-store",
    });
    if (!r.ok) return {};
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; byName?: Record<string, string> };
    if (!d?.ok || !d.byName || typeof d.byName !== "object") return {};
    return d.byName;
  } catch {
    return {};
  }
}

function AuthorAvatar({ author, bot, avatarUrl, color }: { author: string; bot: boolean; avatarUrl: string | null; color: string }) {
  const [src, setSrc] = useState<string | null>(avatarUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(avatarUrl);
    setFailed(false);
  }, [avatarUrl]);

  const fallbackBot = bot && /vinili/i.test(author) ? BOT_AVATAR : null;
  const show = !failed && (src || fallbackBot);

  if (show) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src || fallbackBot || ""}
        alt=""
        width={40}
        height={40}
        className="size-10 rounded-full object-cover"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          if (src && fallbackBot && src !== fallbackBot) {
            setSrc(fallbackBot);
            return;
          }
          setFailed(true);
        }}
      />
    );
  }

  return (
    <span className="flex size-10 items-center justify-center rounded-full text-sm font-bold text-[#1e1f22]" style={{ background: color }} aria-hidden>
      {(author.replace(/^[^a-zA-Z0-9]+/, "").charAt(0) || "?").toUpperCase()}
    </span>
  );
}

/**
 * Transcript salvato solo come testo (ticket vecchi), mostrato come una chat Discord:
 * autore, ora, markdown, embed con la barra colorata, allegati. Le emoji salvate come `:nome:`
 * tornano immagini se esistono ancora nel server.
 */
export function TextTranscriptView({
  text,
  token,
  transcriptToken,
  className,
}: {
  text: string;
  token?: string | null;
  /** Token del link transcript (per risolvere gli avatar dal server). */
  transcriptToken?: string | null;
  className?: string;
}) {
  const parsed = useMemo(() => parseTextTranscript(text), [text]);
  const [emojis, setEmojis] = useState<GuildEmoji[]>(() => emojiCache || []);
  const [avatarsByName, setAvatarsByName] = useState<Record<string, string>>({});

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

  useEffect(() => {
    if (!token || !transcriptToken || !parsed?.messages.length) return;
    const needs = parsed.messages.some((m) => !m.avatarUrl);
    if (!needs) return;
    let off = false;
    void loadTranscriptAvatars(transcriptToken, token).then((map) => {
      if (!off) setAvatarsByName(map);
    });
    return () => {
      off = true;
    };
  }, [token, transcriptToken, parsed]);

  const byName = useMemo(() => buildEmojiNameMap(emojis), [emojis]);

  if (!parsed) {
    return (
      <div className={cn("p-5", className)}>
        <DiscordContent text={restoreEmojiNames(text, byName)} className="text-sm leading-relaxed text-[#dbdee1]" />
      </div>
    );
  }

  const fix = (s: string) => restoreEmojiNames(s, byName);
  const resolveAvatar = (m: TextMessage) =>
    m.avatarUrl ||
    avatarsByName[m.author] ||
    avatarsByName[m.author.toLowerCase()] ||
    (m.bot && /vinili/i.test(m.author) ? BOT_AVATAR : null);

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
          <MessageRow key={m.id} m={m} prev={parsed.messages[i - 1]} fix={fix} avatarUrl={resolveAvatar(m)} />
        ))}
      </ol>
      {parsed.truncated ? (
        <div className="mx-4 mb-4 mt-2 flex items-start gap-3 rounded-lg bg-[#2b2d31] px-4 py-3 text-sm text-[#dbdee1] ring-1 ring-[#f0b232]/40">
          <span className="mt-0.5 text-[#f0b232]" aria-hidden>
            ⚠
          </span>
          <span>
            <strong className="text-white">Il transcript finisce qui.</strong> Di questo ticket il bot ha conservato solo l&apos;inizio: il file completo non è più disponibile.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function MessageRow({ m, prev, fix, avatarUrl }: { m: TextMessage; prev?: TextMessage; fix: (s: string) => string; avatarUrl: string | null }) {
  /* come Discord: messaggi dello stesso autore a pochi minuti di distanza stanno nello stesso gruppo */
  const grouped = Boolean(prev && prev.author === m.author && m.at && prev.at && m.at.getTime() - prev.at.getTime() < 7 * 60 * 1000);
  const color = colorFor(m.author);
  return (
    <li className={cn("group flex gap-4 px-4 py-0.5 hover:bg-black/[0.06]", !grouped && "mt-3")}>
      <div className="w-10 shrink-0">
        {!grouped ? (
          <AuthorAvatar author={m.author} bot={m.bot} avatarUrl={avatarUrl} color={color} />
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

/** Skeleton di un transcript: messaggi stile Discord che arrivano. */
export function TranscriptSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ol className="space-y-5 bg-[#313338] px-4 py-5" aria-busy aria-label="Caricamento transcript">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex gap-4">
          <span className="size-10 shrink-0 animate-pulse rounded-full bg-white/[0.07]" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3.5 w-40 animate-pulse rounded bg-white/[0.09]" />
            <span className="block h-3 animate-pulse rounded bg-white/[0.05]" style={{ width: `${85 - ((i * 17) % 40)}%` }} />
            {i % 2 === 0 ? <span className="block h-16 w-full max-w-md animate-pulse rounded bg-white/[0.04]" /> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

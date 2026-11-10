"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { createStore } from "./store";
import { EmojiText } from "@/components/discord/EmojiText";

/**
 * Emoji picker (E8). Pannello controllato `EmojiPicker` oppure
 * `openEmojiPicker` / `toggleEmojiPicker` (provider in SiteShell).
 */

export type EmojiPick =
  | { type: "unicode"; text: string }
  | { type: "custom"; id: string; name: string; animated?: boolean; markup: string };

/** guildName = emoji di un altro server del bot (senza: server attuale) */
export type GuildEmoji = { id: string; name: string; animated?: boolean; url?: string; guildName?: string };

const RAW_UNICODE = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
  "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨",
  "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢",
  "🤮", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "😮",
  "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓",
  "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻",
  "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾",
  "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆",
  "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "💪",
  "☕", "🍵", "🧋", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🍕", "🍔", "🍟", "🌮", "🍝", "🍣",
  "🍩", "🍪", "🎂", "🍰", "🍫", "🍿",
  "🎵", "🎶", "🎤", "🎧", "🎷", "🎸", "🎹", "🎺", "🎻", "🥁", "🎬", "🎮", "🎲", "🧩", "🎯",
  "🔥", "✨", "⭐", "🌟", "💫", "⚡", "💥", "💢", "💯", "✅", "❌", "❗", "❓", "💬", "🎉", "🏆",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍", "💘", "💝", "💖", "💗", "💓", "💞", "💕", "💔",
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦄",
  "🌸", "🌹", "🌻", "🍀", "🍁", "🍂", "☀️", "🌙", "🌈", "❄️",
  "📌", "📝", "💡", "🔔", "🔑", "🔒", "🛡️", "👑", "💎", "🪄", "🏠", "🚀", "✈️",
];

export const UNICODE_EMOJI: readonly string[] = [...new Set(RAW_UNICODE)];

export function formatCustomEmoji(emoji: { id: string; name?: string; animated?: boolean }): string {
  const id = String(emoji.id || "").trim();
  if (!id) return "";
  return `<${emoji.animated ? "a" : ""}:${emoji.name || "emoji"}:${id}>`;
}

export function customEmojiUrl(id: string, animated = false, size = 48): string {
  const idStr = String(id || "").trim();
  if (!idStr) return "";
  const sz = size > 0 ? size : 48;
  if (animated) return `https://cdn.discordapp.com/emojis/${idStr}.webp?size=${sz}&animated=true`;
  return `https://cdn.discordapp.com/emojis/${idStr}.webp?size=${sz}`;
}

type AnchorBox = { top: number; left: number; bottom: number; right: number; width: number; height: number };

export type EmojiPickerOptions = {
  anchor?: HTMLElement | null;
  anchorRect?: AnchorBox | null;
  guildEmojis?: GuildEmoji[];
  unicodeOnly?: boolean;
  preferCustom?: boolean;
  preferAbove?: boolean;
  onPick?: (pick: EmojiPick) => void;
};

type EmojiSession = {
  anchor: HTMLElement | null;
  rect: AnchorBox | null;
  guildEmojis: GuildEmoji[];
  unicodeOnly: boolean;
  preferCustom: boolean;
  preferAbove: boolean;
  onPick: ((pick: EmojiPick) => void) | null;
};

const emojiStore = createStore<EmojiSession | null>(null);

function boxOf(el: HTMLElement): AnchorBox {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
}

export function openEmojiPicker(opts: EmojiPickerOptions = {}) {
  const anchor = opts.anchor ?? null;
  const unicodeOnly = opts.unicodeOnly === true;
  emojiStore.set({
    anchor,
    rect: anchor ? boxOf(anchor) : opts.anchorRect ?? null,
    guildEmojis: unicodeOnly ? [] : opts.guildEmojis ?? [],
    unicodeOnly,
    preferCustom: !unicodeOnly && opts.preferCustom === true,
    preferAbove: opts.preferAbove !== false,
    onPick: opts.onPick ?? null,
  });
}

export function closeEmojiPicker() {
  emojiStore.set(null);
}

export function emojiPickerIsOpen(anchor?: HTMLElement | null): boolean {
  const s = emojiStore.get();
  if (!s) return false;
  if (anchor == null) return true;
  return s.anchor === anchor;
}

export function toggleEmojiPicker(opts: EmojiPickerOptions = {}): boolean {
  if (emojiPickerIsOpen(opts.anchor ?? null)) {
    closeEmojiPicker();
    return false;
  }
  openEmojiPicker(opts);
  return true;
}

export function useEmojiPicker() {
  const session = useSyncExternalStore(emojiStore.subscribe, emojiStore.get, () => null);
  return {
    open: openEmojiPicker,
    close: closeEmojiPicker,
    toggle: toggleEmojiPicker,
    isOpen: emojiPickerIsOpen,
    active: session != null,
  };
}

function placePanel(panel: HTMLElement, session: EmojiSession) {
  const anchor = session.anchor?.isConnected ? session.anchor : null;
  const box = anchor ? boxOf(anchor) : session.rect;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!box) {
    panel.style.left = `${Math.max(margin, (vw - w) / 2)}px`;
    panel.style.top = `${Math.max(margin, (vh - h) / 2)}px`;
    return;
  }
  let left = box.left;
  if (left + w > vw - margin) left = vw - w - margin;
  if (left < margin) left = margin;
  const gap = 8;
  let top = session.preferAbove ? box.top - h - gap : box.bottom + gap;
  if (top < margin) top = box.bottom + gap;
  if (top + h > vh - margin) top = Math.max(margin, box.top - h - gap);
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(Math.max(margin, top))}px`;
}

export function EmojiPickerProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(emojiStore.subscribe, emojiStore.get, () => null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!session) return;
    const panel = panelRef.current;
    if (!panel) return;
    const place = () => placePanel(panel, session);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (session.anchor?.contains(t)) return;
      closeEmojiPicker();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeEmojiPicker();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [session]);

  return (
    <>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {session ? (
              <EmojiPickerPanel
                ref={panelRef}
                className="fixed z-[110] w-[min(23rem,calc(100vw-1rem))]"
                guildEmojis={session.guildEmojis}
                unicodeOnly={session.unicodeOnly}
                preferCustom={session.preferCustom}
                onClose={closeEmojiPicker}
                onPick={(pick) => {
                  session.onPick?.(pick);
                  closeEmojiPicker();
                }}
              />
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

export function EmojiPicker({
  open,
  onClose,
  onPick,
  guildEmojis = [],
  unicodeOnly,
  preferCustom,
  anchorRef,
  className,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (pick: EmojiPick) => void;
  guildEmojis?: GuildEmoji[];
  unicodeOnly?: boolean;
  preferCustom?: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, onClose, anchorRef]);

  return (
    <AnimatePresence>
      {open ? (
        <EmojiPickerPanel
          ref={root}
          className={cn("absolute z-40 mt-2 w-[min(23rem,calc(100vw-2rem))]", className)}
          guildEmojis={guildEmojis}
          unicodeOnly={unicodeOnly}
          preferCustom={preferCustom}
          onClose={onClose}
          onPick={(pick) => {
            onPick(pick);
            onClose();
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}

/* ───────────── elenco completo delle emoji (caricato alla prima apertura) ───────────── */

type UnicodeRow = [emoji: string, group: number, name: string, search: string, skins?: string[]];
type UnicodeData = { groups: { id: number; key: string; label: string }[]; emojis: UnicodeRow[] };

let unicodeData: UnicodeData | null = null;
let unicodeLoading: Promise<UnicodeData> | null = null;

function loadUnicodeData(): Promise<UnicodeData> {
  if (unicodeData) return Promise.resolve(unicodeData);
  if (!unicodeLoading) {
    unicodeLoading = import("@/lib/data/unicodeEmoji.json")
      .then((m) => {
        unicodeData = ((m as { default?: unknown }).default ?? m) as UnicodeData;
        return unicodeData;
      })
      .finally(() => {
        unicodeLoading = null;
      });
  }
  return unicodeLoading;
}

const normSearch = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .trim();

const GROUP_ICON: Record<string, string> = {
  "smileys-emotion": "😀",
  "people-body": "👋",
  "animals-nature": "🐶",
  "food-drink": "🍕",
  "travel-places": "🚗",
  activities: "⚽",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

const TONES = ["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"];
const TONE_KEY = "vc_emoji_tone";
const RECENT_KEY = "vc_emoji_recent";

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* archivio pieno o bloccato */
  }
}

/** Le bandiere su Windows non si vedono come emoji: le disegniamo come immagini. */
function Glyph({ text, flag }: { text: string; flag?: boolean }) {
  if (flag) return <EmojiText text={text} emojiClassName="size-6" />;
  return <>{text}</>;
}

const EmojiPickerPanel = function EmojiPickerPanel({
  className,
  guildEmojis,
  unicodeOnly,
  preferCustom,
  onClose,
  onPick,
  ref,
}: {
  className?: string;
  guildEmojis: GuildEmoji[];
  unicodeOnly?: boolean;
  preferCustom?: boolean;
  onClose: () => void;
  onPick: (pick: EmojiPick) => void;
  ref?: RefObject<HTMLDivElement | null>;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"custom" | "unicode">(preferCustom && !unicodeOnly && guildEmojis.length ? "custom" : "unicode");
  const [data, setData] = useState<UnicodeData | null>(unicodeData);
  const [tone, setTone] = useState(() => Math.max(0, Math.min(5, Number(readLocal(TONE_KEY)) || 0)));
  const [toneOpen, setToneOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const v = JSON.parse(readLocal(RECENT_KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 24) : [];
    } catch {
      return [];
    }
  });
  const [hover, setHover] = useState<{ glyph: string; name: string; flag?: boolean; url?: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data) return;
    let alive = true;
    void loadUnicodeData()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [data]);

  const needle = normSearch(q);
  const customs = useMemo(
    () => guildEmojis.filter((e) => e.id && (!needle || normSearch(e.name).includes(needle.replace(/:/g, "")) || e.id.includes(needle))),
    [guildEmojis, needle],
  );
  /* emoji custom divise per server: prima quelle del server attuale */
  const customGroups = useMemo(() => {
    const groups = new Map<string, GuildEmoji[]>();
    for (const e of customs) {
      const key = e.guildName || "";
      groups.set(key, [...(groups.get(key) || []), e]);
    }
    return [...groups.entries()].sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0], "it", { sensitivity: "base" })));
  }, [customs]);
  const flagGroup = data?.groups.find((g) => g.key === "flags")?.id;
  const withTone = (row: UnicodeRow) => (tone > 0 && row[4] ? row[4][tone - 1] : row[0]);

  /* ricerca: tutte le parole devono comparire (nome, parole chiave italiane e inglesi, :shortcode:) */
  const results = useMemo(() => {
    const words = needle.split(/\s+/).filter(Boolean);
    if (!data || !words.length) return null;
    const scored: { row: UnicodeRow; score: number }[] = [];
    for (const row of data.emojis) {
      const hay = row[3];
      if (!words.every((w) => hay.includes(w))) continue;
      const name = normSearch(row[2]);
      const score = name === needle ? 0 : name.startsWith(needle) ? 1 : hay.split("|").some((t) => t === needle || t === `:${needle}:`) ? 2 : 3;
      scored.push({ row, score });
    }
    return scored.sort((a, b) => a.score - b.score).map((x) => x.row);
  }, [data, needle]);

  const byGroup = useMemo(() => {
    if (!data) return [];
    return data.groups.map((g) => ({ ...g, rows: data.emojis.filter((r) => r[1] === g.id) }));
  }, [data]);
  const recentRows = useMemo(() => {
    if (!data) return recent.map((e) => [e, -1, e, ""] as UnicodeRow);
    const byChar = new Map<string, UnicodeRow>();
    for (const r of data.emojis) {
      byChar.set(r[0], r);
      for (const s of r[4] || []) byChar.set(s, [s, r[1], r[2], r[3]]);
    }
    return recent.map((e) => byChar.get(e) || ([e, -1, e, ""] as UnicodeRow));
  }, [data, recent]);

  const pickUnicode = (text: string) => {
    const next = [text, ...recent.filter((x) => x !== text)].slice(0, 24);
    setRecent(next);
    writeLocal(RECENT_KEY, JSON.stringify(next));
    onPick({ type: "unicode", text });
  };

  const showCustom = tab === "custom" && !unicodeOnly;
  const cell = "flex size-9 items-center justify-center rounded-lg text-[1.35rem] leading-none hover:bg-crema/10 focus-visible:bg-crema/10 focus-visible:outline-none";

  const emojiButton = (row: UnicodeRow, key: string) => {
    const glyph = withTone(row);
    const flag = row[1] === flagGroup;
    return (
      <button
        key={key}
        type="button"
        aria-label={row[2]}
        onMouseEnter={() => setHover({ glyph, name: row[2], flag })}
        onFocus={() => setHover({ glyph, name: row[2], flag })}
        onClick={() => pickUnicode(glyph)}
        className={cell}
      >
        <Glyph text={glyph} flag={flag} />
      </button>
    );
  };

  const jumpTo = (id: number | "recent") => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-group="${id}"]`);
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 4, behavior: "smooth" });
  };

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label="Scegli emoji"
      data-vc-ui="emoji-picker"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className={cn("overflow-hidden rounded-2xl bg-roast shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-sand/20", className)}
    >
      <div className="flex items-center gap-2 border-b border-sand/10 px-3 py-2">
        <Search className="size-3.5 shrink-0 text-crema/40" />
        <input
          name="emoji-search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={showCustom ? "Cerca tra le emoji dei server…" : "Cerca: cuore, risata, :fire:…"}
          className="min-w-0 flex-1 bg-transparent text-sm text-crema outline-none placeholder:text-crema/35"
        />
        {!showCustom ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setToneOpen((v) => !v)}
              aria-label="Tonalità della pelle"
              title="Tonalità della pelle"
              className="rounded-lg p-1 text-lg leading-none hover:bg-crema/8"
            >
              {TONES[tone]}
            </button>
            {toneOpen ? (
              <div className="absolute right-0 top-full z-10 mt-1 flex gap-0.5 rounded-xl bg-espresso p-1 shadow-lg ring-1 ring-sand/20">
                {TONES.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    aria-label={i === 0 ? "Tonalità predefinita" : `Tonalità ${i}`}
                    onClick={() => {
                      setTone(i);
                      writeLocal(TONE_KEY, String(i));
                      setToneOpen(false);
                    }}
                    className={cn("rounded-lg p-1 text-lg leading-none hover:bg-crema/10", tone === i && "bg-caramel/20")}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-crema/50 hover:bg-crema/8 hover:text-crema" aria-label="Chiudi">
          <X className="size-3.5" />
        </button>
      </div>

      {!unicodeOnly && (
        <div className="flex gap-1 border-b border-sand/10 px-2 py-1.5">
          {(
            [
              ["unicode", "Emoji"],
              ["custom", "Dei server"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors", tab === id ? "bg-caramel/20 text-ember" : "text-crema/55 hover:text-crema")}
            >
              {label}
              {id === "custom" && guildEmojis.length ? <span className="ml-1 text-crema/40">{guildEmojis.length}</span> : null}
            </button>
          ))}
        </div>
      )}

      {!showCustom && !results && data ? (
        <div className="flex justify-between border-b border-sand/10 px-1.5 py-1">
          {recentRows.length ? (
            <button type="button" title="Usate di recente" aria-label="Usate di recente" onClick={() => jumpTo("recent")} className="rounded-md px-1 py-0.5 text-base hover:bg-crema/10">
              🕘
            </button>
          ) : null}
          {byGroup.map((g) => (
            <button key={g.id} type="button" title={g.label} aria-label={g.label} onClick={() => jumpTo(g.id)} className="rounded-md px-1 py-0.5 text-base hover:bg-crema/10">
              <Glyph text={GROUP_ICON[g.key] || g.rows[0]?.[0] || "•"} flag={g.key === "flags"} />
            </button>
          ))}
        </div>
      ) : null}

      <div ref={scroller} className="relative max-h-72 overflow-y-auto p-2" onMouseLeave={() => setHover(null)}>
        {showCustom ? (
          customs.length ? (
            <div className="space-y-2">
              {customGroups.map(([server, list]) => (
                <div key={server || "this"}>
                  {customGroups.length > 1 ? (
                    <p className="sticky top-0 z-10 bg-roast/95 px-1 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-crema/50" translate={server ? "no" : undefined}>
                      {server || "Questo server"} <span className="text-crema/35">{list.length}</span>
                    </p>
                  ) : null}
                  <div className="grid grid-cols-8 gap-0.5">
                    {list.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        aria-label={e.name}
                        onMouseEnter={() => setHover({ glyph: "", name: `:${e.name}:${e.guildName ? ` · ${e.guildName}` : ""}`, url: e.url || customEmojiUrl(e.id, e.animated) })}
                        onClick={() => onPick({ type: "custom", id: e.id, name: e.name, animated: e.animated, markup: formatCustomEmoji(e) })}
                        className={cell}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={e.url || customEmojiUrl(e.id, e.animated)} alt="" loading="lazy" className="size-7 object-contain" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-crema/45">{guildEmojis.length ? "Nessuna emoji trovata." : "Questo server non ha emoji sue."}</p>
          )
        ) : !data ? (
          /* elenco breve mentre arriva quello completo */
          <div className="grid grid-cols-8 gap-0.5">
            {UNICODE_EMOJI.filter((u) => !needle || u.includes(needle)).map((u) => (
              <button key={u} type="button" onClick={() => pickUnicode(u)} className={cell}>
                {u}
              </button>
            ))}
          </div>
        ) : results ? (
          results.length ? (
            <div className="grid grid-cols-8 gap-0.5">{results.slice(0, 400).map((r, i) => emojiButton(r, `${r[0]}-${i}`))}</div>
          ) : (
            <p className="py-6 text-center text-xs text-crema/45">Nessuna emoji per “{q.trim()}”.</p>
          )
        ) : (
          <>
            {recentRows.length ? (
              <section data-group="recent">
                <p className="sticky top-0 z-[1] -mx-2 bg-roast/95 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/50 backdrop-blur">Usate di recente</p>
                <div className="grid grid-cols-8 gap-0.5">{recentRows.map((r, i) => emojiButton([r[0], r[1], r[2], r[3]], `recent-${i}`))}</div>
              </section>
            ) : null}
            {byGroup.map((g) => (
              <section key={g.id} data-group={g.id} className="mt-1">
                <p className="sticky top-0 z-[1] -mx-2 bg-roast/95 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/50 backdrop-blur">{g.label}</p>
                <div className="grid grid-cols-8 gap-0.5">{g.rows.map((r, i) => emojiButton(r, `${g.id}-${i}`))}</div>
              </section>
            ))}
          </>
        )}
      </div>

      <div className="flex h-11 items-center gap-2.5 border-t border-sand/10 px-3">
        {hover ? (
          <>
            <span className="flex size-7 items-center justify-center text-2xl leading-none">
              {hover.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hover.url} alt="" className="size-7 object-contain" />
              ) : (
                <Glyph text={hover.glyph} flag={hover.flag} />
              )}
            </span>
            <span className="truncate text-sm font-medium text-crema/85">{hover.name}</span>
          </>
        ) : (
          <span className="text-xs text-crema/40">{showCustom ? "Emoji di tutti i server del bot" : data ? `${data.emojis.length} emoji · cerca anche in inglese o con :nome:` : "Carico tutte le emoji…"}</span>
        )}
      </div>
    </motion.div>
  );
};

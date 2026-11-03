"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { createStore } from "./store";

/**
 * Emoji picker (E8). Pannello controllato `EmojiPicker` oppure
 * `openEmojiPicker` / `toggleEmojiPicker` (provider in SiteShell).
 */

export type EmojiPick =
  | { type: "unicode"; text: string }
  | { type: "custom"; id: string; name: string; animated?: boolean; markup: string };

export type GuildEmoji = { id: string; name: string; animated?: boolean; url?: string };

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
                className="fixed z-[110] w-[min(20rem,calc(100vw-1rem))]"
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
          className={cn("absolute z-40 mt-2 w-[min(20rem,calc(100vw-2rem))]", className)}
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
  const needle = q.trim().toLowerCase();
  const customs = useMemo(
    () => guildEmojis.filter((e) => e.id && (!needle || e.name.toLowerCase().includes(needle) || e.id.includes(needle))),
    [guildEmojis, needle],
  );
  const unis = useMemo(() => UNICODE_EMOJI.filter((u) => !needle || u.includes(needle)), [needle]);
  const showCustom = tab === "custom" && !unicodeOnly;

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
      className={cn(
        "overflow-hidden rounded-2xl bg-roast shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-sand/20",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-sand/10 px-3 py-2">
        <Search className="size-3.5 shrink-0 text-crema/40" />
        <input name="emoji-search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca…"
          className="min-w-0 flex-1 bg-transparent text-sm text-crema outline-none placeholder:text-crema/35"
        />
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-crema/50 hover:bg-crema/8 hover:text-crema" aria-label="Chiudi">
          <X className="size-3.5" />
        </button>
      </div>
      {!unicodeOnly && (
        <div className="flex gap-1 border-b border-sand/10 px-2 py-1.5">
          {(
            [
              ["custom", "Server"],
              ["unicode", "Unicode"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                tab === id ? "bg-caramel/20 text-ember" : "text-crema/55 hover:text-crema",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {showCustom
          ? customs.map((e) => (
              <button
                key={e.id}
                type="button"
                title={e.name}
                onClick={() =>
                  onPick({
                    type: "custom",
                    id: e.id,
                    name: e.name,
                    animated: e.animated,
                    markup: formatCustomEmoji(e),
                  })
                }
                className="flex size-9 items-center justify-center rounded-lg hover:bg-crema/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.url || customEmojiUrl(e.id, e.animated)} alt="" className="size-6 object-contain" />
              </button>
            ))
          : unis.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onPick({ type: "unicode", text: u })}
                className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-crema/10"
              >
                {u}
              </button>
            ))}
      </div>
      {((showCustom && !customs.length) || (!showCustom && !unis.length)) && (
        <p className="px-3 pb-3 text-center text-xs text-crema/45">Nessuna emoji trovata.</p>
      )}
    </motion.div>
  );
};

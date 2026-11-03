"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { customEmojiUrl, type GuildEmoji } from "@/lib/personalizza";

const UNICODE = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
  "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨",
  "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢",
  "🤮", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "😮",
  "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓",
  "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻",
  "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "👋", "🤚", "🖐️",
  "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "👍",
  "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "💪", "🦾", "🦿", "🦵", "🦶",
  "☕", "🍵", "🧋", "🍺", "🍻", "🥂", "🍷", "🎵", "🎶", "🎤", "🎧", "🎷", "🎸", "🎹", "🎺", "🎻",
  "🥁", "🎬", "🎮", "🎲", "🧩", "🎯", "🔥", "✨", "⭐", "🌟", "💫", "⚡", "💥", "💢", "💯", "✅",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍", "💘", "💝", "💖", "💗", "💓", "💞", "💕",
];

export type EmojiPick =
  | { type: "unicode"; text: string }
  | { type: "custom"; id: string; name: string; animated?: boolean; markup: string };

/** Picker compatto: unicode + emoji del server (da site-custom-profile/emojis). */
export function EmojiPopover({
  open,
  onClose,
  onPick,
  guildEmojis,
  unicodeOnly,
  preferCustom,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (pick: EmojiPick) => void;
  guildEmojis: GuildEmoji[];
  unicodeOnly?: boolean;
  preferCustom?: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"custom" | "unicode">(preferCustom && !unicodeOnly ? "custom" : "unicode");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab(preferCustom && !unicodeOnly && guildEmojis.length ? "custom" : "unicode");
    setQ("");
  }, [open, preferCustom, unicodeOnly, guildEmojis.length]);

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

  const needle = q.trim().toLowerCase();
  const customs = useMemo(() => {
    if (unicodeOnly) return [];
    return guildEmojis.filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.id.includes(needle));
  }, [guildEmojis, needle, unicodeOnly]);
  const unis = useMemo(() => UNICODE.filter((u) => !needle || u.includes(needle)), [needle]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={root}
          role="dialog"
          aria-label="Scegli emoji"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="absolute z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-roast shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-sand/20"
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
            {tab === "custom" && !unicodeOnly
              ? customs.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    title={e.name}
                    onClick={() => {
                      onPick({
                        type: "custom",
                        id: e.id,
                        name: e.name,
                        animated: e.animated,
                        markup: `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`,
                      });
                      onClose();
                    }}
                    className="flex size-9 items-center justify-center rounded-lg hover:bg-crema/10"
                  >
                    <img src={e.url || customEmojiUrl(e.id, e.animated)} alt="" className="size-6 object-contain" />
                  </button>
                ))
              : unis.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      onPick({ type: "unicode", text: u });
                      onClose();
                    }}
                    className="flex size-9 items-center justify-center rounded-lg text-lg hover:bg-crema/10"
                  >
                    {u}
                  </button>
                ))}
          </div>
          {((tab === "custom" && !customs.length) || (tab === "unicode" && !unis.length)) && (
            <p className="px-3 pb-3 text-center text-xs text-crema/45">Nessuna emoji trovata.</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

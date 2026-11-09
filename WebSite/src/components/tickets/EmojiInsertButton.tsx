"use client";

import { useRef, useState } from "react";
import { Loader2, Smile } from "lucide-react";
import { toggleEmojiPicker, type EmojiPick, type GuildEmoji } from "@/components/ui/emoji-picker";
import { cn } from "@/lib/cn";
import { loadGuildEmojis } from "@/lib/personalizza";

/* le emoji del server si scaricano una volta sola per visita */
let guildEmojiCache: GuildEmoji[] | null = null;
let guildEmojiLoading: Promise<GuildEmoji[]> | null = null;

function getGuildEmojis(token: string | null): Promise<GuildEmoji[]> {
  if (guildEmojiCache) return Promise.resolve(guildEmojiCache);
  if (!token) return Promise.resolve([]);
  if (!guildEmojiLoading) {
    guildEmojiLoading = loadGuildEmojis(token)
      .then((list) => {
        guildEmojiCache = Array.isArray(list) ? list : [];
        return guildEmojiCache;
      })
      .catch(() => [])
      .finally(() => {
        guildEmojiLoading = null;
      });
  }
  return guildEmojiLoading;
}

/** Inserisce nel testo la stringa giusta: emoji normale così com'è, emoji del server come <:nome:id>. */
export function emojiPickText(pick: EmojiPick): string {
  return pick.type === "unicode" ? pick.text : pick.markup;
}

/** Inserisce `insert` nella posizione del cursore di una textarea (o in fondo). */
export function insertAtCaret(value: string, insert: string, el: HTMLTextAreaElement | null, max = Infinity) {
  const start = el ? (el.selectionStart ?? value.length) : value.length;
  const end = el ? (el.selectionEnd ?? start) : value.length;
  const next = (value.slice(0, start) + insert + value.slice(end)).slice(0, max);
  const caret = Math.min(next.length, start + insert.length);
  if (el) {
    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(caret, caret);
      } catch {
        /* ignore */
      }
    });
  }
  return { next, caret };
}

/**
 * Pulsante emoji per i campi di testo: apre il selettore del sito con le due schede
 * "Emoji" (normali) e "Server" (emoji custom di Discord del server Vinili & Caffè).
 */
export function EmojiInsertButton({
  token,
  onPick,
  className,
  label = "Inserisci un'emoji",
  preferAbove = true,
  children,
}: {
  token: string | null;
  onPick: (pick: EmojiPick) => void;
  className?: string;
  label?: string;
  preferAbove?: boolean;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      onMouseDown={(e) => e.preventDefault() /* la textarea resta col cursore dov'era */}
      onClick={async () => {
        const anchor = ref.current;
        if (!guildEmojiCache) setLoading(true);
        const guildEmojis = await getGuildEmojis(token);
        setLoading(false);
        toggleEmojiPicker({ anchor, guildEmojis, preferAbove, onPick });
      }}
      className={cn("rounded-full p-2.5 text-crema/55 transition hover:bg-crema/8 hover:text-crema", className)}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : <Smile className="size-5" aria-hidden />}
      {children}
    </button>
  );
}

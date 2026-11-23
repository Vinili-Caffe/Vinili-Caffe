"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MusicQuizPartyChatMsg } from "@/lib/musicQuiz";

/** quanti messaggi degli altri non sono ancora stati letti (si azzera aprendo la chat) */
export function useUnread(chat: MusicQuizPartyChatMsg[], me: string, open: boolean) {
  const [seen, setSeen] = useState(() => chat.length);
  useEffect(() => {
    if (open) setSeen(chat.length);
  }, [open, chat.length]);
  return open ? 0 : chat.slice(seen).filter((m) => m.userId !== me).length;
}

/** Pulsante tondo della chat con il numero dei messaggi nuovi. */
export function ChatButton({ unread, onClick, className }: { unread: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unread ? `Chat, ${unread} messaggi nuovi` : "Apri la chat"}
      className={cn(
        "relative grid size-14 shrink-0 place-items-center rounded-2xl bg-crema/[0.08] text-crema ring-1 ring-sand/20 backdrop-blur transition hover:bg-crema/[0.14]",
        className,
      )}
    >
      <MessageSquare className="size-5" aria-hidden />
      {unread ? (
        <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-ember px-1 text-[11px] font-bold tabular-nums text-ink">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </button>
  );
}

/** Chat della stanza: pannello a destra su computer, dal basso su telefono. */
export function ChatDrawer({
  open,
  onClose,
  chat,
  me,
  enabled,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  chat: MusicQuizPartyChatMsg[];
  me: string;
  enabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);

  /* sempre sull'ultimo messaggio */
  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, chat.length]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-ink/50 sm:bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            data-lenis-prevent
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed inset-x-2 bottom-2 top-24 z-[71] flex flex-col overflow-hidden rounded-3xl bg-roast/95 shadow-2xl ring-1 ring-sand/20 backdrop-blur sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-24 sm:w-96"
          >
            <div className="flex items-center gap-2 border-b border-sand/10 px-4 py-3">
              <MessageSquare className="size-4 text-caramel" aria-hidden />
              <h3 className="flex-1 text-sm font-bold uppercase tracking-wide text-crema">Chat della stanza</h3>
              <button type="button" onClick={onClose} className="rounded-full p-1.5 text-crema/55 hover:bg-crema/10 hover:text-crema" aria-label="Chiudi la chat">
                <X className="size-4" />
              </button>
            </div>
            <div ref={list} className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3">
              {!enabled ? (
                <p className="py-10 text-center text-sm text-crema/45">L&apos;host ha spento la chat.</p>
              ) : !chat.length ? (
                <p className="py-10 text-center text-sm text-crema/45">
                  Ancora nessun messaggio.
                  <br />
                  Saluta mentre arrivano gli altri.
                </p>
              ) : (
                chat.map((m) => {
                  const mine = m.userId === me;
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[85%] rounded-2xl px-3 py-2", mine ? "rounded-br-md bg-caramel/20" : "rounded-bl-md bg-espresso/70")}>
                        {!mine ? <p className="text-[11px] font-bold text-caramel">{m.name}</p> : null}
                        <p className="whitespace-pre-wrap break-words text-sm text-crema/90">{m.text}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {enabled ? (
              <form
                className="flex gap-2 border-t border-sand/10 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = text.trim();
                  if (!t) return;
                  setText("");
                  onSend(t);
                }}
              >
                <input
                  autoFocus
                  value={text}
                  maxLength={280}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Scrivi un messaggio…"
                  className="min-w-0 flex-1 rounded-xl bg-espresso px-3 py-2.5 text-sm text-crema outline-none ring-1 ring-sand/15 placeholder:text-crema/35 focus:ring-caramel/50"
                />
                <button
                  type="submit"
                  disabled={!text.trim()}
                  className="grid size-11 place-items-center rounded-xl bg-caramel text-ink transition hover:brightness-110 disabled:opacity-40"
                  aria-label="Invia"
                >
                  <Send className="size-4" />
                </button>
              </form>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

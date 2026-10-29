"use client";

import { useEffect, useRef, useState } from "react";
import { Hash, Loader2, Terminal, User } from "lucide-react";
import {
  loadTicketCommands,
  searchMentions,
  type CommandHit,
  type MentionHit,
} from "@/lib/tickets";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/Avatar";

export type SuggestPick =
  | { kind: "mention"; markup: string; name: string; id: string; type: MentionHit["type"] }
  | { kind: "command"; text: string };

type Trigger =
  | { kind: "user"; q: string; start: number }
  | { kind: "channel"; q: string; start: number }
  | { kind: "command"; q: string; start: number; prefix: string };

function detectTrigger(text: string, caret: number, canCommands: boolean): Trigger | null {
  const before = text.slice(0, caret);
  const lineStart = Math.max(0, before.lastIndexOf("\n") + 1);
  const line = before.slice(lineStart);

  const ch = line.match(/(^|[^#])#([^\s#]*)$/);
  if (ch) {
    const q = ch[2] || "";
    return { kind: "channel", q, start: caret - q.length - 1 };
  }
  const m = line.match(/(^|[^\w])@([^\s@]*)$/);
  if (m) {
    const q = m[2] || "";
    return { kind: "user", q, start: caret - q.length - 1 };
  }
  if (canCommands) {
    const cmd = line.match(/^([+/!])([^\s]*)$/);
    if (cmd) {
      const q = cmd[2] || "";
      return { kind: "command", q, start: lineStart, prefix: cmd[1] };
    }
  }
  return null;
}

function filterCommands(list: CommandHit[], q: string, prefix: string): CommandHit[] {
  const needle = q.toLowerCase();
  const isSlash = prefix === "/";
  const out: CommandHit[] = [];
  for (const c of list) {
    const name = String(c.name || "").toLowerCase();
    const invoke = String(c.invoke || name).toLowerCase();
    const aliases = Array.isArray(c.aliases) ? c.aliases.map((a) => String(a).toLowerCase()) : [];
    if (needle) {
      const hit =
        invoke.startsWith(needle) ||
        name.startsWith(needle) ||
        invoke.includes(needle) ||
        name.includes(needle) ||
        aliases.some((a) => a.startsWith(needle) || a.includes(needle));
      if (!hit) continue;
    }
    out.push({
      ...c,
      invoke: invoke || name,
      prefix: isSlash ? "/" : c.prefix || "+",
      kind: isSlash ? "slash" : "prefix",
    });
    if (out.length >= 12) break;
  }
  return out;
}

type Props = {
  token: string;
  ticketId: string;
  text: string;
  caret: number;
  canUseCommands: boolean;
  textarea: HTMLTextAreaElement | null;
  onPick: (pick: SuggestPick, replaceFrom: number, replaceTo: number) => void;
  onRememberName?: (type: "user" | "role" | "channel", id: string, name: string) => void;
};

/** Menu @ / # / + / come sul sito classico. */
export function ComposerSuggest({
  token,
  ticketId,
  text,
  caret,
  canUseCommands,
  textarea,
  onPick,
  onRememberName,
}: Props) {
  const [items, setItems] = useState<Array<{ key: string; label: string; hint?: string; pick: SuggestPick; icon?: "user" | "channel" | "cmd"; avatarUrl?: string }>>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<Trigger | null>(null);
  const cmdCache = useRef<{ ticketId: string; prefix: string; commands: CommandHit[]; slash: CommandHit[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const req = useRef(0);

  useEffect(() => {
    const t = detectTrigger(text, caret, canUseCommands);
    triggerRef.current = t;
    if (!t) {
      setOpen(false);
      setItems([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const id = ++req.current;
      setLoading(true);
      setOpen(true);
      void (async () => {
        try {
          if (t.kind === "user" || t.kind === "channel") {
            const hits = await searchMentions(token, ticketId, t.q, t.kind === "channel" ? "channel" : "user");
            if (req.current !== id) return;
            const mapped = hits.map((h) => ({
              key: `${h.type}:${h.id}`,
              label: h.type === "channel" ? `#${h.name}` : `@${h.name}`,
              hint: h.type === "role" ? "ruolo" : h.type === "channel" ? h.parentName || h.channelKind || "canale" : h.username || h.roleName || undefined,
              icon: (h.type === "channel" ? "channel" : "user") as "user" | "channel",
              avatarUrl: h.avatarUrl,
              pick: { kind: "mention" as const, markup: h.markup, name: h.name, id: h.id, type: h.type },
            }));
            setItems(mapped);
            setIndex(0);
            if (!mapped.length) setOpen(false);
          } else {
            let cache = cmdCache.current;
            if (!cache || cache.ticketId !== ticketId) {
              const cat = await loadTicketCommands(token, ticketId);
              cache = { ticketId, prefix: cat.prefix, commands: cat.commands, slash: cat.slashCommands };
              cmdCache.current = cache;
            }
            if (req.current !== id) return;
            const list = t.prefix === "/" ? cache.slash : cache.commands;
            const filtered = filterCommands(list, t.q, t.prefix);
            const mapped = filtered.map((c) => {
              const pref = t.prefix === "/" ? "/" : c.prefix || cache!.prefix || "+";
              const invoke = c.invoke || c.name;
              return {
                key: `${pref}${invoke}`,
                label: `${pref}${invoke}`,
                hint: c.description || c.usage || undefined,
                icon: "cmd" as const,
                pick: { kind: "command" as const, text: `${pref}${invoke} ` },
              };
            });
            setItems(mapped);
            setIndex(0);
            if (!mapped.length) setOpen(false);
          }
        } finally {
          if (req.current === id) setLoading(false);
        }
      })();
    }, 120);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, caret, canUseCommands, token, ticketId]);

  useEffect(() => {
    if (!open || !textarea) return;
    const onKey = (e: KeyboardEvent) => {
      if (!open || !items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const it = items[index];
        const tr = triggerRef.current;
        if (it && tr) apply(it.pick, tr);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    textarea.addEventListener("keydown", onKey);
    return () => textarea.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, index, textarea]);

  const apply = (pick: SuggestPick, tr: Trigger) => {
    if (pick.kind === "mention") onRememberName?.(pick.type, pick.id, pick.name);
    onPick(pick, tr.start, caret);
    setOpen(false);
    setItems([]);
  };

  if (!open) return null;

  return (
    <div
      role="listbox"
      aria-label="Suggerimenti"
      className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-full min-w-[16rem] overflow-y-auto rounded-2xl bg-roast/95 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/20 backdrop-blur-xl sm:max-w-md"
    >
      {loading && !items.length ? (
        <p className="flex items-center gap-2 px-3 py-2 text-xs text-crema/50">
          <Loader2 className="size-3.5 animate-spin" /> Carico…
        </p>
      ) : !items.length ? (
        <p className="px-3 py-2 text-xs text-crema/45">Nessun risultato</p>
      ) : (
        items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            role="option"
            aria-selected={i === index}
            onMouseDown={(e) => {
              e.preventDefault();
              const tr = triggerRef.current;
              if (tr) apply(it.pick, tr);
            }}
            onMouseEnter={() => setIndex(i)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
              i === index ? "bg-caramel/20 text-crema" : "text-crema/80 hover:bg-crema/8",
            )}
          >
            {it.icon === "user" ? (
              <Avatar src={it.avatarUrl} name={it.label} className="size-7 shrink-0 text-[0.6rem]" noPresence />
            ) : it.icon === "channel" ? (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-crema/10 text-caramel">
                <Hash className="size-3.5" />
              </span>
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-crema/10 text-caramel">
                <Terminal className="size-3.5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{it.label}</span>
              {it.hint ? <span className="block truncate text-[0.7rem] text-crema/45">{it.hint}</span> : null}
            </span>
            {it.icon === "user" ? <User className="size-3.5 shrink-0 opacity-30" /> : null}
          </button>
        ))
      )}
    </div>
  );
}

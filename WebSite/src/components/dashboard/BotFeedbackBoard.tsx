"use client";

import { useCallback, useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { useFormDraft } from "@/components/ui/form-drafts";
import { useAuth } from "@/lib/auth";
import {
  KINDS,
  MAX_LEN,
  MIN_LEN,
  STATUS,
  kindLabel,
  createBotFeedback,
  loadBotFeedback,
  type BotFeedbackItem,
  type BotFeedbackKind,
} from "@/lib/bot-feedback";
import { cn } from "@/lib/cn";
import { DiscordContent } from "@/components/discord/DiscordContent";

type BotFbDraft = { kind: BotFeedbackKind; content: string };

export function BotFeedbackBoard() {
  const { ready, token, login } = useAuth();
  const [list, setList] = useState<BotFeedbackItem[] | null>(null);
  const [form, setForm] = useState<BotFbDraft>({ kind: "suggestion", content: "" });
  const kind = form.kind;
  const text = form.content;
  const setKind = (k: BotFeedbackKind) => setForm((f) => ({ ...f, kind: k }));
  const setText = (c: string) => setForm((f) => ({ ...f, content: c }));
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const draft = useFormDraft("bot_feedback:new", form, setForm, {
    watch: true,
    debounceMs: 280,
    isEmpty: (d) => !d.content.trim(),
  });

  const refresh = useCallback(() => {
    if (!token) return;
    loadBotFeedback(token).then((r) => {
      if (!r.ok) {
        setErr(r.message);
        setList([]);
        return;
      }
      setList(r.data.items || []);
      setErr("");
    });
  }, [token]);

  useEffect(() => {
    if (ready && token) refresh();
  }, [ready, token, refresh]);

  if (ready && !token) {
    return (
      <div className="rounded-2xl bg-roast/80 p-6 text-center ring-1 ring-sand/10">
        <p className="font-display text-2xl">Feedback sul bot</p>
        <p className="mt-2 text-sm text-crema/60">Accedi per leggere e inviare idee o problemi.</p>
        <button type="button" onClick={login} className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (text.trim().length < MIN_LEN) {
      setErr(`Minimo ${MIN_LEN} caratteri.`);
      return;
    }
    setBusy(true);
    const r = await createBotFeedback(token, { kind, content: text.trim(), images: [] });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setMsg(r.data.message || "Inviato. Grazie!");
    setText("");
    draft.clear();
    refresh();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-3 rounded-2xl bg-roast/80 p-5 ring-1 ring-sand/10">
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold",
                kind === k.id ? "bg-caramel text-ink" : "bg-crema/6 text-crema/60 ring-1 ring-sand/15",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <textarea name="message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_LEN}
          rows={4}
          placeholder="Descrivi l’idea o il problema…"
          className="w-full rounded-xl bg-espresso/60 px-3 py-2 text-sm ring-1 ring-sand/15"
        />
        {err && <p className="text-sm text-ember">{err}</p>}
        {msg && <p className="text-sm text-emerald-300">{msg}</p>}
        <button type="submit" disabled={busy} className="rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">
          Invia
        </button>
      </form>

      <ul className="space-y-3">
        {(list || []).map((item) => (
          <li key={item.id} id={`vc-bot-feedback-${item.id}`} className="scroll-mt-28 rounded-2xl bg-crema/5 px-4 py-3 ring-1 ring-sand/12">
            <p className="text-xs uppercase tracking-[0.18em] text-crema/40">
              {kindLabel(item.kind)} · {STATUS[item.status]}
            </p>
            <DiscordContent text={item.content} className="mt-1 text-sm text-crema/80" />
            <p className="mt-2 text-xs text-crema/40">
              {item.authorName} · ▲ {item.upvoteCount}
            </p>
          </li>
        ))}
        {list && !list.length && <p className="text-crema/50">Nessun feedback ancora.</p>}
        {!list && <div className="h-24 animate-pulse rounded-2xl bg-crema/6" />}
      </ul>
    </div>
  );
}

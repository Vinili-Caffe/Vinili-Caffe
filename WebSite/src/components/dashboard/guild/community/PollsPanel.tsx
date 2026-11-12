"use client";

import { useEffect, useState } from "react";
import { BarChart3, Plus, RefreshCw, Smile, Square, Trash2, X } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, type Poll } from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, StatusBadge, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "../bits";
import { ChannelField, EmojiButton, EmojiGlyph, formatWhen, useCommunity } from "./shared";

const DURATIONS = [
  { value: "1", label: "1 ora" },
  { value: "4", label: "4 ore" },
  { value: "8", label: "8 ore" },
  { value: "24", label: "1 giorno" },
  { value: "72", label: "3 giorni" },
  { value: "168", label: "1 settimana" },
  { value: "336", label: "2 settimane" },
];

const emptyForm = () => ({ question: "", channelId: null as string | null, answers: [{ text: "", emoji: "" }, { text: "", emoji: "" }], hours: "24", multiselect: false });

export function PollsPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data, error } = useCommunity(guildId, token);
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void communityApi.listPolls(token, guildId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setPolls(r.data.polls);
        setListError(null);
      } else setListError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token, nonce]);

  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data) return <RowsSkeleton rows={4} />;
  const chName = (id: string) => data.pickers.textChannels.find((c) => c.id === id)?.name || "canale";
  const setAnswer = (i: number, p: Partial<{ text: string; emoji: string }>) => setForm({ ...form, answers: form.answers.map((a, j) => (j === i ? { ...a, ...p } : a)) });

  const create = async () => {
    const answers = form.answers.filter((a) => a.text.trim());
    if (!form.question.trim()) return onToast("Scrivi la domanda.", true);
    if (answers.length < 2) return onToast("Servono almeno 2 risposte.", true);
    if (!form.channelId) return onToast("Scegli il canale.", true);
    setBusy("create");
    const r = await communityApi.createPoll(token, guildId, {
      question: form.question.trim(),
      channelId: form.channelId,
      answers,
      durationHours: Number(form.hours),
      multiselect: form.multiselect,
    });
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setPolls((p) => [r.data.poll, ...(p || [])]);
    setForm({ ...emptyForm(), channelId: form.channelId });
    onToast(`Sondaggio pubblicato in #${chName(r.data.poll.channelId)}.`);
  };

  const end = async (p: Poll) => {
    setBusy(p.id);
    const r = await communityApi.endPoll(token, guildId, p.id);
    setBusy(null);
    if (!r.ok) return onToast(r.message, true);
    setPolls((list) => (list || []).map((x) => (x.id === p.id ? r.data.poll : x)));
    onToast("Sondaggio chiuso.");
  };

  const remove = async (p: Poll, alsoDiscord: boolean) => {
    setBusy(p.id);
    const r = await communityApi.deletePoll(token, guildId, p.id, alsoDiscord);
    setBusy(null);
    setConfirm(null);
    if (!r.ok) return onToast(r.message, true);
    setPolls((list) => (list || []).filter((x) => x.id !== p.id));
    onToast(alsoDiscord ? "Sondaggio eliminato anche da Discord." : "Sondaggio tolto dalla dashboard.");
  };

  return (
    <div className="space-y-4">
      <FormGroup title="Nuovo sondaggio" description="Usa i sondaggi di Discord: i membri votano direttamente nel messaggio e i risultati arrivano anche qui.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Domanda">
            <input value={form.question} maxLength={300} placeholder="es. Che evento facciamo sabato?" onChange={(e) => setForm({ ...form, question: e.target.value })} className={fieldClass} />
          </Field>
          <ChannelField label="Canale" value={form.channelId} channels={data.pickers.textChannels} onChange={(channelId) => setForm({ ...form, channelId })} />
        </div>
        <div className="mt-3">
          <span className="text-[0.8rem] font-semibold text-crema/80">Risposte ({form.answers.length}/10)</span>
          <ul className="mt-1.5 space-y-2">
            {form.answers.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <EmojiButton emojis={data.pickers.emojis} onPick={(emoji) => setAnswer(i, { emoji })} label="Emoji della risposta">
                  {a.emoji ? <EmojiGlyph value={a.emoji} /> : <Smile className="size-3.5" />}
                </EmojiButton>
                <input value={a.text} maxLength={55} placeholder={`Risposta ${i + 1}`} onChange={(e) => setAnswer(i, { text: e.target.value })} className={cn(fieldClass, "mt-0 py-1.5")} />
                {form.answers.length > 2 ? (
                  <button type="button" aria-label="Togli la risposta" className={miniBtn} onClick={() => setForm({ ...form, answers: form.answers.filter((_, j) => j !== i) })}>
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {form.answers.length < 10 ? (
            <button type="button" className={cn(miniBtn, "mt-2")} onClick={() => setForm({ ...form, answers: [...form.answers, { text: "", emoji: "" }] })}>
              <Plus className="size-3.5" /> Aggiungi risposta
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="Durata">
              <Select value={form.hours} onChange={(hours) => setForm({ ...form, hours })} options={DURATIONS} className="mt-1.5 h-11 rounded-lg" />
            </Field>
          </div>
          <div className="flex h-11 min-w-56 flex-1 items-center justify-between gap-3 rounded-lg bg-espresso/45 px-3 ring-1 ring-sand/10">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-crema">Più risposte</span>
              <span className="block truncate text-xs text-crema/55">Ogni membro può votarne più di una.</span>
            </span>
            <Toggle size="sm" checked={form.multiselect} onChange={(multiselect) => setForm({ ...form, multiselect })} label="Più risposte" />
          </div>
          <button type="button" className={primaryMini + " h-11"} disabled={!!busy} onClick={() => void create()}>
            <Plus className="size-3.5" /> Pubblica sondaggio
          </button>
        </div>
      </FormGroup>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-crema/55">Sondaggi</p>
        <button type="button" className={miniBtn} onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="size-3.5" /> Aggiorna risultati
        </button>
      </div>
      {listError && !polls ? <Notice error>{listError}</Notice> : null}
      {!polls && !listError ? <RowsSkeleton rows={3} /> : null}
      {polls ? (
        polls.length ? (
          <ul className="space-y-3">
            {polls.map((p) => {
              const total = p.answers.reduce((s, a) => s + (a.votes || 0), 0);
              const max = Math.max(0, ...p.answers.map((a) => a.votes || 0));
              return (
                <li key={p.id} className="rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-crema">{p.question}</p>
                      <p className="text-xs text-crema/55">
                        #{chName(p.channelId)} · {total} {total === 1 ? "voto" : "voti"} · {p.ended ? "chiuso" : `chiude ${formatWhen(p.endsAt)}`}
                        {p.multiselect ? " · più risposte" : ""}
                      </p>
                    </div>
                    {p.deleted ? <StatusBadge>Cancellato su Discord</StatusBadge> : p.ended ? <StatusBadge tone="ok">Chiuso</StatusBadge> : <StatusBadge tone="accent">Aperto</StatusBadge>}
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {p.answers.map((a) => {
                      const pct = total ? Math.round(((a.votes || 0) / total) * 100) : 0;
                      const top = p.ended && max > 0 && a.votes === max;
                      return (
                        <li key={a.answerId} className="relative overflow-hidden rounded-lg bg-crema/[0.04] ring-1 ring-sand/10">
                          <span className={cn("absolute inset-y-0 left-0", top ? "bg-caramel/30" : "bg-crema/[0.08]")} style={{ width: `${pct}%` }} aria-hidden />
                          <span className="relative flex items-center gap-2 px-3 py-1.5 text-sm">
                            {a.emoji ? <EmojiGlyph value={a.emoji} /> : null}
                            <span className={cn("min-w-0 flex-1 truncate", top ? "font-semibold text-crema" : "text-crema/85")}>{a.text}</span>
                            <span className="tabular-nums text-crema/70">
                              {a.votes || 0} · {pct}%
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!p.ended ? (
                      <button type="button" className={miniBtn} disabled={busy === p.id} onClick={() => void end(p)}>
                        <Square className="size-3.5" /> Chiudi ora
                      </button>
                    ) : null}
                    {confirm === p.id ? (
                      <>
                        <button type="button" className={dangerBtn} disabled={busy === p.id} onClick={() => void remove(p, true)}>
                          <Trash2 className="size-3.5" /> Elimina anche da Discord
                        </button>
                        <button type="button" className={miniBtn} disabled={busy === p.id} onClick={() => void remove(p, false)}>
                          Solo dalla dashboard
                        </button>
                        <button type="button" className={miniBtn} onClick={() => setConfirm(null)}>
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button type="button" className={dangerBtn} onClick={() => setConfirm(p.id)}>
                        <Trash2 className="size-3.5" /> Elimina
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={BarChart3} title="Nessun sondaggio" text="Crea il primo qui sopra: i risultati li vedi qui e su Discord." />
        )
      ) : null}
    </div>
  );
}

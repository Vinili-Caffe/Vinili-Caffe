"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchEventoSmistamento,
  submitEventoSmistamento,
  type EventoFactionMeta,
  type EventoSortingQuestion,
} from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui/toast";

/** Quiz smistamento Repubblica / Separatisti (HS / pubblico quando sbloccato). */
export function SmistamentoQuiz() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<EventoSortingQuestion[]>([]);
  const [factions, setFactions] = useState<EventoFactionMeta[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<EventoFactionMeta | null>(null);
  const [gate, setGate] = useState("");

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoSmistamento(token);
    if (!st.ok) {
      setGate(st.message || "Smistamento non disponibile.");
      setLoading(false);
      return;
    }
    setGate("");
    setFactions(st.factions || []);
    setQuestions(st.questions || []);
    if (st.alreadySorted && st.factionMeta) {
      setDone(st.factionMeta);
    }
    setLoading(false);
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function finish() {
    if (!token || submitting) return;
    const payload = questions.map((q) => ({
      questionId: q.id,
      choiceId: answers[q.id],
    }));
    if (payload.some((p) => !p.choiceId)) {
      showToast("Rispondi a tutte le domande.", true);
      return;
    }
    setSubmitting(true);
    const out = await submitEventoSmistamento(token, payload);
    setSubmitting(false);
    if (!out.ok) {
      showToast(out.message || "Smistamento non riuscito.", true);
      if (out.factionMeta) setDone(out.factionMeta);
      return;
    }
    setDone(out.factionMeta || null);
    showToast(`Sei stato smistato in ${out.factionMeta?.label || out.factionId}.`);
  }

  if (loading) {
    return <div className="mx-auto h-40 max-w-lg animate-pulse rounded-2xl bg-crema/8 px-6" aria-busy="true" />;
  }

  if (gate) {
    return <p className="mx-auto max-w-lg px-6 pb-16 text-center text-sm text-crema/65">{gate}</p>;
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-20 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f0e6c8]/70">Fazione</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-[#f0e6c8]">{done.label}</h2>
        <p className="mt-3 text-sm text-crema/70">{done.motto}</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-20 text-center">
        <p className="mb-4 text-sm text-crema/70">Accedi con Discord per fare il quiz di smistamento.</p>
        <button
          type="button"
          onClick={login}
          className="inline-flex rounded-full bg-[#5865f2] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Accedi
        </button>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <ul className="mx-auto mb-10 grid max-w-lg gap-3 px-6 sm:grid-cols-2">
        {factions.map((f) => (
          <li key={f.id} className="rounded-2xl bg-black/30 p-4 ring-1 ring-[#f0e6c8]/15">
            <p className="font-display text-xl font-semibold text-[#f0e6c8]">{f.label}</p>
            <p className="mt-1.5 text-sm text-crema/65">{f.motto}</p>
          </li>
        ))}
      </ul>
    );
  }

  const q = questions[idx]!;
  const picked = answers[q.id];
  const last = idx >= questions.length - 1;

  return (
    <div className="mx-auto max-w-xl px-6 pb-24">
      <p className="mb-3 text-center text-xs text-crema/50">
        Domanda {idx + 1} / {questions.length}
      </p>
      <div className="rounded-2xl bg-gradient-to-br from-[#0b1220]/95 to-[#1a140c]/95 p-5 ring-1 ring-[#f0e6c8]/20">
        <h2 className="font-display text-xl font-semibold text-crema sm:text-2xl">{q.text}</h2>
        <ul className="mt-5 space-y-2">
          {q.choices.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: c.id }))}
                className={cn(
                  "w-full rounded-xl px-4 py-3 text-left text-sm ring-1 transition",
                  picked === c.id
                    ? "bg-[#f0e6c8]/15 text-[#f0e6c8] ring-[#f0e6c8]/50"
                    : "bg-black/25 text-crema/80 ring-sand/15 hover:ring-[#f0e6c8]/30",
                )}
              >
                {c.text}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="rounded-full px-4 py-2 text-sm text-crema/70 ring-1 ring-sand/20 disabled:opacity-30"
          >
            Indietro
          </button>
          {last ? (
            <button
              type="button"
              disabled={!picked || submitting}
              onClick={() => void finish()}
              className="rounded-full bg-caramel/95 px-5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
            >
              {submitting ? "…" : "Scopri la fazione"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!picked}
              onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
              className="rounded-full bg-caramel/95 px-5 py-2 text-sm font-semibold text-ink disabled:opacity-40"
            >
              Avanti
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

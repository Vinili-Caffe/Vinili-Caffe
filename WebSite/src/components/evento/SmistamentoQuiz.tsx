"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield } from "lucide-react";
import {
  fetchEventoSmistamento,
  submitEventoSmistamento,
  type EventoFactionMeta,
  type EventoSortingQuestion,
} from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui/toast";
import {
  EventoBtn,
  EventoKicker,
  EventoLoginGate,
  EventoPanel,
  EventoSkeleton,
  EventoTitle,
} from "@/components/evento/EventoUi";
import { AccademiaArena, makeGateTargets } from "@/components/evento/AccademiaArena";

/** Dopo la 4ª domanda inseriamo la prova Accademia (nessun peso sulla fazione). */
const ACADEMY_AFTER_Q = 4;

type Step =
  | { kind: "question"; qIndex: number }
  | { kind: "academy" };

/** Quiz smistamento Repubblica / Separatisti. */
export function SmistamentoQuiz({ onSorted }: { onSorted?: () => void } = {}) {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<EventoSortingQuestion[]>([]);
  const [factions, setFactions] = useState<EventoFactionMeta[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [academyDone, setAcademyDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<EventoFactionMeta | null>(null);
  const [gate, setGate] = useState("");
  const gatePool = useMemo(() => makeGateTargets(15), []);

  const steps: Step[] = useMemo(() => {
    if (!questions.length) return [];
    const out: Step[] = [];
    questions.forEach((_, qIndex) => {
      out.push({ kind: "question", qIndex });
      if (qIndex + 1 === ACADEMY_AFTER_Q) out.push({ kind: "academy" });
    });
    return out;
  }, [questions]);

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
    if (!academyDone) {
      showToast("Completa anche la prova di riflessi.", true);
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
    window.setTimeout(() => onSorted?.(), 900);
  }

  if (loading) return <EventoSkeleton className="mx-auto max-w-xl px-6" />;
  if (gate) return <p className="mx-auto max-w-lg px-6 text-center text-sm text-crema/55">{gate}</p>;

  if (done) {
    const sith = /separat/i.test(done.label || "") || /separat/i.test(done.id || "");
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoPanel className="text-center" glow={sith ? "red" : "blue"}>
          <Shield className={cn("mx-auto size-10", sith ? "text-rose-400" : "text-sky-400")} aria-hidden />
          <EventoKicker>La tua fazione</EventoKicker>
          <EventoTitle>{done.label}</EventoTitle>
          <p className="mt-3 text-sm leading-relaxed text-crema/70">{done.motto}</p>
        </EventoPanel>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate label="Accedi per il quiz di smistamento: Repubblica o Separatisti." onLogin={login} />
      </div>
    );
  }

  if (!questions.length) {
    return (
      <ul className="mx-auto grid max-w-2xl gap-4 px-6 sm:grid-cols-2">
        {factions.map((f) => {
          const sith = /separat/i.test(f.label || "") || /separat/i.test(f.id || "");
          return (
            <li key={f.id}>
              <EventoPanel glow={sith ? "red" : "blue"}>
                <EventoKicker>{sith ? "CSI" : "Repubblica"}</EventoKicker>
                <p className="mt-1 font-display text-2xl text-crema">{f.label}</p>
                <p className="mt-2 text-sm text-crema/65">{f.motto}</p>
              </EventoPanel>
            </li>
          );
        })}
      </ul>
    );
  }

  const step = steps[stepIdx] || steps[0]!;
  const totalSteps = steps.length;
  const progress = ((stepIdx + 0.2) / totalSteps) * 100;

  if (step.kind === "academy") {
    return (
      <div className="mx-auto max-w-xl px-6">
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-[0.7rem] uppercase tracking-[0.22em] text-crema/45">
            <span>
              Prova {stepIdx + 1} / {totalSteps}
            </span>
            <span>Riflessi</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#c9a227] to-[#2ea8ff] transition-[width] duration-300"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        <EventoPanel glow="gold" className="!overflow-hidden !p-0">
          <div className="border-b border-sand/15 px-4 py-3 sm:px-5">
            <EventoKicker>Prova di riflessi</EventoKicker>
          </div>
          {academyDone ? (
            <div className="px-4 py-8 text-center sm:px-5">
              <p className="text-sm text-crema/70">Prova completata.</p>
              <EventoBtn className="mt-4" onClick={() => setStepIdx((i) => Math.min(totalSteps - 1, i + 1))}>
                Continua le domande
              </EventoBtn>
            </div>
          ) : (
            <AccademiaArena
              pool={gatePool}
              sessionSec={25}
              hint="Mira e spara agli obiettivi che compariranno sul campo."
              startLabel="Inizia la prova"
              onComplete={() => setAcademyDone(true)}
            />
          )}
        </EventoPanel>

        <div className="mt-4 flex justify-start">
          <EventoBtn variant="ghost" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => Math.max(0, i - 1))}>
            Indietro
          </EventoBtn>
        </div>
      </div>
    );
  }

  const q = questions[step.qIndex]!;
  const picked = answers[q.id];
  const lastQuestion = step.qIndex >= questions.length - 1;
  const lastStep = stepIdx >= totalSteps - 1;

  return (
    <div className="mx-auto max-w-xl px-6">
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-[0.7rem] uppercase tracking-[0.22em] text-crema/45">
          <span>
            Domanda {step.qIndex + 1} / {questions.length}
          </span>
          <span>{Math.round((stepIdx / totalSteps) * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#c9a227] to-[#2ea8ff] transition-[width] duration-300"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>

      <EventoPanel glow="gold">
        <h2 className="font-display text-xl font-semibold leading-snug text-crema sm:text-2xl">{q.text}</h2>
        <ul className="mt-5 space-y-2.5">
          {q.choices.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: c.id }))}
                className={cn(
                  "w-full rounded-xl px-4 py-3.5 text-left text-sm ring-1 transition",
                  picked === c.id
                    ? "bg-[#c9a227]/20 text-crema ring-[#c9a227]/55"
                    : "bg-black/30 text-crema/80 ring-sand/12 hover:ring-[#2ea8ff]/35",
                )}
              >
                {c.text}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-between gap-3">
          <EventoBtn variant="ghost" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => Math.max(0, i - 1))}>
            Indietro
          </EventoBtn>
          {lastStep && lastQuestion ? (
            <EventoBtn disabled={!picked || !academyDone || submitting} onClick={() => void finish()}>
              {submitting ? "…" : "Scopri la fazione"}
            </EventoBtn>
          ) : (
            <EventoBtn disabled={!picked} onClick={() => setStepIdx((i) => Math.min(totalSteps - 1, i + 1))}>
              Avanti
            </EventoBtn>
          )}
        </div>
      </EventoPanel>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, Gift, Handshake, Loader2, PenLine, Send, Shield, Sparkles } from "lucide-react";
import { AuthGateCard } from "@/components/AuthGateCard";
import { Reveal } from "@/components/Reveal";
import { RichText } from "@/components/RichText";
import { SubjectWorkflowChats } from "@/components/staff/SubjectWorkflowChats";
import { Radio } from "@/components/ui";
import { clearDraft, loadDraft, saveDraft, useFormDraft } from "@/components/ui/form-drafts";
import { useAuth } from "@/lib/auth";
import {
  REQUIREMENTS,
  ROLE_INTROS,
  ROLES,
  dateTimeIt,
  encodeMulti,
  loadEligibility,
  submitApplication,
  type Eligibility,
  type Question,
  type RoleType,
} from "@/lib/applications";
import { cn } from "@/lib/cn";

const STEP = 4;
const draftName = (t: RoleType) => `candidature:${t}`;
type Answers = Record<string, string | string[]>;

/** Migra le bozze beta (`vc_beta_cand_draft_*`) alle chiavi canoniche. */
function migrateCandDraft(t: RoleType) {
  try {
    const legacyKey = `vc_beta_cand_draft_${t}`;
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return;
    if (loadDraft<Answers>(draftName(t)) == null) {
      const data = JSON.parse(raw) as Answers;
      if (data && typeof data === "object") saveDraft(draftName(t), data, { notify: false });
    }
    localStorage.removeItem(legacyKey);
  } catch {
    /* ignore */
  }
}

/** Barra di avanzamento a chicchi di caffè. */
function Beans({ total, done }: { total: number; done: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Passo ${done} di ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-3 w-2 rounded-[50%] transition-colors duration-500", i < done ? "bg-caramel shadow-[0_0_8px_rgba(217,154,91,0.6)]" : "bg-crema/12")} />
      ))}
    </div>
  );
}

/** Scossa breve per i campi da compilare (rifatta a ogni tentativo grazie alla key). */
function Shake({ on, round, children }: { on: boolean; round: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={on ? `shake-${round}` : "ok"}
      initial={false}
      animate={on && !reduce ? { x: [0, -9, 9, -6, 6, -3, 3, 0] } : { x: 0 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

function Field({
  q,
  n,
  value,
  set,
  readOnly,
  invalid,
}: {
  q: Question;
  n: number;
  value: string | string[] | undefined;
  set: (v: string | string[]) => void;
  readOnly?: boolean;
  invalid?: boolean;
}) {
  const id = `cand-${q.id}`;
  const box = cn(
    "w-full rounded-xl border bg-espresso/75 px-3.5 py-2.5 text-sm text-crema outline-none transition-[border-color,box-shadow] placeholder:text-crema/30 focus:border-caramel/45 focus:ring-2 focus:ring-caramel/35",
    invalid ? "border-[#e2836f]/80 ring-2 ring-[#e2836f]/25 light:border-[#a83a2c]/70" : "border-sand/15",
  );
  const group = invalid ? "border-[#e2836f]/80 ring-2 ring-[#e2836f]/25 light:border-[#a83a2c]/70" : "border-sand/12";

  const head = (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-caramel/15 font-mono text-[0.65rem] font-bold lining-nums text-caramel ring-1 ring-caramel/25">
          {n}
        </span>
        <span className="text-sm font-semibold leading-snug text-crema/90">{q.text}</span>
      </div>
      {q.hint ? <p className="pl-7 text-xs leading-relaxed text-crema/45">{q.hint}</p> : null}
    </div>
  );

  if (q.kind === "choice") {
    const cur = typeof value === "string" ? value : "";
    return (
      <fieldset className="space-y-2.5">
        <legend className="w-full">{head}</legend>
        <div className={cn("space-y-1 rounded-xl border bg-espresso/55 p-2 transition-[border-color,box-shadow]", group)} role="radiogroup" aria-label={q.text}>
          {q.options!.map((o) => {
            const on = cur === o.value;
            return (
              <label
                key={o.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors",
                  on ? "bg-caramel/15 text-crema ring-1 ring-caramel/30" : "text-crema/80 hover:bg-crema/[0.04]",
                )}
              >
                <Radio checked={on} name={id} onChange={() => set(o.value)} />
                <span className="leading-snug">{o.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (q.kind === "multi_choice") {
    const cur = Array.isArray(value) ? value : [];
    return (
      <fieldset className="space-y-2.5">
        <legend className="w-full">{head}</legend>
        <div className={cn("flex flex-wrap gap-2 rounded-xl border bg-espresso/55 p-3 transition-[border-color,box-shadow]", group)} role="group" aria-label={q.text}>
          {q.options!.map((o) => {
            const on = cur.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => set(on ? cur.filter((x) => x !== o.value) : [...cur, o.value])}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ring-1 transition-colors",
                  on
                    ? "bg-caramel/20 text-crema ring-caramel/45"
                    : "bg-espresso/80 text-crema/75 ring-sand/20 hover:ring-sand/40",
                )}
              >
                {on ? <Check className="size-3.5 text-caramel" /> : null}
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <label htmlFor={id} className="block space-y-2.5">
      {head}
      {q.kind === "short" ? (
        <input
          id={id}
          value={(value as string) ?? ""}
          readOnly={readOnly}
          onChange={(e) => set(e.target.value)}
          placeholder={q.placeholder}
          className={cn(box, readOnly && "cursor-not-allowed font-mono text-crema/55 opacity-90")}
        />
      ) : (
        <textarea
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value)}
          rows={4}
          placeholder={q.placeholder || "Scrivi qui la tua risposta…"}
          className={cn(box, "min-h-[6rem] resize-y leading-relaxed")}
        />
      )}
    </label>
  );
}

export function CandidatureBoard() {
  const { ready, token, user, login } = useAuth();
  const [type, setType] = useState<RoleType>("helper");
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [eligErr, setEligErr] = useState<{ text: string; disabled?: boolean } | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ message: string; until?: number } | null>(null);

  const role = ROLES.find((r) => r.id === type)!;
  const questions = role.questions;
  const steps = Math.ceil(questions.length / STEP);
  const review = step === steps;
  const me = elig?.[type];

  useEffect(() => {
    if (!token) return;
    loadEligibility(token).then((r) => {
      if (r.ok) {
        setElig(r.data);
        // parti dal primo ruolo a cui ci si può davvero candidare
        if (!r.data.helper.eligible) {
          if (r.data.partnermanager.eligible) setType("partnermanager");
          else if (r.data.blogger?.eligible) setType("blogger");
        }
      } else setEligErr({ text: r.message, disabled: r.disabled });
    });
  }, [token]);

  const draft = useFormDraft(draftName(type), answers, setAnswers, {
    watch: true,
    debounceMs: 280,
    isEmpty: (a) =>
      Object.keys(a)
        .filter((k) => k !== "id_discord")
        .every((k) => {
          const v = a[k];
          return Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
        }),
  });

  useEffect(() => {
    migrateCandDraft(type);
    setStep(0);
    setErr("");
  }, [type]);

  useEffect(() => {
    if (!draft.restored || !user) return;
    setAnswers((a) => (a.id_discord === user.id ? a : { ...a, id_discord: user.id }));
  }, [draft.restored, user, type]);

  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [shakeRound, setShakeRound] = useState(0);
  const set = (id: string, v: string | string[]) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    // appena si compila, via il bordo rosso
    setMissing((m) => {
      if (!m.has(id)) return m;
      const next = new Set(m);
      next.delete(id);
      return next;
    });
  };
  /** Segna i campi vuoti (bordo rosso + scossa) e porta al primo. */
  const flagMissing = (ids: string[]) => {
    setMissing(new Set(ids));
    setShakeRound((r) => r + 1);
    setErr("");
    window.setTimeout(() => {
      document.getElementById(`field-${ids[0]}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
  };

  const filled = (q: Question) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : !!String(v ?? "").trim();
  };
  const page = questions.slice(step * STEP, step * STEP + STEP);
  const firstEmpty = useMemo(() => questions.findIndex((q) => !filled(q)), [questions, answers]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    const miss = page.filter((q) => !filled(q)).map((q) => q.id);
    if (miss.length) return flagMissing(miss);
    setErr("");
    setMissing(new Set());
    setStep((s) => s + 1);
    window.scrollTo({ top: (document.getElementById("modulo")?.offsetTop ?? 0) - 100, behavior: "smooth" });
  };

  const submit = async () => {
    if (!token) return login();
    if (firstEmpty >= 0) {
      setStep(Math.floor(firstEmpty / STEP));
      return flagMissing(questions.filter((q) => !filled(q)).map((q) => q.id));
    }
    setBusy(true);
    setErr("");
    const payload: Record<string, string> = {};
    for (const q of questions) {
      const v = answers[q.id];
      payload[q.id] = Array.isArray(v) ? encodeMulti(v) : String(v ?? "").trim();
    }
    const r = await submitApplication(token, type, payload);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    draft.clear();
    clearDraft(draftName(type));
    setDone({ message: r.data.message, until: r.data.cooldown_until_ms });
  };

  const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : v || "—");

  return (
    <div className="mx-auto max-w-5xl space-y-16 px-6 pb-20">
      {token ? <SubjectWorkflowChats token={token} queue="candidature" /> : null}

      {/* requisiti ed esito */}
      <Reveal>
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-7 ring-1 ring-sand/12">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Requisiti</p>
            <p className="mt-3 text-crema/70">Per candidarti è necessario soddisfare i seguenti requisiti:</p>
            <ul className="mt-4 space-y-2.5">
              {REQUIREMENTS.map((r) => (
                <li key={r} className="flex gap-2.5 text-crema/80">
                  <Check className="mt-1 size-4 shrink-0 text-caramel" />
                  <span>
                    <RichText text={r} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl bg-gradient-to-br from-mocha/70 to-roast p-7 ring-1 ring-sand/15">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Esito</p>
              <p className="mt-3 leading-relaxed text-crema/75">
                L’esito della tua candidatura sarà disponibile direttamente sul server. In caso di mancata comunicazione entro 15 giorni, potrai ritentare la candidatura.
              </p>
            </div>
            <div className="flex gap-3 rounded-2xl bg-caramel/10 p-5 text-sm leading-relaxed text-crema/80 ring-1 ring-caramel/25">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-caramel" />
              <p>
                <strong className="text-crema">Importante:</strong> non aprire ticket e non pingare lo staff per chiedere l’esito della candidatura.
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* scelta del ruolo: un grembiule per ruolo */}
      <section>
        <Reveal className="mb-8 text-center">
          <p className="font-script text-4xl text-caramel">Entra nello staff</p>
          <h2 className="mt-1 font-display text-4xl font-semibold sm:text-5xl">Per quale ruolo ti candidi?</h2>
        </Reveal>
        <div role="radiogroup" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => {
            const on = r.id === type;
            const e = elig?.[r.id];
            const Icon = r.id === "helper" ? Shield : r.id === "blogger" ? PenLine : Handshake;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => (setType(r.id), setDone(null))}
                className={cn(
                  "relative overflow-hidden rounded-3xl p-6 text-left ring-1 transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out",
                  on ? "bg-gradient-to-b from-caramel/15 to-roast ring-caramel/60 shadow-[0_24px_60px_-30px_rgba(212,145,80,0.6)]" : "bg-roast/70 ring-sand/12 hover:ring-sand/30",
                )}
              >
                {/* il cartellino sul grembiule */}
                <span className="absolute right-5 top-5 rotate-3 rounded-md bg-paper px-2.5 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-wider text-ink shadow">{r.questions.length} domande</span>
                <span className={cn("flex size-12 items-center justify-center rounded-2xl ring-1", on ? "bg-caramel text-ink ring-caramel" : "bg-crema/6 text-sand ring-sand/20")}>
                  <Icon className="size-6" />
                </span>
                <span className="mt-5 block font-display text-3xl font-semibold">{r.label}</span>
                {e && (
                  <span className={cn("mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", e.eligible ? "bg-[#3f7d4e]/20 text-[#9fd3ac] light:text-[#2f6b3f]" : "bg-crema/8 text-crema/60")}>
                    {e.eligible ? <CheckCircle2 className="size-3.5" /> : e.code === "cooldown" ? <Clock className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                    {e.eligible ? "Puoi candidarti" : e.code === "cooldown" && e.cooldown_until_ms ? `Di nuovo dal ${dateTimeIt(e.cooldown_until_ms)}` : e.message || "Non disponibile"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* intro ruolo: Nitro staff del mese (Helper) / catalogo shop (PM) */}
      {ROLE_INTROS[type] ? (
        <Reveal>
          <aside
            className={cn(
              "rounded-3xl p-6 ring-1 sm:p-7",
              type === "partnermanager"
                ? "bg-gradient-to-br from-mocha/80 via-roast to-roast ring-sand/15"
                : "bg-gradient-to-b from-caramel/[0.12] via-roast/90 to-roast ring-caramel/25",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl ring-1",
                  type === "partnermanager" ? "bg-crema/8 text-sand ring-sand/20" : "bg-caramel/15 text-ember ring-caramel/30",
                )}
              >
                {type === "partnermanager" ? <Gift className="size-4" /> : <Sparkles className="size-4" />}
              </span>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">{ROLE_INTROS[type]!.title}</p>
            </div>

            {ROLE_INTROS[type]!.body ? (
              <p className="mt-4 text-sm leading-relaxed text-crema/75">{ROLE_INTROS[type]!.body}</p>
            ) : null}

            {ROLE_INTROS[type]!.highlight ? (
              <p className="mt-4 flex gap-2.5 rounded-2xl bg-caramel/12 px-4 py-3 text-sm font-medium leading-relaxed text-crema ring-1 ring-caramel/30">
                <Gift className="mt-0.5 size-4 shrink-0 text-ember" aria-hidden />
                <span>{ROLE_INTROS[type]!.highlight}</span>
              </p>
            ) : null}

            {ROLE_INTROS[type]!.tiers?.length ? (
              <ul className="mt-5 space-y-2">
                {ROLE_INTROS[type]!.tiers!.map((tier) => (
                  <li
                    key={tier.points}
                    className="flex items-center gap-3 rounded-xl bg-espresso/50 px-3.5 py-2.5 ring-1 ring-sand/12"
                  >
                    <span className="shrink-0 rounded-md bg-caramel/15 px-2 py-1 font-mono text-[0.7rem] font-bold tabular-nums text-ember ring-1 ring-caramel/25">
                      {tier.points}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-crema/85">
                      <span className="text-crema/45">partner → </span>
                      {tier.reward}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </aside>
        </Reveal>
      ) : null}

      {/* modulo */}
      <section id="modulo" className="scroll-mt-28">
        {!ready ? (
          <div className="h-64 animate-pulse rounded-3xl bg-crema/[0.04]" />
        ) : !token ? (
          <AuthGateCard title="Accedi per candidarti" text="Accedi con Discord per compilare il modulo." />
        ) : eligErr ? (
          <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-10 text-center ring-1 ring-sand/12">
            <p className="font-display text-3xl font-semibold">{eligErr.disabled ? "Candidature chiuse" : "Non riesco a verificare il tuo account"}</p>
            <p className="mt-2 text-crema/60">{eligErr.text}</p>
          </div>
        ) : !elig ? (
          <div className="flex h-64 items-center justify-center rounded-3xl bg-crema/[0.04] text-crema/50">
            <Loader2 className="mr-2 size-5 animate-spin" /> Controllo se puoi candidarti…
          </div>
        ) : done ? (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl bg-gradient-to-b from-[#3f7d4e]/20 to-roast p-10 text-center ring-1 ring-[#3f7d4e]/40">
            <CheckCircle2 className="mx-auto size-12 text-[#9fd3ac] light:text-[#2f6b3f]" />
            <p className="mt-4 font-display text-3xl font-semibold">Candidatura inviata con successo!</p>
            <p className="mx-auto mt-3 max-w-lg whitespace-pre-line leading-relaxed text-crema/70">
              Il nostro staff esaminerà attentamente la tua candidatura. Se non ricevi risposta entro 15 giorni, potrai riprovare la candidatura.
            </p>
          </motion.div>
        ) : !me?.eligible ? (
          <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-10 text-center ring-1 ring-sand/12">
            <p className="font-display text-3xl font-semibold">Per ora non puoi candidarti come {role.label}</p>
            <p className="mt-2 text-crema/60">{me?.code === "cooldown" && me.cooldown_until_ms ? `Hai già inviato una candidatura: potrai riprovare dal ${dateTimeIt(me.cooldown_until_ms)}.` : me?.message || "Le candidature per questo ruolo non sono ancora aperte."}</p>
          </div>
        ) : (
          <form
            className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12 sm:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (review) void submit();
              else next();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sand/10 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Modulo · {role.label}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{review ? "Riepilogo" : `Parte ${step + 1} di ${steps}`}</p>
              </div>
              <Beans total={steps + 1} done={step + 1} />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${type}-${step}`}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22 }}
                className="mt-6 space-y-6"
              >
                {review ? (
                  <dl className="space-y-3">
                    {questions.map((q, i) => (
                      <div key={q.id} className="rounded-xl border border-sand/10 bg-espresso/40 px-4 py-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-crema/45">
                          {i + 1}. {q.text}
                        </dt>
                        <dd className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-crema/90">{show(answers[q.id])}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  page.map((q, i) => (
                    <div key={q.id} id={`field-${q.id}`} className="scroll-mt-28">
                      <Shake on={missing.has(q.id)} round={shakeRound}>
                        <Field
                          q={q}
                          n={step * STEP + i + 1}
                          value={answers[q.id]}
                          set={(v) => set(q.id, v)}
                          readOnly={q.id === "id_discord"}
                          invalid={missing.has(q.id)}
                        />
                      </Shake>
                    </div>
                  ))
                )}
              </motion.div>
            </AnimatePresence>

            {err && <p className="mt-5 rounded-xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c]" role="alert">{err}</p>}

            <div className="mt-7 flex items-center justify-between gap-3 border-t border-sand/10 pt-5">
              <button
                type="button"
                onClick={() => (setErr(""), setStep((s) => Math.max(0, s - 1)))}
                disabled={step === 0}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-crema/70 hover:bg-crema/8 disabled:invisible"
              >
                <ArrowLeft className="size-4" /> Indietro
              </button>
              {review ? (
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-semibold text-ink shadow-[0_12px_30px_-10px_rgba(232,160,90,0.7)] transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {busy ? "Invio in corso…" : "Invia candidatura"}
                </button>
              ) : (
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full bg-crema px-6 py-3 font-semibold text-espresso transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
                >
                  {step === steps - 1 ? "Rileggi" : "Avanti"} <ArrowRight className="size-4" />
                </button>
              )}
            </div>
            <p className="mt-4 text-center text-xs text-crema/40">Le risposte restano salvate in questo browser finché non invii.</p>
          </form>
        )}
      </section>
    </div>
  );
}

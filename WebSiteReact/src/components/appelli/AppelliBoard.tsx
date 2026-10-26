"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Check, CheckCircle2, Clock, Info, Loader2, MicOff, Send, ShieldBan } from "lucide-react";
import { AuthGateCard } from "@/components/AuthGateCard";
import { useFormDraft } from "@/components/ui/form-drafts";
import { useAuth } from "@/lib/auth";
import { APPEAL_MAX, dateTimeIt, loadAppealState, submitAppeal, type AppealState, type AppealType } from "@/lib/applications";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";

type AppealDraft = { reason: string; apology: string; extra: string; rules: boolean };

const TEXT: Record<AppealType, { label: string; icon: React.ReactNode; why: string; rules: string; info: string[] }> = {
  unban: {
    label: "Unban",
    icon: <ShieldBan className="size-4" />,
    why: "Come mai sei stato bannato?",
    rules: "Confermo di aver letto e compreso le regole del server e mi impegno a rispettarle. Sono consapevole che qualsiasi ulteriore violazione comporterà un ban permanente.",
    info: [
      "Riceverai risposta entro 15 giorni tramite i DM dal bot",
      "Assicurati di avere i DM attivi per ricevere la notifica",
      "Le richieste false o spam comporteranno un ban permanente",
      "Puoi inviare una nuova richiesta ogni 15 giorni (cooldown)",
    ],
  },
  unmute: {
    label: "Unmute",
    icon: <MicOff className="size-4" />,
    why: "Come mai sei stato mutato?",
    rules: "Confermo di aver letto e compreso le regole del server e mi impegno a rispettarle. Sono consapevole che qualsiasi ulteriore violazione può comportare un mute più lungo o un ban.",
    info: [
      "Riceverai risposta entro 15 giorni tramite i DM dal bot",
      "Assicurati di avere i DM attivi per ricevere la notifica",
      "Le richieste false o spam possono comportare un mute più lungo o un ban",
      "Puoi inviare una nuova richiesta ogni 15 giorni (cooldown)",
    ],
  },
};

function Field({ label, value, set, optional, rows = 4 }: { label: string; value: string; set: (v: string) => void; optional?: boolean; rows?: number }) {
  return (
    <label className="block">
      <span className="font-semibold">
        {label} {optional && <span className="font-normal text-crema/45">(opzionale)</span>}
      </span>
      <textarea
        value={value}
        onChange={(e) => set(e.target.value.slice(0, APPEAL_MAX))}
        rows={rows}
        className="mt-2 w-full resize-y rounded-xl bg-espresso/70 px-4 py-3 leading-relaxed outline-none ring-1 ring-sand/15 focus:ring-2 focus:ring-caramel/70"
      />
    </label>
  );
}

function AppealForm({ type, token }: { type: AppealType; token: string }) {
  const t = TEXT[type];
  const [state, setState] = useState<AppealState | null>(null);
  const [loadErr, setLoadErr] = useState<{ text: string; disabled?: boolean } | null>(null);
  const [form, setForm] = useState<AppealDraft>({ reason: "", apology: "", extra: "", rules: false });
  const a = form;
  const rules = form.rules;
  const setRules = (v: boolean | ((r: boolean) => boolean)) =>
    setForm((f) => ({ ...f, rules: typeof v === "function" ? v(f.rules) : v }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const draft = useFormDraft(`${type}:form`, form, setForm, {
    watch: true,
    debounceMs: 280,
    isEmpty: (d) => !d.reason.trim() && !d.apology.trim() && !d.extra.trim() && !d.rules,
  });

  useEffect(() => {
    setState(null);
    setLoadErr(null);
    setSent(false);
    loadAppealState(token, type).then((r) => (r.ok ? setState(r.data) : setLoadErr({ text: r.message, disabled: r.disabled })));
  }, [token, type]);

  const submit = async () => {
    if (!a.reason.trim() || !a.apology.trim()) return setErr("Compila tutti i campi obbligatori.");
    if (!rules) return setErr("Devi accettare le regole del server per inviare la richiesta.");
    setBusy(true);
    setErr("");
    const r = await submitAppeal(token, type, { reason: a.reason.trim(), apology: a.apology.trim(), extra: a.extra.trim() });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    draft.clear();
    setSent(true);
  };

  if (loadErr)
    return (
      <div className="rounded-3xl bg-roast/70 p-8 text-center ring-1 ring-sand/12">
        <p className="font-display text-2xl font-semibold">{loadErr.disabled ? "Richieste chiuse" : "Non riesco a leggere lo stato del tuo account"}</p>
        <p className="mt-2 text-crema/60">{loadErr.text}</p>
      </div>
    );
  if (!state)
    return (
      <div className="flex h-48 items-center justify-center rounded-3xl bg-crema/[0.04] text-crema/50">
        <Loader2 className="mr-2 size-5 animate-spin" /> Caricamento stato…
      </div>
    );
  if (sent)
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl bg-gradient-to-b from-[#3f7d4e]/20 to-roast p-10 text-center ring-1 ring-[#3f7d4e]/40">
        <CheckCircle2 className="mx-auto size-12 text-[#9fd3ac] light:text-[#2f6b3f]" />
        <p className="mt-4 font-display text-3xl font-semibold">Richiesta inviata con successo!</p>
        <p className="mx-auto mt-3 max-w-lg leading-relaxed text-crema/70">Riceverai aggiornamenti tramite DM dal bot. Se non ricevi risposta entro 15 giorni, considera la richiesta rifiutata.</p>
      </motion.div>
    );

  return (
    <div className="space-y-6">
      <div className={cn("flex items-center gap-3 rounded-2xl p-5 ring-1", state.can_submit ? "bg-caramel/10 ring-caramel/30" : "bg-crema/[0.04] ring-sand/12")}>
        {state.cooldown_until_ms ? <Clock className="size-5 shrink-0 text-caramel" /> : state.can_submit ? <Info className="size-5 shrink-0 text-caramel" /> : <CheckCircle2 className="size-5 shrink-0 text-[#9fd3ac] light:text-[#2f6b3f]" />}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-crema/50">Stato account</p>
          <p className="mt-0.5 text-crema/85">
            {state.message}
            {state.cooldown_until_ms > 0 && ` Potrai riprovare dal ${dateTimeIt(state.cooldown_until_ms)}.`}
          </p>
        </div>
      </div>

      {state.can_submit && (
        <div className="rounded-3xl bg-roast/70 p-6 ring-1 ring-sand/12 sm:p-8">
          <p className="font-display text-2xl font-semibold">Modulo di richiesta {type}</p>
          <p className="mt-1 text-sm text-crema/55">La richiesta può essere inviata solo per te stesso.</p>
          <div className="mt-6 space-y-6">
            <Field label={t.why} value={a.reason} set={(v) => setForm((x) => ({ ...x, reason: v }))} />
            <Field label="Le tue scuse allo staff e alla community" value={a.apology} set={(v) => setForm((x) => ({ ...x, apology: v }))} />
            <Field label="Informazioni aggiuntive" optional rows={3} value={a.extra} set={(v) => setForm((x) => ({ ...x, extra: v }))} />
            <button type="button" role="checkbox" aria-checked={rules} onClick={() => setRules((r) => !r)} className="flex gap-3 rounded-2xl bg-crema/[0.03] p-4 text-left ring-1 ring-sand/12 transition-colors hover:ring-sand/30">
              <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md ring-1", rules ? "bg-caramel text-ink ring-caramel" : "ring-sand/40")}>{rules && <Check className="size-3.5" />}</span>
              <span>
                <span className="block font-semibold">Accetto di rispettare le regole del server</span>
                <span className="mt-1 block text-sm leading-relaxed text-crema/60">{t.rules}</span>
              </span>
            </button>
          </div>
          {err && <p className="mt-5 rounded-xl bg-[#a83a2c]/15 px-4 py-3 text-sm text-[#f0a493] light:text-[#a83a2c]">{err}</p>}
          <button type="button" onClick={submit} disabled={busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3.5 font-semibold text-ink shadow-[0_12px_30px_-10px_rgba(232,160,90,0.7)] transition-all hover:-translate-y-0.5 disabled:opacity-60 sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {busy ? "Invio in corso…" : `Invia richiesta di ${type}`}
          </button>
        </div>
      )}
    </div>
  );
}

export function AppelliBoard() {
  const { ready, token } = useAuth();
  const [type, setType] = useState<AppealType>("unban");

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const q = sp.get("tab") || sp.get("tipo") || location.hash.slice(1);
    if (q === "unmute") setType("unmute");
  }, []);

  const t = TEXT[type];
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 pb-24">
      <div className="flex justify-center">
        <div role="tablist" aria-label="Tipo di richiesta" className="inline-flex rounded-full bg-roast/80 p-1 ring-1 ring-sand/15">
          {(Object.keys(TEXT) as AppealType[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={type === k}
              onClick={() => setType(k)}
              className={cn("inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors", type === k ? "bg-crema text-espresso" : "text-crema/60 hover:text-crema")}
            >
              {TEXT[k].icon} {TEXT[k].label}
            </button>
          ))}
        </div>
      </div>

      {!ready ? (
        <div className="h-48 animate-pulse rounded-3xl bg-crema/[0.04]" />
      ) : !token ? (
        <AuthGateCard title="Accedi per continuare" text="Accedi con Discord per inviare la richiesta." />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={type} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <AppealForm type={type} token={token} />
          </motion.div>
        </AnimatePresence>
      )}

      <div className="space-y-4">
        <div className="rounded-3xl bg-roast/70 p-6 ring-1 ring-sand/12 sm:p-7">
          <p className="font-display text-xl font-semibold">Prima di inviare</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-crema/70">
            <li className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-caramel" />
              Puoi richiedere l&apos;{type} solo per il tuo account.
            </li>
            <li className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-caramel" />
              Ti sarà inviato l&apos;esito entro 15 giorni tramite il nostro bot.
            </li>
            <li className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-caramel" />
              Cooldown: puoi inviare una nuova richiesta ogni 15 giorni.
            </li>
          </ul>
          <p className="mt-4 rounded-2xl bg-caramel/10 px-4 py-3 text-sm leading-relaxed text-crema/80 ring-1 ring-caramel/25">
            <span className="font-semibold text-crema">Suggerimento — </span>
            Spiega con calma la dinamica dell&apos;accaduto e il motivo per il quale sarebbe corretto concederti un&apos;altra possibilità.
          </p>
        </div>

        <div className="rounded-3xl bg-roast/70 p-6 ring-1 ring-sand/12 sm:p-7">
          <p className="font-semibold">Informazioni importanti</p>
          <ul className="mt-3 space-y-2">
            {t.info.map((i) => (
              <li key={i} className="flex gap-2.5 text-sm text-crema/70">
                <Check className="mt-0.5 size-4 shrink-0 text-caramel" /> {i}
              </li>
            ))}
          </ul>
          <a href={page("/regole/")} className="mt-5 inline-flex items-center gap-2 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 transition-colors hover:bg-crema/12">
            <BookOpen className="size-4" /> Leggi le regole
          </a>
        </div>
      </div>
    </div>
  );
}

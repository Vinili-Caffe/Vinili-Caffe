"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, Handshake, Megaphone, Pin, Rocket, Ticket, X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { loadGuildSettings, patchGuildSettings, type ChannelPicker, type RolePicker } from "@/lib/dashboard-guild";
import { createTicketPanel, loadPartnership, loadTicketPanels, patchPartnership } from "@/lib/dashboard-guild-ops";
import { Field, dashPrimaryBtn, fieldClass, miniBtn } from "./bits";

type StepId = "updates" | "tickets" | "partnership" | "boards";
type Status = Record<StepId, boolean>;

const STEPS: { id: StepId; title: string; text: string; icon: React.ReactNode }[] = [
  { id: "updates", title: "Novità del bot", text: "Il canale dove arrivano gli aggiornamenti di Vinili.", icon: <Megaphone className="size-4" /> },
  { id: "tickets", title: "Primo pannello ticket", text: "Un messaggio con il pulsante per aprire un ticket di assistenza.", icon: <Ticket className="size-4" /> },
  { id: "partnership", title: "Partnership", text: "Il canale dove il bot pubblica le partnership e il ruolo dei partner manager.", icon: <Handshake className="size-4" /> },
  { id: "boards", title: "Bacheca", text: "Il canale dove finiscono quote, repost, clip e skullboard.", icon: <Pin className="size-4" /> },
];

const DISMISS_KEY = (gid: string) => `vc-setup-dismissed:${gid}`;

/**
 * Primo avvio guidato: 4 passi per mettere in funzione il bot su un server nuovo.
 * Compare in cima al pannello finché manca qualcosa (si può chiudere). Ogni passo si può saltare.
 */
export function SetupWizard({ guildId, token, onChanged }: { guildId: string; token: string; onChanged?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [channels, setChannels] = useState<ChannelPicker[]>([]);
  const [roles, setRoles] = useState<RolePicker[]>([]);
  const [updatesLocked, setUpdatesLocked] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [step, setStep] = useState<StepId>("updates");
  const [skipped, setSkipped] = useState<StepId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /* valori dei campi */
  const [updatesCh, setUpdatesCh] = useState("");
  const [ticketCh, setTicketCh] = useState("");
  const [ticketTitle, setTicketTitle] = useState("Assistenza");
  const [ticketButton, setTicketButton] = useState("Apri un ticket");
  const [partnerCh, setPartnerCh] = useState("");
  const [managerRole, setManagerRole] = useState("");
  const [boardsCh, setBoardsCh] = useState("");

  const refresh = useCallback(async () => {
    const [settings, panels, partnership] = await Promise.all([loadGuildSettings(token, guildId), loadTicketPanels(token, guildId), loadPartnership(token, guildId)]);
    if (!settings.ok) return;
    const s = settings.data.settings;
    setChannels(settings.data.pickers.textChannels);
    setRoles(settings.data.pickers.roles.filter((r) => !r.managed));
    setUpdatesLocked(s.updatesLocked);
    const next: Status = {
      updates: s.updatesLocked || Boolean(s.updatesChannelId),
      tickets: panels.ok ? panels.data.singles.length > 0 : true,
      partnership: partnership.ok ? Boolean(partnership.data.config.partnershipsChannelId) : true,
      boards: !s.boards.enabled ? false : Boolean(s.boards.sharedChannelId || s.boards.quoteChannelId || s.boards.repostChannelId),
    };
    setStatus(next);
    const firstTodo = STEPS.find((st) => !next[st.id]);
    if (firstTodo) setStep(firstTodo.id);
  }, [token, guildId]);

  useEffect(() => {
    let off = false;
    const raf = window.requestAnimationFrame(() => {
      if (off) return;
      try {
        setDismissed(localStorage.getItem(DISMISS_KEY(guildId)) === "1");
      } catch {
        setDismissed(false);
      }
      void refresh();
    });
    return () => {
      off = true;
      window.cancelAnimationFrame(raf);
    };
  }, [guildId, refresh]);

  if (!status) return null;
  const doneCount = STEPS.filter((s) => status[s.id]).length;
  if (doneCount === STEPS.length) return null;
  if (dismissed && !open) return null;

  const channelOpts = (none: string) => [{ value: "", label: none }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))];
  const goNext = (from: StepId, nextStatus?: Status) => {
    const st = nextStatus || status;
    const idx = STEPS.findIndex((s) => s.id === from);
    const next = STEPS.slice(idx + 1).find((s) => !st[s.id]) || STEPS.find((s) => !st[s.id] && s.id !== from && !skipped.includes(s.id));
    if (next) setStep(next.id);
    else setOpen(false);
  };

  const run = async (id: StepId, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError("");
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.message || "Non è andato a buon fine, riprova.");
    const next = { ...status, [id]: true };
    setStatus(next);
    onChanged?.();
    goNext(id, next);
  };

  const save: Record<StepId, () => void> = {
    updates: () =>
      void run("updates", async () => {
        if (!updatesCh) return { ok: false, message: "Scegli un canale." };
        const r = await patchGuildSettings(token, guildId, { updatesChannelId: updatesCh });
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    tickets: () =>
      void run("tickets", async () => {
        if (!ticketCh) return { ok: false, message: "Scegli il canale dove mettere il pannello." };
        const r = await createTicketPanel(token, guildId, {
          ticketType: "supporto",
          channelId: ticketCh,
          title: ticketTitle.trim() || "Assistenza",
          content: "Hai bisogno di aiuto? Premi il pulsante qui sotto: si apre un canale privato dove lo staff ti risponde.",
          buttonText: ticketButton.trim() || "Apri un ticket",
          buttonStyle: "primary",
          color: "#d99a5b",
          publish: true,
        });
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    partnership: () =>
      void run("partnership", async () => {
        if (!partnerCh) return { ok: false, message: "Scegli il canale delle partnership." };
        const r = await patchPartnership(token, guildId, { partnershipsChannelId: partnerCh, ...(managerRole ? { partnerManagerRoleId: managerRole } : {}) });
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
    boards: () =>
      void run("boards", async () => {
        if (!boardsCh) return { ok: false, message: "Scegli il canale della bacheca." };
        const r = await patchGuildSettings(token, guildId, { boards: { enabled: true, mode: "shared", sharedChannelId: boardsCh } });
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      }),
  };

  const close = () => {
    setOpen(false);
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY(guildId), "1");
    } catch {
      /* ignore */
    }
  };

  /* chiuso: solo la riga "configura in N passi" */
  if (!open) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-gradient-to-r from-caramel/[0.14] via-roast/80 to-roast/80 p-4 ring-1 ring-caramel/30">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/20 text-ember ring-1 ring-caramel/30">
          <Rocket className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-crema">Metti in funzione Vinili in pochi passi</p>
          <p className="text-xs text-crema/70">
            {doneCount} di {STEPS.length} fatti · mancano {STEPS.filter((s) => !status[s.id]).map((s) => s.title.toLowerCase()).join(", ")}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={dashPrimaryBtn}>
          Inizia <ChevronRight className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={close} className="rounded-lg p-2 text-crema/60 transition hover:bg-crema/[0.06] hover:text-crema" aria-label="Nascondi" title="Nascondi">
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const current = STEPS.find((s) => s.id === step) || STEPS[0];

  return (
    <section className="mb-4 overflow-hidden rounded-2xl bg-roast/90 ring-1 ring-caramel/30" aria-label="Primo avvio guidato">
      <header className="flex items-center gap-3 border-b border-sand/[0.08] px-4 py-3 sm:px-5">
        <Rocket className="size-5 text-ember" aria-hidden />
        <p className="min-w-0 flex-1 font-semibold text-crema">Primo avvio</p>
        <span className="text-xs tabular-nums text-crema/60">
          {doneCount}/{STEPS.length}
        </span>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-crema/60 hover:bg-crema/[0.06] hover:text-crema" aria-label="Riduci">
          <X className="size-4" />
        </button>
      </header>
      <div className="grid md:grid-cols-[15rem_minmax(0,1fr)]">
        {/* elenco dei passi */}
        <ol className="flex gap-1 overflow-x-auto border-b border-sand/[0.08] p-2 md:block md:space-y-1 md:border-b-0 md:border-r">
          {STEPS.map((s, i) => {
            const done = status[s.id];
            const on = s.id === step;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  aria-current={on ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition",
                    on ? "bg-caramel/12 text-crema ring-1 ring-caramel/25" : "text-crema/70 hover:bg-crema/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      done ? "bg-[#5f9a6a]/25 text-[#9fd0a8]" : on ? "bg-caramel text-espresso" : "bg-crema/[0.08] text-crema/70",
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="truncate">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }} className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="flex items-center gap-2 font-semibold text-crema">
                <span className="text-ember">{current.icon}</span>
                {current.title}
                {status[current.id] ? <span className="rounded bg-[#5f9a6a]/20 px-1.5 py-0.5 text-[0.65rem] font-semibold text-[#9fd0a8]">fatto</span> : null}
              </p>
              <p className="mt-0.5 text-sm text-crema/70">{current.text}</p>
            </div>

            {step === "updates" ? (
              updatesLocked ? (
                <p className="text-sm text-crema/70">Su questo server il canale aggiornamenti non si sceglie dalla dashboard: passo già a posto.</p>
              ) : (
                <Field label="Canale">
                  <Select value={updatesCh} onChange={setUpdatesCh} options={channelOpts("Scegli un canale…")} className={fieldClass} />
                </Field>
              )
            ) : null}

            {step === "tickets" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Canale del pannello">
                  <Select value={ticketCh} onChange={setTicketCh} options={channelOpts("Scegli un canale…")} className={fieldClass} />
                </Field>
                <Field label="Titolo">
                  <input name="setup-ticket-title" value={ticketTitle} maxLength={100} onChange={(e) => setTicketTitle(e.target.value)} className={fieldClass} />
                </Field>
                <Field label="Testo del pulsante" hint="Il pannello si pubblica subito; poi lo personalizzi in Ticket → Pannelli.">
                  <input name="setup-ticket-button" value={ticketButton} maxLength={80} onChange={(e) => setTicketButton(e.target.value)} className={fieldClass} />
                </Field>
              </div>
            ) : null}

            {step === "partnership" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Canale delle partnership">
                  <Select value={partnerCh} onChange={setPartnerCh} options={channelOpts("Scegli un canale…")} className={fieldClass} />
                </Field>
                <Field label="Ruolo dei partner manager" hint="Facoltativo: chi ha questo ruolo può fare partnership.">
                  <Select value={managerRole} onChange={setManagerRole} options={[{ value: "", label: "Nessuno per ora" }, ...roles.map((r) => ({ value: r.id, label: `@${r.name}` }))]} className={fieldClass} />
                </Field>
              </div>
            ) : null}

            {step === "boards" ? (
              <Field label="Canale della bacheca" hint="Un solo canale per tutto; poi puoi dividerli in Bacheca.">
                <Select value={boardsCh} onChange={setBoardsCh} options={channelOpts("Scegli un canale…")} className={fieldClass} />
              </Field>
            ) : null}

            {error ? <p className="text-sm text-[#f0a493] light:text-[#a83a2c]">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              {!status[current.id] && !(step === "updates" && updatesLocked) ? (
                <button type="button" disabled={busy} onClick={save[step]} className={dashPrimaryBtn}>
                  {busy ? "Salvo…" : step === "tickets" ? "Crea e pubblica" : "Salva e continua"}
                </button>
              ) : (
                <button type="button" onClick={() => goNext(step)} className={dashPrimaryBtn}>
                  Avanti <ChevronRight className="size-4" aria-hidden />
                </button>
              )}
              {!status[current.id] ? (
                <button
                  type="button"
                  className={miniBtn}
                  onClick={() => {
                    setSkipped((s) => [...s, step]);
                    goNext(step);
                  }}
                >
                  Salta per ora
                </button>
              ) : null}
              <button type="button" className="ml-auto text-xs text-crema/60 underline-offset-2 hover:text-crema hover:underline" onClick={close}>
                Non mostrare più
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

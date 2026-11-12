"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Handshake, Megaphone, Pin, Rocket, Sparkles, Ticket, Users } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { loadGuildSettings, patchGuildSettings, type ChannelPicker, type RolePicker } from "@/lib/dashboard-guild";
import { createTicketPanel, loadPartnership, loadTicketPanels, patchPartnership } from "@/lib/dashboard-guild-ops";
import { Field, MultiCheck, dashPrimaryBtn, fieldClass, miniBtn } from "./bits";

type StepId = "access" | "updates" | "tickets" | "partnership" | "boards";
type Status = Record<StepId, boolean>;

const STEPS: { id: StepId; title: string; text: string; icon: React.ReactNode }[] = [
  {
    id: "access",
    title: "Accesso dashboard",
    text: "Quali ruoli possono aprire la dashboard di questo server.",
    icon: <Users className="size-4" />,
  },
  {
    id: "updates",
    title: "Novità del bot",
    text: "Il canale dove arrivano gli aggiornamenti di Vinili.",
    icon: <Megaphone className="size-4" />,
  },
  {
    id: "tickets",
    title: "Primo pannello ticket",
    text: "Un messaggio con il pulsante per aprire un ticket.",
    icon: <Ticket className="size-4" />,
  },
  {
    id: "partnership",
    title: "Partnership",
    text: "Canale delle partnership e ruolo dei partner manager.",
    icon: <Handshake className="size-4" />,
  },
  {
    id: "boards",
    title: "Bacheca",
    text: "Il canale dove finiscono quote, repost, clip e skullboard.",
    icon: <Pin className="size-4" />,
  },
];

function adminRoleIds(roles: RolePicker[]) {
  return roles
    .filter((r) => {
      if (r.managed || /\bbots?\b/i.test(r.name)) return false;
      if (r.administrator === true) return true;
      try {
        return (BigInt(r.permissions || "0") & BigInt(8)) !== BigInt(0);
      } catch {
        return false;
      }
    })
    .map((r) => r.id);
}

/**
 * Primo avvio guidato (stesso stile a fasi del setup partnership):
 * accesso dashboard → novità → ticket → partnership → bacheca.
 */
export function SetupWizard({
  guildId,
  token,
  onChanged,
  /** Sul principale c’è anche la bacheca; sui tenant quel passo non compare. */
  includeBoards = true,
}: {
  guildId: string;
  token: string;
  onChanged?: () => void;
  includeBoards?: boolean;
}) {
  const steps = useMemo(() => (includeBoards ? STEPS : STEPS.filter((s) => s.id !== "boards")), [includeBoards]);

  const [status, setStatus] = useState<Status | null>(null);
  const [channels, setChannels] = useState<ChannelPicker[]>([]);
  const [roles, setRoles] = useState<RolePicker[]>([]);
  const [updatesLocked, setUpdatesLocked] = useState(false);
  const [rolesLocked, setRolesLocked] = useState(false);
  const [step, setStep] = useState<StepId>("access");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [doneFlash, setDoneFlash] = useState(false);

  const [dashRoles, setDashRoles] = useState<string[]>([]);
  const [updatesCh, setUpdatesCh] = useState("");
  const [ticketCh, setTicketCh] = useState("");
  const [ticketTitle, setTicketTitle] = useState("Assistenza");
  const [ticketButton, setTicketButton] = useState("Apri un ticket");
  const [partnerCh, setPartnerCh] = useState("");
  const [managerRole, setManagerRole] = useState("");
  const [boardsCh, setBoardsCh] = useState("");

  const refresh = useCallback(async () => {
    const [settings, panels, partnership] = await Promise.all([
      loadGuildSettings(token, guildId),
      loadTicketPanels(token, guildId),
      loadPartnership(token, guildId),
    ]);
    if (!settings.ok) return;
    const s = settings.data.settings;
    const roleList = settings.data.pickers.roles.filter((r) => !r.managed);
    setChannels(settings.data.pickers.textChannels);
    setRoles(roleList);
    setUpdatesLocked(s.updatesLocked);
    setRolesLocked(s.rolesLocked);
    if (s.updatesChannelId) setUpdatesCh(s.updatesChannelId);
    const auto = adminRoleIds(roleList);
    const saved = s.dashboardRoleIds || [];
    setDashRoles(s.dashboardRolesConfigured ? saved : [...new Set([...auto, ...saved])]);
    if (partnership.ok) {
      if (partnership.data.config.partnershipsChannelId) setPartnerCh(partnership.data.config.partnershipsChannelId);
      if (partnership.data.config.partnerManagerRoleId) setManagerRole(partnership.data.config.partnerManagerRoleId);
    }
    if (s.boards.sharedChannelId) setBoardsCh(s.boards.sharedChannelId);

    const next: Status = {
      access: s.rolesLocked || s.dashboardRolesConfigured === true,
      updates: s.updatesLocked || Boolean(s.updatesChannelId),
      tickets: panels.ok ? panels.data.singles.length > 0 : true,
      partnership: partnership.ok ? Boolean(partnership.data.config.partnershipsChannelId) : true,
      boards:
        !includeBoards ||
        (s.boards.enabled === true && Boolean(s.boards.sharedChannelId || s.boards.quoteChannelId || s.boards.repostChannelId)),
    };
    setStatus(next);
    const firstTodo = steps.find((st) => !next[st.id]);
    if (firstTodo) setStep(firstTodo.id);
  }, [token, guildId, includeBoards, steps]);

  useEffect(() => {
    let off = false;
    const raf = window.requestAnimationFrame(() => {
      if (off) return;
      void refresh();
    });
    return () => {
      off = true;
      window.cancelAnimationFrame(raf);
    };
  }, [refresh]);

  const stepIndex = steps.findIndex((s) => s.id === step);
  const current = steps[stepIndex] || steps[0];
  const doneCount = status ? steps.filter((s) => status[s.id]).length : 0;
  const progress = status ? (doneCount / steps.length) * 100 : 0;
  const progressLive = status ? ((stepIndex + (status[step] ? 1 : 0.35)) / steps.length) * 100 : 8;

  const channelOpts = useMemo(
    () => [{ value: "", label: "Scegli un canale…" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))],
    [channels],
  );
  const roleOpts = useMemo(
    () => [{ value: "", label: "Nessuno per ora" }, ...roles.map((r) => ({ value: r.id, label: `@${r.name}` }))],
    [roles],
  );
  const roleCheckOpts = useMemo(() => roles.map((r) => ({ id: r.id, label: r.name })), [roles]);

  const go = (id: StepId) => {
    setHint("");
    setStep(id);
  };

  const markDone = (id: StepId) => {
    if (!status) return null;
    const next = { ...status, [id]: true };
    setStatus(next);
    onChanged?.();
    const from = steps.findIndex((s) => s.id === id);
    const nxt = steps.slice(from + 1).find((s) => !next[s.id]);
    if (nxt) go(nxt.id);
    else {
      setDoneFlash(true);
      window.setTimeout(() => {
        setDoneFlash(false);
        setStatus({ access: true, updates: true, tickets: true, partnership: true, boards: true });
      }, 2200);
    }
    return next;
  };

  const run = async (id: StepId, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setHint("");
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      setHint(r.message || "Non è andato a buon fine, riprova.");
      return;
    }
    markDone(id);
  };

  if (!status) return null;
  if (doneCount === steps.length && !doneFlash) return null;

  if (doneFlash) {
    return (
      <section className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#5f9a6a]/20 via-roast to-espresso p-8 ring-1 ring-[#5f9a6a]/35 sm:p-10">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#5f9a6a]/25 text-[#9fd0a8] ring-1 ring-[#5f9a6a]/40">
            <Sparkles className="size-7" aria-hidden />
          </span>
          <h2 className="mt-5 font-display text-3xl font-semibold text-crema">Tutto pronto</h2>
          <p className="mt-2 text-sm leading-relaxed text-crema/70">
            Configurazione iniziale completata. Puoi sempre cambiare tutto dalle sezioni della dashboard.
          </p>
        </motion.div>
      </section>
    );
  }

  return (
    <section
      className="mb-4 overflow-hidden rounded-3xl bg-roast/95 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] ring-1 ring-caramel/25"
      aria-label="Configurazione iniziale"
    >
      <header className="relative border-b border-sand/[0.08] px-5 py-5 sm:px-7 sm:py-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 70% 120% at 0% 0%, rgba(217,154,91,0.18), transparent 55%), radial-gradient(ellipse 50% 80% at 100% 0%, rgba(235,69,158,0.08), transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/30">
            <Rocket className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-caramel/90">Configurazione iniziale</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-crema sm:text-3xl">Metti in funzione il bot</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-crema/65">
              {includeBoards
                ? "Cinque passi: chi entra in dashboard, novità, ticket, partnership e bacheca."
                : "Quattro passi: chi entra in dashboard, novità, ticket e partnership."}
            </p>
          </div>
          <span className="relative text-xs tabular-nums font-semibold text-crema/55">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-crema/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-caramel to-ember"
            initial={false}
            animate={{ width: `${Math.max(8, Math.max(progress, progressLive))}%` }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
          />
        </div>
      </header>

      <div className="grid lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <ol className="flex gap-1 overflow-x-auto border-b border-sand/[0.08] p-3 lg:block lg:space-y-1 lg:border-b-0 lg:border-r lg:p-4">
          {steps.map((s, i) => {
            const done = status[s.id];
            const on = s.id === step;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={on ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm transition",
                    on ? "bg-caramel/14 text-crema ring-1 ring-caramel/30" : "text-crema/65 hover:bg-crema/[0.04] hover:text-crema",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      done && !on
                        ? "bg-[#5f9a6a]/25 text-[#9fd0a8] light:text-[#2f6b3f]"
                        : on
                          ? "bg-caramel text-espresso shadow-[0_8px_18px_-10px_rgba(217,154,91,0.9)]"
                          : "bg-crema/[0.07] text-crema/65",
                    )}
                  >
                    {done && !on ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.title}</span>
                    <span className="mt-0.5 hidden truncate text-[0.65rem] text-crema/45 lg:block">{s.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-5 p-5 sm:p-7"
          >
            <div>
              <p className="flex items-center gap-2 text-lg font-semibold text-crema">
                <span className="text-ember">{current.icon}</span>
                {current.title}
                {status[current.id] ? (
                  <span className="rounded bg-[#5f9a6a]/20 px-1.5 py-0.5 text-[0.65rem] font-semibold text-[#9fd0a8] light:text-[#2f6b3f]">
                    fatto
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-crema/65">{current.text}</p>
            </div>

            {step === "access" ? (
              rolesLocked ? (
                <p className="text-sm text-crema/70">Su questo server i ruoli dashboard sono bloccati: passo già a posto.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-crema/55">
                    Chi ha Gestisci server entra sempre. Qui scegli altri ruoli. All’inizio sono spuntati quelli con Amministratore.
                  </p>
                  <MultiCheck
                    options={roleCheckOpts}
                    selected={dashRoles}
                    onChange={setDashRoles}
                    empty="Nessun ruolo disponibile."
                  />
                </div>
              )
            ) : null}

            {step === "updates" ? (
              updatesLocked ? (
                <p className="text-sm text-crema/70">Su questo server il canale aggiornamenti non si sceglie dalla dashboard: passo già a posto.</p>
              ) : (
                <Field label="Canale aggiornamenti">
                  <Select
                    value={updatesCh}
                    onChange={setUpdatesCh}
                    searchable
                    searchPlaceholder="Cerca canale…"
                    options={channelOpts}
                    className={fieldClass}
                  />
                </Field>
              )
            ) : null}

            {step === "tickets" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Canale del pannello">
                  <Select
                    value={ticketCh}
                    onChange={setTicketCh}
                    searchable
                    searchPlaceholder="Cerca canale…"
                    options={channelOpts}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Titolo">
                  <input
                    name="setup-ticket-title"
                    value={ticketTitle}
                    maxLength={100}
                    onChange={(e) => setTicketTitle(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Testo del pulsante" hint="Si pubblica subito; poi lo personalizzi in Ticket → Pannelli.">
                  <input
                    name="setup-ticket-button"
                    value={ticketButton}
                    maxLength={80}
                    onChange={(e) => setTicketButton(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
              </div>
            ) : null}

            {step === "partnership" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Canale delle partnership">
                  <Select
                    value={partnerCh}
                    onChange={setPartnerCh}
                    searchable
                    searchPlaceholder="Cerca canale…"
                    options={channelOpts}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Ruolo partner manager" hint="Facoltativo">
                  <Select
                    value={managerRole}
                    onChange={setManagerRole}
                    searchable
                    searchPlaceholder="Cerca ruolo…"
                    options={roleOpts}
                    className={fieldClass}
                  />
                </Field>
              </div>
            ) : null}

            {step === "boards" ? (
              <Field label="Canale della bacheca" hint="Un solo canale per tutto; poi puoi dividerli in Bacheca.">
                <Select
                  value={boardsCh}
                  onChange={setBoardsCh}
                  searchable
                  searchPlaceholder="Cerca canale…"
                  options={channelOpts}
                  className={fieldClass}
                />
              </Field>
            ) : null}

            {hint ? <p className="text-sm text-[#f0a493] light:text-[#a83a2c]">{hint}</p> : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {stepIndex > 0 ? (
                <button type="button" disabled={busy} className={miniBtn} onClick={() => go(steps[stepIndex - 1]!.id)}>
                  <ChevronLeft className="size-3.5" aria-hidden /> Indietro
                </button>
              ) : null}

              {status[step] || (step === "updates" && updatesLocked) || (step === "access" && rolesLocked) ? (
                <button
                  type="button"
                  disabled={busy}
                  className={dashPrimaryBtn}
                  onClick={() => {
                    const nxt = steps.slice(stepIndex + 1).find((s) => !status[s.id]);
                    if (nxt) go(nxt.id);
                    else markDone(step);
                  }}
                >
                  Avanti <ChevronRight className="size-4" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className={dashPrimaryBtn}
                  onClick={() => {
                    if (step === "access") {
                      void run("access", async () => {
                        const r = await patchGuildSettings(token, guildId, { dashboardRoleIds: dashRoles });
                        return r.ok ? { ok: true } : { ok: false, message: r.message };
                      });
                      return;
                    }
                    if (step === "updates") {
                      void run("updates", async () => {
                        if (!updatesCh) return { ok: false, message: "Scegli un canale." };
                        const r = await patchGuildSettings(token, guildId, { updatesChannelId: updatesCh });
                        return r.ok ? { ok: true } : { ok: false, message: r.message };
                      });
                      return;
                    }
                    if (step === "tickets") {
                      void run("tickets", async () => {
                        if (!ticketCh) return { ok: false, message: "Scegli il canale dove mettere il pannello." };
                        const r = await createTicketPanel(token, guildId, {
                          ticketType: "supporto",
                          channelId: ticketCh,
                          title: ticketTitle.trim() || "Assistenza",
                          content:
                            "Hai bisogno di aiuto? Premi il pulsante qui sotto: si apre un canale privato dove lo staff ti risponde.",
                          buttonText: ticketButton.trim() || "Apri un ticket",
                          buttonStyle: "primary",
                          color: "#d99a5b",
                          publish: true,
                        });
                        return r.ok ? { ok: true } : { ok: false, message: r.message };
                      });
                      return;
                    }
                    if (step === "partnership") {
                      void run("partnership", async () => {
                        if (!partnerCh) return { ok: false, message: "Scegli il canale delle partnership." };
                        const r = await patchPartnership(token, guildId, {
                          partnershipsChannelId: partnerCh,
                          ...(managerRole ? { partnerManagerRoleId: managerRole } : {}),
                        });
                        return r.ok ? { ok: true } : { ok: false, message: r.message };
                      });
                      return;
                    }
                    void run("boards", async () => {
                      if (!boardsCh) return { ok: false, message: "Scegli il canale della bacheca." };
                      const r = await patchGuildSettings(token, guildId, {
                        boards: { enabled: true, mode: "shared", sharedChannelId: boardsCh },
                      });
                      return r.ok ? { ok: true } : { ok: false, message: r.message };
                    });
                  }}
                >
                  {busy ? "Salvo…" : step === "tickets" ? "Crea e continua" : "Salva e continua"}{" "}
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              )}

              {!status[step] && !(step === "updates" && updatesLocked) && !(step === "access" && rolesLocked) ? (
                <button type="button" disabled={busy} className={miniBtn} onClick={() => markDone(step)}>
                  Salta
                </button>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

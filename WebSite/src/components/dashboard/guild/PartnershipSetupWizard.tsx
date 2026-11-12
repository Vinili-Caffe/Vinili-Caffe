"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AtSign, Check, ChevronLeft, ChevronRight, Hash, Handshake, Rocket, Shield, Sparkles } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { patchPartnership, type PartnershipBundle, type PartnershipConfig } from "@/lib/dashboard-guild";
import { Field, dashPrimaryBtn, fieldClass, miniBtn } from "./bits";

type StepId = "channels" | "roles" | "pings" | "complete";

const STEPS: { id: StepId; title: string; text: string; icon: React.ReactNode }[] = [
  {
    id: "channels",
    title: "Canali",
    text: "Dove escono le partnership e, se vuoi, i log.",
    icon: <Hash className="size-4" />,
  },
  {
    id: "roles",
    title: "Ruolo manager",
    text: "Chi può gestire le partnership e i comandi partner.",
    icon: <Shield className="size-4" />,
  },
  {
    id: "pings",
    title: "Ping",
    text: "Soglie di membri per @here, @everyone o un ruolo custom.",
    icon: <AtSign className="size-4" />,
  },
  {
    id: "complete",
    title: "Fine",
    text: "Controlla il riepilogo e chiudi il setup iniziale.",
    icon: <Rocket className="size-4" />,
  },
];

function channelLabel(id: string | null, channels: { id: string; name: string }[]) {
  if (!id) return "—";
  return `#${channels.find((c) => c.id === id)?.name || id}`;
}

function roleLabel(id: string | null, roles: { id: string; name: string }[]) {
  if (!id) return "—";
  return `@${roles.find((r) => r.id === id)?.name || id}`;
}

function pingSummary(pings: PartnershipConfig["pings"]) {
  const bits: string[] = [];
  if (pings.hereMembers != null) bits.push(`@here da ${pings.hereMembers}`);
  if (pings.everyoneMembers != null) bits.push(`@everyone da ${pings.everyoneMembers}`);
  if (pings.customRoleId && pings.customRoleMembers != null) bits.push(`ruolo custom da ${pings.customRoleMembers}`);
  return bits.length ? bits.join(" · ") : "Nessun ping automatico";
}

/**
 * Setup guidato partnership (stesse fasi di +setup):
 * canali → ruolo manager → ping (facoltativo) → completa.
 */
export function PartnershipSetupWizard({
  guildId,
  token,
  draft,
  channels,
  roles,
  busy,
  onDraft,
  onSaved,
  onToast,
  onFinished,
}: {
  guildId: string;
  token: string;
  draft: PartnershipConfig;
  channels: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  busy: boolean;
  onDraft: (patch: Partial<PartnershipConfig>) => void;
  onSaved: (bundle: PartnershipBundle) => void;
  onToast: (msg: string, err?: boolean) => void;
  /** Dopo la schermata “completato” (il parent può nascondere il wizard). */
  onFinished?: () => void;
}) {
  const firstOpen: StepId = !draft.partnershipsChannelId
    ? "channels"
    : !draft.partnerManagerRoleId
      ? "roles"
      : "pings";
  const [step, setStep] = useState<StepId>(firstOpen);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState("");
  const [doneFlash, setDoneFlash] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const current = STEPS[stepIndex] || STEPS[0];
  const progress = ((stepIndex + (doneFlash ? 1 : 0)) / STEPS.length) * 100;

  const channelOpts = useMemo(
    () => [{ value: "", label: "Scegli un canale…" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))],
    [channels],
  );
  const roleOpts = useMemo(
    () => [{ value: "", label: "Scegli un ruolo…" }, ...roles.filter((r) => !/\bbots?\b/i.test(r.name)).map((r) => ({ value: r.id, label: `@${r.name}` }))],
    [roles],
  );

  const patch = async (body: Record<string, unknown>, okMsg?: string) => {
    setSaving(true);
    setHint("");
    const res = await patchPartnership(token, guildId, body);
    setSaving(false);
    if (!res.ok) {
      setHint(res.message);
      onToast(res.message, true);
      return false;
    }
    onSaved(res.data);
    if (okMsg) onToast(okMsg);
    return true;
  };

  const go = (id: StepId) => {
    setHint("");
    setStep(id);
  };

  const nextOf = (id: StepId) => {
    const i = STEPS.findIndex((s) => s.id === id);
    return STEPS[Math.min(STEPS.length - 1, i + 1)]?.id || "complete";
  };

  const prevOf = (id: StepId) => {
    const i = STEPS.findIndex((s) => s.id === id);
    return STEPS[Math.max(0, i - 1)]?.id || "channels";
  };

  const saveChannels = async () => {
    if (!draft.partnershipsChannelId) {
      setHint("Scegli il canale partnership per continuare.");
      return;
    }
    const ok = await patch(
      {
        partnershipsChannelId: draft.partnershipsChannelId,
        logsChannelId: draft.logsChannelId,
      },
      "Canali salvati.",
    );
    if (ok) go("roles");
  };

  const saveRoles = async () => {
    if (!draft.partnerManagerRoleId) {
      setHint("Scegli il ruolo dei partner manager per continuare.");
      return;
    }
    const ok = await patch({ partnerManagerRoleId: draft.partnerManagerRoleId }, "Ruolo manager salvato.");
    if (ok) go("pings");
  };

  const savePings = async () => {
    const customRole = draft.pings.customRoleId;
    const customMembers = draft.pings.customRoleMembers;
    if ((customRole && customMembers == null) || (!customRole && customMembers != null)) {
      setHint("Ruolo custom e soglia membri vanno impostati insieme.");
      return;
    }
    const ok = await patch(
      {
        pings: {
          hereMembers: draft.pings.hereMembers,
          everyoneMembers: draft.pings.everyoneMembers,
          customRoleId: draft.pings.customRoleId,
          customRoleMembers: draft.pings.customRoleMembers,
        },
      },
      "Ping salvati.",
    );
    if (ok) go("complete");
  };

  const finish = async () => {
    if (!draft.partnershipsChannelId || !draft.partnerManagerRoleId) {
      setHint("Servono ancora canale partnership e ruolo manager.");
      go(!draft.partnershipsChannelId ? "channels" : "roles");
      return;
    }
    const ok = await patch(
      {
        partnershipsChannelId: draft.partnershipsChannelId,
        logsChannelId: draft.logsChannelId,
        partnerManagerRoleId: draft.partnerManagerRoleId,
        pings: {
          hereMembers: draft.pings.hereMembers,
          everyoneMembers: draft.pings.everyoneMembers,
          customRoleId: draft.pings.customRoleId,
          customRoleMembers: draft.pings.customRoleMembers,
        },
        completeSetup: true,
      },
      "Setup partnership completato.",
    );
    if (ok) {
      setDoneFlash(true);
      window.setTimeout(() => onFinished?.(), 2200);
    }
  };

  const locked = busy || saving;

  if (doneFlash) {
    return (
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#5f9a6a]/20 via-roast to-espresso p-8 ring-1 ring-[#5f9a6a]/35 sm:p-10">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#5f9a6a]/25 text-[#9fd0a8] ring-1 ring-[#5f9a6a]/40">
            <Sparkles className="size-7" aria-hidden />
          </span>
          <h2 className="mt-5 font-display text-3xl font-semibold text-crema">Setup completato</h2>
          <p className="mt-2 text-sm leading-relaxed text-crema/70">
            Hai finito la configurazione iniziale. Da qui puoi rifinire regole, descrizione, ritardi dei ping e tutto il resto.
          </p>
          <button type="button" className={cn(dashPrimaryBtn, "mt-6")} onClick={() => onFinished?.()}>
            Apri le impostazioni
          </button>
        </motion.div>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-3xl bg-roast/95 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] ring-1 ring-caramel/25"
      aria-label="Setup partnership guidato"
    >
      {/* hero */}
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
            <Handshake className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-caramel/90">Configurazione iniziale</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-crema sm:text-3xl">Setup partnership</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-crema/65">
              Quattro passi per attivare le partnership: canali, ruolo manager, ping e chiusura.
            </p>
          </div>
        </div>
        <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-crema/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-caramel to-ember"
            initial={false}
            animate={{ width: `${Math.max(8, progress)}%` }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
          />
        </div>
      </header>

      <div className="grid lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <ol className="flex gap-1 overflow-x-auto border-b border-sand/[0.08] p-3 lg:block lg:space-y-1 lg:border-b-0 lg:border-r lg:p-4">
          {STEPS.map((s, i) => {
            const reached =
              (s.id === "channels" && Boolean(draft.partnershipsChannelId)) ||
              (s.id === "roles" && Boolean(draft.partnerManagerRoleId)) ||
              (s.id === "pings" && stepIndex > 2) ||
              (s.id === "complete" && false);
            const done = i < stepIndex || reached;
            const on = s.id === step;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    /* indietro libero; avanti solo se i gate precedenti sono ok */
                    if (s.id === "roles" && !draft.partnershipsChannelId) return;
                    if (s.id === "pings" && !draft.partnerManagerRoleId) return;
                    if (s.id === "complete" && (!draft.partnershipsChannelId || !draft.partnerManagerRoleId)) return;
                    go(s.id);
                  }}
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
              </p>
              <p className="mt-1 text-sm leading-relaxed text-crema/65">{current.text}</p>
            </div>

            {step === "channels" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Canale partnership" hint="Obbligatorio · dove escono le partnership">
                  <Select
                    value={draft.partnershipsChannelId || ""}
                    disabled={locked}
                    searchable
                    searchPlaceholder="Cerca canale…"
                    onChange={(v) => onDraft({ partnershipsChannelId: v || null })}
                    options={channelOpts}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Canale log" hint="Facoltativo">
                  <Select
                    value={draft.logsChannelId || ""}
                    disabled={locked}
                    searchable
                    searchPlaceholder="Cerca canale…"
                    onChange={(v) => onDraft({ logsChannelId: v || null })}
                    options={[{ value: "", label: "Nessuno" }, ...channelOpts.slice(1)]}
                    className={fieldClass}
                  />
                </Field>
              </div>
            ) : null}

            {step === "roles" ? (
              <Field label="Ruolo partner manager" hint="Obbligatorio · chi gestisce le partnership">
                <Select
                  value={draft.partnerManagerRoleId || ""}
                  disabled={locked}
                  searchable
                  searchPlaceholder="Cerca ruolo…"
                  onChange={(v) => onDraft({ partnerManagerRoleId: v || null })}
                  options={roleOpts}
                  className={fieldClass}
                />
              </Field>
            ) : null}

            {step === "pings" ? (
              <div className="space-y-4">
                <p className="rounded-xl bg-crema/[0.04] px-3 py-2.5 text-xs leading-relaxed text-crema/60 ring-1 ring-sand/10">
                  Facoltativo. Con soglia <span className="font-semibold text-crema/80">0</span> il ping parte sempre. Lascia vuoto per non usare quel ping.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="@here da (membri del server partner)">
                    <NumberField
                      min={0}
                      nullable
                      value={draft.pings.hereMembers ?? null}
                      placeholder="mai"
                      disabled={locked}
                      onChange={(n) => onDraft({ pings: { ...draft.pings, hereMembers: n } })}
                      aria-label="@here da membri"
                    />
                  </Field>
                  <Field label="@everyone da (membri del server partner)">
                    <NumberField
                      min={0}
                      nullable
                      value={draft.pings.everyoneMembers ?? null}
                      placeholder="mai"
                      disabled={locked}
                      onChange={(n) => onDraft({ pings: { ...draft.pings, everyoneMembers: n } })}
                      aria-label="@everyone da membri"
                    />
                  </Field>
                  <Field label="Ruolo custom da pingare">
                    <Select
                      value={draft.pings.customRoleId || ""}
                      disabled={locked}
                      searchable
                      searchPlaceholder="Cerca ruolo…"
                      onChange={(v) => onDraft({ pings: { ...draft.pings, customRoleId: v || null } })}
                      options={[{ value: "", label: "Nessuno" }, ...roleOpts.slice(1)]}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Soglia membri per il ruolo custom">
                    <NumberField
                      min={0}
                      nullable
                      value={draft.pings.customRoleMembers ?? null}
                      placeholder="mai"
                      disabled={locked}
                      onChange={(n) => onDraft({ pings: { ...draft.pings, customRoleMembers: n } })}
                      aria-label="Soglia ruolo custom"
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {step === "complete" ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-gradient-to-br from-caramel/[0.1] to-crema/[0.03] p-4 ring-1 ring-caramel/20 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-caramel/90">Riepilogo</p>
                  <dl className="mt-3 space-y-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand/[0.08] pb-2">
                      <dt className="text-crema/55">Canali</dt>
                      <dd className="text-right font-medium text-crema">
                        {channelLabel(draft.partnershipsChannelId, channels)}
                        {draft.logsChannelId ? (
                          <span className="text-crema/55"> · log {channelLabel(draft.logsChannelId, channels)}</span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand/[0.08] pb-2">
                      <dt className="text-crema/55">Manager</dt>
                      <dd className="font-medium text-crema">{roleLabel(draft.partnerManagerRoleId, roles)}</dd>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <dt className="text-crema/55">Ping</dt>
                      <dd className="max-w-[16rem] text-right font-medium text-crema">{pingSummary(draft.pings)}</dd>
                    </div>
                  </dl>
                </div>
                <p className="text-xs leading-relaxed text-crema/55">
                  Completando, il bot marca il setup come fatto e crea l’invito sul canale partnership se manca.
                </p>
              </div>
            ) : null}

            {hint ? <p className="text-sm text-[#f0a493] light:text-[#a83a2c]">{hint}</p> : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {stepIndex > 0 ? (
                <button type="button" disabled={locked} className={miniBtn} onClick={() => go(prevOf(step))}>
                  <ChevronLeft className="size-3.5" aria-hidden /> Indietro
                </button>
              ) : null}

              {step === "channels" ? (
                <button type="button" disabled={locked || !draft.partnershipsChannelId} className={dashPrimaryBtn} onClick={() => void saveChannels()}>
                  {saving ? "Salvo…" : "Salva e continua"} <ChevronRight className="size-4" aria-hidden />
                </button>
              ) : null}
              {step === "roles" ? (
                <button type="button" disabled={locked || !draft.partnerManagerRoleId} className={dashPrimaryBtn} onClick={() => void saveRoles()}>
                  {saving ? "Salvo…" : "Salva e continua"} <ChevronRight className="size-4" aria-hidden />
                </button>
              ) : null}
              {step === "pings" ? (
                <>
                  <button type="button" disabled={locked} className={dashPrimaryBtn} onClick={() => void savePings()}>
                    {saving ? "Salvo…" : "Salva e continua"} <ChevronRight className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    className={miniBtn}
                    onClick={() => go("complete")}
                  >
                    Salta ping
                  </button>
                </>
              ) : null}
              {step === "complete" ? (
                <button type="button" disabled={locked} className={dashPrimaryBtn} onClick={() => void finish()}>
                  {saving ? "Completo…" : "Completa setup"}
                </button>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

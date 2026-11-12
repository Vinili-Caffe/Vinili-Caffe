"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Check, Copy, Gift, Heart, MessageSquareHeart, RefreshCw, Rocket, Sparkles, Star, Timer, Zap } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, type BumpExp, type BumpExpKey, type BumpService, type BumpVotesConfig, type VoteService } from "@/lib/dashboard-community";
import { Field, Notice, RowsSkeleton, Toggle, primaryMini } from "../bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, roleOptions, useCommunity, useSampleVars } from "./shared";

/* ───────────── costanti ───────────── */

const BUMP_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha bumpato" },
  { token: "{service}", hint: "Disboard o Discadia" },
  { token: "{count}", hint: "bump totali di quella persona" },
];
const REMINDER_PLACEHOLDERS = [
  { token: "{role}", hint: "il ruolo da avvisare" },
  { token: "{service}", hint: "Disboard o Discadia" },
];
const EXP_PLACEHOLDERS = [
  { token: "{exp}", hint: "EXP guadagnati" },
  { token: "{bonus}", hint: "bonus rapida/streak: mettilo su una riga sua (se vuoto la riga sparisce)" },
  { token: "{streak}", hint: "serie attuale" },
];
const VOTE_PLACEHOLDERS = [
  { token: "{user}", hint: "chi ha votato" },
  { token: "{service}", hint: "Top.gg o Discadia" },
  { token: "{count}", hint: "voti totali di quella persona" },
];
const VOTE_DM_PLACEHOLDERS = [{ token: "{service}", hint: "Top.gg o Discadia" }];

const BUMP_EXP_KEYS: BumpExpKey[] = ["disboard", "discadia"];
const VOTE_EXP_KEYS: BumpExpKey[] = ["topgg", "discadiaVote"];
const EXP_LABEL: Record<BumpExpKey, string> = {
  disboard: "Bump su Disboard",
  discadia: "Bump su Discadia",
  topgg: "Voto su Top.gg",
  discadiaVote: "Voto su Discadia",
};

/* colore di ogni servizio (solo come accento: pallino, bordo della scheda accesa) */
const BRAND = {
  disboard: { label: "Disboard", color: "#7289ff", initial: "D" },
  discadia: { label: "Discadia", color: "#a78bfa", initial: "D" },
  topgg: { label: "Top.gg", color: "#ff3366", initial: "T" },
} as const;
const SERVICE_LABEL = { disboard: "Disboard", discadia: "Discadia" } as const;
const VOTE_LABEL = { topgg: "Top.gg", discadia: "Discadia" } as const;

const fmtEvery = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  if (m % 1440 === 0) return m === 1440 ? "ogni giorno" : `ogni ${m / 1440} giorni`;
  if (m % 60 === 0) return m === 60 ? "ogni ora" : `ogni ${m / 60} ore`;
  return `ogni ${m} minuti`;
};
const fmtHours = (h: number) => (h === 1 ? "1 ora" : h % 24 === 0 ? (h === 24 ? "1 giorno" : `${h / 24} giorni`) : `${h} ore`);

type PanelProps = { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void };

/* ───────────── dati ───────────── */

function useBumpVotesConfig(guildId: string, token: string) {
  const { data, error } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<BumpVotesConfig | null>(null);
  const [saved, setSaved] = useState<BumpVotesConfig | null>(null);
  const [urls, setUrls] = useState<{ topgg: string; discadia: string } | null>(null);
  const [isMain, setIsMain] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    let alive = true;
    void communityApi.getBumpVotes(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setIsMain(r.data.isMainGuild === true);
      setImported(r.data.imported === true);
      if (r.data.config) {
        setCfg(r.data.config);
        setSaved(r.data.config);
      }
      if (r.data.urls) setUrls(r.data.urls);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  const set = (next: BumpVotesConfig) => {
    setCfg(next);
    setDirty(true);
  };
  const markSaved = (next: BumpVotesConfig) => {
    setCfg(next);
    setSaved(next);
    setDirty(false);
  };
  const reset = () => {
    if (saved) setCfg(saved);
    setDirty(false);
  };

  return { data, error, cfg, setCfg, set, markSaved, reset, urls, setUrls, isMain, loadError, busy, setBusy, dirty, imported };
}

/* ───────────── pezzi grafici ───────────── */

/** Testata della pagina: icona, titolo, stato e interruttore principale. */
function Hero({
  icon: Icon,
  title,
  text,
  on,
  onToggle,
  toggleLabel,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  toggleLabel: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-mocha via-roast to-espresso p-5 ring-1 ring-sand/15 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full opacity-25 blur-3xl" style={{ background: accent }} aria-hidden />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-crema/[0.06] ring-1 ring-sand/15" style={{ color: accent }}>
          <Icon className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-semibold text-crema">{title}</h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                on ? "bg-emerald-500/12 text-emerald-300 ring-emerald-400/25" : "bg-crema/[0.05] text-crema/55 ring-sand/15",
              )}
            >
              <span className={cn("size-1.5 rounded-full", on ? "bg-emerald-400" : "bg-crema/35")} aria-hidden />
              {on ? "Attivo" : "Spento"}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-crema/65">{text}</p>
        </div>
        <Toggle checked={on} onChange={onToggle} label={toggleLabel} />
      </div>
    </div>
  );
}

/** Scheda di un servizio (Disboard, Discadia, Top.gg). */
function ServiceCard({
  brand,
  on,
  onToggle,
  subtitle,
  children,
}: {
  brand: (typeof BRAND)[keyof typeof BRAND];
  on: boolean;
  onToggle: (v: boolean) => void;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      layout
      className={cn("rounded-2xl bg-espresso/45 p-4 ring-1 transition-colors", on ? "ring-sand/20" : "ring-sand/10 opacity-70")}
      style={on ? { boxShadow: `inset 3px 0 0 ${brand.color}` } : undefined}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white" style={{ background: brand.color }} aria-hidden>
          {brand.initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-crema">{brand.label}</p>
          <p className="truncate text-xs text-crema/55">{on ? subtitle : "Spento"}</p>
        </div>
        <Toggle size="sm" checked={on} onChange={onToggle} label={brand.label} />
      </div>
      <AnimatePresence initial={false}>
        {on && children ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="pt-4">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/** Controllo a pillole (es. Ringraziamento / Promemoria, Disboard / Discadia). */
function Pills<K extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: K;
  onChange: (k: K) => void;
  options: { id: K; label: string; icon?: React.ComponentType<{ className?: string }>; dot?: string }[];
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-espresso/70 p-1 ring-1 ring-sand/10" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value === o.id;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              on ? "text-crema" : "text-crema/55 hover:text-crema",
            )}
          >
            {on ? <motion.span layoutId={`pill-${ariaLabel}`} className="absolute inset-0 rounded-lg bg-mocha ring-1 ring-sand/15" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
            <span className="relative inline-flex items-center gap-1.5">
              {o.dot ? <span className="size-2 rounded-full" style={{ background: o.dot }} aria-hidden /> : null}
              {Icon ? <Icon className="size-3.5" /> : null}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Sezione con titolo e icona. */
function Section({ icon: Icon, title, text, right, children }: { icon: React.ComponentType<{ className?: string }>; title: string; text?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-roast/60 p-4 ring-1 ring-sand/10 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-caramel/12 text-ember">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-crema">{title}</h3>
          {text ? <p className="text-xs text-crema/55">{text}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Editor del messaggio + anteprima affiancati. */
function Studio({ editor, preview }: { editor: React.ReactNode; preview: React.ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0">{editor}</div>
      <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Anteprima</p>
        {preview}
      </div>
    </div>
  );
}

/** Barra in basso quando ci sono modifiche da salvare. */
function SaveBar({ show, busy, onSave, onReset }: { show: boolean; busy: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="sticky bottom-4 z-20 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-mocha/95 px-4 py-3 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.85)] ring-1 ring-sand/20 backdrop-blur"
        >
          <span className="size-2 rounded-full bg-ember" aria-hidden />
          <p className="flex-1 text-sm font-medium text-crema">Hai modifiche non salvate</p>
          <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-crema/70 hover:text-crema" disabled={busy} onClick={onReset}>
            Annulla
          </button>
          <button type="button" className={primaryMini} disabled={busy} onClick={onSave}>
            <Check className="size-3.5" /> Salva
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Riquadro "chi fa X riceve @ruolo per N ore". */
function RewardSummary({ roleName, hours, verb }: { roleName: string | null; hours: number; verb: string }) {
  return (
    <p className="rounded-xl bg-espresso/45 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-sand/10">
      {roleName ? (
        <>
          Chi {verb} riceve <span className="font-semibold text-ember">@{roleName}</span> per <span className="font-semibold text-crema">{fmtHours(hours)}</span>, poi il bot lo toglie da solo.
        </>
      ) : (
        <>Nessun ruolo di ricompensa: scegline uno qui sotto se vuoi premiare chi {verb}.</>
      )}
    </p>
  );
}

function ExpCards({ keys, cfg, setExp }: { keys: BumpExpKey[]; cfg: BumpVotesConfig; setExp: (k: BumpExpKey, p: Partial<BumpExp>) => void }) {
  if (!cfg.exp) return null;
  return (
    <Section icon={Zap} title="EXP" text="Solo sul server principale, dove ci sono i livelli. Stessi calcoli del sistema classico.">
      <div className="grid gap-3 lg:grid-cols-2">
        {keys.map((k) => {
          const x = cfg.exp![k];
          const isVote = k === "topgg" || k === "discadiaVote";
          return (
            <div key={k} className={cn("rounded-2xl bg-espresso/45 p-4 ring-1", x.enabled ? "ring-sand/20" : "ring-sand/10 opacity-70")}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-crema">{EXP_LABEL[k]}</p>
                  <p className="text-xs text-crema/55">
                    {x.enabled ? (x.minExp === x.maxExp ? `${x.minExp} EXP` : `da ${x.minExp} a ${x.maxExp} EXP`) : "Nessun EXP"}
                  </p>
                </div>
                <Toggle size="sm" checked={x.enabled} onChange={(enabled) => setExp(k, { enabled })} label={EXP_LABEL[k]} />
              </div>
              {x.enabled ? (
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
                  <Field label="EXP minimi">
                    <NumberField value={x.minExp} min={0} max={100000} onChange={(v) => setExp(k, { minExp: Number(v) || 0 })} aria-label="EXP minimi" />
                  </Field>
                  <Field label="EXP massimi">
                    <NumberField value={x.maxExp} min={0} max={100000} onChange={(v) => setExp(k, { maxExp: Number(v) || 0 })} aria-label="EXP massimi" />
                  </Field>
                  {isVote ? (
                    <Field label="Primo voto" hint="0 = come gli altri.">
                      <NumberField value={x.firstTimeExp} min={0} max={100000} onChange={(v) => setExp(k, { firstTimeExp: Number(v) || 0 })} aria-label="EXP primo voto" />
                    </Field>
                  ) : null}
                  <Field label="Rapida: entro minuti" hint="0 = niente bonus.">
                    <NumberField value={x.fastWindowMinutes} min={0} max={1440} onChange={(v) => setExp(k, { fastWindowMinutes: Number(v) || 0 })} aria-label="Minuti risposta rapida" />
                  </Field>
                  <Field label="Rapida: ×">
                    <NumberField value={x.fastMultiplier} min={1} max={10} step={0.1} onChange={(v) => setExp(k, { fastMultiplier: Math.max(1, Number(v) || 1) })} aria-label="Moltiplicatore risposta rapida" />
                  </Field>
                  <Field label="Serie: % per volta">
                    <NumberField value={x.streakPercent} min={0} max={1000} onChange={(v) => setExp(k, { streakPercent: Number(v) || 0 })} aria-label="Percentuale serie" />
                  </Field>
                  <Field label="Serie: % massima">
                    <NumberField value={x.streakMaxPercent} min={0} max={10000} onChange={(v) => setExp(k, { streakMaxPercent: Number(v) || 0 })} aria-label="Percentuale massima serie" />
                  </Field>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/* ───────────── pagina Bump ───────────── */

export function BumpPanel({ guildId, token, onToast }: PanelProps) {
  const h = useBumpVotesConfig(guildId, token);
  const { data, error, cfg, set, isMain, loadError, busy, setBusy, dirty, imported } = h;
  const [kind, setKind] = useState<"thanks" | "reminder">("thanks");
  const [svc, setSvc] = useState<BumpService>("disboard");
  const baseVars = useSampleVars(data);
  const reminderRoleId = cfg?.reminder?.roleId || null;
  const vars = useMemo(
    () => ({ ...baseVars, count: "12", role: reminderRoleId ? `<@&${reminderRoleId}>` : "", exp: "150", streak: "3", bonus: "🔥 Streak 3 **+20 exp**" }),
    [baseVars, reminderRoleId],
  );

  if (loadError && isMain == null) return <Notice error>{loadError}</Notice>;
  if (isMain == null) return <RowsSkeleton rows={4} />;
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const roles = [{ value: "", label: "— Nessuno —" }, ...roleOptions(data.pickers.roles, guildId)];
  const roleName = (id: string | null) => (id ? data.pickers.roles.find((r) => r.id === id)?.name || "ruolo" : null);
  const channels = data.pickers.textChannels;
  const setService = (s: BumpService, p: Partial<BumpVotesConfig["services"][BumpService]>) => set({ ...cfg, services: { ...cfg.services, [s]: { ...cfg.services[s], ...p } } });
  const setExp = (k: BumpExpKey, p: Partial<BumpExp>) => cfg.exp && set({ ...cfg, exp: { ...cfg.exp, [k]: { ...cfg.exp[k], ...p } } });
  const bumpPh = isMain ? [...BUMP_PLACEHOLDERS, ...EXP_PLACEHOLDERS] : BUMP_PLACEHOLDERS;
  const msgOn = kind === "thanks" ? cfg.thanks.enabled : cfg.reminder.enabled;
  const draft = kind === "thanks" ? cfg.services[svc].thanksDraft : cfg.services[svc].reminderDraft;

  const save = async () => {
    setBusy(true);
    const patch: Partial<BumpVotesConfig> = {
      enabled: cfg.enabled,
      services: cfg.services,
      thanks: cfg.thanks,
      reminder: cfg.reminder,
      reward: cfg.reward,
      ...(isMain && cfg.exp ? { exp: Object.fromEntries(BUMP_EXP_KEYS.map((k) => [k, cfg.exp![k]])) as BumpVotesConfig["exp"] } : {}),
    };
    const r = await communityApi.saveBumpVotes(token, guildId, patch);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    h.markSaved(r.data.config);
    onToast("Bump salvati.");
  };

  return (
    <div className="space-y-5 pb-4">
      <Hero
        icon={Rocket}
        title="Bump"
        text="Quando qualcuno usa /bump su Disboard o Discadia il bot ringrazia, dà la ricompensa e avvisa quando si può bumpare di nuovo."
        on={cfg.enabled}
        onToggle={(enabled) => set({ ...cfg, enabled })}
        toggleLabel="Attiva i bump"
        accent="#7289ff"
      />

      {imported ? <Notice>Ho importato le impostazioni di adesso del server principale. Sono spente: accendile quando vuoi passare al modulo.</Notice> : null}

      <div className={cn("space-y-5 transition-opacity", !cfg.enabled && "pointer-events-none opacity-45")} aria-disabled={!cfg.enabled}>
        <div className="grid gap-3 md:grid-cols-2">
          {(["disboard", "discadia"] as const).map((s) => (
            <ServiceCard key={s} brand={BRAND[s]} on={cfg.services[s].enabled} onToggle={(enabled) => setService(s, { enabled })} subtitle={`Si bumpa ${fmtEvery(cfg.services[s].cooldownMinutes)}`}>
              <Field label="Minuti tra un bump e l'altro" hint={`Il promemoria parte ${fmtEvery(cfg.services[s].cooldownMinutes)}.`}>
                <NumberField value={cfg.services[s].cooldownMinutes} min={5} max={10080} onChange={(v) => setService(s, { cooldownMinutes: Number(v) || 5 })} aria-label="Minuti" />
              </Field>
            </ServiceCard>
          ))}
        </div>

        <Section
          icon={MessageSquareHeart}
          title="Messaggi"
          text="Il ringraziamento risponde al bump; il promemoria avvisa quando si può bumpare di nuovo."
          right={
            <Toggle
              size="sm"
              checked={msgOn}
              onChange={(v) => set(kind === "thanks" ? { ...cfg, thanks: { ...cfg.thanks, enabled: v } } : { ...cfg, reminder: { ...cfg.reminder, enabled: v } })}
              label={kind === "thanks" ? "Ringraziamento" : "Promemoria"}
            />
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Pills
              ariaLabel="Tipo di messaggio"
              value={kind}
              onChange={setKind}
              options={[
                { id: "thanks", label: "Ringraziamento", icon: Heart },
                { id: "reminder", label: "Promemoria", icon: BellRing },
              ]}
            />
            <Pills
              ariaLabel="Servizio"
              value={svc}
              onChange={setSvc}
              options={(["disboard", "discadia"] as const).map((s) => ({ id: s, label: SERVICE_LABEL[s], dot: BRAND[s].color }))}
            />
          </div>

          {kind === "reminder" && cfg.reminder.enabled ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <ChannelField label="Canale" hint="Vuoto = dove è stato fatto il bump." value={cfg.reminder.channelId} channels={channels} onChange={(channelId) => set({ ...cfg, reminder: { ...cfg.reminder, channelId } })} />
              <Field label="Ruolo da avvisare" hint="Vuoto = nessun ping.">
                <Select value={cfg.reminder.roleId || ""} onChange={(v) => set({ ...cfg, reminder: { ...cfg.reminder, roleId: v || null } })} options={roles} className="mt-1.5 h-11 rounded-lg" />
              </Field>
            </div>
          ) : null}

          {msgOn ? (
            <Studio
              editor={
                <DraftEditor
                  key={`${kind}-${svc}`}
                  value={draft}
                  onChange={(d) => setService(svc, kind === "thanks" ? { thanksDraft: d } : { reminderDraft: d })}
                  emojis={data.pickers.emojis}
                  placeholders={kind === "thanks" ? bumpPh : REMINDER_PLACEHOLDERS}
                  maxButtons={data.limits.buttons}
                />
              }
              preview={<DiscordMessagePreview bot={data.bot} draft={draft} vars={{ ...vars, service: SERVICE_LABEL[svc] }} roles={data.pickers.roles} channels={channels} />}
            />
          ) : (
            <p className="rounded-xl bg-espresso/45 px-3 py-6 text-center text-sm text-crema/55 ring-1 ring-sand/10">
              {kind === "thanks" ? "Il ringraziamento è spento." : "Il promemoria è spento."} Accendilo con l&apos;interruttore qui sopra.
            </p>
          )}
        </Section>

        <Section icon={Gift} title="Ricompensa" text="Un ruolo a tempo per chi bumpa.">
          <div className="space-y-3">
            <RewardSummary roleName={roleName(cfg.reward.roleId)} hours={cfg.reward.hours} verb="bumpa" />
            <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
              <Field label="Ruolo">
                <Select value={cfg.reward.roleId || ""} onChange={(v) => set({ ...cfg, reward: { ...cfg.reward, roleId: v || null } })} options={roles} className="mt-1.5 h-11 rounded-lg" />
              </Field>
              <Field label="Per quante ore">
                <NumberField value={cfg.reward.hours} min={1} max={720} onChange={(v) => set({ ...cfg, reward: { ...cfg.reward, hours: Number(v) || 1 } })} aria-label="Ore" />
              </Field>
            </div>
          </div>
        </Section>

        {isMain && cfg.exp ? <ExpCards keys={BUMP_EXP_KEYS} cfg={cfg} setExp={setExp} /> : null}
      </div>

      <SaveBar show={dirty} busy={busy} onSave={() => void save()} onReset={h.reset} />
    </div>
  );
}

/* ───────────── pagina Voti ───────────── */

export function VotesPanel({ guildId, token, onToast }: PanelProps) {
  const h = useBumpVotesConfig(guildId, token);
  const { data, error, cfg, set, urls, isMain, loadError, busy, setBusy, dirty, imported } = h;
  const [kind, setKind] = useState<"thanks" | "dm">("thanks");
  const [svc, setSvc] = useState<VoteService>("topgg");
  const [copied, setCopied] = useState<string | null>(null);
  const baseVars = useSampleVars(data);
  const vars = useMemo(() => ({ ...baseVars, count: "12", exp: "150", streak: "3", bonus: "🔥 Streak 3 **+20 exp**" }), [baseVars]);

  if (loadError && isMain == null) return <Notice error>{loadError}</Notice>;
  if (isMain == null) return <RowsSkeleton rows={4} />;
  if (error && !data) return <Notice error>{error}</Notice>;
  if (!data || !cfg) return <RowsSkeleton rows={4} />;

  const roles = [{ value: "", label: "— Nessuno —" }, ...roleOptions(data.pickers.roles, guildId)];
  const roleName = data.pickers.roles.find((r) => r.id === cfg.votes.rewardRoleId)?.name || null;
  const channels = data.pickers.textChannels;
  const votePh = isMain ? [...VOTE_PLACEHOLDERS, ...EXP_PLACEHOLDERS] : VOTE_PLACEHOLDERS;
  const setVoteService = (s: VoteService, p: Partial<BumpVotesConfig["votes"]["perService"][VoteService]>) =>
    set({ ...cfg, votes: { ...cfg.votes, perService: { ...cfg.votes.perService, [s]: { ...cfg.votes.perService[s], ...p } } } });
  const setExp = (k: BumpExpKey, p: Partial<BumpExp>) => cfg.exp && set({ ...cfg, exp: { ...cfg.exp, [k]: { ...cfg.exp[k], ...p } } });
  const showDm = kind === "dm" && isMain;
  const per = cfg.votes.perService[svc];
  const msgOn = showDm ? per.reminderEnabled !== false : cfg.votes.thanks.enabled && Boolean(cfg.votes.channelId);
  const draft = showDm ? per.reminderDraft : per.draft;

  const save = async () => {
    setBusy(true);
    const patch: Partial<BumpVotesConfig> = {
      votes: cfg.votes,
      ...(isMain && cfg.exp ? { exp: Object.fromEntries(VOTE_EXP_KEYS.map((k) => [k, cfg.exp![k]])) as BumpVotesConfig["exp"] } : {}),
    };
    const r = await communityApi.saveBumpVotes(token, guildId, patch);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    h.markSaved(r.data.config);
    h.setUrls(r.data.urls);
    onToast("Voti salvati.");
  };

  const regen = async () => {
    setBusy(true);
    const r = await communityApi.regenBumpVotesToken(token, guildId);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    h.setCfg((c) => (c ? { ...c, votes: { ...c.votes, token: r.data.config.votes.token } } : c));
    h.setUrls(r.data.urls);
    onToast("Nuovo indirizzo creato: aggiornalo su Top.gg e Discadia.");
  };

  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
      },
      () => onToast("Copia non riuscita.", true),
    );
  };

  const steps: Record<VoteService, string[]> = {
    topgg: ["Apri la pagina del server su Top.gg", "Vai in Webhooks", "Incolla l'indirizzo come Webhook URL e salva"],
    discadia: ["Apri le impostazioni del server su Discadia", "Vai in Webhook dei voti", "Incolla l'indirizzo e salva"],
  };

  return (
    <div className="space-y-5 pb-4">
      <Hero
        icon={Star}
        title="Voti"
        text="Collega Top.gg e Discadia: a ogni voto il bot ringrazia, dà il ruolo e, sul server principale, ricorda con un messaggio privato quando si può votare di nuovo."
        on={cfg.votes.enabled}
        onToggle={(enabled) => set({ ...cfg, votes: { ...cfg.votes, enabled } })}
        toggleLabel="Attiva i voti"
        accent="#ff3366"
      />

      {imported ? <Notice>Ho importato canale, testi, ruolo Voter e promemoria dal server principale. I voti del modulo sono spenti finché non li accendi.</Notice> : null}

      <div className={cn("space-y-5 transition-opacity", !cfg.votes.enabled && "pointer-events-none opacity-45")} aria-disabled={!cfg.votes.enabled}>
        <div className="grid gap-3 md:grid-cols-2">
          {(["topgg", "discadia"] as const).map((s) => (
            <ServiceCard
              key={s}
              brand={s === "topgg" ? BRAND.topgg : BRAND.discadia}
              on={cfg.votes[s]}
              onToggle={(on) => set({ ...cfg, votes: { ...cfg.votes, [s]: on } })}
              subtitle={`Ruolo per ${fmtHours(cfg.votes.perService[s].hours)} dopo ogni voto`}
            >
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-crema/50">Indirizzo webhook</p>
                  {urls ? (
                    <div className="flex items-center gap-2 rounded-xl bg-ink/40 p-1.5 pl-3 ring-1 ring-sand/10">
                      <code className="min-w-0 flex-1 truncate font-mono text-xs text-crema/80" title={urls[s]}>
                        {urls[s]}
                      </code>
                      <button
                        type="button"
                        onClick={() => copy(s, urls[s])}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                          copied === s ? "bg-emerald-500/15 text-emerald-300" : "bg-crema/[0.06] text-crema/80 hover:bg-crema/10",
                        )}
                      >
                        {copied === s ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {copied === s ? "Copiato" : "Copia"}
                      </button>
                    </div>
                  ) : null}
                  {dirty ? <p className="mt-1.5 text-xs text-ember/90">Salva prima di incollarlo: funziona dopo il salvataggio.</p> : null}
                </div>
                <ol className="space-y-1.5">
                  {steps[s].map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-crema/70">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-crema/[0.06] text-[0.65rem] font-bold text-crema/80">{i + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                <Field label="Ore del ruolo dopo un voto">
                  <NumberField value={cfg.votes.perService[s].hours} min={1} max={720} onChange={(v) => setVoteService(s, { hours: Number(v) || 1 })} aria-label={`Ore ${VOTE_LABEL[s]}`} />
                </Field>
              </div>
            </ServiceCard>
          ))}
        </div>
        <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-crema/55 hover:text-crema" disabled={busy} onClick={() => void regen()}>
          <RefreshCw className="size-3.5" /> Crea nuovi indirizzi (se quelli di adesso sono finiti in mani sbagliate)
        </button>

        <Section icon={Gift} title="Ricompensa" text="Lo stesso ruolo per tutti e due i siti; le ore si scelgono nelle schede qui sopra.">
          <div className="space-y-3">
            <RewardSummary roleName={roleName} hours={cfg.votes.perService.topgg.hours} verb="vota" />
            <Field label="Ruolo">
              <Select value={cfg.votes.rewardRoleId || ""} onChange={(v) => set({ ...cfg, votes: { ...cfg.votes, rewardRoleId: v || null } })} options={roles} className="mt-1.5 h-11 rounded-lg" />
            </Field>
          </div>
        </Section>

        <Section
          icon={Sparkles}
          title="Messaggi"
          text={isMain ? "Il ringraziamento va nel canale scelto; il promemoria arriva in privato quando si può votare di nuovo." : "Il ringraziamento va nel canale scelto a ogni voto."}
          right={
            <Toggle
              size="sm"
              checked={showDm ? per.reminderEnabled !== false : cfg.votes.thanks.enabled}
              onChange={(v) => (showDm ? setVoteService(svc, { reminderEnabled: v }) : set({ ...cfg, votes: { ...cfg.votes, thanks: { ...cfg.votes.thanks, enabled: v } } }))}
              label={showDm ? "Promemoria in privato" : "Ringraziamento"}
            />
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {isMain ? (
              <Pills
                ariaLabel="Tipo di messaggio dei voti"
                value={kind}
                onChange={setKind}
                options={[
                  { id: "thanks", label: "Ringraziamento", icon: Heart },
                  { id: "dm", label: "Promemoria in privato", icon: Timer },
                ]}
              />
            ) : null}
            <Pills
              ariaLabel="Sito dei voti"
              value={svc}
              onChange={setSvc}
              options={(["topgg", "discadia"] as const).map((s) => ({ id: s, label: VOTE_LABEL[s], dot: s === "topgg" ? BRAND.topgg.color : BRAND.discadia.color }))}
            />
          </div>

          {!showDm ? (
            <div className="mb-4 max-w-md">
              <ChannelField label="Canale dei ringraziamenti" hint="Vuoto = nessun messaggio, solo il ruolo." value={cfg.votes.channelId} channels={channels} onChange={(channelId) => set({ ...cfg, votes: { ...cfg.votes, channelId } })} />
            </div>
          ) : null}

          {msgOn ? (
            <Studio
              editor={
                <DraftEditor
                  key={`${kind}-${svc}`}
                  value={draft}
                  onChange={(d) => setVoteService(svc, showDm ? { reminderDraft: d } : { draft: d })}
                  emojis={data.pickers.emojis}
                  placeholders={showDm ? VOTE_DM_PLACEHOLDERS : votePh}
                  maxButtons={data.limits.buttons}
                />
              }
              preview={<DiscordMessagePreview bot={data.bot} draft={draft} vars={{ ...vars, service: VOTE_LABEL[svc] }} roles={data.pickers.roles} channels={channels} />}
            />
          ) : (
            <p className="rounded-xl bg-espresso/45 px-3 py-6 text-center text-sm text-crema/55 ring-1 ring-sand/10">
              {showDm ? "Il promemoria in privato è spento per questo sito." : !cfg.votes.channelId ? "Scegli il canale per scrivere il ringraziamento." : "Il ringraziamento è spento."}
            </p>
          )}
        </Section>

        {isMain && cfg.exp ? <ExpCards keys={VOTE_EXP_KEYS} cfg={cfg} setExp={setExp} /> : null}
      </div>

      <SaveBar show={dirty} busy={busy} onSave={() => void save()} onReset={h.reset} />
    </div>
  );
}

/** @deprecated usa BumpPanel / VotesPanel */
export function BumpVotesPanel(props: PanelProps) {
  return <BumpPanel {...props} />;
}

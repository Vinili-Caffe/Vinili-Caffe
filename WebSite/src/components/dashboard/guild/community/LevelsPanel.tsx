"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Gift, Megaphone, MessageSquare, Mic, Plus, Sparkles, Trash2, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { MultiSelect, Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, type LevelsConfig, type LevelsRoleMultiplier, type LevelsRoleReward, type PickerRole } from "@/lib/dashboard-community";
import { Field, Notice, Pills, RowsSkeleton, StatusBadge, Toggle, TrackUnsaved, fieldClass, labelClass, miniBtn } from "../bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, roleOptions, useCommunity, useSampleVars } from "./shared";

const LEVEL_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione di chi è salito di livello" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{level}", hint: "numero del livello raggiunto" },
  { token: "{avatar}", hint: "foto profilo (campi immagine)" },
  { token: "{server}", hint: "nome del server" },
];

const MILESTONE_PLACEHOLDERS = [
  ...LEVEL_PLACEHOLDERS,
  { token: "{role}", hint: "menzione del ruolo premio" },
  { token: "{roleid}", hint: "id del ruolo premio" },
  { token: "{perks}", hint: "canale vantaggi (menzione)" },
];

type Tab = "exp" | "ruoli" | "annunci";

/* ───────────── pezzi grafici ───────────── */

/** Scheda con icona, titolo, testo e (a destra) un interruttore o altro. */
function Card({
  icon: Icon,
  title,
  text,
  aside,
  off,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  aside?: React.ReactNode;
  off?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("relative overflow-hidden rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl ring-1 transition", off ? "bg-crema/[0.04] text-crema/35 ring-sand/10" : "bg-[#826bc2]/15 text-[#b9a6f0] ring-[#826bc2]/30")}>
          <Icon className="size-[1.1rem]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-semibold", off ? "text-crema/55" : "text-crema")}>{title}</h3>
          {text ? <p className="mt-0.5 text-xs leading-relaxed text-crema/55">{text}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-center">{aside}</div> : null}
      </div>
      <div className={cn("mt-4 transition-opacity", off && "pointer-events-none opacity-45")}>{children}</div>
    </section>
  );
}

/** Numero grande con la sua etichetta (EXP per messaggio, al minuto…). */
function BigNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="w-28">
          <NumberField value={value} min={min} max={max} step={step} disabled={disabled} onChange={(v) => onChange(Number(v) || 0)} aria-label={label} />
        </div>
        {suffix ? <span className="text-sm font-semibold text-crema/60">{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-2 text-xs text-crema/50">{hint}</p> : null}
    </div>
  );
}

const roleColor = (roles: PickerRole[], id: string) => {
  const c = roles.find((r) => r.id === id)?.color;
  return c && c !== "#000000" ? c : "#99aab5";
};

/* ───────────── pannello ───────────── */

export function LevelsPanel({ guildId, token, onToast }: { guildId: string; token: string; onToast: (msg: string, err?: boolean) => void }) {
  const { data } = useCommunity(guildId, token);
  const baseVars = useSampleVars(data);
  const [cfg, setCfg] = useState<LevelsConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [imported, setImported] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("exp");
  const [announce, setAnnounce] = useState<"level" | "milestone">("level");

  useEffect(() => {
    let alive = true;
    void communityApi.getLevels(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setCfg(r.data.config);
      setSaved(JSON.stringify(r.data.config));
      setImported(r.data.imported === true);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  const vars = useMemo(
    () => ({
      ...baseVars,
      user: baseVars.user || "@Mario",
      username: baseVars.username || "Mario",
      level: "42",
      role: "@Level 50",
      roleid: "100000000000000050",
      perks: "#supporters",
    }),
    [baseVars],
  );

  if (loadError && !cfg) return <Notice error>{loadError}</Notice>;
  if (!cfg || !data) return <RowsSkeleton rows={8} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const channels = data.pickers.textChannels;
  const pickerRoles = data.pickers.roles;
  const roles = roleOptions(pickerRoles, guildId);
  const set = (patch: Partial<LevelsConfig>) => setCfg({ ...cfg, ...patch });

  const save = async () => {
    const r = await communityApi.saveLevels(token, guildId, cfg);
    if (!r.ok) return onToast(r.message, true);
    setCfg(r.data.config);
    setSaved(JSON.stringify(r.data.config));
    setImported(false);
    onToast("Livelli e EXP salvati.");
  };
  const reset = () => {
    try {
      setCfg(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  };

  const setReward = (i: number, patch: Partial<LevelsRoleReward>) => set({ roleRewards: cfg.roleRewards.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
  const setMult = (i: number, patch: Partial<LevelsRoleMultiplier>) =>
    set({ roleMultipliers: cfg.roleMultipliers.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });

  /* premi in ordine di livello, ricordando la posizione originale per modificarli */
  const rewards = cfg.roleRewards.map((row, i) => ({ row, i })).sort((a, b) => a.row.level - b.row.level);
  const nextRewardLevel = (cfg.roleRewards.reduce((m, r) => Math.max(m, r.level), 0) || 0) + 10;
  const mults = cfg.roleMultipliers.map((row, i) => ({ row, i }));
  const voicePerHour = Math.round(cfg.voiceExpPerMinute * 60 * cfg.globalMultiplier);

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />
      {imported ? (
        <Notice>Ho importato tassi, moltiplicatori, canali bloccati e ruoli premio che il bot usa già su questo server. Puoi cambiarli liberamente da qui.</Notice>
      ) : null}

      {/* riepilogo in alto */}
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          { icon: MessageSquare, label: "Per messaggio", value: cfg.messageEnabled ? `${cfg.messageExp} EXP` : "spento" },
          { icon: Mic, label: "In vocale, all'ora", value: cfg.voiceEnabled ? `≈ ${voicePerHour.toLocaleString("it-IT")} EXP` : "spento" },
          { icon: Sparkles, label: "Moltiplicatore", value: `×${cfg.globalMultiplier} · max ×${cfg.maxCombinedMultiplier}` },
          { icon: Gift, label: "Ruoli premio", value: String(cfg.roleRewards.length) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl bg-espresso/45 px-3.5 py-3 ring-1 ring-sand/10">
            <Icon className="size-4 shrink-0 text-[#b9a6f0]" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/45">{label}</p>
              <p className="truncate text-sm font-semibold text-crema">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <Pills
        value={tab}
        onChange={setTab}
        ariaLabel="Sezioni livelli"
        options={[
          { id: "exp", label: "Guadagno EXP", icon: TrendingUp },
          { id: "ruoli", label: "Ruoli premio", icon: Trophy },
          { id: "annunci", label: "Annunci", icon: Megaphone },
        ]}
      />

      {tab === "exp" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              icon={MessageSquare}
              title="Chat"
              text="EXP per ogni messaggio che conta."
              off={!cfg.messageEnabled}
              aside={<Toggle checked={cfg.messageEnabled} onChange={(messageEnabled) => set({ messageEnabled })} label="EXP dai messaggi" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <BigNumber label="EXP per messaggio" value={cfg.messageExp} min={0} max={500} onChange={(messageExp) => set({ messageExp })} suffix="EXP" />
                <BigNumber
                  label="Pausa tra un premio e l'altro"
                  value={cfg.messageCooldownSec}
                  min={0}
                  max={3600}
                  onChange={(messageCooldownSec) => set({ messageCooldownSec })}
                  suffix="sec"
                  hint={cfg.messageCooldownSec > 0 ? "Contro lo spam di messaggi brevi." : "0 = ogni messaggio dà EXP."}
                />
              </div>
            </Card>
            <Card
              icon={Mic}
              title="Vocale"
              text="EXP per ogni minuto passato in un canale vocale."
              off={!cfg.voiceEnabled}
              aside={<Toggle checked={cfg.voiceEnabled} onChange={(voiceEnabled) => set({ voiceEnabled })} label="EXP dal vocale" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <BigNumber label="EXP al minuto" value={cfg.voiceExpPerMinute} min={0} max={500} onChange={(voiceExpPerMinute) => set({ voiceExpPerMinute })} suffix="EXP" />
                <div className="flex flex-col justify-center rounded-2xl bg-[#826bc2]/10 p-3.5 ring-1 ring-[#826bc2]/20">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Un&apos;ora in vocale</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-crema lining-nums">≈ {voicePerHour.toLocaleString("it-IT")} EXP</p>
                  <p className="text-xs text-crema/50">col moltiplicatore globale, senza bonus dei ruoli</p>
                </div>
              </div>
            </Card>
          </div>

          <Card icon={Sparkles} title="Moltiplicatori" text="Il globale vale per tutti; chi ha un ruolo con bonus prende il più alto dei suoi ruoli in più, fino al tetto.">
            <div className="grid gap-3 sm:grid-cols-2">
              <BigNumber
                label="Moltiplicatore globale"
                value={cfg.globalMultiplier}
                min={0.1}
                max={50}
                step={0.1}
                onChange={(v) => set({ globalMultiplier: Math.max(0.1, v || 1) })}
                suffix="×"
                hint="Gli eventi temporanei si aggiungono sopra."
              />
              <BigNumber
                label="Tetto massimo"
                value={cfg.maxCombinedMultiplier}
                min={1}
                max={50}
                step={0.1}
                onChange={(v) => set({ maxCombinedMultiplier: Math.max(1, v || 8) })}
                suffix="×"
                hint="Globale + bonus ruolo non vanno oltre."
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className={labelClass}>Bonus per ruolo</p>
                <StatusBadge>{cfg.roleMultipliers.length} ruoli</StatusBadge>
              </div>
              {mults.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {mults.map(({ row, i }) => (
                    <li key={i} className="flex items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <Select value={row.roleId} onChange={(roleId) => setMult(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo" />
                      </div>
                      <div className="w-24 shrink-0">
                        <NumberField value={row.multiplier} min={0.1} max={20} step={0.05} onChange={(v) => setMult(i, { multiplier: Math.max(0.1, Number(v) || 1) })} aria-label="Moltiplicatore del ruolo" />
                      </div>
                      <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ roleMultipliers: cfg.roleMultipliers.filter((_, j) => j !== i) })} aria-label="Togli il bonus">
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun ruolo con bonus: tutti guadagnano col solo moltiplicatore globale.</p>
              )}
              <button
                type="button"
                className={cn(miniBtn, "mt-2")}
                disabled={!roles.length}
                onClick={() => set({ roleMultipliers: [...cfg.roleMultipliers, { roleId: roles.find((r) => !cfg.roleMultipliers.some((m) => m.roleId === r.value))?.value || roles[0]?.value || "", multiplier: 1.5 }] })}
              >
                <Plus className="size-3.5" aria-hidden /> Aggiungi bonus
              </button>
            </div>
          </Card>

          <Card icon={Ban} title="Esclusioni" text="Dove e per chi l'EXP non conta.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Canali senza EXP" hint="Messaggi e vocale qui non danno EXP.">
                <MultiSelect value={cfg.lockedChannelIds} onChange={(lockedChannelIds) => set({ lockedChannelIds })} options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} className={fieldClass} placeholder="Nessuno" />
              </Field>
              <Field label="Ruoli senza EXP" hint="Chi ha uno di questi ruoli non guadagna EXP.">
                <MultiSelect value={cfg.ignoredRoleIds} onChange={(ignoredRoleIds) => set({ ignoredRoleIds })} options={roles} className={fieldClass} placeholder="Nessuno" />
              </Field>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "ruoli" ? (
        <div className="space-y-4">
          <Card icon={Trophy} title="Ruoli premio" text="Arrivato al livello, il bot dà il ruolo. Chi lo supera senza averlo lo riceve lo stesso.">
            {rewards.length ? (
              <ol className="relative space-y-2 pl-5 before:absolute before:bottom-3 before:left-[0.55rem] before:top-3 before:w-px before:bg-gradient-to-b before:from-[#826bc2]/60 before:to-transparent">
                {rewards.map(({ row, i }) => (
                  <li key={i} className="relative flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                    <span className="absolute -left-[1.15rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[#826bc2] ring-4 ring-roast" aria-hidden />
                    <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Lv</span>
                    <div className="w-24 shrink-0">
                      <NumberField value={row.level} min={1} max={10000} onChange={(v) => setReward(i, { level: Math.max(1, Number(v) || 1) })} aria-label="Livello del premio" />
                    </div>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                    <div className="min-w-[10rem] flex-1">
                      <Select value={row.roleId} onChange={(roleId) => setReward(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo premio" />
                    </div>
                    <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ roleRewards: cfg.roleRewards.filter((_, j) => j !== i) })} aria-label="Togli il premio">
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun ruolo premio: si sale di livello e basta.</p>
            )}
            <button
              type="button"
              className={cn(miniBtn, "mt-3")}
              disabled={!roles.length}
              onClick={() => set({ roleRewards: [...cfg.roleRewards, { level: nextRewardLevel, roleId: roles[0]?.value || "" }] })}
            >
              <Plus className="size-3.5" aria-hidden /> Aggiungi premio (livello {nextRewardLevel})
            </button>
          </Card>

          <Card
            icon={Gift}
            title="Ruolo vantaggio"
            text="Un ruolo in più da un certo livello, per esempio i permessi per mandare foto."
            aside={cfg.perkRoleId ? <StatusBadge tone="accent">dal livello {cfg.perkMinLevel}</StatusBadge> : <StatusBadge>nessuno</StatusBadge>}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <Field label="Ruolo">
                <Select value={cfg.perkRoleId || ""} onChange={(v) => set({ perkRoleId: v || null })} options={[{ value: "", label: "Nessuno" }, ...roles]} className={fieldClass} />
              </Field>
              <Field label="Dal livello">
                <div className="mt-1.5">
                  <NumberField value={cfg.perkMinLevel} min={0} max={10000} disabled={!cfg.perkRoleId} onChange={(v) => set({ perkMinLevel: Math.max(0, Number(v) || 0) })} aria-label="Livello del ruolo vantaggio" />
                </div>
              </Field>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "annunci" ? (
        <div className="space-y-4">
          <Card icon={Megaphone} title="Dove si annuncia" text="Il canale dei messaggi di level-up. Vuoto = il canale comandi predefinito del bot.">
            <ChannelField label="Canale" value={cfg.levelUpChannelId} channels={channels} onChange={(levelUpChannelId) => set({ levelUpChannelId })} />
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Pills
              value={announce}
              onChange={setAnnounce}
              ariaLabel="Messaggio di level-up"
              options={[
                { id: "level", label: "Nuovo livello", icon: TrendingUp },
                { id: "milestone", label: "Ruolo premio sbloccato", icon: Trophy },
              ]}
            />
            <p className="text-xs text-crema/55">
              {announce === "level" ? "A ogni livello senza premio." : cfg.roleRewards.length ? "Quando il livello dà un ruolo premio: usa {role} e {perks}." : "Senza ruoli premio non viene mai usato."}
            </p>
          </div>

          <EditorWithPreview
            editor={
              <DraftEditor
                key={announce}
                value={announce === "level" ? cfg.levelUpDraft : cfg.milestoneDraft}
                onChange={(d) => set(announce === "level" ? { levelUpDraft: d } : { milestoneDraft: d })}
                emojis={data.pickers.emojis}
                placeholders={announce === "level" ? LEVEL_PLACEHOLDERS : MILESTONE_PLACEHOLDERS}
                maxButtons={data.limits.buttons}
              />
            }
            preview={
              <DiscordMessagePreview
                testChannelId={cfg.levelUpChannelId || undefined}
                bot={data.bot}
                draft={announce === "level" ? cfg.levelUpDraft : cfg.milestoneDraft}
                vars={vars}
                roles={pickerRoles}
                channels={channels}
              />
            }
          />
        </div>
      ) : null}
    </div>
  );
}

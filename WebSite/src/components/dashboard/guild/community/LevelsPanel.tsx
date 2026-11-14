"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Gamepad2, Gift, Megaphone, MessageSquare, Mic, Plus, RefreshCw, Search, Sparkles, Star, Timer, Trash2, TrendingUp, Trophy, UserRound, X, type LucideIcon } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { MultiSelect, Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { communityApi, type LevelsConfig, type LevelsEvent, type LevelsRoleMultiplier, type LevelsRoleReward, type LevelsUser, type LevelsUserAction, type PickerRole } from "@/lib/dashboard-community";
import { searchTicketMembers, type MemberHit } from "@/lib/dashboard-guild-ops";
import { Field, Notice, Pills, RowsSkeleton, StatusBadge, Toggle, TrackUnsaved, dangerBtn, dashPrimaryBtn, fieldClass, labelClass, miniBtn } from "../bits";
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

type Tab = "exp" | "ruoli" | "annunci" | "utenti";

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
        <div className="w-36">
          <NumberField className="!mt-0" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(v) => onChange(Number(v) || 0)} aria-label={label} />
        </div>
        {suffix ? <span className="self-center text-sm font-semibold text-crema/60">{suffix}</span> : null}
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

export function LevelsPanel({
  guildId,
  token,
  onToast,
  tab = "exp",
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  /** scheda scelta nell'elenco laterale */
  tab?: Tab;
}) {
  const { data } = useCommunity(guildId, token);
  const baseVars = useSampleVars(data);
  const [cfg, setCfg] = useState<LevelsConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [imported, setImported] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<"level" | "milestone">("level");
  const [isMain, setIsMain] = useState(false);
  const [event, setEvent] = useState<LevelsEvent | null>(null);

  useEffect(() => {
    let alive = true;
    void communityApi.getLevels(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setCfg(r.data.config);
      setSaved(JSON.stringify(r.data.config));
      setImported(r.data.imported === true);
      setIsMain(r.data.isMainGuild === true);
      setEvent(r.data.event || null);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  /* {role} come un vero ruolo del server: il primo ruolo premio (o uno qualsiasi) */
  const sampleRoleId = cfg?.roleRewards?.[0]?.roleId || data?.pickers.roles.find((r) => !r.managed && r.id !== guildId)?.id || "";
  const vars = useMemo(
    () => ({
      ...baseVars,
      user: baseVars.user || "@Mario",
      username: baseVars.username || "Mario",
      level: "42",
      role: sampleRoleId ? `<@&${sampleRoleId}>` : "@Level 50",
      roleid: sampleRoleId || "100000000000000050",
      perks: "#supporters",
    }),
    [baseVars, sampleRoleId],
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
  const games = (cfg.minigameRewards || []).map((row, i) => ({ row, i })).sort((a, b) => a.row.exp - b.row.exp);
  const setGame = (i: number, patch: Partial<{ exp: number; roleId: string }>) =>
    set({ minigameRewards: (cfg.minigameRewards || []).map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
  const nextGameExp = Math.max(500, ...(cfg.minigameRewards || []).map((r) => r.exp * 2));

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />
      {imported ? (
        <Notice>Ho importato tassi, moltiplicatori, canali bloccati e ruoli premio che il bot usa già su questo server. Puoi cambiarli liberamente da qui.</Notice>
      ) : null}

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
                <div className="rounded-2xl bg-[#826bc2]/10 p-3.5 ring-1 ring-[#826bc2]/20">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Un&apos;ora in vocale</p>
                  <p className="mt-2 flex h-10 items-center font-display text-2xl font-semibold text-crema lining-nums">≈ {voicePerHour.toLocaleString("it-IT")} EXP</p>
                  <p className="mt-2 text-xs text-crema/50">col moltiplicatore globale, senza bonus dei ruoli</p>
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
                      <div className="w-36 shrink-0">
                        <NumberField className="!mt-0" value={row.multiplier} min={0.1} max={20} step={0.05} onChange={(v) => setMult(i, { multiplier: Math.max(0.1, Number(v) || 1) })} aria-label="Moltiplicatore del ruolo" />
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

          <EventCard guildId={guildId} token={token} event={event} onEvent={setEvent} onToast={onToast} />

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

          <Card icon={Gift} title="Bonus chat" text="Premi una tantum: primo messaggio del giorno e saluto a chi entra.">
            {(() => {
              const first = cfg.bonuses?.firstMessageDaily || { enabled: true, amount: 150, channelIds: [] };
              const welcome = cfg.bonuses?.welcomeGreeting || { enabled: true, amount: 30, channelIds: [] };
              const setBonus = (key: "firstMessageDaily" | "welcomeGreeting", patch: Partial<typeof first>) =>
                set({
                  bonuses: {
                    firstMessageDaily: key === "firstMessageDaily" ? { ...first, ...patch } : first,
                    welcomeGreeting: key === "welcomeGreeting" ? { ...welcome, ...patch } : welcome,
                  },
                });
              return (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className={cn("rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10", !first.enabled && "opacity-55")}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-crema">Primo messaggio del giorno</p>
                      <Toggle size="sm" checked={first.enabled} onChange={(enabled) => setBonus("firstMessageDaily", { enabled })} label="Primo messaggio" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="EXP">
                        <NumberField value={first.amount} min={0} max={100000} disabled={!first.enabled} onChange={(v) => setBonus("firstMessageDaily", { amount: Number(v) || 0 })} aria-label="EXP primo messaggio" />
                      </Field>
                      <Field label="Canali" hint="Vuoto = #chat predefinito.">
                        <MultiSelect value={first.channelIds} onChange={(channelIds) => setBonus("firstMessageDaily", { channelIds })} options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} className={fieldClass} placeholder="Default" disabled={!first.enabled} />
                      </Field>
                    </div>
                  </div>
                  <div className={cn("rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10", !welcome.enabled && "opacity-55")}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-crema">Saluto di benvenuto</p>
                      <Toggle size="sm" checked={welcome.enabled} onChange={(enabled) => setBonus("welcomeGreeting", { enabled })} label="Saluto benvenuto" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="EXP">
                        <NumberField value={welcome.amount} min={0} max={100000} disabled={!welcome.enabled} onChange={(v) => setBonus("welcomeGreeting", { amount: Number(v) || 0 })} aria-label="EXP saluto" />
                      </Field>
                      <Field label="Canali" hint="Vuoto = regole attuali del bot.">
                        <MultiSelect value={welcome.channelIds} onChange={(channelIds) => setBonus("welcomeGreeting", { channelIds })} options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} className={fieldClass} placeholder="Default" disabled={!welcome.enabled} />
                      </Field>
                    </div>
                  </div>
                </div>
              );
            })()}
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
                    <div className="w-36 shrink-0">
                      <NumberField className="!mt-0" value={row.level} min={1} max={10000} onChange={(v) => setReward(i, { level: Math.max(1, Number(v) || 1) })} aria-label="Livello del premio" />
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
                  <NumberField className="!mt-0" value={cfg.perkMinLevel} min={0} max={10000} disabled={!cfg.perkRoleId} onChange={(v) => set({ perkMinLevel: Math.max(0, Number(v) || 0) })} aria-label="Livello del ruolo vantaggio" />
                </div>
              </Field>
            </div>
          </Card>

          {isMain ? (
            <Card icon={Gamepad2} title="Premi minigiochi" text="Ruoli per chi accumula EXP vincendo i minigiochi. Lista vuota = nessun ruolo.">
              {games.length ? (
                <ol className="relative space-y-2 pl-5 before:absolute before:bottom-3 before:left-[0.55rem] before:top-3 before:w-px before:bg-gradient-to-b before:from-[#826bc2]/60 before:to-transparent">
                  {games.map(({ row, i }) => (
                    <li key={i} className="relative flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                      <span className="absolute -left-[1.15rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[#826bc2] ring-4 ring-roast" aria-hidden />
                      <div className="w-40 shrink-0">
                        <NumberField className="!mt-0" value={row.exp} min={1} max={100000000} step={100} onChange={(v) => setGame(i, { exp: Math.max(1, Number(v) || 1) })} aria-label="EXP dei minigiochi" />
                      </div>
                      <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">EXP</span>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                      <div className="min-w-[10rem] flex-1">
                        <Select value={row.roleId} onChange={(roleId) => setGame(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo premio minigiochi" />
                      </div>
                      <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ minigameRewards: (cfg.minigameRewards || []).filter((_, j) => j !== i) })} aria-label="Togli il premio">
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun premio: i minigiochi danno solo EXP.</p>
              )}
              <button
                type="button"
                className={cn(miniBtn, "mt-3")}
                disabled={!roles.length}
                onClick={() => set({ minigameRewards: [...(cfg.minigameRewards || []), { exp: nextGameExp, roleId: roles[0]?.value || "" }] })}
              >
                <Plus className="size-3.5" aria-hidden /> Aggiungi premio ({nextGameExp.toLocaleString("it-IT")} EXP)
              </button>
            </Card>
          ) : null}

          {isMain ? (
            <Card
              icon={Star}
              title="Recensione su Disboard"
              text="Livelli regalati a chi lascia una recensione al server (una volta sola)."
              aside={(cfg.reviewRewardLevels ?? 5) > 0 ? <StatusBadge tone="accent">+{cfg.reviewRewardLevels ?? 5} livelli</StatusBadge> : <StatusBadge>spento</StatusBadge>}
            >
              <div className="max-w-xs">
                <BigNumber
                  label="Livelli in regalo"
                  value={cfg.reviewRewardLevels ?? 5}
                  min={0}
                  max={100}
                  onChange={(v) => set({ reviewRewardLevels: Math.max(0, Math.floor(v || 0)) })}
                  suffix="livelli"
                  hint="0 = nessun premio."
                />
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "utenti" ? <UsersTab guildId={guildId} token={token} cfg={cfg} pickerRoles={pickerRoles} onToast={onToast} /> : null}

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

/* ───────────── evento EXP a tempo ───────────── */

function timeLeft(ms: number) {
  if (ms <= 0) return "finito";
  const m = Math.ceil(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d) return `${d}g ${h}h`;
  if (h) return `${h}h ${min}m`;
  return `${min}m`;
}

const EVENT_DURATIONS = [
  { hours: 1, label: "1 ora" },
  { hours: 3, label: "3 ore" },
  { hours: 6, label: "6 ore" },
  { hours: 24, label: "1 giorno" },
  { hours: 72, label: "3 giorni" },
  { hours: 168, label: "1 settimana" },
];

function EventCard({
  guildId,
  token,
  event,
  onEvent,
  onToast,
}: {
  guildId: string;
  token: string;
  event: LevelsEvent | null;
  onEvent: (e: LevelsEvent) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [multiplier, setMultiplier] = useState(2);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const endsAt = event?.expiresAt ? new Date(event.expiresAt).getTime() : 0;
  const active = Boolean(event?.active && endsAt > now);

  const run = async (body: { multiplier: number; hours: number } | { stop: true }) => {
    setBusy(true);
    const r = await communityApi.setLevelsEvent(token, guildId, body);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    onEvent(r.data.event);
    setNow(Date.now());
    onToast("stop" in body ? "Evento EXP chiuso." : `Evento ×${body.multiplier} avviato.`);
  };

  return (
    <Card
      icon={Timer}
      title="Evento EXP"
      text="Un moltiplicatore in più per un periodo, sopra a tutto il resto. Si spegne da solo."
      aside={active ? <StatusBadge tone="ok">attivo</StatusBadge> : <StatusBadge>nessuno</StatusBadge>}
    >
      {active && event ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[#826bc2]/12 p-4 ring-1 ring-[#826bc2]/30">
          <p className="font-display text-4xl font-semibold text-crema lining-nums">×{event.multiplier}</p>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-crema">Mancano {timeLeft(endsAt - now)}</p>
            <p className="text-xs text-crema/55">
              Finisce {new Date(endsAt).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <button type="button" className={dangerBtn} disabled={busy} onClick={() => void run({ stop: true })}>
            Chiudi ora
          </button>
        </div>
      ) : null}

      <div className={cn("grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]", active && "mt-4")}>
        <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Moltiplicatore</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-32">
              <NumberField className="!mt-0" value={multiplier} min={1.1} max={10} step={0.1} onChange={(v) => setMultiplier(Number(v) || 2)} aria-label="Moltiplicatore dell'evento" />
            </div>
            <span className="text-sm font-semibold text-crema/60">×</span>
          </div>
        </div>
        <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Durata</p>
          <div className="mt-2">
            <Pills value={String(hours)} onChange={(v) => setHours(Number(v))} ariaLabel="Durata dell'evento" options={EVENT_DURATIONS.map((d) => ({ id: String(d.hours), label: d.label }))} />
          </div>
        </div>
      </div>
      <button type="button" className={cn(dashPrimaryBtn, "mt-3")} disabled={busy || multiplier < 1.05} onClick={() => void run({ multiplier, hours })}>
        <Sparkles className="size-4" aria-hidden /> {active ? "Sostituisci l'evento" : "Avvia evento"} (×{multiplier} per {EVENT_DURATIONS.find((d) => d.hours === hours)?.label})
      </button>
    </Card>
  );
}

/* ───────────── scheda Utenti ───────────── */

function MemberSearch({ guildId, token, onPick }: { guildId: string; token: string; onPick: (m: MemberHit) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) return;
    const timer = window.setTimeout(async () => {
      const res = await searchTicketMembers(token, guildId, q);
      if (res.ok) setHits(res.data);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, token, guildId]);

  const q = query.trim();
  const shown = q.length >= 2 || /^\d{16,22}$/.test(q) ? hits : [];

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-crema/45" aria-hidden />
      <input
        value={query}
        placeholder="Cerca un membro per nome o ID"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={cn(fieldClass, "!mt-0 h-11 py-0 pl-10")}
        aria-label="Cerca un membro"
      />
      {open && shown.length ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl bg-mocha p-1 shadow-xl ring-1 ring-sand/15">
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-crema hover:bg-crema/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(m);
                  setQuery("");
                  setHits([]);
                  setOpen(false);
                }}
              >
                <span className="truncate font-semibold" translate="no">{m.label}</span>
                {m.label !== m.username ? <span className="truncate text-xs text-crema/50" translate="no">@{m.username}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function UsersTab({
  guildId,
  token,
  cfg,
  pickerRoles,
  onToast,
}: {
  guildId: string;
  token: string;
  cfg: LevelsConfig;
  pickerRoles: PickerRole[];
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [member, setMember] = useState<MemberHit | null>(null);
  const [user, setUser] = useState<LevelsUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"level" | "exp">("level");
  const [value, setValue] = useState(1);
  const [confirmReset, setConfirmReset] = useState(false);

  const pick = async (m: MemberHit) => {
    setMember(m);
    setUser(null);
    setConfirmReset(false);
    setLoading(true);
    const r = await communityApi.getLevelsUser(token, guildId, m.id);
    setLoading(false);
    if (!r.ok) return onToast(r.message, true);
    setUser(r.data.user);
  };

  const clear = () => {
    setMember(null);
    setUser(null);
    setConfirmReset(false);
  };

  const act = async (action: LevelsUserAction["action"]) => {
    if (!member) return;
    setBusy(true);
    const r = await communityApi.mutateLevelsUser(token, guildId, { userId: member.id, action, mode, value });
    setBusy(false);
    setConfirmReset(false);
    if (!r.ok) return onToast(r.message, true);
    setUser(r.data.user);
    if (action === "syncroles") {
      return onToast(r.data.rolesSynced ? "Ruoli premio risincronizzati." : "Il bot non ha il server in memoria: i ruoli si aggiornano al prossimo messaggio.", !r.data.rolesSynced);
    }
    const b = r.data.before;
    const u = r.data.user;
    const roles = r.data.rolesSynced ? "" : " I ruoli si aggiornano al prossimo messaggio.";
    onToast(`${member.label}: livello ${b.level} → ${u.level}, ${b.totalExp.toLocaleString("it-IT")} → ${u.totalExp.toLocaleString("it-IT")} EXP.${roles}`);
  };

  const sortedRewards = [...cfg.roleRewards].sort((a, b) => a.level - b.level);
  const earned = user ? sortedRewards.filter((r) => r.level <= user.level) : [];
  const nextReward = user ? sortedRewards.find((r) => r.level > user.level) : undefined;
  const roleName = (id: string) => pickerRoles.find((r) => r.id === id)?.name || "ruolo eliminato";
  const span = user ? Math.max(1, user.nextLevelExp - user.levelStartExp) : 1;
  const pct = user ? Math.min(100, Math.max(0, ((user.totalExp - user.levelStartExp) / span) * 100)) : 0;

  return (
    <div className="space-y-4">
      <Card icon={UserRound} title="Utenti" text="Cerca un membro per vedere il suo livello e cambiarlo a mano. Ogni modifica finisce nello storico livelli.">
        {member ? (
          <div className="flex items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#826bc2]/20 font-display text-lg font-semibold text-[#cdbdf7]" aria-hidden>
              {(member.label || member.username || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-crema" translate="no">
                {member.label}
              </p>
              <p className="truncate text-xs text-crema/50" translate="no">
                @{member.username} · {member.id}
              </p>
            </div>
            <button type="button" className={cn(miniBtn, "!px-2")} onClick={clear} aria-label="Cambia membro">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <MemberSearch guildId={guildId} token={token} onPick={(m) => void pick(m)} />
        )}
      </Card>

      {member && loading ? <RowsSkeleton rows={3} /> : null}

      {member && user ? (
        <>
          <section className="rounded-3xl bg-gradient-to-br from-[#826bc2]/20 via-roast/80 to-roast/70 p-5 ring-1 ring-[#826bc2]/25">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Livello</p>
                <p className="font-display text-5xl font-semibold leading-none text-crema lining-nums">{user.level}</p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">EXP totali</p>
                <p className="text-xl font-semibold text-crema lining-nums">{user.totalExp.toLocaleString("it-IT")}</p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Questa settimana</p>
                <p className="text-xl font-semibold text-crema lining-nums">{user.weeklyExp.toLocaleString("it-IT")}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-espresso/70">
                <div className="h-full rounded-full bg-[#9c86db]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-crema/55 lining-nums">
                {Math.max(0, user.nextLevelExp - user.totalExp).toLocaleString("it-IT")} EXP al livello {user.level + 1}
                {nextReward ? ` · prossimo ruolo premio al livello ${nextReward.level} (${roleName(nextReward.roleId)})` : ""}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {earned.length ? (
                earned.map((r) => (
                  <span key={`${r.level}-${r.roleId}`} className="inline-flex items-center gap-1.5 rounded-full bg-espresso/60 px-2.5 py-1 text-xs font-semibold text-crema/85 ring-1 ring-sand/10">
                    <span className="size-2 rounded-full" style={{ background: roleColor(pickerRoles, r.roleId) }} aria-hidden />
                    {roleName(r.roleId)}
                    <span className="text-crema/40">Lv {r.level}</span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-crema/50">Nessun ruolo premio ancora.</span>
              )}
            </div>
          </section>

          <Card icon={TrendingUp} title="Modifica" text="Imposta un valore preciso, oppure aggiungi o togli rispetto a quello attuale.">
            <div className="flex flex-wrap items-center gap-2">
              <Pills
                value={mode}
                onChange={setMode}
                ariaLabel="Cosa cambiare"
                options={[
                  { id: "level", label: "Livelli" },
                  { id: "exp", label: "EXP" },
                ]}
              />
              <div className="w-40">
                <NumberField
                  className="!mt-0"
                  value={value}
                  min={0}
                  max={mode === "level" ? 10000 : 2000000000}
                  step={mode === "level" ? 1 : 100}
                  onChange={(v) => setValue(Math.max(0, Math.floor(Number(v) || 0)))}
                  aria-label="Valore"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={dashPrimaryBtn} disabled={busy} onClick={() => void act("set")}>
                Imposta a {value.toLocaleString("it-IT")} {mode === "level" ? "liv." : "EXP"}
              </button>
              <button type="button" className={miniBtn} disabled={busy || value <= 0} onClick={() => void act("add")}>
                <Plus className="size-3.5" aria-hidden /> Aggiungi
              </button>
              <button type="button" className={miniBtn} disabled={busy || value <= 0} onClick={() => void act("remove")}>
                <Trash2 className="size-3.5" aria-hidden /> Togli
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-sand/10 pt-4">
              <button type="button" className={miniBtn} disabled={busy} onClick={() => void act("syncroles")}>
                <RefreshCw className="size-3.5" aria-hidden /> Risincronizza ruoli premio
              </button>
              {confirmReset ? (
                <>
                  <button type="button" className={dangerBtn} disabled={busy} onClick={() => void act("reset")}>
                    Sì, azzera tutto
                  </button>
                  <button type="button" className={miniBtn} onClick={() => setConfirmReset(false)}>
                    Annulla
                  </button>
                </>
              ) : (
                <button type="button" className={miniBtn} disabled={busy || user.totalExp === 0} onClick={() => setConfirmReset(true)}>
                  Azzera EXP
                </button>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

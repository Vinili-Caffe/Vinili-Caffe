"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MessageSquareText, Mic, Sparkles, Target, TrendingUp } from "lucide-react";
import { Range } from "@/components/ui/Range";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cleanRole, fmt, mult, type ProfileData } from "@/lib/profile";
import {
  combineMultiplier,
  estimateLevelEta,
  formatEta,
  getTotalExpForLevel,
  type LevelsSimCatalogRole,
  type LevelsSimConfig,
} from "@/lib/levelSim";
import { cn } from "@/lib/cn";

type RolePick = "attuale" | "base" | string;

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(Number(n) || 0)));
}

function LevelField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clampInt(Number(e.target.value), min, max))}
        className="mt-1.5 w-full rounded-2xl bg-crema/[0.06] px-3.5 py-3 font-display text-2xl font-semibold lining-nums tabular-nums text-crema outline-none ring-1 ring-sand/15 transition-[box-shadow,background-color] focus:bg-crema/[0.09] focus:ring-caramel/40"
      />
    </label>
  );
}

function ActivitySlider({
  icon,
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-crema/80">
          <span className="text-caramel [&>svg]:size-4">{icon}</span>
          {label}
        </p>
        <p className="font-display text-xl font-semibold lining-nums tabular-nums text-ember">{valueLabel}</p>
      </div>
      <Range value={value} min={min} max={max} step={step} onChange={onChange} aria-label={label} />
    </div>
  );
}

function EtaHeadline({ days, alreadyThere, zeroDaily }: { days: number; alreadyThere: boolean; zeroDaily: boolean }) {
  const reduce = useReducedMotion();
  if (alreadyThere) {
    return (
      <motion.p
        key="done"
        initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="font-display text-4xl font-semibold text-ember sm:text-5xl"
      >
        Sei già lì
      </motion.p>
    );
  }
  if (zeroDaily) {
    return (
      <motion.p
        key="zero"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="font-display text-3xl font-semibold text-crema/70 sm:text-4xl"
      >
        Imposta un po&apos; di attività
      </motion.p>
    );
  }
  const eta = formatEta(days);
  return (
    <motion.p
      key={`${eta.amount}-${eta.unit}`}
      initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="font-display text-4xl font-semibold tracking-tight text-crema sm:text-5xl"
    >
      <NumberTicker value={eta.amount} duration={0.55} className="lining-nums tabular-nums" />
      {eta.unit ? <span className="ml-2 text-caramel">{eta.unit}</span> : null}
    </motion.p>
  );
}

function ComparisonRow({
  label,
  badge,
  multiplier,
  days,
  active,
  current,
  hint,
}: {
  label: string;
  badge?: string;
  multiplier: number;
  days: number;
  active?: boolean;
  current?: boolean;
  hint?: string;
}) {
  const eta = formatEta(days);
  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-2xl px-3.5 py-3 transition-colors sm:grid-cols-[minmax(0,1.2fr)_auto_auto]",
        active ? "bg-caramel/15 ring-1 ring-caramel/30" : "bg-crema/[0.04] hover:bg-crema/[0.07]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-crema/90">
          {label}
          <span className="ml-2 font-display text-sm font-bold text-ember lining-nums">{mult(multiplier)}</span>
        </p>
        {hint ? <p className="truncate text-xs text-crema/45">{hint}</p> : null}
      </div>
      {badge ? (
        <span className="hidden rounded-full bg-crema/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-crema/55 sm:inline">
          {badge}
        </span>
      ) : (
        <span className="hidden sm:block" />
      )}
      <p className={cn("text-right font-display text-lg font-semibold lining-nums tabular-nums", current ? "text-ember" : "text-crema/80")}>
        {Number.isFinite(days) ? eta.label : "—"}
      </p>
    </li>
  );
}

/** Media giornaliera da totali/settimana (preferisce la settimana se c’è attività). */
function averageDailyActivity(p: ProfileData) {
  const joinedMs = p.joinedAt ? new Date(p.joinedAt).getTime() : NaN;
  const daysSinceJoin = Number.isFinite(joinedMs)
    ? Math.max(1, Math.floor((Date.now() - joinedMs) / 86_400_000) + 1)
    : 30;
  const msgWeekly = Math.max(0, Number(p.messages?.messagesWeekly) || 0);
  const msgTotal = Math.max(0, Number(p.messages?.messagesTotal) || 0);
  const msgDaily = Math.max(0, Number(p.messages?.messagesDaily) || 0);
  const voiceWeekly = Math.max(0, Number(p.voice?.voiceWeeklySeconds) || 0);
  const voiceTotal = Math.max(0, Number(p.voice?.voiceTotalSeconds) || 0);
  const voiceDaily = Math.max(0, Number(p.voice?.voiceDailySeconds) || 0);

  const avgMsgs =
    msgWeekly > 0
      ? msgWeekly / 7
      : msgTotal > 0
        ? msgTotal / daysSinceJoin
        : msgDaily;
  const avgVoiceSec =
    voiceWeekly > 0
      ? voiceWeekly / 7
      : voiceTotal > 0
        ? voiceTotal / daysSinceJoin
        : voiceDaily;

  return {
    messages: Math.max(0, Math.min(400, Math.round(avgMsgs))),
    voiceHours: Math.max(0, Math.min(12, Math.round((avgVoiceSec / 3600) * 10) / 10)),
  };
}

export function LevelSimulator({ p, sim }: { p: ProfileData; sim: LevelsSimConfig }) {
  const currentLevel = Math.max(0, Math.floor(p.level?.level ?? 0));
  const currentExp = Math.max(0, Math.floor(p.level?.exp ?? 0));
  const roleIds = useMemo(() => new Set(p.roles.map((r) => r.id)), [p.roles]);
  const avg = useMemo(() => averageDailyActivity(p), [p]);

  const [fromLevel, setFromLevel] = useState(currentLevel);
  const [toLevel, setToLevel] = useState(Math.min(1000, Math.max(currentLevel + 1, currentLevel + 10)));
  const [messages, setMessages] = useState(() => {
    const a = averageDailyActivity(p);
    return a.messages > 0 ? a.messages : 80;
  });
  const [voiceHours, setVoiceHours] = useState(() => {
    const a = averageDailyActivity(p);
    return a.voiceHours > 0 ? a.voiceHours : 1;
  });
  const [pick, setPick] = useState<RolePick>("attuale");
  const usingAvg = messages === avg.messages && Math.abs(voiceHours - avg.voiceHours) < 0.05;

  const startExp = useMemo(() => {
    if (fromLevel === currentLevel) return currentExp;
    return getTotalExpForLevel(fromLevel, sim.levelCurve);
  }, [fromLevel, currentLevel, currentExp, sim.levelCurve]);

  const activeRole = pick !== "attuale" && pick !== "base" ? sim.catalog.find((c) => c.key === pick) : null;
  const effectiveMult =
    pick === "attuale"
      ? Math.max(0.1, p.multiplier || 1)
      : pick === "base"
        ? combineMultiplier(sim.globalMultiplier, 1, sim.maxCombinedMultiplier)
        : combineMultiplier(sim.globalMultiplier, activeRole?.multiplier ?? 1, sim.maxCombinedMultiplier);

  const safeTo = Math.max(fromLevel, toLevel);
  const eta = estimateLevelEta({
    currentExp: startExp,
    targetLevel: safeTo,
    messagesPerDay: messages,
    voiceHoursPerDay: voiceHours,
    multiplier: effectiveMult,
    cfg: sim,
  });

  const comparisons = useMemo(() => {
    const rows: { key: string; label: string; badge?: string; multiplier: number; days: number; hint?: string; current?: boolean }[] = [];
    const youEta = estimateLevelEta({
      currentExp: startExp,
      targetLevel: safeTo,
      messagesPerDay: messages,
      voiceHoursPerDay: voiceHours,
      multiplier: Math.max(0.1, p.multiplier || 1),
      cfg: sim,
    });
    rows.push({
      key: "attuale",
      label: "Adesso",
      badge: "TUO",
      multiplier: Math.max(0.1, p.multiplier || 1),
      days: youEta.zeroDaily ? Infinity : youEta.alreadyThere ? 0 : youEta.days,
      hint: "Con il moltiplicatore del profilo",
      current: true,
    });
    for (const role of sim.catalog) {
      const m = combineMultiplier(sim.globalMultiplier, role.multiplier, sim.maxCombinedMultiplier);
      const e = estimateLevelEta({
        currentExp: startExp,
        targetLevel: safeTo,
        messagesPerDay: messages,
        voiceHoursPerDay: voiceHours,
        multiplier: m,
        cfg: sim,
      });
      const owned = roleIds.has(role.roleId);
      rows.push({
        key: role.key,
        label: role.label,
        badge: role.kind === "boost" ? "BOOST" : role.kind === "donor" ? "DONATORI" : "STATUS",
        multiplier: m,
        days: e.zeroDaily ? Infinity : e.alreadyThere ? 0 : e.days,
        hint: owned ? "Ce l’hai già" : undefined,
        current: owned && Math.abs(p.multiplier - m) < 0.05,
      });
    }
    return rows;
  }, [sim, startExp, safeTo, messages, voiceHours, roleIds, p.multiplier]);

  const appliedLabel = (() => {
    if (pick === "attuale") return `il tuo ×${p.multiplier.toFixed(1).replace(".", ",")}`;
    if (pick === "base") return mult(effectiveMult);
    return `${cleanRole(activeRole?.label || "")} ${mult(effectiveMult)}`;
  })();

  const pills: { id: RolePick; label: string; owned?: boolean }[] = [
    { id: "attuale", label: "Il tuo" },
    { id: "base", label: "Base" },
    ...sim.catalog.map((c: LevelsSimCatalogRole) => ({ id: c.key, label: c.label, owned: roleIds.has(c.roleId) })),
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-caramel">
            <Target className="size-3.5" aria-hidden /> Calcolatore
          </p>
          <h3 className="mt-1 font-display text-2xl font-semibold text-balance sm:text-3xl">Quanto ci metti a salire?</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessages(avg.messages);
            setVoiceHours(avg.voiceHours);
          }}
          aria-pressed={usingAvg}
          title={`Media stimata: ${fmt(avg.messages)} msg/giorno · ${avg.voiceHours.toLocaleString("it-IT", { maximumFractionDigits: 1 })} h vocale`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-200 ease-out",
            usingAvg
              ? "bg-gradient-to-r from-caramel to-ember text-ink shadow-[0_10px_24px_-12px_rgba(240,180,110,0.7)]"
              : "bg-crema/[0.06] text-crema/75 ring-1 ring-sand/15 hover:bg-crema/[0.1] hover:text-crema",
          )}
        >
          <Sparkles className="size-3.5" aria-hidden />
          {usingAvg ? "Media applicata" : "Usa la mia media"}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <LevelField label="Livello attuale" value={fromLevel} min={0} max={999} onChange={(n) => {
          setFromLevel(n);
          if (toLevel <= n) setToLevel(Math.min(1000, n + 1));
        }} />
        <span className="hidden pb-4 text-crema/35 sm:block" aria-hidden>
          →
        </span>
        <LevelField label="Livello da raggiungere" value={toLevel} min={Math.max(1, fromLevel)} max={1000} onChange={setToLevel} />
      </div>

      <div className="space-y-5">
        <ActivitySlider
          icon={<MessageSquareText />}
          label="Messaggi al giorno"
          valueLabel={fmt(messages)}
          value={messages}
          min={0}
          max={400}
          step={5}
          onChange={setMessages}
        />
        <ActivitySlider
          icon={<Mic />}
          label="Vocale al giorno"
          valueLabel={`${voiceHours.toLocaleString("it-IT", { maximumFractionDigits: 1 })} h`}
          value={voiceHours}
          min={0}
          max={12}
          step={0.5}
          onChange={setVoiceHours}
        />
      </div>

      <div>
        <p className="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">Moltiplicatore da usare</p>
        <ul className="flex flex-wrap gap-2">
          {pills.map((pill) => {
            const on = pick === pill.id;
            return (
              <li key={pill.id}>
                <button
                  type="button"
                  onClick={() => setPick(pill.id)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-200 ease-out",
                    on
                      ? "bg-gradient-to-r from-caramel to-ember text-ink shadow-[0_10px_24px_-12px_rgba(240,180,110,0.7)]"
                      : "bg-crema/[0.06] text-crema/70 ring-1 ring-sand/15 hover:bg-crema/[0.1] hover:text-crema",
                  )}
                >
                  {pill.label}
                  {pill.owned && !on ? <span className="ml-1.5 text-[0.65rem] uppercase tracking-wider text-caramel">tu</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-caramel/20 via-mocha/80 to-espresso p-5 ring-1 ring-caramel/25 sm:p-6">
        <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-ember/20 blur-3xl" aria-hidden />
        <p className="relative text-sm font-semibold text-crema/60">
          Arrivi al livello <span className="text-crema lining-nums">{safeTo}</span> in
        </p>
        <div className="relative mt-2 min-h-[3.25rem]">
          <AnimatePresence mode="wait" initial={false}>
            <EtaHeadline days={eta.days} alreadyThere={eta.alreadyThere} zeroDaily={eta.zeroDaily} />
          </AnimatePresence>
        </div>
        <p className="relative mt-3 text-sm leading-relaxed text-crema/55">
          {eta.alreadyThere ? (
            <>Hai già abbastanza EXP per quel livello.</>
          ) : eta.zeroDaily ? (
            <>Alza messaggi o ore in vocale per vedere una stima.</>
          ) : (
            <>
              Ti mancano <span className="font-semibold text-crema/80 lining-nums">{fmt(eta.xpNeeded)} EXP</span> e ne fai circa{" "}
              <span className="font-semibold text-crema/80 lining-nums">{fmt(eta.dailyXp)}</span> al giorno ({appliedLabel}).
            </>
          )}
        </p>
      </div>

      <div>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-crema/75">
          <TrendingUp className="size-4 text-caramel" aria-hidden />
          Con un moltiplicatore più alto
          <span className="font-normal text-crema/40">· stessa attività</span>
        </p>
        <ul className="grid gap-2">
          {comparisons.map((row) => (
            <ComparisonRow
              key={row.key}
              label={row.label}
              badge={row.badge}
              multiplier={row.multiplier}
              days={row.days}
              active={pick === row.key}
              current={row.current}
              hint={row.hint}
            />
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-crema/40">
          Stime: messaggi che danno EXP{sim.messageCooldownSec > 0 ? ` (cooldown ${sim.messageCooldownSec}s)` : ""} e vocale senza mute.
          In classifica settimanale conta l&apos;EXP senza moltiplicatore. Durante gli eventi globali si sale più in fretta.
        </p>
      </div>
    </div>
  );
}

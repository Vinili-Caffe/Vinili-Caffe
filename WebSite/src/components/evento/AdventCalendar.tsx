"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Gift, Lock, Sparkles, Star } from "lucide-react";
import { ADVENT_CRATE_LABELS, ADVENT_DAYS, adventSlotForRomeDate, type AdventCrateId } from "@/lib/evento-avvento";
import {
  claimEventoAvventoDay,
  fetchEventoAvvento,
  type EventoAdventDayRow,
} from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui/toast";
import { EventoKicker, EventoPanel, EventoSkeleton } from "@/components/evento/EventoUi";
import { AdventReveal, type AdventGranted } from "@/components/evento/AdventReveal";
import { crateArtUrl, crateTint } from "@/components/evento/EventoCrateArt";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";

type ScatterSlot = { left: number; top: number; rot: number; scale: number };

/** PRNG stabile (mulberry32) — layout identico a ogni render. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 25 slot sparsi: griglia irregolare + jitter + rotazione leggera. */
function buildScatterSlots(seed = 2026_12_01): ScatterSlot[] {
  const rand = mulberry32(seed);
  const cols = 5;
  const rows = 5;
  const slots: ScatterSlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellW = 100 / cols;
      const cellH = 100 / rows;
      const jx = (rand() - 0.5) * cellW * 0.55;
      const jy = (rand() - 0.5) * cellH * 0.5;
      const left = Math.min(88, Math.max(2, c * cellW + cellW * 0.12 + jx));
      const top = Math.min(86, Math.max(2, r * cellH + cellH * 0.1 + jy));
      const rot = (rand() - 0.5) * 14;
      const scale = 0.88 + rand() * 0.22;
      slots.push({ left, top, rot, scale });
    }
  }
  /* mescola l’ordine degli slot così i giorni non seguono la griglia */
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = slots[i]!;
    slots[i] = slots[j]!;
    slots[j] = tmp;
  }
  return slots;
}

const SCATTER_SLOTS = buildScatterSlots();

function primaryCrateId(slot: EventoAdventDayRow): string | null {
  const c = slot.rewards?.find((r) => r.type === "crate");
  return c && c.type === "crate" ? c.crateId : null;
}

function hasCreditsReward(slot: EventoAdventDayRow): boolean {
  return Boolean(slot.rewards?.some((r) => r.type === "premium_credits"));
}

function DoorFace({
  day,
  label,
  claimed,
  locked,
  missed,
  isToday,
  busy,
  crateId,
  showCredits,
}: {
  day: number;
  label: string;
  claimed: boolean;
  locked: boolean;
  missed: boolean;
  isToday: boolean;
  busy: boolean;
  crateId: string | null;
  showCredits: boolean;
}) {
  return (
    <span className="relative flex h-full min-h-[5.5rem] w-full flex-col sm:min-h-[6.25rem]">
      <span
        className={cn(
          "absolute inset-0 rounded-2xl",
          claimed
            ? "bg-gradient-to-br from-[#c9a227]/30 via-[#121a32] to-[#0a1020]"
            : missed
              ? "bg-gradient-to-br from-[#3a1218]/80 via-[#0a1020] to-black/90"
              : isToday
                ? "bg-gradient-to-br from-[#2ea8ff]/30 via-[#1a2744] to-[#0a1020]"
                : locked
                  ? "bg-gradient-to-br from-[#0a1020] to-black/80"
                  : "bg-gradient-to-br from-[#1a2744] to-[#0a1020]",
        )}
      />
      <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-40 [background:repeating-linear-gradient(90deg,transparent,transparent_10px,rgba(255,255,255,0.03)_10px,rgba(255,255,255,0.03)_11px)]" />

      <span className="relative z-[1] flex flex-1 flex-col justify-between p-2">
        <span className="flex items-start justify-between gap-1">
          <span
            className={cn(
              "font-display text-xl font-semibold tabular-nums leading-none sm:text-2xl",
              isToday || claimed ? "text-[#e4c76b]" : missed ? "text-crema/25" : locked ? "text-crema/35" : "text-crema/80",
            )}
          >
            {day}
          </span>
          {claimed ? (
            <Check className="size-3.5 text-[#86efac]" aria-hidden />
          ) : missed ? (
            <Lock className="size-3 text-rose-400/50" aria-hidden />
          ) : locked ? (
            <Lock className="size-3 text-crema/30" aria-hidden />
          ) : isToday ? (
            <Sparkles className="size-3.5 text-[#2ea8ff]" aria-hidden />
          ) : day === 25 ? (
            <Star className="size-3.5 text-[#e4c76b]" aria-hidden />
          ) : null}
        </span>

        <span className="mx-auto my-0.5 flex size-8 items-end justify-center gap-0.5 sm:size-9">
          {crateId && crateArtUrl(crateId, false) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={crateArtUrl(crateId, false)}
              alt=""
              data-vc-lightbox-ignore
              className={cn(
                "h-6 w-6 object-contain sm:h-7 sm:w-7",
                claimed ? "opacity-100" : missed || locked ? "opacity-35 grayscale" : "opacity-90",
              )}
              style={{
                filter: isToday ? "drop-shadow(0 0 8px rgba(46,168,255,0.55))" : undefined,
              }}
              draggable={false}
            />
          ) : showCredits ? null : (
            <span
              className={cn(
                "relative h-5 w-7 rounded-sm",
                claimed ? "opacity-100" : missed || locked ? "opacity-35" : "opacity-90",
              )}
              style={{
                background: `linear-gradient(160deg, ${crateTint(crateId || "casuale").lid}, ${crateTint(crateId || "casuale").face})`,
                boxShadow: isToday ? "0 0 14px -2px rgba(46,168,255,0.55)" : "0 4px 10px rgba(0,0,0,0.35)",
              }}
            >
              <span className="absolute inset-x-0 top-0 h-1.5 rounded-t-sm bg-white/25" />
              <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/35 ring-1 ring-white/30" />
            </span>
          )}
          {showCredits ? (
            <EventoCreditsIcon
              size="sm"
              className={cn(
                claimed ? "opacity-100" : missed || locked ? "opacity-35 grayscale" : "opacity-95",
              )}
            />
          ) : null}
        </span>

        <span
          className={cn(
            "line-clamp-2 text-center text-[0.55rem] font-medium leading-snug sm:text-[0.6rem]",
            claimed ? "text-[#e4c76b]/90" : missed ? "text-rose-300/55" : locked ? "text-crema/35" : "text-crema/70",
          )}
        >
          {busy ? "Apertura…" : claimed ? "Ritirato" : missed ? "Perso" : label}
        </span>
      </span>
    </span>
  );
}

/** Avvento hub: 25 porte sparse, claim → cassa che si apre subito. */
export function AdventCalendar() {
  const { token, ready } = useAuth();
  const localToday = adventSlotForRomeDate();
  const [days, setDays] = useState<EventoAdventDayRow[] | null>(null);
  const [todayAdvent, setTodayAdvent] = useState<number | null>(localToday);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [gateMsg, setGateMsg] = useState("");
  const [reveal, setReveal] = useState<{
    day: number;
    label: string;
    granted: AdventGranted[];
  } | null>(null);
  const [openingDoor, setOpeningDoor] = useState<number | null>(null);

  const reload = useCallback(async (opts?: { soft?: boolean }) => {
    if (!ready) return;
    if (!opts?.soft) setLoading(true);
    const st = await fetchEventoAvvento(token);
    if (!st.ok) {
      if (!opts?.soft) {
        setGateMsg(st.message || "Avvento non disponibile.");
        setDays(null);
        setLoading(false);
      }
      return;
    }
    setGateMsg("");
    setTodayAdvent(st.todayAdvent ?? localToday);
    setDays(st.days || []);
    if (!opts?.soft) setLoading(false);
  }, [ready, token, localToday]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onClaim(slot: EventoAdventDayRow) {
    if (!token || claiming || !slot.canClaim) return;
    setClaiming(slot.day);
    setOpeningDoor(slot.day);
    const out = await claimEventoAvventoDay(token, slot.day);
    setClaiming(null);
    if (!out.ok) {
      setOpeningDoor(null);
      showToast(out.message || "Ritiro non riuscito.", true);
      return;
    }

    const granted = (Array.isArray(out.granted) ? out.granted : []) as AdventGranted[];
    const fallback: AdventGranted[] = (slot.rewards || []).map((r) =>
      r.type === "premium_credits"
        ? { type: "premium_credits" as const, amount: r.amount }
        : {
            type: "crate" as const,
            crateId: r.crateId,
            qty: r.qty,
            label: ADVENT_CRATE_LABELS[r.crateId as AdventCrateId] || r.crateId,
          },
    );

    setDays((prev) =>
      (prev || []).map((d) =>
        d.day === slot.day
          ? { ...d, claimed: true, canClaim: false, claimedAt: d.claimedAt || new Date().toISOString() }
          : d,
      ),
    );
    setReveal({
      day: slot.day,
      label: out.label || slot.label,
      granted: granted.length ? granted : fallback,
    });
    void reload({ soft: true });
  }

  const rows = useMemo(() => {
    if (days && days.length) return days;
    return ADVENT_DAYS.map((slot) => ({
      day: slot.day,
      label: slot.label,
      rewards: slot.rewards,
      claimed: false,
      claimedAt: null,
      canClaim: false,
      unlocked: localToday != null && slot.day <= localToday,
      missed: localToday != null && slot.day < localToday,
    }));
  }, [days, localToday]);

  const byDay = useMemo(() => {
    const m = new Map<number, EventoAdventDayRow>();
    for (const r of rows) m.set(r.day, r);
    return m;
  }, [rows]);

  if (loading && !reveal) return <EventoSkeleton className="mx-auto max-w-4xl px-6" />;

  if (gateMsg && !days) {
    return <div className="mx-auto mb-8 max-w-lg px-6 text-center text-sm text-crema/55">{gateMsg}</div>;
  }

  return (
    <div className="mx-auto mb-10 max-w-4xl px-6">
      <EventoPanel glow="gold" className="mb-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a227]/30 to-[#2ea8ff]/15 ring-1 ring-[#c9a227]/40">
          <Gift className="size-6 text-[#e4c76b]" aria-hidden />
        </div>
        <EventoKicker>Avvento</EventoKicker>
        <p className="mt-2 text-sm text-crema/70">
          {todayAdvent
            ? `Giorno ${todayAdvent} — apri la porta luminosa entro mezzanotte.`
            : "25 porte sparse · ogni giorno una ricompensa; se salti, perdi quel giorno."}
        </p>
        {!token ? (
          <p className="mt-2 text-xs text-[#e4c76b]">Accedi con Discord per aprire le caselle.</p>
        ) : null}
      </EventoPanel>

      <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-[#1a2744]/95 via-[#0a1020] to-[#05070f] ring-1 ring-[#c9a227]/35">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(ellipse_at_30%_20%,rgba(46,168,255,0.12),transparent_45%),radial-gradient(ellipse_at_70%_80%,rgba(201,162,39,0.1),transparent_40%)]" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#e4c76b]/55 to-transparent" />

        <ol className="relative mx-auto h-[38rem] w-full sm:h-[42rem] md:h-[46rem]" aria-label="Calendario dell’avvento">
          {SCATTER_SLOTS.map((pos, idx) => {
            const dayNum = idx + 1;
            const slot = byDay.get(dayNum);
            if (!slot) return null;
            const isToday = todayAdvent === slot.day;
            const missed = Boolean(slot.missed) && !slot.claimed;
            const locked = !slot.unlocked && !slot.claimed && !missed;
            const busy = claiming === slot.day;
            const flipping = openingDoor === slot.day;
            const crateId = primaryCrateId(slot);
            const showCredits = hasCreditsReward(slot);
            const z = isToday ? 30 : flipping ? 40 : Math.round(10 + pos.scale * 10);

            return (
              <li
                key={slot.day}
                className="absolute w-[4.85rem] sm:w-[5.6rem] md:w-[6.1rem] [perspective:900px]"
                style={{
                  left: `${pos.left}%`,
                  top: `${pos.top}%`,
                  zIndex: z,
                  transform: `rotate(${pos.rot}deg) scale(${pos.scale})`,
                }}
              >
                <motion.button
                  type="button"
                  disabled={!slot.canClaim || busy}
                  onClick={() => void onClaim(slot)}
                  title={missed ? `${slot.label} · perso` : slot.label}
                  whileHover={slot.canClaim && !flipping ? { scale: 1.06, rotate: 0 } : undefined}
                  whileTap={slot.canClaim && !flipping ? { scale: 0.96 } : undefined}
                  animate={
                    flipping
                      ? { rotateY: -72, scale: 1.05 }
                      : isToday
                        ? { y: [0, -3, 0] }
                        : { rotateY: 0, scale: 1 }
                  }
                  transition={
                    flipping
                      ? { type: "tween", duration: 0.32, ease: "easeOut" }
                      : isToday
                        ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                        : { type: "tween", duration: 0.25 }
                  }
                  className={cn(
                    "relative w-full overflow-hidden rounded-2xl text-left ring-1 transition will-change-transform",
                    slot.claimed
                      ? "ring-[#c9a227]/55 shadow-[0_0_22px_-6px_rgba(201,162,39,0.6)]"
                      : missed
                        ? "ring-rose-500/25 opacity-80"
                        : isToday
                          ? "ring-[#2ea8ff]/65 shadow-[0_0_32px_-4px_rgba(46,168,255,0.7)]"
                          : locked
                            ? "ring-white/5"
                            : "ring-sand/20",
                    slot.canClaim && "cursor-pointer hover:ring-[#e4c76b]/75",
                    !slot.canClaim && "cursor-default",
                  )}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <DoorFace
                    day={slot.day}
                    label={slot.label}
                    claimed={slot.claimed}
                    locked={locked}
                    missed={missed}
                    isToday={isToday}
                    busy={busy}
                    crateId={crateId}
                    showCredits={showCredits}
                  />
                </motion.button>
              </li>
            );
          })}
        </ol>
      </div>

      <AnimatePresence>
        {reveal ? (
          <AdventReveal
            day={reveal.day}
            label={reveal.label}
            granted={reveal.granted}
            onClose={() => {
              setReveal(null);
              setOpeningDoor(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

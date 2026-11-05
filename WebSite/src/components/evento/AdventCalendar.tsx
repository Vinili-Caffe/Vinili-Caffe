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
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { EventoKicker, EventoPanel, EventoSkeleton } from "@/components/evento/EventoUi";
import { AdventReveal, type AdventGranted } from "@/components/evento/AdventReveal";
import { crateArtUrl, crateTint } from "@/components/evento/EventoCrateArt";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";

/** PRNG stabile — ordine porte fisso a ogni render. */
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

/** Griglia 5×5: giorni 1–25 mischiati (forma calendario, non ordine cronologico). */
function shuffledAdventDays(seed = 2026_12_01): number[] {
  const days = Array.from({ length: 25 }, (_, i) => i + 1);
  const rand = mulberry32(seed);
  for (let i = days.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = days[i]!;
    days[i] = days[j]!;
    days[j] = tmp;
  }
  return days;
}

const GRID_DAYS = shuffledAdventDays();

function primaryCrateId(slot: EventoAdventDayRow): string | null {
  const c = slot.rewards?.find((r) => r.type === "crate");
  return c && c.type === "crate" ? c.crateId : null;
}

function hasCreditsReward(slot: EventoAdventDayRow): boolean {
  return Boolean(slot.rewards?.some((r) => r.type === "credits" || r.type === "premium_credits"));
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
  /** Premi nascosti finché il giorno non è sbloccato (futuro). */
  const spoilersHidden = locked && !claimed;

  return (
    <span className="relative flex h-full min-h-[6.5rem] w-full flex-col sm:min-h-[7rem]">
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
          {spoilersHidden ? (
            <Gift
              className="size-6 text-crema/25 blur-[3px] sm:size-7"
              aria-hidden
            />
          ) : crateId && crateArtUrl(crateId, false) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={crateArtUrl(crateId, false)}
              alt=""
              data-vc-lightbox-ignore
              className={cn(
                "h-6 w-6 object-contain sm:h-7 sm:w-7",
                claimed ? "opacity-100" : missed ? "opacity-35 grayscale" : "opacity-90",
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
                claimed ? "opacity-100" : missed ? "opacity-35" : "opacity-90",
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
          {!spoilersHidden && showCredits ? (
            <EventoCreditsIcon
              size="sm"
              className={cn(claimed ? "opacity-100" : missed ? "opacity-35 grayscale" : "opacity-95")}
            />
          ) : null}
        </span>

        <span
          className={cn(
            "line-clamp-2 text-center text-[0.55rem] font-medium leading-snug sm:text-[0.6rem]",
            claimed
              ? "text-[#e4c76b]/90"
              : missed
                ? "text-rose-300/55"
                : spoilersHidden
                  ? "text-crema/30 blur-[2px] select-none"
                  : "text-crema/70",
          )}
          aria-hidden={spoilersHidden || undefined}
        >
          {busy
            ? "Apertura…"
            : claimed
              ? "Ritirato"
              : missed
                ? "Perso"
                : spoilersHidden
                  ? "Segreto"
                  : label}
        </span>
      </span>
    </span>
  );
}

/** Avvento: griglia calendario 5×5 con giorni mischiati. */
export function AdventCalendar({ embedded = false }: { embedded?: boolean }) {
  const { token, ready } = useAuth();
  const { highStaff } = useEventoStaffAccess();
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

  const reload = useCallback(
    async (opts?: { soft?: boolean }) => {
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
    },
    [ready, token, localToday],
  );

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
      r.type === "credits" || r.type === "premium_credits"
        ? { type: "credits" as const, amount: r.amount }
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
      canClaim: Boolean(highStaff && token),
      unlocked: highStaff || (localToday != null && slot.day <= localToday),
      missed: !highStaff && localToday != null && slot.day < localToday,
      activity: null,
    }));
  }, [days, localToday, highStaff, token]);

  const byDay = useMemo(() => {
    const m = new Map<number, EventoAdventDayRow>();
    for (const r of rows) m.set(r.day, r);
    return m;
  }, [rows]);

  if (loading && !reveal) {
    return embedded ? <EventoSkeleton className="w-full" /> : <EventoSkeleton className="mx-auto max-w-4xl px-6" />;
  }

  if (gateMsg && !days) {
    return <div className="text-center text-sm text-crema/55">{gateMsg}</div>;
  }

  const grid = (
    <>
      {!embedded ? (
        <EventoPanel glow="gold" className="mb-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a227]/30 to-[#2ea8ff]/15 ring-1 ring-[#c9a227]/40">
            <Gift className="size-6 text-[#e4c76b]" aria-hidden />
          </div>
          <EventoKicker>Avvento</EventoKicker>
          <p className="mt-2 text-sm text-crema/70">
            {highStaff && !todayAdvent
              ? "Anteprima High Staff — porte mischiate, claim senza limiti."
              : todayAdvent
                ? `Giorno ${todayAdvent} — apri la porta luminosa entro mezzanotte.`
                : "25 porte in griglia · giorni mischiati · premi + missioni del giorno."}
          </p>
          {!token ? (
            <p className="mt-2 text-xs text-[#e4c76b]">Accedi con Discord per aprire le caselle.</p>
          ) : null}
        </EventoPanel>
      ) : null}

      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-b from-[#1a2744]/95 via-[#0a1020] to-[#05070f] ring-1 ring-[#c9a227]/35">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(ellipse_at_30%_20%,rgba(46,168,255,0.12),transparent_45%),radial-gradient(ellipse_at_70%_80%,rgba(201,162,39,0.1),transparent_40%)]" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#e4c76b]/55 to-transparent" />

        <div className="relative grid grid-cols-5 gap-1.5 p-2.5 sm:gap-2 sm:p-3">
          {GRID_DAYS.map((dayNum) => {
            const slot = byDay.get(dayNum);
            if (!slot) return <div key={dayNum} className="min-h-[6.5rem]" aria-hidden />;
            const isToday = todayAdvent === slot.day;
            const missed = Boolean(slot.missed) && !slot.claimed;
            const locked = !slot.unlocked && !slot.claimed && !missed;
            const busy = claiming === slot.day;
            const flipping = openingDoor === slot.day;
            const crateId = primaryCrateId(slot);
            const showCredits = hasCreditsReward(slot);

            return (
              <div key={slot.day} className="relative">
                <motion.button
                  type="button"
                  disabled={!slot.canClaim || busy}
                  onClick={() => void onClaim(slot)}
                  title={
                    missed
                      ? `${slot.label} · perso`
                      : locked
                        ? `Giorno ${slot.day} · ancora chiuso`
                        : slot.label
                  }
                  whileHover={slot.canClaim && !flipping ? { scale: 1.03 } : undefined}
                  whileTap={slot.canClaim && !flipping ? { scale: 0.97 } : undefined}
                  animate={
                    flipping
                      ? { rotateY: -72, scale: 1.04 }
                      : isToday
                        ? { y: [0, -2, 0] }
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
                      ? "ring-[#c9a227]/55 shadow-[0_0_18px_-6px_rgba(201,162,39,0.55)]"
                      : missed
                        ? "ring-rose-500/25 opacity-80"
                        : isToday
                          ? "ring-[#2ea8ff]/65 shadow-[0_0_28px_-4px_rgba(46,168,255,0.65)]"
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
              </div>
            );
          })}
        </div>
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
    </>
  );

  if (embedded) return <div className="w-full">{grid}</div>;
  return <div className="mx-auto mb-10 max-w-4xl px-6">{grid}</div>;
}

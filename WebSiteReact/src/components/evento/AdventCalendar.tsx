"use client";

import { useCallback, useEffect, useState } from "react";
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

function primaryCrateId(slot: EventoAdventDayRow): string | null {
  const c = slot.rewards?.find((r) => r.type === "crate");
  return c && c.type === "crate" ? c.crateId : null;
}

function DoorFace({
  day,
  label,
  claimed,
  locked,
  isToday,
  busy,
  crateId,
}: {
  day: number;
  label: string;
  claimed: boolean;
  locked: boolean;
  isToday: boolean;
  busy: boolean;
  crateId: string | null;
}) {
  return (
    <span className="relative flex h-full min-h-[6.25rem] w-full flex-col sm:min-h-[7.25rem]">
      {/* texture porta */}
      <span
        className={cn(
          "absolute inset-0 rounded-2xl",
          claimed
            ? "bg-gradient-to-br from-[#c9a227]/30 via-[#121a32] to-[#0a1020]"
            : isToday
              ? "bg-gradient-to-br from-[#2ea8ff]/30 via-[#1a2744] to-[#0a1020]"
              : locked
                ? "bg-gradient-to-br from-[#0a1020] to-black/80"
                : "bg-gradient-to-br from-[#1a2744] to-[#0a1020]",
        )}
      />
      <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-40 [background:repeating-linear-gradient(90deg,transparent,transparent_10px,rgba(255,255,255,0.03)_10px,rgba(255,255,255,0.03)_11px)]" />

      <span className="relative z-[1] flex flex-1 flex-col justify-between p-2 sm:p-2.5">
        <span className="flex items-start justify-between gap-1">
          <span
            className={cn(
              "font-display text-2xl font-semibold tabular-nums leading-none sm:text-3xl",
              isToday || claimed ? "text-[#e4c76b]" : locked ? "text-crema/35" : "text-crema/80",
            )}
          >
            {day}
          </span>
          {claimed ? (
            <Check className="size-4 text-[#86efac]" aria-hidden />
          ) : locked ? (
            <Lock className="size-3.5 text-crema/30 sm:size-4" aria-hidden />
          ) : isToday ? (
            <Sparkles className="size-3.5 text-[#2ea8ff] sm:size-4" aria-hidden />
          ) : day === 25 ? (
            <Star className="size-3.5 text-[#e4c76b] sm:size-4" aria-hidden />
          ) : null}
        </span>

        {/* mini cassa */}
        <span className="mx-auto my-1 flex size-9 items-end justify-center sm:size-10">
          <span
            className={cn(
              "relative h-6 w-8 rounded-sm sm:h-7 sm:w-9",
              claimed ? "opacity-100" : locked ? "opacity-40" : "opacity-90",
            )}
            style={{
              background:
                crateId === "omega"
                  ? "linear-gradient(160deg,#e4c76b,#c9a227)"
                  : crateId === "alpha"
                    ? "linear-gradient(160deg,#7dd3fc,#2ea8ff)"
                    : crateId === "beta"
                      ? "linear-gradient(160deg,#a78bfa,#7c3aed)"
                      : crateId === "avvento"
                        ? "linear-gradient(160deg,#86efac,#22c55e)"
                        : crateId?.startsWith("militare")
                          ? "linear-gradient(160deg,#fb7185,#e11d48)"
                          : "linear-gradient(160deg,#fde68a,#f0b46e)",
              boxShadow: isToday ? "0 0 14px -2px rgba(46,168,255,0.55)" : "0 4px 10px rgba(0,0,0,0.35)",
            }}
          >
            <span className="absolute inset-x-0 top-0 h-2 rounded-t-sm bg-white/25" />
            <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/35 ring-1 ring-white/30" />
          </span>
        </span>

        <span
          className={cn(
            "line-clamp-2 text-center text-[0.58rem] font-medium leading-snug sm:text-[0.65rem]",
            claimed ? "text-[#e4c76b]/90" : locked ? "text-crema/35" : "text-crema/70",
          )}
        >
          {busy ? "Apertura…" : claimed ? "Ritirato" : label}
        </span>
      </span>
    </span>
  );
}

/** Griglia 25 porte — claim + reveal animato (porta → casse che si aprono). */
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

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoAvvento(token);
    if (!st.ok) {
      setGateMsg(st.message || "Avvento non disponibile.");
      setDays(null);
      setLoading(false);
      return;
    }
    setGateMsg("");
    setTodayAdvent(st.todayAdvent ?? localToday);
    setDays(st.days || []);
    setLoading(false);
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

    setReveal({
      day: slot.day,
      label: out.label || slot.label,
      granted: granted.length ? granted : fallback,
    });
    await reload();
  }

  if (loading) return <EventoSkeleton className="mx-auto max-w-4xl px-6" />;

  if (gateMsg && !days) {
    return <div className="mx-auto max-w-lg px-6 pb-8 text-center text-sm text-crema/55">{gateMsg}</div>;
  }

  const rows =
    days && days.length
      ? days
      : ADVENT_DAYS.map((slot) => ({
          day: slot.day,
          label: slot.label,
          rewards: slot.rewards,
          claimed: false,
          claimedAt: null,
          canClaim: false,
          unlocked: localToday != null && slot.day <= localToday,
        }));

  return (
    <div className="mx-auto max-w-4xl px-6">
      <EventoPanel className="mb-6 text-center" glow="gold">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a227]/30 to-[#2ea8ff]/15 ring-1 ring-[#c9a227]/40">
          <Gift className="size-7 text-[#e4c76b]" aria-hidden />
        </div>
        <EventoKicker>Calendario galattico</EventoKicker>
        <p className="mt-2 text-sm text-crema/70">
          {todayAdvent
            ? `Giorno ${todayAdvent} — apri la porta luminosa per ritirare la cassa.`
            : "25 porte, 25 premi · ritiro dal 1° dicembre (HS in anteprima)."}
        </p>
        {!token ? (
          <p className="mt-2 text-xs text-[#e4c76b]">Accedi con Discord per aprire le caselle.</p>
        ) : null}
      </EventoPanel>

      {/* cornice calendario */}
      <div className="relative rounded-[1.75rem] bg-gradient-to-b from-[#1a2744]/90 to-[#05070f] p-3 ring-1 ring-[#c9a227]/35 sm:p-4">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#e4c76b]/60 to-transparent" />
        <ol className="grid grid-cols-5 gap-2 sm:gap-2.5">
          {rows.map((slot) => {
            const isToday = todayAdvent === slot.day;
            const locked = !slot.unlocked && !slot.claimed;
            const busy = claiming === slot.day;
            const flipping = openingDoor === slot.day;
            const crateId = primaryCrateId(slot);
            return (
              <li key={slot.day} className="[perspective:800px]">
                <motion.button
                  type="button"
                  disabled={!slot.canClaim || busy}
                  onClick={() => void onClaim(slot)}
                  title={slot.label}
                  whileTap={slot.canClaim && !flipping ? { scale: 0.98 } : undefined}
                  animate={flipping ? { rotateY: -55, scale: 0.98 } : { rotateY: 0, scale: 1 }}
                  transition={{ type: "tween", duration: 0.28, ease: "easeOut" }}
                  className={cn(
                    "relative w-full overflow-hidden rounded-2xl text-left ring-1 transition will-change-transform",
                    slot.claimed
                      ? "ring-[#c9a227]/55 shadow-[0_0_20px_-8px_rgba(201,162,39,0.55)]"
                      : isToday
                        ? "ring-[#2ea8ff]/60 shadow-[0_0_28px_-6px_rgba(46,168,255,0.65)]"
                        : locked
                          ? "ring-white/5"
                          : "ring-sand/15",
                    slot.canClaim && "cursor-pointer hover:ring-[#e4c76b]/70",
                    !slot.canClaim && "cursor-default",
                  )}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <DoorFace
                    day={slot.day}
                    label={slot.label}
                    claimed={slot.claimed}
                    locked={locked}
                    isToday={isToday}
                    busy={busy}
                    crateId={crateId}
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

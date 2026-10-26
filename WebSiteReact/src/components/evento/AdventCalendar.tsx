"use client";

import { useCallback, useEffect, useState } from "react";
import { ADVENT_DAYS, adventSlotForRomeDate } from "@/lib/evento-avvento";
import {
  claimEventoAvventoDay,
  fetchEventoAvvento,
  type EventoAdventDayRow,
} from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui/toast";

/** Griglia 25 caselle — stato reale da API (claim HS / da 1 dic). */
export function AdventCalendar() {
  const { token, ready } = useAuth();
  const localToday = adventSlotForRomeDate();
  const [days, setDays] = useState<EventoAdventDayRow[] | null>(null);
  const [todayAdvent, setTodayAdvent] = useState<number | null>(localToday);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [gateMsg, setGateMsg] = useState("");

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

  async function onClaim(day: number) {
    if (!token || claiming) return;
    setClaiming(day);
    const out = await claimEventoAvventoDay(token, day);
    setClaiming(null);
    if (!out.ok) {
      showToast(out.message || "Ritiro non riuscito.", true);
      return;
    }
    showToast(out.label ? `Ritirato: ${out.label}` : `Giorno ${day} ritirato.`);
    await reload();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 pb-24" aria-busy="true">
        <div className="h-48 animate-pulse rounded-2xl bg-crema/8" />
      </div>
    );
  }

  if (gateMsg && !days) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-24 text-center text-sm text-crema/65">{gateMsg}</div>
    );
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
    <div className="mx-auto max-w-4xl px-6 pb-24">
      <p className="mb-4 text-center text-xs text-crema/50">
        {todayAdvent
          ? `Oggi: giorno ${todayAdvent} · tocca una casella sbloccata per ritirare`
          : "Catalogo premi · ritiro dal 1° dicembre (HS in anteprima)"}
      </p>
      {!token ? (
        <p className="mb-4 text-center text-xs text-caramel/90">Accedi con Discord per ritirare i premi.</p>
      ) : null}
      <ol className="grid grid-cols-5 gap-2 sm:grid-cols-5 md:gap-2.5">
        {rows.map((slot) => {
          const isToday = todayAdvent === slot.day;
          const past = todayAdvent != null && slot.day < todayAdvent;
          const busy = claiming === slot.day;
          return (
            <li key={slot.day}>
              <button
                type="button"
                disabled={!slot.canClaim || busy}
                onClick={() => void onClaim(slot.day)}
                title={slot.label}
                className={cn(
                  "flex min-h-[4.75rem] w-full flex-col items-stretch justify-between rounded-xl p-2 text-left ring-1 transition sm:min-h-[5.5rem] sm:p-2.5",
                  slot.claimed
                    ? "bg-[#f0e6c8]/20 ring-[#f0e6c8]/45"
                    : isToday
                      ? "bg-[#f0e6c8]/15 ring-[#f0e6c8]/50"
                      : past || slot.unlocked
                        ? "bg-black/25 ring-sand/10 opacity-80"
                        : "bg-black/35 ring-[#f0e6c8]/18 opacity-60",
                  slot.canClaim && "cursor-pointer hover:ring-[#f0e6c8]/70",
                  !slot.canClaim && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "font-display text-lg font-semibold tabular-nums leading-none sm:text-xl",
                    isToday || slot.claimed ? "text-[#f0e6c8]" : "text-crema/80",
                  )}
                >
                  {slot.day}
                </span>
                <span className="mt-1 line-clamp-3 text-[0.62rem] font-medium leading-snug text-crema/65 sm:text-[0.68rem]">
                  {slot.claimed ? `✓ ${slot.label}` : busy ? "…" : slot.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

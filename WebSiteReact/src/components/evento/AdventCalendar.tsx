"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { ADVENT_DAYS, adventSlotForRomeDate } from "@/lib/evento-avvento";
import {
  claimEventoAvventoDay,
  fetchEventoAvvento,
  type EventoAdventDayRow,
} from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui/toast";
import { EventoKicker, EventoPanel, EventoSkeleton } from "@/components/evento/EventoUi";

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

  if (loading) return <EventoSkeleton className="mx-auto max-w-4xl px-6" />;

  if (gateMsg && !days) {
    return <div className="mx-auto max-w-lg px-6 pb-8 text-center text-sm text-[#f0e6c8]/55">{gateMsg}</div>;
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
      <EventoPanel className="mb-5 text-center" glow="gold">
        <Gift className="mx-auto size-8 text-[#e4c76b]" aria-hidden />
        <EventoKicker>Calendario galattico</EventoKicker>
        <p className="mt-2 text-sm text-[#f0e6c8]/7">
          {todayAdvent
            ? `Oggi è il giorno ${todayAdvent} — tocca una casella sbloccata per ritirare.`
            : "25 casse di crediti e premi · ritiro dal 1° dicembre (HS in anteprima)."}
        </p>
        {!token ? (
          <p className="mt-2 text-xs text-[#c9a227]">Accedi con Discord per ritirare i premi.</p>
        ) : null}
      </EventoPanel>

      <ol className="grid grid-cols-5 gap-2 md:gap-2.5">
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
                  "relative flex min-h-[5rem] w-full flex-col items-stretch justify-between overflow-hidden rounded-2xl p-2 text-left ring-1 transition sm:min-h-[5.75rem] sm:p-2.5",
                  slot.claimed
                    ? "bg-gradient-to-br from-[#c9a227]/35 to-[#2ea8ff]/15 ring-[#c9a227]/55"
                    : isToday
                      ? "bg-gradient-to-br from-[#2ea8ff]/25 to-[#c9a227]/15 ring-[#2ea8ff]/55 shadow-[0_0_24px_-8px_rgba(46,168,255,0.55)]"
                      : past || slot.unlocked
                        ? "bg-[rgba(10,16,32,0.7)] ring-[#f0e6c8]/12 opacity-85"
                        : "bg-black/40 ring-[#f0e6c8]/1 opacity-55",
                  slot.canClaim && "cursor-pointer hover:ring-[#e4c76b]/80",
                  !slot.canClaim && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "font-display text-xl font-semibold tabular-nums leading-none sm:text-2xl",
                    isToday || slot.claimed ? "text-[#f0e6c8]" : "text-[#f0e6c8]/7",
                  )}
                >
                  {slot.day}
                </span>
                <span className="mt-1 line-clamp-3 text-[0.62rem] font-medium leading-snug text-[#f0e6c8]/6 sm:text-[0.68rem]">
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

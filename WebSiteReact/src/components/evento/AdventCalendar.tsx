"use client";

import { ADVENT_DAYS, adventSlotForRomeDate } from "@/lib/evento-avvento";
import { cn } from "@/lib/cn";

/** Griglia 25 caselle — anteprima premi (claim dopo). */
export function AdventCalendar() {
  const today = adventSlotForRomeDate();

  return (
    <div className="mx-auto max-w-4xl px-6 pb-24">
      <p className="mb-4 text-center text-xs text-crema/50">
        Premi fissati · ritiro giornaliero in arrivo (casse + crediti)
      </p>
      <ol className="grid grid-cols-5 gap-2 sm:grid-cols-5 md:gap-2.5">
        {ADVENT_DAYS.map((slot) => {
          const isToday = today === slot.day;
          const past = today != null && slot.day < today;
          return (
            <li
              key={slot.day}
              title={slot.label}
              className={cn(
                "flex min-h-[4.75rem] flex-col items-stretch justify-between rounded-xl p-2 ring-1 sm:min-h-[5.5rem] sm:p-2.5",
                isToday
                  ? "bg-[#f0e6c8]/15 ring-[#f0e6c8]/50"
                  : past
                    ? "bg-black/25 ring-sand/10 opacity-70"
                    : "bg-black/35 ring-[#f0e6c8]/18",
              )}
            >
              <span
                className={cn(
                  "font-display text-lg font-semibold tabular-nums leading-none sm:text-xl",
                  isToday ? "text-[#f0e6c8]" : "text-crema/80",
                )}
              >
                {slot.day}
              </span>
              <span className="mt-1 line-clamp-3 text-[0.62rem] font-medium leading-snug text-crema/65 sm:text-[0.68rem]">
                {slot.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

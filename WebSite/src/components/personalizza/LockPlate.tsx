"use client";

import { Lock } from "lucide-react";

/** Piastra "locked" del mixer: requisiti boost/donazioni dall'API. */
export function LockPlate({
  title,
  anyOf,
  note,
}: {
  title: string;
  anyOf?: string[];
  note?: string;
}) {
  return (
    <div className="rounded-3xl bg-gradient-to-b from-mocha/80 to-roast/90 p-6 ring-1 ring-sand/15 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <Lock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Canale bloccato</p>
          <h3 className="mt-1 font-display text-2xl font-semibold text-crema">{title}</h3>
          {note && <p className="mt-2 text-sm leading-relaxed text-crema/60">{note}</p>}
          {anyOf && anyOf.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Requisiti">
              {anyOf.map((r) => (
                <li
                  key={r}
                  className="rounded-full bg-crema/6 px-3 py-1 text-xs font-semibold text-sand ring-1 ring-sand/20"
                >
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

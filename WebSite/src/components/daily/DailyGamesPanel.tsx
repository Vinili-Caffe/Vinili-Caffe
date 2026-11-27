"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Flame } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DAILY_GAMES, loadDailyMe, type DailyMe } from "@/lib/daily";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";

/** Giochi del giorno: cosa hai fatto oggi e la serie combinata. */
export function DailyGamesPanel() {
  const { token, ready } = useAuth();
  const [me, setMe] = useState<DailyMe | null>(null);

  useEffect(() => {
    if (!ready || !token) return;
    void loadDailyMe(token).then(setMe);
  }, [ready, token]);

  const done = me?.todayGames || {};
  const doneCount = DAILY_GAMES.filter((g) => done[g.id]).length;

  return (
    <section className="mx-auto mb-10 w-full max-w-6xl px-4">
      <div className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-5 ring-1 ring-sand/15 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-crema">Giochi del giorno</h2>
          {token ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
                (me?.streak || 0) > 0 ? "bg-caramel text-ink" : "bg-crema/[0.07] text-crema/70",
              )}
              title="Giorni di fila con tutti i giochi del giorno fatti"
            >
              <Flame className="size-4" /> {me?.streak ?? 0}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-crema/60">
          {token
            ? doneCount === DAILY_GAMES.length
              ? "Oggi li hai fatti tutti: la serie continua domani."
              : `Fatti ${doneCount} su ${DAILY_GAMES.length}: completali tutti per allungare la serie.`
            : "Accedi con Discord per tenere la serie e comparire nella classifica."}
        </p>
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {DAILY_GAMES.map((g) => {
            const e = done[g.id];
            return (
              <li key={g.id}>
                <SmartLink
                  href={page(g.href)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ring-1 transition hover:bg-crema/[0.06]",
                    e ? "bg-emerald-500/10 ring-emerald-400/25" : "bg-crema/[0.03] ring-sand/10",
                  )}
                >
                  {e ? <Check className="size-4 shrink-0 text-emerald-400" /> : <Circle className="size-4 shrink-0 text-crema/30" />}
                  <span className={cn("min-w-0 flex-1 truncate font-semibold", e ? "text-crema" : "text-crema/80")}>{g.label}</span>
                  {e ? (
                    <span className="shrink-0 text-xs font-bold text-emerald-300">+{e.p} pt</span>
                  ) : (
                    <span className="shrink-0 text-xs text-crema/40">da fare</span>
                  )}
                </SmartLink>
              </li>
            );
          })}
        </ul>
        {token && me ? (
          <p className="mt-3 text-xs text-crema/50">
            Record della serie: <b className="text-crema/80">{me.bestStreak ?? 0}</b> · questa settimana{" "}
            <b className="text-crema/80">{me.weekPoints ?? 0} pt</b>
          </p>
        ) : null}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Circle, Crown, Flame, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DAILY_GAMES, loadDailyMe, loadDailyWeek, type DailyMe, type DailyWeek } from "@/lib/daily";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";

function prettyDay(day: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/**
 * Giochi del giorno: cosa hai fatto oggi, la serie combinata (giorni di fila con tutti i giochi fatti)
 * e la classifica della settimana (riparte ogni lunedì; la domenica alle 21 esce anche su Discord).
 */
export function DailyGamesPanel() {
  const { token, ready } = useAuth();
  const [me, setMe] = useState<DailyMe | null>(null);
  const [week, setWeek] = useState<DailyWeek | null>(null);
  const [prev, setPrev] = useState(false);

  useEffect(() => {
    if (!ready || !token) return;
    void loadDailyMe(token).then(setMe);
  }, [ready, token]);

  useEffect(() => {
    if (!ready) return;
    setWeek(null);
    void loadDailyWeek(token, prev).then(setWeek);
  }, [ready, token, prev]);

  const done = me?.todayGames || {};
  const doneCount = DAILY_GAMES.filter((g) => done[g.id]).length;

  return (
    <section className="mx-auto mb-10 grid w-full max-w-6xl gap-4 px-4 lg:grid-cols-[1fr_1.2fr]">
      {/* oggi e serie */}
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
        <ul className="mt-4 grid gap-1.5">
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
                  {e ? <span className="shrink-0 text-xs font-bold text-emerald-300">+{e.p} pt</span> : <span className="shrink-0 text-xs text-crema/40">da fare</span>}
                </SmartLink>
              </li>
            );
          })}
        </ul>
        {token && me ? (
          <p className="mt-3 text-xs text-crema/50">
            Record della serie: <b className="text-crema/80">{me.bestStreak ?? 0}</b> · questa settimana <b className="text-crema/80">{me.weekPoints ?? 0} pt</b>
          </p>
        ) : null}
      </div>

      {/* classifica della settimana */}
      <div className="rounded-[2rem] bg-roast/80 p-5 ring-1 ring-sand/12 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-2xl text-crema">
            <Trophy className="size-5 text-caramel" /> Classifica della settimana
          </h2>
          <div className="flex rounded-full bg-ink/50 p-0.5 text-xs font-bold ring-1 ring-sand/15">
            {[false, true].map((p) => (
              <button
                key={String(p)}
                type="button"
                onClick={() => setPrev(p)}
                className={cn("rounded-full px-3 py-1.5 transition", prev === p ? "bg-caramel text-ink" : "text-crema/60 hover:text-crema")}
              >
                {p ? "Scorsa" : "Questa"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-crema/55">
          {week ? `Dal ${prettyDay(week.days[0]!)} al ${prettyDay(week.days[6]!)}` : "…"} · più punti se indovini con meno tentativi. La domenica sera esce anche su Discord, nell'annuncio dei membri della settimana.
        </p>
        {!week ? (
          <div className="mt-4 h-40 animate-pulse rounded-2xl bg-crema/[0.04]" />
        ) : !week.top.length ? (
          <p className="mt-6 rounded-2xl border border-dashed border-sand/20 px-4 py-8 text-center text-sm text-crema/60">Ancora nessun punto: il primo posto è libero.</p>
        ) : (
          <ol className="mt-4 overflow-hidden rounded-2xl ring-1 ring-sand/10">
            {week.top.slice(0, 10).map((r) => {
              const mine = week.me?.rank === r.rank;
              return (
                <motion.li
                  key={r.userId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn("flex items-center gap-3 px-4 py-2.5 not-last:border-b not-last:border-sand/[0.07]", mine ? "bg-caramel/10" : "bg-crema/[0.02]")}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
                      r.rank === 1 ? "bg-caramel text-ink" : r.rank === 2 ? "bg-crema/70 text-ink" : r.rank === 3 ? "bg-ember/70 text-ink" : "bg-crema/[0.07] text-crema/60",
                    )}
                  >
                    {r.rank === 1 ? <Crown className="size-3.5" /> : r.rank}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.avatar || "/images/logo-disco.png"} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-crema">{r.name}</span>
                  <span className="shrink-0 text-xs text-crema/45">{r.solved}/{r.games}</span>
                  <span className="w-14 shrink-0 text-right font-display text-xl tabular-nums text-caramel">{r.points}</span>
                </motion.li>
              );
            })}
          </ol>
        )}
        {week?.me && week.me.rank > 10 ? (
          <p className="mt-3 text-sm text-crema/65">
            Tu sei <b className="text-crema">{week.me.rank}°</b> con <b className="text-crema">{week.me.points} pt</b>.
          </p>
        ) : null}
      </div>
    </section>
  );
}

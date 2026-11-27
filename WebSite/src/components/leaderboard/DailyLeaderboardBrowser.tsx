"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Crown, Gamepad2, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DAILY_GAMES, loadDailyWeek, type DailyWeek } from "@/lib/daily";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";

function prettyDay(day: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

const PERIODS = [
  { id: false as const, label: "Questa" },
  { id: true as const, label: "Scorsa" },
];

export function DailyLeaderboardBrowser({ initial }: { initial: DailyWeek | null }) {
  const { token, ready } = useAuth();
  const [prev, setPrev] = useState(false);
  const [week, setWeek] = useState<DailyWeek | null>(initial);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    void loadDailyWeek(token, prev).then((w) => {
      if (cancelled) return;
      setWeek(w);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, token, prev]);

  const range =
    week?.days?.length === 7
      ? `Dal ${prettyDay(week.days[0]!)} al ${prettyDay(week.days[6]!)}`
      : null;

  return (
    <div className="mx-auto max-w-5xl px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-3xl text-crema sm:text-4xl">
            <Trophy className="size-7 text-caramel" />
            Classifica della settimana
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-crema/60">
            {range ? `${range} · ` : ""}
            Più punti se indovini con meno tentativi. Contano Wordle, Quordle, Angle, Canzone e Copertina.
            La domenica sera esce anche su Discord, nell&apos;annuncio dei membri della settimana.
          </p>
        </div>
        <LayoutGroup id="daily-week-period">
          <div
            role="tablist"
            aria-label="Settimana"
            className="flex w-fit shrink-0 rounded-full bg-crema/[0.06] p-1 ring-1 ring-sand/15"
          >
            {PERIODS.map((p) => {
              const active = prev === p.id;
              return (
                <button
                  key={String(p.id)}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPrev(p.id)}
                  className={cn(
                    "relative isolate rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
                    active ? "text-espresso" : "text-crema/65 hover:text-crema",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="daily-week-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-crema to-sand"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  {p.label}
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {DAILY_GAMES.map((g) => (
          <SmartLink
            key={g.id}
            href={page(g.href)}
            className="inline-flex items-center gap-1.5 rounded-full bg-crema/[0.05] px-3 py-1 text-xs font-semibold text-crema/75 ring-1 ring-sand/12 transition hover:bg-crema/[0.09] hover:text-crema"
          >
            <Gamepad2 className="size-3.5 text-caramel" />
            {g.label}
          </SmartLink>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={String(prev)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {loading && !week ? (
            <div className="h-56 animate-pulse rounded-2xl bg-crema/[0.04]" />
          ) : !week?.top?.length ? (
            <p className="rounded-2xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">
              Ancora nessun punto: il primo posto è libero.
            </p>
          ) : (
            <ol className="overflow-hidden rounded-2xl ring-1 ring-sand/10">
              {week.top.map((r) => {
                const mine = week.me?.rank === r.rank;
                return (
                  <li
                    key={r.userId}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 not-last:border-b not-last:border-sand/[0.07]",
                      mine ? "bg-caramel/10" : "bg-crema/[0.02]",
                      r.rank <= 3 ? "bg-crema/[0.04]" : null,
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
                        r.rank === 1
                          ? "bg-caramel text-ink"
                          : r.rank === 2
                            ? "bg-crema/70 text-ink"
                            : r.rank === 3
                              ? "bg-ember/70 text-ink"
                              : "bg-crema/[0.07] text-crema/60",
                      )}
                    >
                      {r.rank === 1 ? <Crown className="size-3.5" /> : r.rank}
                    </span>
                    <Avatar
                      userId={r.userId}
                      src={r.avatar || undefined}
                      name={r.name}
                      className="size-9 shrink-0 rounded-full"
                    />
                    <SmartLink
                      href={page(`/user/?id=${r.userId}`)}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-crema hover:underline"
                    >
                      {r.name}
                    </SmartLink>
                    <span className="shrink-0 text-xs tabular-nums text-crema/45">
                      {r.solved}/{r.games}
                    </span>
                    <span className="w-14 shrink-0 text-right font-display text-2xl tabular-nums text-caramel">
                      {r.points}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {week?.me && week.me.rank > (week.top?.length || 0) ? (
            <p className="mt-4 text-sm text-crema/65">
              Tu sei <b className="text-crema">{week.me.rank}°</b> con{" "}
              <b className="text-crema">{week.me.points} pt</b>.
            </p>
          ) : null}
          {week?.players != null ? (
            <p className="mt-3 text-xs text-crema/40">{week.players} giocatori in classifica</p>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

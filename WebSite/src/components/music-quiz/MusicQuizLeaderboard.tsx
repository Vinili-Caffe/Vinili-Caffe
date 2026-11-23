"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { loadMusicQuizScores } from "@/lib/musicQuiz";

type Row = { rank: number; userId: string; displayName: string; avatarUrl: string; score: number; maxScore: number };

export function MusicQuizLeaderboard({ slug, difficulty }: { slug: string; difficulty?: string }) {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!token || !slug) return;
    let alive = true;
    void loadMusicQuizScores(token, slug, { difficulty, mode: "solo" }).then((r) => {
      if (alive) setRows(r.ok ? r.data.scores || [] : []);
    });
    return () => {
      alive = false;
    };
  }, [token, slug, difficulty]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-3xl font-semibold text-crema">Classifica</h2>
        {difficulty ? (
          <span className="rounded-full bg-crema/[0.07] px-3 py-1 text-xs font-semibold text-crema/70">ascolto di {difficulty.replace("s", " s")}</span>
        ) : null}
      </div>
      {rows == null ? (
        <div className="h-32 animate-pulse rounded-3xl bg-crema/[0.04]" />
      ) : !rows.length ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-sand/20 px-6 py-10 text-center">
          <Crown className="size-7 text-caramel/70" aria-hidden />
          <p className="text-crema/70">Nessun punteggio ancora: il primo posto è libero.</p>
        </div>
      ) : (
        <ol className="overflow-hidden rounded-3xl bg-roast/60 ring-1 ring-sand/10">
          {rows.slice(0, 10).map((r) => {
            const mine = r.userId === user?.id;
            return (
              <li key={`${r.rank}-${r.userId}`} className={cn("flex items-center gap-4 px-5 py-3.5 not-last:border-b not-last:border-sand/[0.07]", mine && "bg-caramel/10")}>
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums",
                    r.rank === 1 ? "bg-caramel text-ink" : r.rank === 2 ? "bg-crema/70 text-ink" : r.rank === 3 ? "bg-ember/70 text-ink" : "bg-crema/[0.07] text-crema/60",
                  )}
                >
                  {r.rank === 1 ? <Crown className="size-3.5" aria-hidden /> : r.rank}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.avatarUrl || "/images/logo-disco.png"} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                <span className="min-w-0 flex-1 truncate font-medium text-crema">{r.displayName}</span>
                <span className="shrink-0 text-right">
                  <span className="font-display text-2xl font-semibold tabular-nums text-caramel">{r.score}</span>
                  {r.maxScore ? <span className="ml-1 text-xs tabular-nums text-crema/40">/ {r.maxScore}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

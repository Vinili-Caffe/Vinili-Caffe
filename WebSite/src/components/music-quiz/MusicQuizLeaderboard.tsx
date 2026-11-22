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
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/55">Classifica{difficulty ? ` · ${difficulty.replace("s", " s")}` : ""}</h2>
      {rows == null ? (
        <div className="h-24 animate-pulse rounded-2xl bg-crema/[0.04]" />
      ) : !rows.length ? (
        <p className="rounded-2xl border border-dashed border-sand/20 px-4 py-6 text-center text-sm text-crema/55">Nessun punteggio ancora: il primo posto è libero.</p>
      ) : (
        <ol className="overflow-hidden rounded-2xl bg-roast/60 ring-1 ring-sand/10">
          {rows.slice(0, 10).map((r) => {
            const mine = r.userId === user?.id;
            return (
              <li key={`${r.rank}-${r.userId}`} className={cn("flex items-center gap-3 px-3.5 py-2.5 not-last:border-b not-last:border-sand/[0.07]", mine && "bg-caramel/10")}>
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
                    r.rank === 1 ? "bg-caramel text-ink" : r.rank === 2 ? "bg-crema/70 text-ink" : r.rank === 3 ? "bg-ember/70 text-ink" : "bg-crema/[0.07] text-crema/60",
                  )}
                >
                  {r.rank === 1 ? <Crown className="size-3.5" aria-hidden /> : r.rank}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.avatarUrl || "/images/logo-disco.png"} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-crema">{r.displayName}</span>
                <span className="shrink-0 font-display text-lg font-semibold tabular-nums text-caramel">{r.score}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

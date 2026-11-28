"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, Circle, Flame, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DAILY_GAMES, loadDailyMe, type DailyMe } from "@/lib/daily";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";

/**
 * Giochi del giorno: cosa hai fatto oggi e la serie combinata.
 * Una linguetta sul bordo sinistro; al clic il pannello entra da sinistra.
 */
export function DailyGamesPanel() {
  const { token, ready } = useAuth();
  const [me, setMe] = useState<DailyMe | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || !token) return;
    void loadDailyMe(token).then(setMe);
  }, [ready, token]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const done = me?.todayGames || {};
  const doneCount = DAILY_GAMES.filter((g) => done[g.id]).length;
  const allDone = doneCount === DAILY_GAMES.length;
  const streak = me?.streak ?? 0;

  return (
    <>
      {/* linguetta sul bordo sinistro */}
      <AnimatePresence>
        {!open ? (
          <motion.button
            key="tab"
            type="button"
            onClick={() => setOpen(true)}
            initial={{ x: -64 }}
            animate={{ x: 0 }}
            exit={{ x: -64 }}
            transition={{ type: "spring", stiffness: 320, damping: 30, delay: 0.3 }}
            aria-label="Apri i giochi del giorno"
            aria-expanded={false}
            className={cn(
              "group fixed left-0 top-[30%] z-[45] flex flex-col items-center gap-1.5 rounded-r-2xl py-3 pl-2 pr-2.5 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.8)] ring-1 transition-[padding] hover:pl-3",
              allDone ? "bg-caramel text-ink ring-caramel/50" : "bg-gradient-to-b from-mocha to-roast text-crema ring-sand/20",
            )}
          >
            <Flame className="size-4" />
            <span className="text-xs font-bold tabular-nums">{token ? `${doneCount}/${DAILY_GAMES.length}` : "?"}</span>
            <ChevronRight className="size-3.5 opacity-60 transition group-hover:translate-x-0.5" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-[2px]"
              aria-hidden
            />
            <motion.aside
              key="panel"
              role="dialog"
              aria-modal="true"
              aria-label="Giochi del giorno"
              initial={{ x: "-105%" }}
              animate={{ x: 0 }}
              exit={{ x: "-105%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed left-2 top-1/2 z-[56] max-h-[calc(100dvh-2rem)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 sm:left-4 sm:p-6"
              style={{ y: "-50%" }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl text-crema">Giochi del giorno</h2>
                <div className="flex items-center gap-2">
                  {token ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
                        streak > 0 ? "bg-caramel text-ink" : "bg-crema/[0.07] text-crema/70",
                      )}
                      title="Giorni di fila con tutti i giochi del giorno fatti"
                    >
                      <Flame className="size-4" /> {streak}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Chiudi"
                    className="grid size-8 place-items-center rounded-full text-crema/60 transition hover:bg-crema/10 hover:text-crema"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-sm text-crema/60">
                {token
                  ? allDone
                    ? "Oggi li hai fatti tutti: la serie continua domani."
                    : `Fatti ${doneCount} su ${DAILY_GAMES.length}: completali tutti per allungare la serie.`
                  : "Accedi con Discord per tenere la serie e comparire nella classifica."}
              </p>
              <ul className="mt-4 grid gap-1.5">
                {DAILY_GAMES.map((g, i) => {
                  const e = done[g.id];
                  return (
                    <motion.li
                      key={g.id}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + i * 0.04 }}
                    >
                      <SmartLink
                        href={page(g.href)}
                        onClick={() => setOpen(false)}
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
                    </motion.li>
                  );
                })}
              </ul>
              {token && me ? (
                <p className="mt-3 text-xs text-crema/50">
                  Record della serie: <b className="text-crema/80">{me.bestStreak ?? 0}</b> · questa settimana{" "}
                  <b className="text-crema/80">{me.weekPoints ?? 0} pt</b>
                </p>
              ) : null}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Disc3, LogIn } from "lucide-react";
import { nextTier, TIERS, tierFor } from "@/lib/perks";
import { loadBoard } from "@/lib/leaderboard";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { NewTag, PerkList } from "./PerkList";

// tacche equidistanti (10→200 non è lineare da leggere); la posizione del tuo livello è interpolata tra due tacche
const pos = (i: number) => (i / (TIERS.length - 1)) * 100;
function levelPos(level: number) {
  if (level <= TIERS[0].level) return 0; // prima del Pop: inizio traccia
  for (let i = 0; i < TIERS.length - 1; i++) {
    const a = TIERS[i].level;
    const b = TIERS[i + 1].level;
    if (level < b) return pos(i) + ((level - a) / (b - a)) * (pos(i + 1) - pos(i));
  }
  return 100;
}

export function GenreTimeline() {
  const { user, login, ready } = useAuth();
  const [level, setLevel] = useState<number | null>(null);
  const [sel, setSel] = useState(0);

  // da loggato: il tuo livello dalla classifica
  useEffect(() => {
    if (!user) return;
    let alive = true;
    loadBoard("level", 1, { userId: user.id, perPage: 10 }).then((d) => {
      const me = d?.rows.find((r) => r.userId === user.id);
      if (!alive || !me?.level) return;
      setLevel(me.level);
      const cur = tierFor(me.level);
      setSel(cur ? TIERS.indexOf(cur) : 0);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const tier = TIERS[sel];
  const cur = level != null ? tierFor(level) : null;
  const next = level != null ? nextTier(level) : null;

  return (
    <div>
      {/* il tuo livello */}
      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl bg-crema/[0.04] px-5 py-4 text-sm text-crema/70 ring-1 ring-sand/10">
        {level != null ? (
          <span>
            Sei al <strong className="text-crema">livello {level}</strong>
            {cur ? (
              <>
                , genere <strong className="text-ember">{cur.genre}</strong>
              </>
            ) : null}
            {next ? (
              <>
                . {next.level - level === 1 ? "Ti manca" : "Ti mancano"}{" "}
                <strong className="text-crema">
                  {next.level - level} {next.level - level === 1 ? "livello" : "livelli"}
                </strong>{" "}
                per sbloccare {next.genre}.
              </>
            ) : (
              ". Hai sbloccato tutti i generi: leggenda del server!"
            )}
          </span>
        ) : user ? (
          <span>Sto cercando il tuo livello…</span>
        ) : (
          <>
            <span>Accedi per vedere a che punto sei sulla traccia.</span>
            {ready && (
              <button type="button" onClick={login} className="inline-flex items-center gap-1.5 font-semibold text-caramel hover:underline">
                <LogIn className="size-4" /> Accedi con Discord
              </button>
            )}
          </>
        )}
      </div>

      {/* la traccia */}
      <div className="relative px-3 pb-2 pt-10 sm:px-6">
        <div className="relative h-2 rounded-full bg-crema/10">
          {level != null && (
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-caramel to-ember"
              initial={{ width: 0 }}
              animate={{ width: `${levelPos(level)}%` }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          {/* la "puntina": il tuo livello */}
          {level != null && (
            <motion.div
              className={cn("absolute -top-9 text-ember", levelPos(level) > 90 ? "-translate-x-[calc(100%-0.5rem)]" : levelPos(level) < 10 ? "-translate-x-2" : "-translate-x-1/2")}
              initial={{ left: "0%", opacity: 0 }}
              animate={{ left: `${levelPos(level)}%`, opacity: 1 }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={cn("flex flex-col", levelPos(level) > 90 ? "items-end" : levelPos(level) < 10 ? "items-start" : "items-center")}>
                <span className="whitespace-nowrap rounded-full bg-ember px-2 py-0.5 text-[0.65rem] font-bold text-ink">Tu · {level}</span>
                <span className="mx-2 h-3 w-px bg-ember" />
              </span>
            </motion.div>
          )}
          {TIERS.map((t, i) => {
            const reached = level != null && level >= t.level;
            const active = i === sel;
            return (
              <button
                key={t.genre}
                type="button"
                onClick={() => setSel(i)}
                aria-pressed={active}
                aria-label={`${t.genre}, livello ${t.level}`}
                className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pos(i)}%` }}
              >
                <span
                  className={cn(
                    "block rounded-full ring-2 transition-all",
                    active ? "size-5 bg-ember ring-ember/40" : reached ? "size-3.5 bg-caramel ring-espresso" : "size-3.5 bg-mocha ring-sand/30 group-hover:bg-sand/60",
                  )}
                />
              </button>
            );
          })}
        </div>
        {/* etichette */}
        <div className="relative mt-4 h-10">
          {TIERS.map((t, i) => (
            <button
              key={t.genre}
              type="button"
              onClick={() => setSel(i)}
              className={cn(
                "absolute -translate-x-1/2 whitespace-nowrap text-center transition-colors",
                i % 2 === 1 && "max-sm:top-5",
                i === sel ? "text-ember" : "text-crema/50 hover:text-crema",
              )}
              style={{ left: `${pos(i)}%` }}
            >
              <span className="block font-display text-sm font-semibold sm:text-base">{t.genre}</span>
              <span className="block text-[0.65rem] tabular-nums">Lv {t.level}</span>
            </button>
          ))}
        </div>
      </div>

      {/* dettaglio del genere scelto */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tier.genre}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="mt-6 grid gap-6 rounded-3xl bg-gradient-to-br from-mocha/80 to-roast p-6 ring-1 ring-sand/15 sm:grid-cols-[auto_1fr] sm:p-8"
        >
          <div className="flex items-center gap-4 sm:flex-col sm:items-start">
            <span className="flex size-16 items-center justify-center rounded-full bg-espresso text-caramel ring-1 ring-sand/20">
              <Disc3 className="size-9 animate-[spin_6s_linear_infinite] motion-reduce:animate-none" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-caramel">Livello {tier.level}+</p>
              <p className="mt-1 font-display text-4xl font-semibold">{tier.genre}</p>
              <p className="mt-1 text-sm text-crema/50">Ruolo @{tier.role}</p>
              {tier.isNew && <NewTag className="mt-2" />}
            </div>
          </div>
          <PerkList perks={tier.perks} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

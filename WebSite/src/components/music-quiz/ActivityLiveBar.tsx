"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { activityInstanceId } from "@/lib/discordActivity";
import { getLivePreview, loadLive, onLivePreview, postLive, type LivePlayer, type LivePreview } from "@/lib/activityLive";
import type { Mark } from "@/lib/wordle";
import { cn } from "@/lib/cn";

const GAME_LABEL: Record<string, string> = { quiz: "Music Quiz", numeri: "Number Quiz", angolo: "Angle", wordle: "Wordle", quad: "Quordle", canzone: "Canzone del giorno", copertina: "Copertina del giorno" };
const MODE_LABEL: Record<string, string> = { daily: "Del giorno", practice: "Allenamento", duel: "Sfida un amico" };

const dot = (m: Mark) => (m === "g" ? "bg-[#58a64b]" : m === "y" ? "bg-[#c9a227]" : "bg-crema/15");

/** solo colori, niente lettere: si capisce come va senza vedere le parole */
function MiniGrid({ rows, max }: { rows: Mark[][]; max: number }) {
  return (
    <div className="flex flex-col gap-[2px]">
      {Array.from({ length: max }, (_, r) => (
        <div key={r} className="flex gap-[2px]">
          {Array.from({ length: 5 }, (_, c) => (
            <span key={c} className={cn("size-[5px] rounded-[1px]", rows[r] ? dot(rows[r][c] || "b") : "bg-crema/[0.06]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Status({ p }: { p: LivePreview }) {
  if (p.solved) return <span className="text-emerald-400">indovinato</span>;
  if (p.done) return <span className="text-crema/50">finito</span>;
  if (p.game === "numeri" && p.streak != null) return <span>serie {p.streak}</span>;
  if (p.attempts != null && p.max) return <span>{p.attempts} di {p.max}</span>;
  return <span className="text-crema/45">sta giocando</span>;
}

/**
 * Barra a sinistra nell'Attività: chi della chiamata sta giocando e come va.
 * Manda anche la tua anteprima (ridotta) agli altri.
 */
export function ActivityLiveBar() {
  const { token, user } = useAuth();
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  /* su finestre strette parte chiusa, per non coprire il gioco */
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1100);
  const instance = typeof window !== "undefined" ? activityInstanceId() : null;

  /* la tua anteprima: subito quando cambia, e ogni 8 secondi per restare «in chiamata» */
  useEffect(() => {
    if (!token || !instance) return;
    let last = 0;
    let timer = 0;
    const send = () => {
      last = Date.now();
      void postLive(token, instance, getLivePreview());
    };
    const off = onLivePreview(() => {
      window.clearTimeout(timer);
      /* al massimo una volta al secondo */
      timer = window.setTimeout(send, Math.max(0, 1000 - (Date.now() - last)));
    });
    send();
    const beat = window.setInterval(send, 8000);
    return () => {
      off();
      window.clearTimeout(timer);
      window.clearInterval(beat);
      void postLive(token, instance, null);
    };
  }, [token, instance]);

  useEffect(() => {
    if (!instance) return;
    let alive = true;
    const tick = () => void loadLive(instance).then((list) => alive && setPlayers(list));
    tick();
    const t = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [instance]);

  const others = players.filter((p) => p.userId !== user?.id);
  if (!instance || !others.length) return null;

  return (
    <aside className="fixed left-0 top-1/2 z-[45] -translate-y-1/2" aria-label="Chi gioca in chiamata">
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="open"
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            className="ml-2 w-44 rounded-2xl bg-roast/90 p-2.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl sm:w-52"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-caramel">Chi gioca in chiamata</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Nascondi" className="grid size-6 place-items-center rounded-md text-crema/50 hover:text-crema">
                <ChevronLeft className="size-4" />
              </button>
            </div>
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
              {others.map((p) => {
                const pr = p.preview;
                const grids = pr.grids || [];
                return (
                  <li key={p.userId} className="rounded-xl bg-crema/[0.04] p-2 ring-1 ring-sand/10">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.avatar || "/images/logo-disco.png"} alt="" className="size-6 shrink-0 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-crema">{p.name}</p>
                        <p className="truncate text-[10px] text-crema/55">
                          {GAME_LABEL[pr.game] || pr.game}
                          {pr.mode && MODE_LABEL[pr.mode] ? ` · ${MODE_LABEL[pr.mode]}` : ""}
                        </p>
                      </div>
                    </div>
                    {grids.length ? (
                      <div className={cn("mt-2 flex gap-2", grids.length > 1 && "flex-wrap")}>
                        {grids.map((g, i) => (
                          <MiniGrid key={i} rows={g} max={pr.max || 6} />
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-1.5 text-[10px] font-semibold text-crema/70">
                      <Status p={pr} />
                    </p>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        ) : (
          <motion.button
            key="closed"
            type="button"
            onClick={() => setOpen(true)}
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            aria-label="Mostra chi sta giocando"
            className="flex items-center gap-1 rounded-r-xl bg-roast/90 py-2.5 pl-2 pr-2.5 text-xs font-bold text-crema ring-1 ring-sand/15 backdrop-blur-xl"
          >
            <Users className="size-4 text-caramel" />
            {others.length}
          </motion.button>
        )}
      </AnimatePresence>
    </aside>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronRight, Search, Server } from "lucide-react";
import type { ProfileGuild } from "@/lib/profile";
import { cn } from "@/lib/cn";

/** Scelta del server del profilo, con lo stesso aspetto di "Lista staff": frecce, nome, posizione e menu. */
export function ServerSwitcher({ guilds, current, onGo }: { guilds: ProfileGuild[]; current: string; onGo: (id: string) => void }) {
  const i = guilds.findIndex((g) => g.id === current);
  const cur = guilds[i] || guilds[0];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  if (!cur) return null;
  const go = (id?: string) => id && (setOpen(false), onGo(id));
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = guilds.filter((g) => !q || norm(g.name).includes(norm(q)));

  const icon = (g: ProfileGuild, size = "size-5") =>
    g.iconUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- icona Discord piccola
      <img src={g.iconUrl} alt="" className={cn(size, "shrink-0 rounded-md")} />
    ) : (
      <span className={cn(size, "flex shrink-0 items-center justify-center rounded-md bg-caramel/15 text-[0.6rem] font-bold text-ember")}>{g.name.slice(0, 1)}</span>
    );

  return (
    <div ref={box} className="relative flex max-w-full items-center gap-1 rounded-full bg-roast/90 p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.85)] ring-1 ring-sand/20 backdrop-blur" aria-label="Server del profilo">
      <button type="button" aria-label="Server precedente" disabled={i <= 0} onClick={() => go(guilds[i - 1]?.id)} className="rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema disabled:opacity-30">
        <ChevronLeft className="size-4" />
      </button>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-crema/8">
        {icon(cur)}
        <span className="min-w-0 max-w-[11rem] truncate sm:max-w-[16rem]" translate="no">
          {cur.name}
        </span>
        <span className="shrink-0 text-crema/45 lining-nums">
          {i >= 0 ? i + 1 : 1}/{guilds.length}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      <button type="button" aria-label="Server successivo" disabled={i < 0 || i >= guilds.length - 1} onClick={() => go(guilds[i + 1]?.id)} className="rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema disabled:opacity-30">
        <ChevronRight className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute left-1/2 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl bg-roast/95 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
          >
            {guilds.length > 6 ? (
              <label htmlFor="profile-server-search" className="flex items-center gap-2 border-b border-sand/10 px-3">
                <Search className="size-4 text-crema/40" />
                <input id="profile-server-search" name="profile-server-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un server…" className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-crema/35" />
              </label>
            ) : null}
            <div className="max-h-80 overflow-y-auto p-1.5">
              <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-caramel">
                <Server className="size-3" aria-hidden /> Server in comune
              </p>
              {list.map((g) => (
                <button key={g.id} type="button" onClick={() => go(g.id)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-crema/[0.06]", g.id === cur.id && "bg-caramel/12 text-ember")}>
                  {icon(g, "size-7")}
                  <span className="min-w-0 flex-1 truncate" translate="no">
                    {g.name}
                  </span>
                  {g.isMain ? <span className="text-[0.6rem] font-bold uppercase text-sand">principale</span> : null}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

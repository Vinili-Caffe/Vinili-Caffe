"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Bot, Disc3, Plus, Server, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadBoardsConfig, loadListings, type BoardKind, type BoardListing, type BoardsConfig } from "@/lib/boards";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { ListingCardSkeleton, Spotlight } from "./ListingCard";

type Shelf = { total: number; items: BoardListing[] } | null;

const DOORS: { kind: BoardKind; title: string; text: string; icon: LucideIcon; href: string; tint: string }[] = [
  {
    kind: "server",
    title: "Server",
    text: "Community da scoprire: gaming, musica, chiacchiere, eventi. Trova il posto giusto per te.",
    icon: Server,
    href: "/vetrina/server/",
    tint: "rgba(217,154,91,0.45)",
  },
  {
    kind: "bot",
    title: "Bot",
    text: "Musica, moderazione, giochi, utilità: i bot che rendono vivo un server, provati dalla community.",
    icon: Bot,
    href: "/vetrina/bot/",
    tint: "rgba(88,101,242,0.45)",
  },
];

/** Ingresso della vetrina: due porte (server e bot, sempre separati) e il podio di ciascuno. */
export function VetrinaLanding() {
  const { ready, token } = useAuth();
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [shelves, setShelves] = useState<Record<BoardKind, Shelf>>({ server: null, bot: null });

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void loadBoardsConfig("", token).then((c) => alive && c && setCfg(c));
    for (const kind of ["server", "bot"] as BoardKind[]) {
      void loadListings({ kind, sort: "score", perPage: 3 }, token).then((l) => {
        if (alive) setShelves((prev) => ({ ...prev, [kind]: { total: l?.total || 0, items: l?.listings || [] } }));
      });
    }
    return () => {
      alive = false;
    };
  }, [ready, token]);

  return (
    <>
      <header className="relative overflow-hidden px-6 pb-12 pt-14 text-center sm:pt-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto max-w-4xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-crema/6 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-caramel ring-1 ring-sand/15">
            <Disc3 className="size-4" /> Vetrina
          </p>
          <h1 className="mt-5 font-display text-6xl font-semibold leading-[0.98] sm:text-7xl md:text-8xl">
            La vetrina <em className="block font-script text-[1.05em] font-normal not-italic text-ember sm:inline">della community</em>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-crema/60">
            Server e bot Discord si mettono in mostra: scegli da che parte entrare, sfoglia, vota e lascia una recensione.
          </p>
        </motion.div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        {/* le due porte */}
        <div className="grid gap-5 md:grid-cols-2">
          {DOORS.map((d, i) => {
            const shelf = shelves[d.kind];
            const Icon = d.icon;
            return (
              <motion.div key={d.kind} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08, duration: 0.5 }}>
                <SmartLink
                  href={page(d.href)}
                  className="group relative flex min-h-[15rem] flex-col justify-between overflow-hidden rounded-[2rem] bg-roast p-7 ring-1 ring-sand/15 transition duration-300 hover:-translate-y-1 hover:ring-ember/40 sm:p-8"
                >
                  <span aria-hidden className="absolute -right-24 -top-24 size-96 opacity-60 transition-opacity duration-500 group-hover:opacity-100" style={{ background: `radial-gradient(circle, ${d.tint}, transparent 65%)` }} />
                  <span className="relative flex items-start justify-between gap-4">
                    <span className="flex size-14 items-center justify-center rounded-2xl bg-crema text-ink">
                      <Icon className="size-7" />
                    </span>
                    {/* icone delle prime schede, sovrapposte */}
                    <span className="flex -space-x-3">
                      {(shelf?.items || []).map((l) =>
                        l.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={l.id} src={l.iconUrl} alt="" className="size-11 rounded-full object-cover ring-4 ring-roast" />
                        ) : (
                          <span key={l.id} className="flex size-11 items-center justify-center rounded-full bg-mocha ring-4 ring-roast">
                            <Icon className="size-5 text-crema/60" />
                          </span>
                        ),
                      )}
                    </span>
                  </span>
                  <span className="relative mt-8 block">
                    <span className="block font-display text-5xl font-semibold">{d.title}</span>
                    <span className="mt-2 block max-w-md text-crema/60">{d.text}</span>
                    <span className="mt-5 flex items-center justify-between gap-3">
                      <span className="text-sm text-crema/50">
                        {shelf ? (
                          <>
                            <span className="font-semibold text-crema/85">{shelf.total.toLocaleString("it-IT")}</span> {d.kind === "bot" ? "bot" : "server"} in vetrina
                          </>
                        ) : (
                          <span className="inline-block h-4 w-28 animate-pulse rounded bg-crema/8" />
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold text-crema ring-1 ring-sand/25 transition group-hover:bg-crema group-hover:text-ink">
                        Sfoglia <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </span>
                  </span>
                </SmartLink>
              </motion.div>
            );
          })}
        </div>

        {/* il podio di ciascuno, separati */}
        {DOORS.map((d) => {
          const shelf = shelves[d.kind];
          if (shelf && shelf.items.length === 0) return null;
          return (
            <div key={d.kind} className="mt-16">
              <div className="mb-5 flex items-end justify-between gap-3">
                <div>
                  <p className="font-script text-2xl text-caramel/85">In primo piano</p>
                  <h2 className="font-display text-3xl font-semibold sm:text-4xl">{d.kind === "bot" ? "I bot più in alto" : "I server più in alto"}</h2>
                </div>
                <SmartLink href={page(d.href)} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-crema/60 hover:text-ember">
                  Vedi tutti <ArrowRight className="size-4" />
                </SmartLink>
              </div>
              {shelf ? (
                <Spotlight items={shelf.items} cfg={cfg} />
              ) : (
                <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                  <ListingCardSkeleton />
                  <ListingCardSkeleton i={1} />
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-20 flex flex-col items-center gap-4 rounded-[2rem] border border-dashed border-sand/20 p-10 text-center">
          <p className="font-display text-3xl">Hai un server o un bot?</p>
          <p className="max-w-md text-crema/55">Mettilo in vetrina: lo controlliamo e finisce sugli scaffali, pronto per voti e recensioni.</p>
          <SmartLink href={page("/vetrina/invia/")} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-bold text-ink transition-transform hover:-translate-y-0.5">
            <Plus className="size-4" /> Metti in vetrina
          </SmartLink>
        </div>
      </section>
    </>
  );
}

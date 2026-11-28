"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Bot, Disc3, Plus, Server, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadBoardsConfig, loadListings, type BoardKind, type BoardListing, type BoardsConfig } from "@/lib/boards";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { ListingCardSkeleton, Spotlight } from "./ListingCard";
import { VetrinaHeroBg } from "./VetrinaChrome";

type Shelf = { total: number; items: BoardListing[] } | null;

const DOORS: { kind: BoardKind; title: string; text: string; icon: LucideIcon; href: string; tint: string }[] = [
  {
    kind: "server",
    title: "Server",
    text: "Community di gaming, musica, chiacchiere ed eventi. Sfogliale e trova quella giusta per te.",
    icon: Server,
    href: "/vetrina/server/",
    tint: "rgba(217,154,91,0.45)",
  },
  {
    kind: "bot",
    title: "Bot",
    text: "Bot per musica, moderazione, giochi e utilità, provati e recensiti dalla community.",
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
  const [monthShelves, setMonthShelves] = useState<Record<BoardKind, Shelf>>({ server: null, bot: null });

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void loadBoardsConfig("", token).then((c) => alive && c && setCfg(c));
    for (const kind of ["server", "bot"] as BoardKind[]) {
      void loadListings({ kind, sort: "score", perPage: 3 }, token).then((l) => {
        if (alive) setShelves((prev) => ({ ...prev, [kind]: { total: l?.total || 0, items: l?.listings || [] } }));
      });
      void loadListings({ kind, sort: "month", perPage: 3 }, token).then((l) => {
        if (alive) setMonthShelves((prev) => ({ ...prev, [kind]: { total: l?.total || 0, items: l?.listings || [] } }));
      });
    }
    return () => {
      alive = false;
    };
  }, [ready, token]);

  return (
    <>
      <header className="relative isolate overflow-hidden px-6 pb-16 pt-28 text-center sm:pt-36">
        <VetrinaHeroBg />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto max-w-4xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-crema/6 px-3.5 py-1.5 text-xs font-semibold text-caramel ring-1 ring-sand/15">
            <Disc3 className="size-4" /> Vetrina
          </p>
          <h1 className="mt-5 font-display text-6xl font-semibold leading-[0.98] sm:text-7xl md:text-8xl">
            La vetrina <em className="block font-script text-[1.05em] font-normal not-italic text-ember sm:inline">della community</em>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-crema/60">
            Un elenco di server e bot Discord, ognuno con la sua scheda. Scegli se cercare un server o un bot, sfoglia, vota e lascia una recensione. Se hai un progetto tuo, lo proponi da «Metti in vetrina».
          </p>
        </motion.div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        {/* le due porte */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {DOORS.map((d, i) => {
            const shelf = shelves[d.kind];
            const Icon = d.icon;
            return (
              <motion.div key={d.kind} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08, duration: 0.5 }}>
                <SmartLink
                  href={page(d.href)}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-[1.6rem] bg-roast p-5 ring-1 sm:min-h-[15rem] sm:rounded-[2rem] sm:p-8 ring-sand/15 transition duration-300  hover:ring-ember/40"
                >
                  <span aria-hidden className="absolute -right-24 -top-24 size-96 opacity-60 transition-opacity duration-500 group-hover:opacity-100" style={{ background: `radial-gradient(circle, ${d.tint}, transparent 65%)` }} />
                  <span className="relative flex items-start justify-between gap-4">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-crema text-ink sm:size-14 sm:rounded-2xl">
                      <Icon className="size-6 sm:size-7" />
                    </span>
                    {/* icone delle prime schede, sovrapposte */}
                    <span className="flex -space-x-3">
                      {(shelf?.items || []).map((l) =>
                        l.iconUrl ? (
                           
                          <img key={l.id} src={l.iconUrl} alt="" className="size-9 rounded-full object-cover ring-4 ring-roast sm:size-11" />
                        ) : (
                          <span key={l.id} className="flex size-9 items-center justify-center rounded-full bg-mocha ring-4 ring-roast sm:size-11">
                            <Icon className="size-5 text-crema/60" />
                          </span>
                        ),
                      )}
                    </span>
                  </span>
                  <span className="relative mt-4 block sm:mt-8">
                    <span className="block font-display text-4xl font-semibold sm:text-5xl">{d.title}</span>
                    <span className="mt-1.5 line-clamp-2 max-w-md text-sm text-crema/60 sm:mt-2 sm:line-clamp-none sm:text-base">{d.text}</span>
                    <span className="mt-4 flex sm:mt-5 items-center justify-between gap-3">
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
          const monthShelf = monthShelves[d.kind];
          if (shelf && shelf.items.length === 0 && monthShelf && monthShelf.items.length === 0) return null;
          const monthHref = page(`${d.href}?sort=month`);
          return (
            <div key={d.kind} className="mt-16 space-y-16">
              {shelf && shelf.items.length > 0 ? (
                <div>
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
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                      <ListingCardSkeleton />
                      <ListingCardSkeleton i={1} />
                    </div>
                  )}
                </div>
              ) : shelf === null ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                  <ListingCardSkeleton />
                  <ListingCardSkeleton i={1} />
                </div>
              ) : null}
              {monthShelf && monthShelf.items.length > 0 ? (
                <div>
                  <div className="mb-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-script text-2xl text-caramel/85">Classifiche del mese</p>
                      <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                        Top del mese · {d.kind === "bot" ? "Bot" : "Server"}
                      </h2>
                    </div>
                    <SmartLink href={monthHref} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-crema/60 hover:text-ember">
                      Classifica completa <ArrowRight className="size-4" />
                    </SmartLink>
                  </div>
                  <Spotlight items={monthShelf.items} cfg={cfg} />
                </div>
              ) : monthShelf === null ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                  <ListingCardSkeleton />
                  <ListingCardSkeleton i={1} />
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="mt-20 flex flex-col items-center gap-4 rounded-[2rem] border border-dashed border-sand/20 p-10 text-center">
          <p className="font-display text-3xl">Hai un server o un bot?</p>
          <p className="max-w-md text-crema/55">Mettilo in vetrina: compili la scheda, lo staff la controlla e dopo l’approvazione può ricevere voti e recensioni.</p>
          <SmartLink href={page("/vetrina/invia/")} className="inline-flex items-center gap-2 rounded-full bg-caramel px-6 py-3 font-bold text-ink transition-transform ">
            <Plus className="size-4" /> Metti in vetrina
          </SmartLink>
        </div>
      </section>
    </>
  );
}

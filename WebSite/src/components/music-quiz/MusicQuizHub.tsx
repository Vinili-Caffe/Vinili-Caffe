"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Disc3, Plus, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { loadMusicQuizHub, type MusicQuizPackCard } from "@/lib/musicQuiz";
import { MusicQuizSearch } from "./MusicQuizSearch";

const packHref = (p: MusicQuizPackCard) => page(`/music-quiz/pack/?slug=${encodeURIComponent(p.slug)}`);

export function MusicQuizHub() {
  const { token } = useAuth();
  const [featured, setFeatured] = useState<MusicQuizPackCard[] | null>(null);
  const [community, setCommunity] = useState<MusicQuizPackCard[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void loadMusicQuizHub(token).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setErr(r.message);
        setFeatured([]);
        return;
      }
      setFeatured(r.data.featured || r.data.popular || []);
      setCommunity(r.data.community || []);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const [top, ...rest] = featured || [];

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 pb-20 pt-24 sm:pt-28">
      {/* ricerca */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-mocha via-roast to-espresso px-5 py-8 ring-1 ring-sand/15 sm:px-10 sm:py-10">
        <motion.div
          aria-hidden
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, ease: "linear", duration: 30 }}
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#2a1c14_1.5px_3px)] opacity-60 ring-1 ring-sand/10"
        >
          <span className="absolute inset-[36%] rounded-full bg-gradient-to-br from-caramel to-ember" />
        </motion.div>
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-caramel">Indovina la canzone</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-crema sm:text-5xl">Quanto conosci la tua musica?</h1>
          <p className="mt-3 text-crema/65">Scegli un artista o una playlist, ascolta pochi secondi di ogni brano e indovina il titolo prima degli altri.</p>
        </div>
        <div className="relative mt-6 max-w-3xl">
          <MusicQuizSearch />
        </div>
      </section>

      {err ? <p className="text-sm text-ember">{err}</p> : null}

      {/* artisti del momento */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-display text-3xl font-semibold text-crema">Artisti del momento</h2>
          <span className="text-sm text-crema/50">dalle classifiche di Deezer</span>
        </div>
        {featured == null ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className={`animate-pulse rounded-3xl bg-crema/[0.05] ${i === 0 ? "col-span-2 row-span-2 aspect-square" : "aspect-square"}`} />
            ))}
          </div>
        ) : !featured.length ? (
          <p className="text-sm text-crema/55">Nessun artista disponibile ora.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {top ? <PackTile p={top} big /> : null}
            {rest.map((p, i) => (
              <PackTile key={p.slug} p={p} i={i + 1} />
            ))}
          </div>
        )}
      </section>

      {/* community */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-semibold text-crema">Creati dallo staff</h2>
            <p className="mt-1 text-sm text-crema/55">Quiz con i brani scelti a mano.</p>
          </div>
          <SmartLink
            href={page("/music-quiz/crea/")}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-bold text-ink transition hover:-translate-y-0.5"
          >
            <Plus className="size-4" aria-hidden /> Crea un quiz
          </SmartLink>
        </div>
        {!community.length ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-sand/20 px-6 py-10 text-center">
            <Disc3 className="size-8 text-caramel/70" aria-hidden />
            <p className="text-crema/70">Non c&apos;è ancora nessun quiz fatto a mano. Il primo lo puoi creare tu.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {community.map((p, i) => (
              <PackTile key={p.slug} p={p} i={i} small />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PackTile({ p, big, small, i = 0 }: { p: MusicQuizPackCard; big?: boolean; small?: boolean; i?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 10) * 0.04 }}
      className={big ? "col-span-2 row-span-2" : ""}
    >
      <SmartLink href={packHref(p)} className="group relative block aspect-square overflow-hidden rounded-3xl bg-roast ring-1 ring-sand/10 transition hover:ring-caramel/45">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.cover || "/images/logo-disco.png"} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
        <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
        {big ? <span className="absolute left-4 top-4 rounded-full bg-caramel px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink">In evidenza</span> : null}
        <span className={`absolute inset-x-0 bottom-0 p-4 ${big ? "sm:p-6" : ""}`}>
          <span className={`block font-display font-semibold leading-tight text-crema ${big ? "text-4xl sm:text-5xl" : small ? "text-lg" : "text-xl"}`}>{p.title}</span>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-crema/70">
            {p.plays ? (
              <>
                <Users className="size-3" aria-hidden /> {p.plays} partite
              </>
            ) : p.trackCount ? (
              `${p.trackCount} brani`
            ) : (
              "Gioca ora"
            )}
          </span>
        </span>
      </SmartLink>
    </motion.div>
  );
}

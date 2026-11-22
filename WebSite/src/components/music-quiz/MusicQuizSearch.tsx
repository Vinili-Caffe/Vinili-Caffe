"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ListMusic, Loader2, Mic2, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { searchMusicQuiz } from "@/lib/musicQuiz";

type Hit = { href: string; title: string; cover: string; sub: string; kind: "artist" | "playlist" };

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".0", "")} mln` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export function MusicQuizSearch() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!token || query.length < 2) {
      setHits(null);
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    const id = window.setTimeout(() => {
      void searchMusicQuiz(token, query).then((r) => {
        if (!alive) return;
        setBusy(false);
        if (!r.ok) return setHits([]);
        setHits([
          ...(r.data.artists || []).slice(0, 6).map((a) => ({
            href: page(`/music-quiz/pack/?slug=artist-${a.id}`),
            title: a.name,
            cover: a.cover,
            sub: a.fans ? `${fmt(a.fans)} fan` : "Artista",
            kind: "artist" as const,
          })),
          ...(r.data.playlists || []).slice(0, 6).map((p) => ({
            href: page(`/music-quiz/pack/?slug=playlist-${p.id}`),
            title: p.name,
            cover: p.cover,
            sub: p.trackCount ? `${p.trackCount} brani` : "Playlist",
            kind: "playlist" as const,
          })),
        ]);
      });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [q, token]);

  return (
    <div className="w-full">
      <label className="relative block">
        <span className="sr-only">Cerca un artista o una playlist</span>
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-crema/45" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca un artista o una playlist: Vasco, Måneskin, anni '80…"
          className="w-full rounded-full border-0 bg-espresso/80 py-4 pl-14 pr-12 text-base text-crema outline-none ring-1 ring-sand/20 transition placeholder:text-crema/40 focus:ring-2 focus:ring-caramel/60"
        />
        {busy ? (
          <Loader2 className="absolute right-5 top-1/2 size-5 -translate-y-1/2 animate-spin text-caramel" aria-hidden />
        ) : q ? (
          <button type="button" onClick={() => setQ("")} aria-label="Cancella la ricerca" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-crema/50 hover:text-crema">
            <X className="size-4" />
          </button>
        ) : null}
      </label>

      <AnimatePresence>
        {hits ? (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-3">
            {!hits.length && !busy ? (
              <p className="rounded-2xl bg-roast/70 px-4 py-5 text-center text-sm text-crema/60 ring-1 ring-sand/10">Niente trovato su Deezer. Prova con un altro nome.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {hits.map((h) => (
                  <li key={h.href}>
                    <SmartLink href={h.href} className="group flex items-center gap-3 rounded-2xl bg-roast/80 p-2 pr-4 ring-1 ring-sand/10 transition hover:bg-mocha/70 hover:ring-caramel/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.cover || "/images/logo-disco.png"} alt="" className={`size-14 shrink-0 object-cover ${h.kind === "artist" ? "rounded-full" : "rounded-xl"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-crema">{h.title}</span>
                        <span className="flex items-center gap-1.5 text-xs text-crema/55">
                          {h.kind === "artist" ? <Mic2 className="size-3" aria-hidden /> : <ListMusic className="size-3" aria-hidden />}
                          {h.sub}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-caramel/15 px-3 py-1 text-xs font-semibold text-caramel opacity-0 transition group-hover:opacity-100">Gioca</span>
                    </SmartLink>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

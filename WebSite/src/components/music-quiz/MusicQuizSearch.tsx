"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Disc3, ListMusic, Loader2, Mic2, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { searchMusicQuiz } from "@/lib/musicQuiz";
import { QuizCarousel } from "./QuizCarousel";

type Artist = { href: string; name: string; cover: string; fans: number };
type Playlist = { href: string; name: string; cover: string; sub: string };
export type Hits = { artists: Artist[]; playlists: Playlist[]; quizzes?: Playlist[] };

const COVER = "/images/logo-disco.png";
const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".0", "")} mln` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function slugFromPackHref(href: string) {
  try {
    const u = new URL(href, "https://www.viniliecaffe.it");
    const m = u.pathname.match(/\/music-quiz\/pack\/?$/i);
    if (!m) return "";
    return String(u.searchParams.get("slug") || "").trim();
  } catch {
    return "";
  }
}

export function MusicQuizSearch({ onPickSlug }: { onPickSlug?: (slug: string) => void } = {}) {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hits | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits(null);
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    const id = window.setTimeout(() => {
      void searchMusicQuiz(token || "", query).then((r) => {
        if (!alive) return;
        setBusy(false);
        if (!r.ok) return setHits({ artists: [], playlists: [], quizzes: [] });
        /* ordine di Deezer (il nome più simile prima), ma senza i profili omonimi quasi vuoti */
        const all = r.data.artists || [];
        const known = all.filter((a) => (a.fans || 0) >= 500);
        const artists = (known.length >= 3 ? known : all).slice(0, 12).map((a) => ({
          href: page(`/music-quiz/pack/?slug=artist-${a.id}`),
          name: a.name,
          cover: a.cover,
          fans: a.fans || 0,
        }));
        /* l'ordine lo decide il server (nome cercato nel titolo, poi le più seguite); Spotify e Deezer insieme */
        const playlists = [...(r.data.playlists || [])]
          .filter((p) => (p.trackCount || 0) >= 8)
          .slice(0, 18)
          .map((p) => ({
            href: page(`/music-quiz/pack/?slug=${p.kind === "spotify" ? "spotify" : "playlist"}-${p.id}`),
            name: p.name,
            cover: p.cover,
            sub: [p.kind === "spotify" ? "Spotify" : "Deezer", p.trackCount ? `${p.trackCount} brani` : "", p.owner || ""]
              .filter(Boolean)
              .join(" · "),
          }));
        const quizzes = (r.data.quizzes || []).map((p) => ({
          href: page(`/music-quiz/pack/?slug=${encodeURIComponent(p.slug)}`),
          name: p.title,
          cover: p.cover,
          sub: [p.trackCount ? `${p.trackCount} brani` : "", p.authorName ? `di ${p.authorName}` : "", p.plays ? `${p.plays} partite` : ""]
            .filter(Boolean)
            .join(" · "),
        }));
        setHits({ artists, playlists, quizzes });
      });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [q, token]);

  const empty = hits && !hits.artists.length && !hits.playlists.length && !hits.quizzes?.length;

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
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-6 space-y-7">
            {empty && !busy ? (
              <p className="rounded-2xl bg-roast/70 px-4 py-5 text-center text-sm text-crema/60 ring-1 ring-sand/10">Niente trovato. Prova con un altro nome.</p>
            ) : null}

            <SearchResults hits={hits} onPickSlug={onPickSlug} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PackHit({
  href,
  onPickSlug,
  className,
  children,
}: {
  href: string;
  onPickSlug?: (slug: string) => void;
  className?: string;
  children: ReactNode;
}) {
  if (onPickSlug) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          const slug = slugFromPackHref(href);
          if (slug) onPickSlug(slug);
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <SmartLink href={href} className={className}>
      {children}
    </SmartLink>
  );
}

/** Artisti in una riga che scorre, playlist su due righe: separato per poterlo vedere anche senza ricerca. */
export function SearchResults({ hits, onPickSlug }: { hits: Hits; onPickSlug?: (slug: string) => void }) {
  return (
    <>
      {hits.artists.length ? (
        <section>
          <ResultsHead icon={<Mic2 className="size-3.5" aria-hidden />} label="Artisti" />
          <QuizCarousel round>
            {hits.artists.map((a, i) => (
              <motion.div
                key={a.href}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                className="shrink-0 snap-start"
              >
                <PackHit href={a.href} onPickSlug={onPickSlug} className="group block w-24 text-center sm:w-28">
                  <span className="block aspect-square overflow-hidden rounded-full bg-crema/[0.06] ring-1 ring-sand/15 transition group-hover:ring-2 group-hover:ring-caramel">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.cover || COVER} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                  </span>
                  <span className="mt-2 block truncate text-sm font-semibold text-crema">{a.name}</span>
                  {a.fans ? <span className="block text-[0.7rem] text-crema/45">{fmt(a.fans)} fan</span> : null}
                </PackHit>
              </motion.div>
            ))}
          </QuizCarousel>
        </section>
      ) : null}

      {hits.quizzes?.length ? (
        <section>
          <ResultsHead icon={<Disc3 className="size-3.5" aria-hidden />} label="Quiz della community" />
          <QuizCarousel>
            <div className="grid shrink-0 auto-cols-[15.5rem] grid-flow-col grid-rows-2 gap-2.5 sm:auto-cols-[18rem]">
              {hits.quizzes.map((p) => (
                <PackHit
                  key={p.href}
                  href={p.href}
                  onPickSlug={onPickSlug}
                  className="group flex items-center gap-3 rounded-2xl bg-crema/[0.04] p-2 pr-3 text-left ring-1 ring-sand/10 transition hover:bg-crema/[0.08] hover:ring-caramel/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.cover || COVER} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-crema">{p.name}</span>
                    <span className="block truncate text-xs text-crema/50">{p.sub || "Quiz"}</span>
                  </span>
                </PackHit>
              ))}
            </div>
          </QuizCarousel>
        </section>
      ) : null}
      {hits.playlists.length ? (
        <section>
          <ResultsHead icon={<ListMusic className="size-3.5" aria-hidden />} label="Playlist" />
          <QuizCarousel>
            <div className="grid shrink-0 auto-cols-[15.5rem] grid-flow-col grid-rows-2 gap-2.5 sm:auto-cols-[18rem]">
              {hits.playlists.map((p) => (
                <PackHit
                  key={p.href}
                  href={p.href}
                  onPickSlug={onPickSlug}
                  className="group flex items-center gap-3 rounded-2xl bg-crema/[0.04] p-2 pr-3 text-left ring-1 ring-sand/10 transition hover:bg-crema/[0.08] hover:ring-caramel/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.cover || COVER} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-crema">{p.name}</span>
                    <span className="block truncate text-xs text-crema/50">{p.sub || "Playlist"}</span>
                  </span>
                </PackHit>
              ))}
            </div>
          </QuizCarousel>
        </section>
      ) : null}
    </>
  );
}

function ResultsHead({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <p className="mb-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-crema/55">
      {icon}
      {label}
    </p>
  );
}

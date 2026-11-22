"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Disc3, ListMusic, Plus } from "lucide-react";
import { QuizCarousel as Carousel } from "./QuizCarousel";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { loadMusicQuizHub, type MusicQuizHubData, type MusicQuizPackCard } from "@/lib/musicQuiz";
import { MusicQuizSearch } from "./MusicQuizSearch";

const packHref = (p: MusicQuizPackCard) => page(`/music-quiz/pack/?slug=${encodeURIComponent(p.slug)}`);
const COVER = "/images/logo-disco.png";

function playsLabel(p: MusicQuizPackCard) {
  if (p.plays) return `${p.plays} ${p.plays === 1 ? "partita" : "partite"}`;
  if (p.trackCount) return `${p.trackCount} brani`;
  return "Gioca ora";
}

export function MusicQuizHub() {
  const { token } = useAuth();
  const [hub, setHub] = useState<MusicQuizHubData | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void loadMusicQuizHub(token).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setErr(r.message);
        setHub({ featured: [] });
        return;
      }
      setHub(r.data);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const loading = hub == null;
  const featured = (hub?.featured || []).slice(0, 5);
  const [top, ...rest] = featured;

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 pb-20 pt-24 sm:pt-28">
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

      {/* in evidenza */}
      <section>
        <SectionHead title="In evidenza" note="I nomi più ascoltati in Italia in questo momento" />
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={cn("aspect-square animate-pulse rounded-3xl bg-crema/[0.05]", i === 0 && "col-span-2 row-span-2")} />
            ))}
          </div>
        ) : !featured.length ? (
          <p className="text-sm text-crema/55">Nessun artista disponibile ora.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {top ? <FeatureTile p={top} big /> : null}
            {rest.map((p, i) => (
              <FeatureTile key={p.slug} p={p} i={i + 1} />
            ))}
          </div>
        )}
      </section>

      <Row title="Playlist in primo piano" note="Classifiche, grandi successi e qualche ricordo" items={hub?.playlists} loading={loading} render={(p) => <CoverTile p={p} />} />

      <CommunitySection hub={hub} loading={loading} />

      <Row title="Artisti in tendenza" items={hub?.trendingArtists} loading={loading} round render={(p) => <ArtistTile p={p} />} />

      {/* decenni */}
      {loading || hub?.decades?.length ? (
        <section>
          <SectionHead title="Per decennio" note="Dai juke-box agli anni dello streaming" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {loading
              ? Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-crema/[0.05]" />)
              : hub!.decades!.map((p, i) => <DecadeTile key={p.slug} p={p} i={i} />)}
          </div>
        </section>
      ) : null}

      <GenreSection genres={hub?.genres} loading={loading} />

      <Row title="I più giocati qui" note="Quelli su cui si sfidano di più" items={hub?.popular} render={(p) => <CoverTile p={p} showPlays />} hideEmpty />
      <Row title="Giocati di recente" items={hub?.recent} render={(p) => <CoverTile p={p} showPlays />} hideEmpty />
    </div>
  );
}

/* ---------- pezzi ---------- */

function SectionHead({ title, note, right }: { title: string; note?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-3xl font-semibold text-crema">{title}</h2>
        {note ? <p className="mt-1 text-sm text-crema/55">{note}</p> : null}
      </div>
      {right}
    </div>
  );
}

function Row({
  title,
  note,
  items,
  loading,
  round,
  hideEmpty,
  right,
  render,
}: {
  title: string;
  note?: string;
  items?: MusicQuizPackCard[];
  loading?: boolean;
  round?: boolean;
  hideEmpty?: boolean;
  right?: ReactNode;
  render: (p: MusicQuizPackCard) => ReactNode;
}) {
  if (!loading && !items?.length && hideEmpty) return null;
  if (!loading && !items?.length) return null;
  return (
    <section>
      <SectionHead title={title} note={note} right={right} />
      <Carousel round={round}>
        {loading
          ? Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={cn("shrink-0 animate-pulse bg-crema/[0.05]", round ? "size-32 rounded-full sm:size-36" : "aspect-square w-40 rounded-3xl sm:w-48")} />
            ))
          : items!.map((p) => (
              <div key={p.slug} className="shrink-0 snap-start">
                {render(p)}
              </div>
            ))}
      </Carousel>
    </section>
  );
}

function FeatureTile({ p, big, i = 0 }: { p: MusicQuizPackCard; big?: boolean; i?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
      className={big ? "col-span-2 row-span-2" : ""}
    >
      <SmartLink href={packHref(p)} className="group relative block aspect-square overflow-hidden rounded-3xl bg-roast ring-1 ring-sand/10 transition hover:ring-caramel/45">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.cover || COVER} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
        <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />
        {big ? <span className="absolute left-4 top-4 rounded-full bg-caramel px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink">Numero uno</span> : null}
        <span className={cn("absolute inset-x-0 bottom-0 p-4", big && "sm:p-6")}>
          <span className={cn("block font-display font-semibold leading-tight text-crema", big ? "text-4xl sm:text-5xl" : "text-xl")}>{p.title}</span>
          <span className="mt-1 block text-xs text-crema/70">Gioca ora</span>
        </span>
      </SmartLink>
    </motion.div>
  );
}

function CoverTile({ p, showPlays }: { p: MusicQuizPackCard; showPlays?: boolean }) {
  const artist = p.kind === "artist";
  return (
    <SmartLink href={packHref(p)} className="group block w-40 sm:w-48">
      <span className={cn("relative block aspect-square overflow-hidden bg-roast ring-1 ring-sand/10 transition group-hover:ring-caramel/45", artist ? "rounded-full" : "rounded-3xl")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.cover || COVER} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
        {!artist && p.kind === "playlist" ? (
          <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-ink/70 text-crema backdrop-blur">
            <ListMusic className="size-4" aria-hidden />
          </span>
        ) : null}
      </span>
      <span className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-crema">{p.title}</span>
      <span className="mt-0.5 block text-xs text-crema/55">
        {showPlays ? playsLabel(p) : p.authorName ? `di ${p.authorName}` : p.trackCount ? `${p.trackCount} brani` : "Gioca ora"}
      </span>
    </SmartLink>
  );
}

function ArtistTile({ p }: { p: MusicQuizPackCard }) {
  return (
    <SmartLink href={packHref(p)} className="group block w-32 text-center sm:w-36">
      <span className="relative block aspect-square overflow-hidden rounded-full bg-roast ring-1 ring-sand/10 transition group-hover:ring-2 group-hover:ring-caramel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.cover || COVER} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
      </span>
      <span className="mt-2 block truncate text-sm font-semibold text-crema">{p.title}</span>
    </SmartLink>
  );
}

function DecadeTile({ p, i }: { p: MusicQuizPackCard; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}>
      <SmartLink href={packHref(p)} className="group relative block aspect-[4/5] overflow-hidden rounded-3xl bg-roast ring-1 ring-sand/10 transition hover:ring-caramel/45">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.cover || COVER} alt="" loading="lazy" className="size-full object-cover opacity-70 transition duration-500 group-hover:scale-105 group-hover:opacity-90" />
        <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
        <span className="absolute inset-x-0 bottom-0 p-4">
          <span className="block font-display text-3xl font-semibold leading-none text-crema">{p.title}</span>
          {p.trackCount ? <span className="mt-1.5 block text-xs text-crema/65">{p.trackCount} brani</span> : null}
        </span>
      </SmartLink>
    </motion.div>
  );
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "relative rounded-full px-4 py-1.5 text-sm font-semibold transition",
            value === o.id ? "text-ink" : "text-crema/70 ring-1 ring-sand/20 hover:text-crema",
          )}
        >
          {value === o.id ? <motion.span layoutId={`tab-${options.map((x) => x.id).join("-")}`} className="absolute inset-0 rounded-full bg-caramel" /> : null}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function CommunitySection({ hub, loading }: { hub: MusicQuizHubData | null; loading: boolean }) {
  const [tab, setTab] = useState<"new" | "top">("new");
  const list = (tab === "new" ? hub?.communityNew || hub?.community : hub?.communityTop) || [];
  return (
    <section>
      <SectionHead
        title="Quiz della community"
        note="Brani scelti a mano da chi gioca"
        right={
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { id: "new", label: "Nuovi" },
              { id: "top", label: "Popolari" },
            ]}
          />
        }
      />
      <Carousel>
        <div className="shrink-0 snap-start">
          <SmartLink
            href={page("/music-quiz/crea/")}
            className="group flex aspect-square w-40 flex-col justify-between rounded-3xl bg-gradient-to-br from-caramel to-ember p-4 text-ink transition hover:-translate-y-0.5 sm:w-48"
          >
            <span className="grid size-11 place-items-center rounded-full bg-ink/15">
              <Plus className="size-6" aria-hidden />
            </span>
            <span>
              <span className="block font-display text-2xl font-semibold leading-tight">Crea il tuo quiz</span>
              <span className="mt-1 block text-xs font-medium text-ink/70">Scegli i brani e sfida gli altri</span>
            </span>
          </SmartLink>
        </div>
        {loading
          ? Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square w-40 shrink-0 animate-pulse rounded-3xl bg-crema/[0.05] sm:w-48" />)
          : list.map((p) => (
              <div key={p.slug} className="shrink-0 snap-start">
                <CoverTile p={p} showPlays={tab === "top"} />
              </div>
            ))}
        {!loading && !list.length ? (
          <div className="flex aspect-square w-56 shrink-0 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-sand/20 p-5 text-center">
            <Disc3 className="size-7 text-caramel/70" aria-hidden />
            <p className="text-sm text-crema/65">Ancora nessun quiz fatto a mano. Il primo può essere il tuo.</p>
          </div>
        ) : null}
      </Carousel>
    </section>
  );
}

function GenreSection({ genres, loading }: { genres?: MusicQuizHubData["genres"]; loading: boolean }) {
  const [id, setId] = useState("");
  if (!loading && !genres?.length) return null;
  const current = genres?.find((g) => g.id === id) || genres?.[0];
  return (
    <section>
      <SectionHead title="Per genere" note="Scegli un genere e poi un artista" />
      {genres?.length ? (
        <div className="mb-5">
          <Tabs value={current?.id || ""} onChange={setId} options={genres.map((g) => ({ id: g.id, label: g.name }))} />
        </div>
      ) : null}
      <Carousel round>
        {loading || !current
          ? Array.from({ length: 6 }, (_, i) => <div key={i} className="size-32 shrink-0 animate-pulse rounded-full bg-crema/[0.05] sm:size-36" />)
          : current.items.map((p) => (
              <motion.div key={`${current.id}-${p.slug}`} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="shrink-0 snap-start">
                <ArtistTile p={p} />
              </motion.div>
            ))}
      </Carousel>
    </section>
  );
}


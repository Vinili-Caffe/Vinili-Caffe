"use client";

import { ListMusic } from "lucide-react";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import type { MusicQuizPackCard } from "@/lib/musicQuiz";
import { QuizCardMenu } from "./QuizCardMenu";

/** Schede dei quiz usate nella pagina principale e sotto ogni quiz. */
export const packHref = (p: MusicQuizPackCard) => page(`/music-quiz/pack/?slug=${encodeURIComponent(p.slug)}`);
export const COVER = "/images/logo-disco.png";

function playsLabel(p: MusicQuizPackCard) {
  if (p.plays) return `${p.plays} ${p.plays === 1 ? "partita" : "partite"}`;
  if (p.trackCount) return `${p.trackCount} brani`;
  return "Gioca ora";
}

export function CoverTile({ p, showPlays, onDeleted }: { p: MusicQuizPackCard; showPlays?: boolean; onDeleted?: (slug: string) => void }) {
  const artist = p.kind === "artist";
  /* i propri quiz hanno il menu «⋮» (fuori dal link, così aprirlo non apre il quiz) */
  if (p.mine) {
    return (
      <div className="relative w-40 sm:w-48">
        <CoverTile p={{ ...p, mine: false }} showPlays={showPlays} />
        <QuizCardMenu slug={p.slug} title={p.title} onDeleted={() => onDeleted?.(p.slug)} className="absolute right-2 top-2 z-10" />
      </div>
    );
  }
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


export function ArtistTile({ p }: { p: MusicQuizPackCard }) {
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


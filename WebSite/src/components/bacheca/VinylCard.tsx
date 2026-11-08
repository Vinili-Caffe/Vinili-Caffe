"use client";

import { motion } from "motion/react";
import { Bot, Server, Star } from "lucide-react";
import type { BoardListing } from "@/lib/boards";
import { kindLabel } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { Highlight } from "../Highlight";

/** Pezzo in vetrina: cartellino da display, non card “dashboard”. */
export function VinylCard({
  listing,
  query = "",
  i = 0,
  onOpen,
}: {
  listing: BoardListing;
  query?: string;
  i?: number;
  onOpen: () => void;
}) {
  const accent = listing.accent || "#d99a5b";
  return (
    <motion.button
      type="button"
      layout="position"
      onClick={onOpen}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden text-left",
        "rounded-sm border border-crema/[0.1] bg-[#0c0907]",
        "transition-[border-color,transform,box-shadow] duration-300 ease-out",
        "hover:-translate-y-1 hover:border-caramel/40 hover:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.95)]",
      )}
    >
      {/* fascia luce sopra — come farebbe una vetrina */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-caramel/70 to-transparent opacity-70"
      />
      <span aria-hidden className="absolute left-0 top-0 z-10 h-full w-[2px]" style={{ background: accent }} />

      <span className="relative aspect-[5/4] overflow-hidden bg-[#14100c]">
        <span
          aria-hidden
          className="absolute inset-0 opacity-40 transition-opacity duration-500 group-hover:opacity-55"
          style={{
            background: `radial-gradient(ellipse 70% 60% at 50% 35%, ${accent}55, transparent 65%)`,
          }}
        />
        {listing.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.iconUrl}
            alt=""
            className="absolute inset-[18%] size-[64%] rounded-[18%] object-cover shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] ring-1 ring-crema/15 transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-crema/35">
            {listing.kind === "bot" ? <Bot className="size-14" strokeWidth={1.25} /> : <Server className="size-14" strokeWidth={1.25} />}
          </span>
        )}
        <span className="absolute left-3 top-3 rounded-full border border-crema/15 bg-black/45 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-crema/75 backdrop-blur-sm">
          {kindLabel(listing.kind)}
        </span>
      </span>

      <span className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-3.5">
        <span className="line-clamp-2 font-display text-[1.35rem] font-semibold leading-[1.05] tracking-[-0.02em] text-crema sm:text-[1.45rem]">
          <Highlight text={listing.name || "Senza titolo"} query={query} />
        </span>
        {listing.tagline ? (
          <span className="line-clamp-2 text-[0.84rem] leading-snug text-crema/50">
            <Highlight text={listing.tagline} query={query} />
          </span>
        ) : null}

        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-crema/[0.08] pt-3 text-[0.72rem] text-crema/45">
          {listing.ratingAvg > 0 ? (
            <span className="inline-flex items-center gap-1 text-crema/70">
              <Star className="size-3 fill-caramel text-caramel" />
              {listing.ratingAvg.toFixed(1)}
              <span className="text-crema/30">· {listing.reviewsCount}</span>
            </span>
          ) : (
            <span>Ancora senza stelle</span>
          )}
          {listing.votesMonth > 0 ? <span>{listing.votesMonth} voti/mese</span> : null}
          {listing.categories[0] ? <span className="ml-auto truncate text-crema/35">{listing.categories[0]}</span> : null}
        </span>
      </span>
    </motion.button>
  );
}

export function VinylCardSkeleton({ i = 0 }: { i?: number }) {
  return (
    <div
      className="aspect-[4/5] animate-pulse rounded-sm border border-crema/[0.07] bg-[#0c0907]"
      style={{ animationDelay: `${i * 60}ms` }}
    />
  );
}

"use client";

import { motion } from "motion/react";
import { Bot, Server, Star } from "lucide-react";
import type { BoardListing } from "@/lib/boards";
import { kindLabel } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { Highlight } from "../Highlight";

/** Card bacheca: icona + nome del bot o server. */
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
  const accent = listing.accent || "#d49150";
  return (
    <motion.button
      type="button"
      layout="position"
      onClick={onOpen}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 14) * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover="hover"
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-mocha/80 to-roast p-4 text-left ring-1 ring-sand/12 transition-colors hover:ring-sand/30 sm:p-5"
    >
      <span className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full opacity-30 blur-2xl" style={{ background: accent }} />

      <span className="relative flex items-start gap-4">
        <motion.span
          variants={{ hover: { rotate: -18 } }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="relative shrink-0"
        >
          <span className="absolute inset-0 translate-x-2 translate-y-1 rounded-full bg-espresso/80" aria-hidden />
          <span
            className="relative flex size-20 items-center justify-center overflow-hidden rounded-full ring-2 ring-sand/20 sm:size-24"
            style={{ background: `radial-gradient(circle at 35% 30%, ${accent}55, #1a100c 70%)` }}
          >
            {listing.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.iconUrl} alt="" className="size-full object-cover" />
            ) : listing.kind === "bot" ? (
              <Bot className="size-8 text-sand/70" />
            ) : (
              <Server className="size-8 text-sand/70" />
            )}
            <span className="absolute inset-[38%] rounded-full bg-espresso/90 ring-1 ring-sand/25" />
          </span>
        </motion.span>

        <span className="min-w-0 flex-1 pt-1">
          <span className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-caramel">
            {listing.kind === "bot" ? <Bot className="size-3" /> : <Server className="size-3" />}
            {kindLabel(listing.kind)}
          </span>
          <span className="mt-1 block truncate font-display text-xl font-semibold text-crema sm:text-2xl">
            <Highlight text={listing.name || "Senza titolo"} query={query} />
          </span>
          {listing.tagline && (
            <span className="mt-1 line-clamp-2 text-sm leading-snug text-crema/55">
              <Highlight text={listing.tagline} query={query} />
            </span>
          )}
        </span>
      </span>

      <span className="relative mt-4 flex flex-wrap items-center gap-2 text-xs text-crema/50">
        {listing.ratingAvg > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-crema/6 px-2 py-0.5 ring-1 ring-sand/15">
            <Star className="size-3 fill-caramel text-caramel" />
            {listing.ratingAvg.toFixed(1)}
            <span className="text-crema/35">({listing.reviewsCount})</span>
          </span>
        )}
        {listing.votesMonth > 0 && <span className="rounded-full bg-crema/6 px-2 py-0.5 ring-1 ring-sand/15">{listing.votesMonth} voti/mese</span>}
        {listing.categories.slice(0, 2).map((c) => (
          <span key={c} className="rounded-full bg-crema/6 px-2 py-0.5 ring-1 ring-sand/15">
            {c}
          </span>
        ))}
      </span>
    </motion.button>
  );
}

export function VinylCardSkeleton({ i = 0 }: { i?: number }) {
  return (
    <div
      className={cn("h-40 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10")}
      style={{ animationDelay: `${i * 60}ms` }}
    />
  );
}

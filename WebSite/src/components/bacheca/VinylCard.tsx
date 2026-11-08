"use client";

import { motion } from "motion/react";
import { Bot, Server, Star } from "lucide-react";
import type { BoardListing } from "@/lib/boards";
import { kindLabel } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { Highlight } from "../Highlight";

/** Scheda in vetrina: icona dietro il “vetro”, tipografia da etichetta. */
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
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 14) * 0.03, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover="hover"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[1.35rem] text-left",
        "bg-[linear-gradient(165deg,rgba(255,235,210,0.06)_0%,rgba(42,28,20,0.55)_38%,rgba(20,13,10,0.92)_100%)]",
        "ring-1 ring-sand/14 transition-[ring-color,transform] duration-300 ease-out",
        "hover:ring-caramel/35 hover:-translate-y-0.5",
        "shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]",
      )}
    >
      {/* alone accent dietro l’icona */}
      <span
        className="pointer-events-none absolute -right-10 top-0 size-40 rounded-full opacity-25 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: accent }}
        aria-hidden
      />
      {/* riflesso vetro in alto */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-crema/[0.07] to-transparent"
      />

      <span className="relative flex items-start gap-4 p-4 sm:p-5">
        <motion.span
          variants={{ hover: { y: -3, rotate: -4 } }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative shrink-0"
        >
          <span
            className="relative flex size-[4.5rem] items-center justify-center overflow-hidden rounded-2xl ring-1 ring-sand/20 sm:size-20"
            style={{
              background: `linear-gradient(145deg, ${accent}33, rgba(14,9,6,0.92) 70%)`,
              boxShadow: `inset 0 1px 0 rgba(255,240,220,0.12), 0 12px 28px -16px ${accent}88`,
            }}
          >
            {listing.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.iconUrl} alt="" className="size-full object-cover" />
            ) : listing.kind === "bot" ? (
              <Bot className="size-8 text-sand/70" />
            ) : (
              <Server className="size-8 text-sand/70" />
            )}
          </span>
        </motion.span>

        <span className="min-w-0 flex-1 pt-0.5">
          <span className="flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-caramel/90">
            {listing.kind === "bot" ? <Bot className="size-3" /> : <Server className="size-3" />}
            {kindLabel(listing.kind)}
          </span>
          <span className="mt-1.5 block truncate font-display text-xl font-semibold leading-tight text-crema sm:text-[1.35rem]">
            <Highlight text={listing.name || "Senza titolo"} query={query} />
          </span>
          {listing.tagline && (
            <span className="mt-1.5 line-clamp-2 text-sm leading-snug text-crema/55">
              <Highlight text={listing.tagline} query={query} />
            </span>
          )}
        </span>
      </span>

      <span className="relative mt-auto flex flex-wrap items-center gap-1.5 border-t border-sand/10 px-4 py-3 sm:px-5">
        {listing.ratingAvg > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-crema/[0.06] px-2 py-0.5 text-xs text-crema/60 ring-1 ring-sand/12">
            <Star className="size-3 fill-caramel text-caramel" />
            {listing.ratingAvg.toFixed(1)}
            <span className="text-crema/35">({listing.reviewsCount})</span>
          </span>
        )}
        {listing.votesMonth > 0 && (
          <span className="rounded-full bg-crema/[0.06] px-2 py-0.5 text-xs text-crema/55 ring-1 ring-sand/12">
            {listing.votesMonth} voti/mese
          </span>
        )}
        {listing.categories.slice(0, 2).map((c) => (
          <span key={c} className="rounded-full bg-crema/[0.06] px-2 py-0.5 text-xs text-crema/50 ring-1 ring-sand/12">
            {c}
          </span>
        ))}
        <span className="ml-auto text-[0.65rem] font-medium uppercase tracking-[0.18em] text-crema/30 transition-colors group-hover:text-caramel/80">
          apri
        </span>
      </span>
    </motion.button>
  );
}

export function VinylCardSkeleton({ i = 0 }: { i?: number }) {
  return (
    <div
      className="h-[9.5rem] animate-pulse rounded-[1.35rem] bg-roast/45 ring-1 ring-sand/10"
      style={{ animationDelay: `${i * 60}ms` }}
    />
  );
}

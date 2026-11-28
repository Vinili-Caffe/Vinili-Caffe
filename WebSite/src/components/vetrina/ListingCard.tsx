"use client";

import { motion } from "motion/react";
import { ArrowUpRight, BadgeCheck, Bot, Check, Flame, Handshake, MonitorSmartphone, Server, Star, ThumbsUp, Wallet } from "lucide-react";
import { kindLabel, labelOf, listingFeatures, type BoardListing, type BoardsConfig } from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { Highlight } from "@/components/Highlight";

export const listingHref = (l: BoardListing) =>
  page(`/vetrina/scheda/?slug=${encodeURIComponent(l.slug || l.id)}`);

const accentOf = (l: BoardListing) => (/^#[0-9a-f]{6}$/i.test(l.accent || "") ? l.accent : "#d99a5b");

/** Riposizionata nelle ultime 24 ore. */
export function isRising(l: BoardListing) {
  if (!l.bumpedAt) return false;
  const t = Date.parse(l.bumpedAt);
  return Number.isFinite(t) && Date.now() - t < 24 * 3600_000;
}

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value.toFixed(1)} su 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="relative inline-block size-[1em]">
            <Star className="absolute inset-0 size-full text-crema/20" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="size-[1em] fill-ember text-ember" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Copertina della scheda: banner (o colore della scheda), icona, nome e numeri essenziali. */
export function ListingCard({
  listing,
  cfg,
  query = "",
  i = 0,
  selected = false,
  onToggleCompare,
}: {
  listing: BoardListing;
  cfg?: BoardsConfig | null;
  query?: string;
  i?: number;
  selected?: boolean;
  onToggleCompare?: (id: string) => void;
}) {
  const accent = accentOf(listing);
  const KindIcon = listing.kind === "bot" ? Bot : Server;
  const cat = listing.categories[0];
  const feat = listingFeatures(listing);
  const badges: { icon: typeof BadgeCheck; label: string }[] = [];
  if (feat.requireVerification) badges.push({ icon: BadgeCheck, label: "Verifica" });
  if (feat.paidTier === "paid" || feat.paidFeaturesAvailable) badges.push({ icon: Wallet, label: "Premium" });
  if (feat.acceptsPartnerships) badges.push({ icon: Handshake, label: "Partner" });
  if (feat.webInterface) badges.push({ icon: MonitorSmartphone, label: "Web" });
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="h-full min-w-0"
    >
      <SmartLink
        href={listingHref(listing)}
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-[1.6rem] bg-roast ring-1 transition duration-300  hover:shadow-[0_28px_60px_-30px_var(--card-accent)]",
          selected ? "ring-ember/55 hover:ring-ember/70" : "ring-sand/12 hover:ring-sand/30",
        )}
        style={{ ["--card-accent" as string]: `${accent}aa` }}
      >
        {/* copertina */}
        <span className="relative block h-28 overflow-hidden sm:h-32">
          {listing.bannerUrl ? (
             
            <img src={listing.bannerUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
          ) : (
            <span
              className="block size-full"
              style={{
                background: `radial-gradient(120% 140% at 15% 0%, ${accent}cc, transparent 55%), radial-gradient(90% 120% at 100% 100%, ${accent}55, transparent 60%), #1a110c`,
              }}
            />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-roast via-roast/20 to-transparent" />
          {onToggleCompare ? (
            <button
              type="button"
              aria-pressed={selected}
              aria-label={selected ? "Togli dal confronto" : "Aggiungi al confronto"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleCompare(listing.id);
              }}
              className={cn(
                "absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full ring-1 backdrop-blur-sm transition",
                selected ? "bg-ember text-ink ring-ember" : "bg-espresso/75 text-crema/80 ring-sand/20 hover:bg-espresso/90",
              )}
            >
              <Check className="size-4" />
            </button>
          ) : null}
          <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-espresso/75 px-2.5 py-1 text-xs font-semibold text-crema/85 ring-1 ring-sand/15 backdrop-blur-sm">
              <KindIcon className="size-3" /> {kindLabel(listing.kind)}
            </span>
            {isRising(listing) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ember/90 px-2.5 py-1 text-xs font-semibold text-ink">
                <Flame className="size-3" /> In risalita
              </span>
            )}
            {listing.nsfw && <span className="rounded-full bg-[#a83a2c]/85 px-2.5 py-1 text-xs font-semibold text-crema">18+</span>}
            {badges.slice(0, 2).map((b) => {
              const Icon = b.icon;
              return (
                <span key={b.label} className="inline-flex items-center gap-1 rounded-full bg-espresso/70 px-2 py-1 text-xs font-semibold text-caramel ring-1 ring-caramel/25 backdrop-blur-sm">
                  <Icon className="size-3" /> {b.label}
                </span>
              );
            })}
          </span>
        </span>

        {/* corpo */}
        <span className="relative flex flex-1 flex-col px-5 pb-5">
          <span className="-mt-9 flex items-end gap-3">
            <span
              className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-4 ring-roast"
              style={{ background: `radial-gradient(circle at 35% 30%, ${accent}66, #1a110c 75%)` }}
            >
              {listing.iconUrl ? (
                 
                <img src={listing.iconUrl} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <KindIcon className="size-7 text-sand/70" />
              )}
            </span>
            <ArrowUpRight className="mb-1 ml-auto size-5 text-crema/25 transition-[color,background-color,border-color,opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ember" />
          </span>
          <span className="mt-3 block truncate font-display text-2xl font-semibold leading-tight text-crema">
            <Highlight text={listing.name || "Senza titolo"} query={query} />
          </span>
          <span className="mt-1.5 line-clamp-2 min-h-[2.6em] text-sm leading-snug text-crema/55">
            {listing.tagline ? <Highlight text={listing.tagline} query={query} /> : "Nessuna descrizione breve."}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-sand/10 pt-3.5 text-xs text-crema/55">
            {listing.reviewsCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Stars value={listing.ratingAvg} className="text-[0.8rem]" />
                <span className="font-semibold text-crema/80">{listing.ratingAvg.toFixed(1)}</span>
                <span className="text-crema/35">({listing.reviewsCount})</span>
              </span>
            ) : (
              <span className="text-crema/35">Nessuna recensione</span>
            )}
            {listing.votesMonth > 0 && (
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="size-3.5 text-caramel" /> {listing.votesMonth}
              </span>
            )}
            {cat && (
              <span className="ml-auto rounded-full bg-crema/6 px-2 py-0.5 capitalize ring-1 ring-sand/12">
                {labelOf(cfg?.categoryLabels, cat)}
              </span>
            )}
          </span>
        </span>
      </SmartLink>
    </motion.div>
  );
}

export function ListingCardSkeleton({ i = 0 }: { i?: number }) {
  return (
    <div className="h-[19rem] animate-pulse overflow-hidden rounded-[1.6rem] bg-roast/60 ring-1 ring-sand/10" style={{ animationDelay: `${i * 70}ms` }}>
      <div className="h-28 bg-mocha/50 sm:h-32" />
    </div>
  );
}

/** Le tre schede più in alto: copertine grandi col numero di classifica. */
export function Spotlight({ items, cfg }: { items: BoardListing[]; cfg?: BoardsConfig | null }) {
  if (!items.length) return null;
  const [first, ...rest] = items;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <SpotCard l={first} rank={1} big cfg={cfg} />
      <div className="grid min-w-0 grid-cols-1 gap-4">
        {rest.map((l, i) => (
          <SpotCard key={l.id} l={l} rank={i + 2} cfg={cfg} />
        ))}
      </div>
    </div>
  );
}

function SpotCard({ l, rank, big = false, cfg }: { l: BoardListing; rank: number; big?: boolean; cfg?: BoardsConfig | null }) {
  const accent = accentOf(l);
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: rank * 0.08, duration: 0.5 }} className="h-full min-w-0">
      <SmartLink
        href={listingHref(l)}
        className={cn(
          "group relative flex h-full overflow-hidden rounded-[2rem] ring-1 ring-sand/15 transition duration-300  hover:ring-ember/40",
          /* su telefono più bassi: il primo non deve riempire lo schermo */
          big ? "min-h-[14rem] flex-col justify-end p-5 sm:min-h-[22rem] sm:p-9" : "min-h-[7.5rem] items-end p-4 sm:min-h-[10.5rem] sm:p-6",
        )}
      >
        {l.bannerUrl ? (
           
          <img src={l.bannerUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <span className="absolute inset-0" style={{ background: `radial-gradient(120% 120% at 0% 0%, ${accent}, transparent 60%), radial-gradient(100% 100% at 100% 100%, ${accent}66, transparent 60%), #1a110c` }} />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-espresso via-espresso/70 to-espresso/10" />
        <span
          className={cn(
            "absolute right-5 top-3 font-display font-semibold leading-none text-crema/10 transition-colors duration-500 group-hover:text-ember/25",
            big ? "text-7xl sm:text-[9rem]" : "text-5xl sm:text-7xl",
          )}
          aria-hidden
        >
          {rank}
        </span>
        <span className="relative flex w-full items-end gap-3 sm:gap-4">
          <span className={cn("shrink-0 overflow-hidden rounded-xl ring-2 ring-crema/20 sm:rounded-2xl", big ? "size-12 sm:size-20" : "size-10 sm:size-14")} style={{ background: `${accent}55` }}>
            {l.iconUrl ? (
               
              <img src={l.iconUrl} alt="" className="size-full object-cover" />
            ) : l.kind === "bot" ? (
              <Bot className="m-auto size-1/2 h-full text-crema/70" />
            ) : (
              <Server className="m-auto size-1/2 h-full text-crema/70" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-ember sm:text-xs">
              N°{rank} in vetrina · {kindLabel(l.kind)}
              {l.categories[0] ? <span className="hidden text-crema/50 sm:inline">· {labelOf(cfg?.categoryLabels, l.categories[0])}</span> : null}
            </span>
            <span className={cn("mt-1 block truncate font-display font-semibold text-crema", big ? "text-3xl sm:text-5xl" : "text-xl sm:text-2xl")}>{l.name}</span>
            {big && l.tagline ? <span className="mt-1.5 line-clamp-1 max-w-xl text-sm text-crema/70 sm:mt-2 sm:line-clamp-2 sm:text-base">{l.tagline}</span> : null}
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-crema/60 sm:mt-2">
              {l.reviewsCount > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Stars value={l.ratingAvg} /> {l.ratingAvg.toFixed(1)}
                </span>
              ) : null}
              {l.votesMonth > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="size-3.5" /> {l.votesMonth} voti<span className="hidden sm:inline"> questo mese</span>
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </SmartLink>
    </motion.div>
  );
}

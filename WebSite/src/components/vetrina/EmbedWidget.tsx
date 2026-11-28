"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Bot, Rocket, Server, ThumbsUp } from "lucide-react";
import { kindLabel, loadListing, type BoardListing } from "@/lib/boards";
import { page, SITE_ORIGIN } from "@/lib/site";
import { Stars } from "./ListingCard";
import { cn } from "@/lib/cn";

type ViewProps = {
  listing: BoardListing;
  width?: number;
  className?: string;
};

/** Card widget (anteprima Gestisci o contenuto iframe). */
export function EmbedWidgetView({ listing: l, width = 360, className }: ViewProps) {
  const accent = /^#[0-9a-f]{6}$/i.test(l.accent || "") ? l.accent : "#d99a5b";
  const KindIcon = l.kind === "bot" ? Bot : Server;
  const isServer = l.kind !== "bot";
  const scheda = `${SITE_ORIGIN}${page(`/vetrina/scheda/?slug=${encodeURIComponent(l.slug || l.id)}`)}`;
  const vota = `${SITE_ORIGIN}${page(`/vetrina/vota/?slug=${encodeURIComponent(l.slug || l.id)}&id=${encodeURIComponent(l.id)}`)}`;
  const bump = `${SITE_ORIGIN}${page(`/vetrina/scheda/?slug=${encodeURIComponent(l.slug || l.id)}#bump`)}`;

  return (
    <div
      className={cn(
        "box-border flex h-[140px] overflow-hidden rounded-2xl bg-[#1a110c] text-[#f4e9d8] ring-1 ring-[#f4e9d8]/15",
        className,
      )}
      style={{ fontFamily: "system-ui, sans-serif", width, maxWidth: "100%" }}
    >
      <div className="relative w-[88px] shrink-0 overflow-hidden" style={{ background: `radial-gradient(circle at 30% 20%, ${accent}99, #1a110c 70%)` }}>
        {l.iconUrl ? (
           
          <img src={l.iconUrl} alt="" className="size-full object-cover" />
        ) : (
          <KindIcon className="absolute inset-0 m-auto size-8 opacity-70" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[#e0a465]">
            {kindLabel(l.kind)} · Vinili & Caffè
          </p>
          <p className="mt-0.5 truncate text-lg font-semibold leading-tight">{l.name}</p>
          {l.reviewsCount > 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-[#f4e9d8]/70">
              <Stars value={l.ratingAvg} className="text-[0.75rem]" /> {l.ratingAvg.toFixed(1)}
            </p>
          ) : (
            <p className="mt-1 truncate text-xs text-[#f4e9d8]/45">{l.tagline || "In vetrina"}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={vota}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#d99a5b] to-[#c9735a] px-3 py-1.5 text-xs font-semibold text-[#1a110c]"
          >
            <ThumbsUp className="size-3.5" /> Vota
          </a>
          {isServer ? (
            <a
              href={bump}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-[#f4e9d8]/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-[#f4e9d8]/20"
            >
              <Rocket className="size-3.5" /> Bump
            </a>
          ) : (
            <a
              href={scheda}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-[#f4e9d8]/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-[#f4e9d8]/20"
            >
              Scheda <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pagina /vetrina/embed/?slug=… (iframe pubblici). */
export function EmbedWidget() {
  const sp = useSearchParams();
  const slug = String(sp.get("slug") || sp.get("id") || "").trim();
  const [listing, setListing] = useState<BoardListing | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    void loadListing(slug).then((r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.message || "Scheda non trovata");
      setListing(r.data.listing);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (!slug) return <p className="p-4 text-sm text-crema/60">Manca ?slug= o ?id=</p>;
  if (err) return <p className="p-4 text-sm text-ember">{err}</p>;
  if (!listing) return <div className="h-[140px] w-[360px] max-w-full animate-pulse rounded-2xl bg-roast/80" />;
  return <EmbedWidgetView listing={listing} />;
}

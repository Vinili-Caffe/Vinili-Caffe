"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Store } from "lucide-react";
import { loadMine, type BoardListing } from "@/lib/boards";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { VoteHookTab } from "@/components/vetrina/manage/VoteHookTab";
import { ReviewHookTab } from "@/components/vetrina/manage/ReviewHookTab";
import { Notice, RowsSkeleton } from "./bits";
import type { VetrinaModuleTabId } from "../guildSections";

/** Voti e recensioni della scheda in Vetrina di questo server. */
export function VetrinaPanel({
  guildId,
  token,
  tab,
}: {
  guildId: string;
  token: string;
  tab: VetrinaModuleTabId;
}) {
  const [listing, setListing] = useState<BoardListing | null | undefined>(undefined);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setListing(undefined);
    setErr("");
    void loadMine(token).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setErr(r.message);
        setListing(null);
        return;
      }
      const hit =
        (r.data.listings || []).find((l) => l.kind === "server" && String(l.discordId) === String(guildId)) || null;
      setListing(hit);
    });
    return () => {
      alive = false;
    };
  }, [token, guildId]);

  if (err) return <Notice error>{err}</Notice>;
  if (listing === undefined) return <RowsSkeleton rows={4} />;

  if (!listing) {
    return (
      <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-8 text-center ring-1 ring-sand/12 sm:p-10">
        <Store className="mx-auto size-10 text-caramel/70" aria-hidden />
        <h2 className="mt-4 font-display text-3xl font-semibold">Nessuna scheda in Vetrina</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-crema/60">
          Metti questo server in Vetrina per gestire i voti (ringraziamento e ruolo) e rispondere alle recensioni da qui.
        </p>
        <SmartLink
          href={page("/vetrina/invia/")}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink"
        >
          Metti in Vetrina <ArrowUpRight className="size-4" />
        </SmartLink>
      </div>
    );
  }

  if (listing.status !== "approved") {
    return (
      <div className="space-y-4">
        <ListingChip listing={listing} />
        <Notice>
          La scheda non è ancora pubblica ({listing.status === "pending" ? "in revisione" : listing.status}). Quando sarà
          approvata, da qui gestisci voti e recensioni.
        </Notice>
        <SmartLink
          href={page(`/vetrina/modifica/?id=${encodeURIComponent(listing.id)}`)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember hover:text-caramel"
        >
          Apri la gestione scheda <ArrowUpRight className="size-3.5" />
        </SmartLink>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ListingChip listing={listing} />
      {tab === "voti" ? (
        <VoteHookTab listing={listing} token={token} compact />
      ) : (
        <ReviewHookTab listing={listing} token={token} compact />
      )}
    </div>
  );
}

function ListingChip({ listing }: { listing: BoardListing }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 px-4 py-3 ring-1 ring-sand/10">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-mocha ring-1 ring-sand/15">
        {listing.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.iconUrl} alt="" className="size-full object-cover" />
        ) : (
          <Store className="size-5 text-crema/50" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-crema">{listing.name}</p>
        <p className="text-xs text-crema/50">Scheda in Vetrina</p>
      </div>
      {listing.slug ? (
        <SmartLink
          href={page(`/vetrina/scheda/?slug=${encodeURIComponent(listing.slug)}`)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-crema/60 hover:text-ember"
        >
          Vedi scheda <ArrowUpRight className="size-3" />
        </SmartLink>
      ) : null}
      <SmartLink
        href={page(`/vetrina/modifica/?id=${encodeURIComponent(listing.id)}`)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-crema/60 hover:text-ember"
      >
        Aspetto e stats <ArrowUpRight className="size-3" />
      </SmartLink>
    </div>
  );
}

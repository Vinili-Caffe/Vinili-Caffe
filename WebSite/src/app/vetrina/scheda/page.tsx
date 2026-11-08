import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Album } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const ListingDetail = dynamic(
  () => import("@/components/bacheca/ListingDetail").then((m) => m.ListingDetail),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/scheda/", title: "Vetrina · Scheda", description: "Scheda dettaglio bot o server in Vetrina." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/scheda/"
        title="Vetrina · Scheda"
        description="Scheda dettaglio bot o server in Vetrina."
      />
      <PageHero
        icon={<Album />}
        kicker="Vetrina"
        title="Dettaglio"
        accent="scheda"
        text="Dettaglio della scheda: descrizione, link e azioni."
      />
      <ListingDetail />
    </SiteShell>
  );
}
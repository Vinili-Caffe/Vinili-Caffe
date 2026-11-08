import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaHero } from "@/components/bacheca/VetrinaHero";

const ListingDetail = dynamic(() => import("@/components/bacheca/ListingDetail").then((m) => m.ListingDetail), {
  loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/vetrina/scheda/",
    title: "Vetrina · Scheda",
    description: "Dettaglio scheda in Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/scheda/"
        title="Vetrina · Scheda"
        description="Dettaglio scheda in Vetrina."
      />
      <VetrinaHero
        kicker="Scheda"
        title={
          <>
            Da vicino
          </>
        }
        text="Descrizione, link, voti e recensioni. Abbastanza per decidere se entrare o invitare."
      />
      <ListingDetail />
    </SiteShell>
  );
}

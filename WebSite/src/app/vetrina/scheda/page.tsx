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
    description: "Dettaglio di un bot o server in Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/scheda/"
        title="Vetrina · Scheda"
        description="Dettaglio di un bot o server in Vetrina."
      />
      <VetrinaHero
        kicker="Vetrina · Scheda"
        title={
          <>
            Dentro
            <br />
            <span className="text-caramel/90">la scheda</span>
          </>
        }
        text="Descrizione, link, voti e recensioni. Quello che serve per decidere se entrare o invitare."
      />
      <ListingDetail />
    </SiteShell>
  );
}

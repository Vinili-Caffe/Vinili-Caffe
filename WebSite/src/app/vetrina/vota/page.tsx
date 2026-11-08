import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaHero } from "@/components/bacheca/VetrinaHero";

const VoteListing = dynamic(() => import("@/components/bacheca/VoteListing").then((m) => m.VoteListing), {
  loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/vetrina/vota/",
    title: "Vetrina · Vota",
    description: "Vota una scheda della Vetrina Vinili & Caffè.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/vota/"
        title="Vetrina · Vota"
        description="Vota una scheda della Vetrina Vinili & Caffè."
      />
      <VetrinaHero
        kicker="Vetrina · Voto"
        title={
          <>
            Un voto
            <br />
            <span className="text-caramel/90">alla scheda</span>
          </>
        }
        text="Segui i passaggi, conferma, e la scheda sale. Niente altro: un sostegno chiaro."
      />
      <VoteListing />
    </SiteShell>
  );
}

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
    description: "Vota una scheda della Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/vota/"
        title="Vetrina · Vota"
        description="Vota una scheda della Vetrina."
      />
      <VetrinaHero
        kicker="Voto"
        title={
          <>
            Un punto
            <br />
            in più
          </>
        }
        text="Completa i passaggi e la scheda sale. Niente fronzoli: un sostegno netto."
      />
      <VoteListing />
    </SiteShell>
  );
}

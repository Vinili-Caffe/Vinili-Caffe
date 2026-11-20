import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { ThumbsUp } from "lucide-react";
import { VetrinaGate, VetrinaHeader } from "@/components/vetrina/VetrinaChrome";
import { SiteShell } from "@/components/SiteShell";

const VoteListing = dynamic(
  () => import("@/components/bacheca/VoteListing").then((m) => m.VoteListing),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/vota/", title: "Vetrina · Vota", description: "Vota una scheda della Vetrina." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/vota/"
        title="Vetrina · Vota"
        description="Vota una scheda della Vetrina."
      />
      <VetrinaGate>
        <VetrinaHeader icon={<ThumbsUp />} kicker="Vetrina" title="Dai il tuo" accent="voto" text="Ogni voto spinge la scheda più in alto in vetrina. Pochi secondi e hai fatto la tua parte." />
        <div className="pt-10">
          <VoteListing />
        </div>
      </VetrinaGate>
    </SiteShell>
  );
}
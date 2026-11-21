import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { ThumbsUp } from "lucide-react";
import { VetrinaGate, VetrinaHeader, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const VoteListing = dynamic(
  () => import("@/components/bacheca/VoteListing").then((m) => m.VoteListing),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/vota/", title: "Vetrina · Vota", description: "Vota un server o un bot nella Vetrina di Vinili & Caffè." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/vota/"
        title="Vetrina · Vota"
        description="Vota un server o un bot nella Vetrina di Vinili & Caffè."
      />
      <VetrinaGate allowLoggedInPreview>
        <VetrinaHeader icon={<ThumbsUp />} kicker="Vetrina" title="Dai il tuo" accent="voto" text="Ogni voto fa salire la scheda nell’elenco, così la trovano più persone. Ci vogliono pochi secondi." />
        <div className="pt-10">
          <VoteListing />
        </div>
      </VetrinaGate>
    </VetrinaShell>
  );
}
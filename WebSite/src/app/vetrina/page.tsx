import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { VetrinaGate, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const VetrinaHome = dynamic(() => import("@/components/vetrina/VetrinaHome").then((m) => m.VetrinaHome), { loading: () => null });

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/", title: "Vetrina", description: "La Vetrina di Vinili & Caffè: server e bot Discord con schede, voti e recensioni della community." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/"
        title="Vetrina"
        description="La Vetrina di Vinili & Caffè: server e bot Discord con schede, voti e recensioni della community."
      />
      <VetrinaGate>
        <VetrinaHome />
      </VetrinaGate>
    </VetrinaShell>
  );
}

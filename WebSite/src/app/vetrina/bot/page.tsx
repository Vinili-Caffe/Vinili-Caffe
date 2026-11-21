import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { VetrinaGate, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const VetrinaHome = dynamic(() => import("@/components/vetrina/VetrinaHome").then((m) => m.VetrinaHome), { loading: () => null });

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/bot/", title: "Bot in Vetrina", description: "Bot Discord per musica, moderazione, giochi e utilità, con voti e recensioni della community di Vinili & Caffè." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/bot/"
        title="Bot in Vetrina"
        description="Bot Discord per musica, moderazione, giochi e utilità, con voti e recensioni della community di Vinili & Caffè."
      />
      <VetrinaGate>
        <VetrinaHome initialKind="bot" />
      </VetrinaGate>
    </VetrinaShell>
  );
}
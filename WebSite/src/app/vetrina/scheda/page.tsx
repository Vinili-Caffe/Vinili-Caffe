import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { VetrinaGate, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const ListingPage = dynamic(() => import("@/components/vetrina/ListingPage").then((m) => m.ListingPage), { loading: () => null });

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/scheda/", title: "Vetrina · Scheda", description: "Scheda dettaglio bot o server in Vetrina." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/scheda/"
        title="Vetrina · Scheda"
        description="Scheda dettaglio bot o server in Vetrina."
      />
      <VetrinaGate>
        <ListingPage />
      </VetrinaGate>
    </VetrinaShell>
  );
}
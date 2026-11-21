import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { VetrinaGate, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const CompareListings = dynamic(() => import("@/components/vetrina/CompareListings").then((m) => m.CompareListings), { loading: () => null });

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/confronta/", title: "Confronta schede · Vetrina", description: "Confronta fino a tre bot o server in Vetrina." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed path="/vetrina/confronta/" title="Confronta schede" description="Confronta fino a tre bot o server in Vetrina." />
      <VetrinaGate>
        <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse rounded-3xl bg-roast/50" />}>
          <CompareListings />
        </Suspense>
      </VetrinaGate>
    </VetrinaShell>
  );
}

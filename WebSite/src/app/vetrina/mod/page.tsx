import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Shield } from "lucide-react";
import { VetrinaGate, VetrinaHeader, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const ModQueue = dynamic(
  () => import("@/components/bacheca/ModQueue").then((m) => m.ModQueue),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/mod/", title: "Mod Vetrina", description: "Le schede della Vetrina in attesa di controllo." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/mod/"
        title="Mod Vetrina"
        description="Le schede della Vetrina in attesa di controllo."
      />
      <VetrinaGate>
        <VetrinaHeader icon={<Shield />} kicker="Staff" title="Coda di" accent="moderazione" text="Schede in attesa: controlla, approva o rimanda indietro con un motivo." />
        <div className="pt-10">
          <ModQueue />
        </div>
      </VetrinaGate>
    </VetrinaShell>
  );
}
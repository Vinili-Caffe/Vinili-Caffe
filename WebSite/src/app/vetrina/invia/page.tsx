import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { PlusCircle } from "lucide-react";
import { VetrinaGate, VetrinaHeader, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const SubmitListing = dynamic(
  () => import("@/components/bacheca/SubmitListing").then((m) => m.SubmitListing),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/invia/", title: "Vetrina · Invia", description: "Proponi il tuo server o il tuo bot Discord per la Vetrina di Vinili & Caffè." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/invia/"
        title="Vetrina · Invia"
        description="Proponi il tuo server o il tuo bot Discord per la Vetrina di Vinili & Caffè."
      />
      <VetrinaGate>
        <VetrinaHeader icon={<PlusCircle />} kicker="Vetrina" title="Metti in" accent="vetrina" text="Presenta il tuo server o il tuo bot: compila la scheda e, dopo il controllo dello staff, compare nella Vetrina." />
        <div className="pt-10">
          <SubmitListing />
        </div>
      </VetrinaGate>
    </VetrinaShell>
  );
}
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { PlusCircle } from "lucide-react";
import { VetrinaGate, VetrinaHeader } from "@/components/vetrina/VetrinaChrome";
import { SiteShell } from "@/components/SiteShell";

const SubmitListing = dynamic(
  () => import("@/components/bacheca/SubmitListing").then((m) => m.SubmitListing),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/invia/", title: "Vetrina · Invia", description: "Invia una scheda bot o server alla Vetrina." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/invia/"
        title="Vetrina · Invia"
        description="Invia una scheda bot o server alla Vetrina."
      />
      <VetrinaGate>
        <VetrinaHeader icon={<PlusCircle />} kicker="Vetrina" title="Metti in" accent="vetrina" text="Presenta il tuo server o il tuo bot: compila la scheda, la controlliamo e la mettiamo sugli scaffali." />
        <div className="pt-10">
          <SubmitListing />
        </div>
      </VetrinaGate>
    </SiteShell>
  );
}
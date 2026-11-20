import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { ScrollText } from "lucide-react";
import { VetrinaGate, VetrinaHeader, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const Guidelines = dynamic(
  () => import("@/components/bacheca/Guidelines").then((m) => m.Guidelines),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/linee-guida-recensioni/", title: "Vetrina · Linee guida recensioni", description: "Linee guida per le recensioni in Vetrina." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/linee-guida-recensioni/"
        title="Vetrina · Linee guida recensioni"
        description="Linee guida per le recensioni in Vetrina."
      />
      <VetrinaGate>
        <VetrinaHeader icon={<ScrollText />} kicker="Vetrina" title="Linee guida" accent="recensioni" text="Come scrivere una recensione utile, cosa è vietato e come gestiamo le segnalazioni." />
        <div className="pt-10">
          <Guidelines />
        </div>
      </VetrinaGate>
    </VetrinaShell>
  );
}
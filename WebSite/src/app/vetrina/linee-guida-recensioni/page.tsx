import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { ScrollText } from "lucide-react";
import { VetrinaHeader, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const Guidelines = dynamic(
  () => import("@/components/bacheca/Guidelines").then((m) => m.Guidelines),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/linee-guida-recensioni/", title: "Linee guida · Vetrina", description: "Come scrivere una recensione utile nella Vetrina di Vinili & Caffè, cosa non è ammesso e come gestiamo le segnalazioni." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/linee-guida-recensioni/"
        title="Linee Guida · Vetrina"
        description="Come scrivere una recensione utile nella Vetrina di Vinili & Caffè, cosa non è ammesso e come gestiamo le segnalazioni."
      />
      <VetrinaHeader icon={<ScrollText />} kicker="Vetrina" title="Linee" accent="guida" text="Come scrivere una recensione utile, cosa è vietato e come gestiamo le segnalazioni." />
      <div className="pt-10">
        <Guidelines />
      </div>
    </VetrinaShell>
  );
}
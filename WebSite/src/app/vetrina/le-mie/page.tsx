import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Library } from "lucide-react";
import { VetrinaGate, VetrinaHeader, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const MyListings = dynamic(
  () => import("@/components/bacheca/MyListings").then((m) => m.MyListings),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/le-mie/", title: "Vetrina · Le mie schede", description: "Le tue schede nella Vetrina di Vinili & Caffè." }),
};

export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/le-mie/"
        title="Vetrina · Le mie schede"
        description="Le tue schede nella Vetrina di Vinili & Caffè."
      />
      <VetrinaGate>
        <VetrinaHeader icon={<Library />} kicker="Vetrina" title="Le tue" accent="schede" text="Le tue bozze, le schede pubblicate e quelle che segui per sapere quando puoi votare o fare un bump." />
        <div className="pt-10">
          <MyListings />
        </div>
      </VetrinaGate>
    </VetrinaShell>
  );
}
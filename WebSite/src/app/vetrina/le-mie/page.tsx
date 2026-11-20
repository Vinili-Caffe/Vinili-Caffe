import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Library } from "lucide-react";
import { VetrinaHeader } from "@/components/vetrina/VetrinaChrome";
import { SiteShell } from "@/components/SiteShell";

const MyListings = dynamic(
  () => import("@/components/bacheca/MyListings").then((m) => m.MyListings),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/le-mie/", title: "Vetrina · Le mie schede", description: "Le tue schede in Vetrina Vinili & Caffè." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/le-mie/"
        title="Vetrina · Le mie schede"
        description="Le tue schede in Vetrina Vinili & Caffè."
      />
      <VetrinaHeader icon={<Library />} kicker="Vetrina" title="Le tue" accent="schede" text="Bozze, schede in revisione e quelle già in vetrina: modificale, riposizionale, tienile aggiornate." />
      <div className="pt-10">
        <MyListings />
      </div>
    </SiteShell>
  );
}
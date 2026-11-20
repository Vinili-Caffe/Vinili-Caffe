import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaGate } from "@/components/vetrina/VetrinaChrome";

const VetrinaHome = dynamic(() => import("@/components/vetrina/VetrinaHome").then((m) => m.VetrinaHome), { loading: () => null });

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/server/", title: "Vetrina · Server", description: "Server Discord in Vetrina Vinili & Caffè." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/server/"
        title="Vetrina · Server"
        description="Server Discord in Vetrina Vinili & Caffè."
      />
      <VetrinaGate>
        <VetrinaHome initialKind="server" />
      </VetrinaGate>
    </SiteShell>
  );
}
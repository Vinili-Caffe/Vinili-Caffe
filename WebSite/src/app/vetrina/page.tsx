import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaHero, VetrinaHubActions } from "@/components/bacheca/VetrinaHero";

const BoardsBrowse = dynamic(() => import("@/components/bacheca/BoardsBrowse").then((m) => m.BoardsBrowse), {
  loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/vetrina/",
    title: "Vetrina",
    description: "Server e bot Discord in mostra su Vinili & Caffè.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/"
        title="Vetrina"
        description="Server e bot Discord in mostra su Vinili & Caffè."
      />
      <VetrinaHero
        size="hub"
        kicker="Vinili & Caffè"
        title={
          <>
            Guardala
            <br />
            dalla strada
          </>
        }
        text="Server e bot dietro il vetro. Sfoglia gli scaffali, apri una scheda, vota se ti convince — o metti la tua."
        actions={<VetrinaHubActions />}
      />
      <BoardsBrowse />
    </SiteShell>
  );
}

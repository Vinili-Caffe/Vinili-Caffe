import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaHero } from "@/components/bacheca/VetrinaHero";

const BoardsBrowse = dynamic(() => import("@/components/bacheca/BoardsBrowse").then((m) => m.BoardsBrowse), {
  loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/vetrina/bot/",
    title: "Bot in Vetrina",
    description: "Bot Discord selezionati nella Vetrina di Vinili & Caffè.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/bot/"
        title="Bot in Vetrina"
        description="Bot Discord selezionati nella Vetrina di Vinili & Caffè."
      />
      <VetrinaHero
        kicker="Vetrina · Bot"
        title={
          <>
            I bot
            <br />
            <span className="text-caramel/90">sullo scaffale</span>
          </>
        }
        text="Automazioni, tool e compagnia da server. Filtra, leggi la scheda, invita se ti convince."
      />
      <BoardsBrowse initialKind="bot" />
    </SiteShell>
  );
}

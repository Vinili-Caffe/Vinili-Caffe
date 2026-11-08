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
    description: "Bot Discord in Vetrina su Vinili & Caffè.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/bot/"
        title="Bot in Vetrina"
        description="Bot Discord in Vetrina su Vinili & Caffè."
      />
      <VetrinaHero
        kicker="Solo bot"
        title={
          <>
            Automazioni
            <br />
            in fila
          </>
        }
        text="Tool e bot della community, messi sullo stesso ripiano. Apri la scheda prima di invitare."
      />
      <BoardsBrowse initialKind="bot" />
    </SiteShell>
  );
}

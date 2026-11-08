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
    description: "Server e bot Discord in mostra nella community Vinili & Caffè.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/"
        title="Vetrina"
        description="Server e bot Discord in mostra nella community Vinili & Caffè."
      />
      <VetrinaHero
        size="hub"
        kicker="Vinili & Caffè"
        title={
          <>
            Dietro il vetro,
            <br />
            <span className="text-caramel/90">server e bot</span>
          </>
        }
        text="Uno scaffale curato: schede vere, voti e recensioni. Sfoglia, apri quella che ti interessa, oppure metti la tua."
        actions={<VetrinaHubActions />}
      />
      <BoardsBrowse />
    </SiteShell>
  );
}

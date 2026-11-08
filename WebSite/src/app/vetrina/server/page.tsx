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
    path: "/vetrina/server/",
    title: "Vetrina · Server",
    description: "Server Discord in Vetrina su Vinili & Caffè.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/server/"
        title="Vetrina · Server"
        description="Server Discord in Vetrina su Vinili & Caffè."
      />
      <VetrinaHero
        kicker="Solo server"
        title={
          <>
            Comunità
            <br />
            in mostra
          </>
        }
        text="Non un elenco infinito: schede con un perché, voti, e spazio per entrare se ti piace l’aria."
      />
      <BoardsBrowse initialKind="server" />
    </SiteShell>
  );
}

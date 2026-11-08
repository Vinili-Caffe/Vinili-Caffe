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
    description: "Server Discord selezionati nella Vetrina di Vinili & Caffè.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/server/"
        title="Vetrina · Server"
        description="Server Discord selezionati nella Vetrina di Vinili & Caffè."
      />
      <VetrinaHero
        kicker="Vetrina · Server"
        title={
          <>
            I server
            <br />
            <span className="text-caramel/90">in mostra</span>
          </>
        }
        text="Comunità messe in fila come dischi. Non un elenco infinito: schede con un perché, e spazio per votarle."
      />
      <BoardsBrowse initialKind="server" />
    </SiteShell>
  );
}

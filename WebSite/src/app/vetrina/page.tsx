import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Disc3 } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const BoardsBrowse = dynamic(() => import("@/components/bacheca/BoardsBrowse").then((m) => m.BoardsBrowse), { loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/", title: "Vetrina", description: "Directory di bot e server Discord della community Vinili & Caffè." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/"
        title="Vetrina"
        description="Directory di bot e server Discord della community Vinili & Caffè."
      />
      <PageHero
        icon={<Disc3 />}
        kicker="Vetrina"
        title="La vetrina"
        accent="community"
        text="Bot e server Discord ordinati per genere: sfoglia, apri la scheda, vota."
      />
      <BoardsBrowse />
    </SiteShell>
  );
}

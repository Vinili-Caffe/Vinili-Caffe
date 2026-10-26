import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";
import { Disc3 } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const BoardsBrowse = dynamic(() => import("@/components/bacheca/BoardsBrowse").then((m) => m.BoardsBrowse), { loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/bacheca/", title: "Bacheca", description: "Directory di bot e server Discord della community Vinili & Caffè." }),
};

export default function Page() {
  return (
    <SiteShell>
      <PageHero
        icon={<Disc3 />}
        kicker="Bacheca"
        title="La bacheca"
        accent="community"
        text="Bot e server Discord ordinati per genere: sfoglia, apri la scheda, vota."
      />
      <BoardsBrowse />
    </SiteShell>
  );
}

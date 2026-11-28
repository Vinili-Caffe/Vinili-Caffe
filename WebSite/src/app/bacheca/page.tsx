import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Pin } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";
import { NavActivitySeen } from "@/components/NavActivitySeen";

const BachecaWall = dynamic(() => import("@/components/bacheca-wall/BachecaWall").then((m) => m.BachecaWall), {
  loading: () => <BoardSkeleton className="mx-auto max-w-7xl px-6" />,
});

const DESCRIPTION = "Quote, repost, clip vocali e messaggi da 💀 della community, appesi al muro.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/bacheca/", title: "Bacheca", description: DESCRIPTION }),
};

export default function BachecaPage() {
  return (
    <SiteShell>
      <NavActivitySeen path="/bacheca" />
      <DiscordComponentEmbed path="/bacheca/" title="Bacheca" description={DESCRIPTION} />
      <PageHero
        icon={<Pin />}
        kicker="Community"
        title="La"
        accent="bacheca"
        text="I messaggi che la community ha citato, ripubblicato, registrato o premiato con un 💀. Puoi reagire, pescarne uno a caso e condividerlo."
      />
      <BachecaWall />
    </SiteShell>
  );
}

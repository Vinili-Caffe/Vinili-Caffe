import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { ThumbsUp } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const VoteListing = dynamic(
  () => import("@/components/bacheca/VoteListing").then((m) => m.VoteListing),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/vota/", title: "Vetrina · Vota", description: "Vota una scheda della Vetrina." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/vota/"
        title="Vetrina · Vota"
        description="Vota una scheda della Vetrina."
      />
      <PageHero
        icon={<ThumbsUp />}
        kicker="Vetrina"
        title="Voto"
        accent="voto"
        text="Sostieni una scheda completando il percorso di voto."
      />
      <VoteListing />
    </SiteShell>
  );
}
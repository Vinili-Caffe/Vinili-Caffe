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
  ...pageSocialMeta({ path: "/bacheca/vota/", title: "Bacheca · Vota", description: "Vota una scheda della Bacheca." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/bacheca/vota/"
        title="Bacheca · Vota"
        description="Vota una scheda della Bacheca."
      />
      <PageHero
        icon={<ThumbsUp />}
        kicker="Bacheca"
        title="Voto"
        accent="voto"
        text="Sostieni una scheda completando il percorso di voto."
      />
      <VoteListing />
    </SiteShell>
  );
}
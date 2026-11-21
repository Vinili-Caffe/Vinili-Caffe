import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Heart } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildVote } from "@/lib/vote";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

const VoteBoard = dynamic(() => import("@/components/vote/VoteBoard").then((m) => m.VoteBoard), { loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vote/", title: "Vota", description: "Vota Vinili & Caffè su Discadia e Top.gg: il server si fa trovare da più persone e tu ricevi EXP e il ruolo Voter." }),
};

export default async function VotePage() {
  const initial = await loadBuildVote();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vote/"
        title="Vota"
        description="Vota Vinili & Caffè su Discadia e Top.gg: il server si fa trovare da più persone e tu ricevi EXP e il ruolo Voter."
      />
      <PageHero
        icon={<Heart />}
        kicker="Sostienici"
        title="Vota il"
        accent="server"
        text="Su Discadia si vota una volta ogni 24 ore, su Top.gg ogni 12. Ogni voto fa salire il server nelle liste dove lo trovano i nuovi membri, e a te porta un po' di EXP."
      />
      <VoteBoard initial={initial} />
    </SiteShell>
  );
}

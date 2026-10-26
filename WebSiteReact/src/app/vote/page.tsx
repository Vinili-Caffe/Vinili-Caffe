import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Heart } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildVote } from "@/lib/vote";
import { pageSocialMeta } from "@/lib/og";

const VoteBoard = dynamic(() => import("@/components/vote/VoteBoard").then((m) => m.VoteBoard), { loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vote/", title: "Vota", description: "Vota Vinili & Caffè su Discadia e Top.gg: bonus EXP, ruolo Voter e più visibilità per la community." }),
};

export default async function VotePage() {
  const initial = await loadBuildVote();
  return (
    <SiteShell>
      <PageHero
        icon={<Heart />}
        kicker="Sostienici"
        title="Vota il"
        accent="server"
        text="Un voto su Discadia ogni 24 ore e uno su Top.gg ogni 12: il server sale in classifica e tu guadagni EXP."
      />
      <VoteBoard initial={initial} />
    </SiteShell>
  );
}

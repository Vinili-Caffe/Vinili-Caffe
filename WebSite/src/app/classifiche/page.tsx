import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Trophy } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildBoard } from "@/lib/leaderboard";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const LeaderboardBrowser = dynamic(
  () => import("@/components/leaderboard/LeaderboardBrowser").then((m) => m.LeaderboardBrowser),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/classifiche/", title: "Classifiche", description: "I membri più attivi di Vinili & Caffè: livello, EXP settimanale, messaggi, vocale e minigames." }),
};

export default async function ClassifichePage() {
  const initial = await loadBuildBoard();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/classifiche/"
        title="Classifiche"
        description="I membri più attivi di Vinili & Caffè: livello, EXP settimanale, messaggi, vocale e minigames."
      />
      <PageHero
        icon={<Trophy />}
        kicker="Classifiche"
        title="I dischi"
        accent="d'oro"
        text="Chi spacca di più nel server: livello, EXP della settimana, messaggi, ore in vocale e minigames."
      />
      <LeaderboardBrowser initial={initial} />
    </SiteShell>
  );
}

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Trophy } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildBoard } from "@/lib/leaderboard";
import { loadBuildBotsBoard } from "@/lib/bots-leaderboard";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const ClassificheBrowser = dynamic(
  () => import("@/components/leaderboard/ClassificheBrowser").then((m) => m.ClassificheBrowser),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/classifiche/",
    title: "Classifiche",
    description: "Classifiche community e bot di Vinili & Caffè: livello, messaggi, vocale, partnership e ingressi.",
  }),
};

export default async function ClassifichePage() {
  const [initialCommunity, initialBots] = await Promise.all([loadBuildBoard(), loadBuildBotsBoard()]);
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/classifiche/"
        title="Classifiche"
        description="Classifiche community e bot di Vinili & Caffè: livello, messaggi, vocale, partnership e ingressi."
      />
      <PageHero
        icon={<Trophy />}
        kicker="Classifiche"
        title="I dischi"
        accent="d'oro"
        text="Community e partnership: chi spacca di più nel server e chi porta più gente."
      />
      <ClassificheBrowser initialCommunity={initialCommunity} initialBots={initialBots} />
    </SiteShell>
  );
}

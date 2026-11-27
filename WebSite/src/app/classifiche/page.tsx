import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Trophy } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildBoard } from "@/lib/leaderboard";
import { loadBuildBotsBoard } from "@/lib/bots-leaderboard";
import { loadBuildDailyWeek } from "@/lib/daily";
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
    description:
      "Le classifiche di Vinili & Caffè: livelli, messaggi, ore in vocale, partnership, bots e giochi del giorno.",
  }),
};

export default async function ClassifichePage() {
  const [initialCommunity, initialBots, initialDaily] = await Promise.all([
    loadBuildBoard(),
    loadBuildBotsBoard(),
    loadBuildDailyWeek(),
  ]);
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/classifiche/"
        title="Classifiche"
        description="Le classifiche di Vinili & Caffè: livelli, messaggi, ore in vocale, partnership, bots e giochi del giorno."
      />
      <PageHero
        icon={<Trophy />}
        kicker="Classifiche"
        title="I dischi"
        accent="d'oro"
        text="Chi scrive di più, chi passa più tempo in vocale, chi ha portato più persone e chi indovina meglio nei giochi del giorno. Si aggiornano da sole."
      />
      <ClassificheBrowser
        initialCommunity={initialCommunity}
        initialBots={initialBots}
        initialDaily={initialDaily}
      />
    </SiteShell>
  );
}

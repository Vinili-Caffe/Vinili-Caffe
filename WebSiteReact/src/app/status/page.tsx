import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Activity } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildStatus } from "@/lib/status";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const StatusBoard = dynamic(
  () => import("@/components/status/StatusBoard").then((m) => m.StatusBoard),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/status/", title: "Stato", description: "Stato in tempo reale del sito, dei bot Discord, del database, della musica e dei voti." }),
};

export default async function StatusPage() {
  const initial = await loadBuildStatus();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/status/"
        title="Stato"
        description="Stato in tempo reale del sito, dei bot Discord, del database, della musica e dei voti."
      />
      <PageHero
        icon={<Activity />}
        kicker="Sistema"
        title="Stato dei"
        accent="servizi"
        text="Stato di sito, bot, database, musica e voti — aggiornato in tempo reale."
      />
      <StatusBoard initial={initial} />
    </SiteShell>
  );
}

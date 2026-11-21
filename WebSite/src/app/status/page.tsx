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
  ...pageSocialMeta({ path: "/status/", title: "Stato", description: "Lo stato del sito e dei bot di Vinili & Caffè, aggiornato in tempo reale." }),
};

export default async function StatusPage() {
  const initial = await loadBuildStatus();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/status/"
        title="Stato"
        description="Lo stato del sito e dei bot di Vinili & Caffè, aggiornato in tempo reale."
      />
      <PageHero
        icon={<Activity />}
        kicker="Sistema"
        title="Stato dei"
        accent="servizi"
        text="Se qualcosa non va, qui lo vedi subito: quali servizi funzionano, quanto ci mettono a rispondere e cosa è successo nelle ultime ore. La pagina si aggiorna da sola."
      />
      <StatusBoard initial={initial} />
    </SiteShell>
  );
}

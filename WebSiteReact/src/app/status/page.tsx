import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { StatusBoard } from "@/components/status/StatusBoard";
import { loadBuildStatus } from "@/lib/status";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/status/", title: "Stato", description: "Stato in tempo reale del sito, dei bot Discord, del database, della musica e dei voti." }),
};

export default async function StatusPage() {
  const initial = await loadBuildStatus();
  return (
    <SiteShell>
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

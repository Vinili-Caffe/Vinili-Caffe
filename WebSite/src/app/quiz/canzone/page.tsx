import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Disc3 } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const DailyMusicGame = dynamic(() => import("@/components/daily/DailyMusicGame").then((m) => m.DailyMusicGame));

const DESCRIPTION = "Indovina la canzone del giorno: la senti per un secondo, poi sempre di più. Sei tentativi, uguale per tutti.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/quiz/canzone/", title: "Canzone del giorno", description: DESCRIPTION }),
};

export default function DailySongPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/quiz/canzone/" title="Canzone del giorno" description={DESCRIPTION} />
      <PageHero compact icon={<Disc3 />} kicker="Quiz" title="La canzone" accent="del giorno" text={DESCRIPTION} />
      <DailyMusicGame kind="song" />
    </SiteShell>
  );
}

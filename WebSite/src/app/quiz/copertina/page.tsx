import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Image as ImageIcon } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const DailyMusicGame = dynamic(() => import("@/components/daily/DailyMusicGame").then((m) => m.DailyMusicGame));
/* lo scaffale dei giorni scorsi (coverflow) */
const DailyPastShelf = dynamic(() => import("@/components/daily/DailyPastShelf").then((m) => m.DailyPastShelf));

const DESCRIPTION = "Indovina l'album dalla copertina a quadretti: a ogni errore si vede meglio. Sei tentativi, uguale per tutti.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/quiz/copertina/", title: "Copertina del giorno", description: DESCRIPTION }),
};

export default function DailyCoverPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/quiz/copertina/" title="Copertina del giorno" description={DESCRIPTION} />
      <PageHero compact icon={<ImageIcon />} kicker="Quiz" title="La copertina" accent="del giorno" text={DESCRIPTION} />
      <DailyMusicGame kind="cover" />
      <DailyPastShelf kind="cover" />
    </SiteShell>
  );
}

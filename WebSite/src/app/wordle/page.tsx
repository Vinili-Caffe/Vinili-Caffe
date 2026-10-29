import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Coffee } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildWordle } from "@/lib/wordle";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

const WordleBoard = dynamic(
  () => import("@/components/wordle/WordleBoard").then((m) => m.WordleBoard),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/wordle/", title: "Wordle", description: "Wordle giornaliero Vinili & Caffè — stessa lingua del sito, una parola al giorno." }),
};

export default async function WordlePage() {
  const initial = await loadBuildWordle("it");
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/wordle/"
        title="Wordle"
        description="Wordle giornaliero Vinili & Caffè — stessa lingua del sito, una parola al giorno."
      />
      <PageHero
        icon={<Coffee />}
        kicker="Minigioco"
        title="Wordle del"
        accent="server"
        text="Cinque lettere, sei tentativi, una parola al giorno."
      />
      <WordleBoard initial={initial} />
    </SiteShell>
  );
}

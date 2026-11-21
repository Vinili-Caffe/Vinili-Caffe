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
  ...pageSocialMeta({ path: "/wordle/", title: "Wordle", description: "Il Wordle di Vinili & Caffè: una parola nuova ogni giorno da indovinare in sei tentativi, nella lingua del sito." }),
};

export default async function WordlePage() {
  const initial = await loadBuildWordle("it");
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/wordle/"
        title="Wordle"
        description="Il Wordle di Vinili & Caffè: una parola nuova ogni giorno da indovinare in sei tentativi, nella lingua del sito."
      />
      <PageHero
        icon={<Coffee />}
        kicker="Minigioco"
        title="Wordle del"
        accent="server"
        text="Cinque lettere e sei tentativi per indovinare la parola del giorno. Domani ce n’è un’altra."
      />
      <WordleBoard initial={initial} />
    </SiteShell>
  );
}

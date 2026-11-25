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
  ...pageSocialMeta({
    path: "/wordle/",
    title: "Wordle",
    description:
      "Il Wordle di Vinili & Caffè: una parola nuova ogni giorno. Accedi e entra nel server per ricevere EXP in base ai tentativi.",
  }),
};

export default async function WordlePage() {
  const initial = await loadBuildWordle("it");
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/wordle/"
        title="Wordle"
        description="Il Wordle di Vinili & Caffè: una parola nuova ogni giorno. Accedi e entra nel server per ricevere EXP."
      />
      <PageHero
        compact
        icon={<Coffee />}
        kicker="Minigioco"
        title="Wordle del"
        accent="server"
        text="Indovina la parola del giorno. Vinci e guadagni EXP."
      />
      <WordleBoard initial={initial} />
    </SiteShell>
  );
}

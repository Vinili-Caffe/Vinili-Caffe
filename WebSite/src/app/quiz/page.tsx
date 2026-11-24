import type { Metadata } from "next";
import { ArrowUpDown, Brain, Music2 } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { QuizHubCards } from "@/components/number-quiz/QuizHubCards";
import { pageSocialMeta } from "@/lib/og";

const DESCRIPTION = "Tutti i quiz di Vinili & Caffè: indovina la canzone, sfida i numeri e crea i tuoi.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/quiz/", title: "Quiz", description: DESCRIPTION }),
};

export default function QuizPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/quiz/" title="Quiz" description={DESCRIPTION} />
      <PageHero compact icon={<Brain />} kicker="Giochi" title="I nostri" accent="quiz" text="Scegli a cosa giocare: da solo, con gli amici o in chiamata su Discord." />
      <QuizHubCards
        cards={[
          {
            href: "/music-quiz/",
            title: "Music Quiz",
            text: "Indovina la canzone da pochi secondi di ascolto, da solo o con gli amici.",
            note: "Serve essere nel server Discord",
            icon: <Music2 className="size-7" />,
          },
          {
            href: "/quiz/numeri/",
            title: "Number Quiz",
            text: "Più o meno? Due voci a confronto: indovina quale numero è più alto.",
            note: "Puoi anche creare le tue categorie",
            icon: <ArrowUpDown className="size-7" />,
          },
        ]}
      />
    </SiteShell>
  );
}

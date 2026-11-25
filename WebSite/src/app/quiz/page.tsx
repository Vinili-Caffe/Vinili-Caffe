import type { Metadata } from "next";
import { ArrowUpDown, Brain, Compass, Grid2x2, Music2, SpellCheck } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { QuizHubCards } from "@/components/number-quiz/QuizHubCards";
import { pageSocialMeta } from "@/lib/og";

const DESCRIPTION = "Tutti i quiz di Vinili & Caffè: indovina la canzone, sfida i numeri, trova la parola del giorno.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/quiz/", title: "Quiz", description: DESCRIPTION }),
};

export default function QuizPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/quiz/" title="Quiz" description={DESCRIPTION} />
      <PageHero
        compact
        icon={<Brain />}
        kicker="Giochi"
        title="I nostri"
        accent="quiz"
        text="Si gioca subito, anche senza accesso. Accedi con Discord per salvare i punteggi; se sei nel server prendi anche EXP."
      />
      <QuizHubCards
        cards={[
          {
            href: "/music-quiz/",
            title: "Music Quiz",
            text: "Indovina la canzone da pochi secondi di ascolto, da solo, con gli amici o con la tua live.",
            note: "Migliaia di artisti e playlist",
            icon: <Music2 className="size-7" />,
          },
          {
            href: "/quiz/numeri/",
            title: "Number Quiz",
            text: "Più o meno? Due voci a confronto: indovina quale numero è più alto.",
            note: "Oltre 100 categorie",
            icon: <ArrowUpDown className="size-7" />,
          },
          {
            href: "/quiz/angle/",
            title: "Angle",
            text: "Indovina l'angolo sul vinile in quattro tentativi.",
            note: "Uno nuovo ogni giorno",
            icon: <Compass className="size-7" />,
          },
          {
            href: "/wordle/",
            title: "Wordle",
            text: "Una parola nuova ogni giorno: hai sei tentativi per indovinarla.",
            note: "Una partita al giorno",
            icon: <SpellCheck className="size-7" />,
          },
          {
            href: "/wordle/quattro/",
            title: "Quordle",
            text: "Quattro parole insieme e nove tentativi condivisi.",
            note: "Per chi vuole la sfida vera",
            icon: <Grid2x2 className="size-7" />,
          },
        ]}
      />
    </SiteShell>
  );
}

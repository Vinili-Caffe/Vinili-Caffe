import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Lightbulb } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { NavActivitySeen } from "@/components/NavActivitySeen";

const SiteFeedback = dynamic(
  () => import("@/components/feedback/SiteFeedback").then((m) => m.SiteFeedback),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/feedback/", title: "Feedback", description: "Idee e segnalazioni per Vinili & Caffè: proponi qualcosa di nuovo o segnala un problema, e vota le proposte degli altri membri." }),
};

export default function FeedbackPage() {
  return (
    <SiteShell>
      <NavActivitySeen path="/feedback" />
      <DiscordComponentEmbed
        path="/feedback/"
        title="Feedback"
        description="Hai un"
      />
      <PageHero
        icon={<Lightbulb />}
        kicker="Feedback"
        title="Il tuo feedback per"
        accent="Vinili & Caffè"
        text="Hai un’idea per il server o qualcosa non funziona? Scrivilo qui, indica se è un’idea o un problema e aggiungi una foto se aiuta a capire. Gli altri membri possono votare e commentare."
      />
      <SiteFeedback />
    </SiteShell>
  );
}

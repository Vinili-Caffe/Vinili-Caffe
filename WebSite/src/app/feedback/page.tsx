import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Lightbulb } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const SiteFeedback = dynamic(
  () => import("@/components/feedback/SiteFeedback").then((m) => m.SiteFeedback),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/feedback/", title: "Feedback", description: "Hai un'idea o hai trovato un problema? Condividilo con la community di Vinili & Caffè: vota e commenta le proposte." }),
};

export default function FeedbackPage() {
  return (
    <SiteShell>
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
        text="Hai un’idea o hai trovato un problema? Condividilo con la community: puoi scegliere Idea o Problema e allegare foto."
      />
      <SiteFeedback />
    </SiteShell>
  );
}

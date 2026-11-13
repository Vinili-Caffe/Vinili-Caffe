import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Lightbulb } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const BotFeedbackBoard = dynamic(() => import("@/components/dashboard/BotFeedbackBoard").then((m) => m.BotFeedbackBoard), {
  loading: () => null,
});

const FeedbackBoard = dynamic(
  () => import("@/components/feedback/FeedbackBoard").then((m) => m.FeedbackBoard),
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
      <FeedbackBoard />
      {/* feedback sul bot Vinili: archivio a parte, subito sotto (prima stava in dashboard; /feedback/#bot porta qui) */}
      <section id="bot" className="mx-auto max-w-6xl scroll-mt-28 px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Il bot Vinili</p>
        <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Idee e problemi sul bot</h2>
        <p className="mt-2 max-w-2xl text-sm text-crema/60">Il bot che usi anche nel tuo server: proponi una funzione o segnala qualcosa che non va.</p>
      </section>
      <BotFeedbackBoard />
    </SiteShell>
  );
}

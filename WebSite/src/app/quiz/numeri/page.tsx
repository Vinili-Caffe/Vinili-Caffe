import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { ArrowUpDown } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const NumberQuizHub = dynamic(() => import("@/components/number-quiz/NumberQuizHub").then((m) => m.NumberQuizHub));

const DESCRIPTION = "Più o meno? Due voci a confronto: indovina quale ha il numero più alto e allunga la serie.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/quiz/numeri/", title: "Number Quiz", description: DESCRIPTION }),
};

export default function NumberQuizPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/quiz/numeri/" title="Number Quiz" description={DESCRIPTION} />
      <PageHero compact icon={<ArrowUpDown />} kicker="Quiz" title="Number" accent="Quiz" text={DESCRIPTION} />
      <NumberQuizHub />
    </SiteShell>
  );
}

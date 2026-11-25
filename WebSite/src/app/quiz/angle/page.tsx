import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Compass } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const AngleGame = dynamic(() => import("@/components/angle/AngleGame").then((m) => m.AngleGame));

const DESCRIPTION = "Indovina l'angolo sul vinile in quattro tentativi. Uno nuovo ogni giorno, uguale per tutti.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/quiz/angle/", title: "Angle", description: DESCRIPTION }),
};

export default function AnglePage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/quiz/angle/" title="Angle" description={DESCRIPTION} />
      <PageHero compact icon={<Compass />} kicker="Quiz" title="Indovina" accent="l'angolo" text={DESCRIPTION} />
      <Suspense fallback={null}>
        <AngleGame />
      </Suspense>
    </SiteShell>
  );
}

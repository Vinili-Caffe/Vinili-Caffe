import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Grid2x2 } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildWordleQuad } from "@/lib/wordleQuad";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

const WordleQuadBoard = dynamic(
  () => import("@/components/wordle/WordleQuadBoard").then((m) => m.WordleQuadBoard),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/wordle/quattro/",
    title: "Quordle",
    description:
      "Quattro parole insieme, nove tentativi condivisi. Accedi e entra nel server per EXP in base a quanto sei stato bravo.",
  }),
};

export default async function WordleQuattroPage() {
  const initial = await loadBuildWordleQuad("it");
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/wordle/quattro/"
        title="Quordle"
        description="Quattro parole insieme, nove tentativi. EXP sul livello se sei nel server."
      />
      <PageHero
        compact
        icon={<Grid2x2 />}
        kicker="Minigioco"
        title="Il"
        accent="Quordle"
        text="Quattro parole, nove tentativi. Vinci e guadagni EXP."
      />
      <WordleQuadBoard initial={initial} />
    </SiteShell>
  );
}

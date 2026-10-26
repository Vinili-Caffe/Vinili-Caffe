import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";
import { Sparkles } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const PuzzleBoard = dynamic(() => import("@/components/puzzle/PuzzleBoard").then((m) => m.PuzzleBoard), { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" />,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/puzzle/", title: "Puzzle", description: "Puzzle galassia riservato all’High Staff — pezzi da ricomporre." }),
  robots: { index: false },
};

export default function PuzzlePage() {
  return (
    <SiteShell>
      <PageHero
        icon={<Sparkles />}
        kicker="High Staff"
        title="Puzzle"
        accent="galassia"
        text="Pezzi coperti da pescare: ricomponi la galassia sul quadro."
      />
      <PuzzleBoard />
    </SiteShell>
  );
}

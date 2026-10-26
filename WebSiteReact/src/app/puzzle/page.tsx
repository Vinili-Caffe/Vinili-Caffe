import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const PuzzleBoard = dynamic(() => import("@/components/puzzle/PuzzleBoard").then((m) => m.PuzzleBoard), {
  loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" />,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/puzzle/", title: "Puzzle", description: "Puzzle galassia riservato all’High Staff — pezzi da ricomporre." }),
  robots: { index: false },
};

export default function PuzzlePage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/puzzle/"
        title="Puzzle"
        description="Puzzle galassia riservato all’High Staff — pezzi da ricomporre."
      />
      <PuzzleBoard />
    </SiteShell>
  );
}

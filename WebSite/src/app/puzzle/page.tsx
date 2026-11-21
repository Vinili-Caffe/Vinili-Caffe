import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { EventoBootScroll } from "@/components/evento/EventoBootScroll";
import { EventoSortGate } from "@/components/evento/EventoSortGate";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const PuzzleBoard = dynamic(() => import("@/components/puzzle/PuzzleBoard").then((m) => m.PuzzleBoard), {
  loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" />,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/puzzle/",
    title: "Puzzle galattico",
    description:
      "Ricomponi le illustrazioni a tema galattico scegliendo fra sei livelli di difficoltà. Più sei veloce, più alto è il premio.",
  }),
  robots: { index: false },
};

export default function PuzzlePage() {
  return (
    <SiteShell chrome="evento">
      <EventoBootScroll />
      <DiscordComponentEmbed
        path={"/puzzle/"}
        title="Puzzle galattico"
        description="Ricomponi le illustrazioni a tema galattico scegliendo fra sei livelli di difficoltà. Più sei veloce, più alto è il premio."
      />
      <EventoSortGate mode="redirect">
        <PuzzleBoard />
      </EventoSortGate>
    </SiteShell>
  );
}

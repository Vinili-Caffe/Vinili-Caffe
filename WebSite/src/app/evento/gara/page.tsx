import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { EventoPage } from "@/components/evento/EventoPage";
import { EventoSortGate } from "@/components/evento/EventoSortGate";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const GaraGame = dynamic(
  () => import("@/components/evento/GaraGame").then((m) => m.GaraGame),
  { loading: () => <BoardSkeleton className="mx-auto max-w-3xl px-6" /> },
);

const meta = eventoPageMeta("gara");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: "Podracing Championship", description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoGaraPage() {
  return (
    <EventoPage pageId="gara" path={meta.path} title="Podracing Championship" text={meta.description}>
      <EventoSortGate mode="redirect">
        <GaraGame />
      </EventoSortGate>
    </EventoPage>
  );
}

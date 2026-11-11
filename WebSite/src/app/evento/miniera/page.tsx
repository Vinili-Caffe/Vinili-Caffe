import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Gem } from "lucide-react";
import { EventoPage } from "@/components/evento/EventoPage";
import { EventoSortGate } from "@/components/evento/EventoSortGate";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const MinieraGame = dynamic(
  () => import("@/components/evento/MinieraGame").then((m) => m.MinieraGame),
  { loading: () => <BoardSkeleton className="mx-auto max-w-3xl px-6" /> },
);

const meta = eventoPageMeta("miniera");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoMinieraPage() {
  return (
    <EventoPage
      pageId="miniera"
      path={meta.path}
      title="Estrazione"
      accent="Kyber"
      text="Scava nei geodi di Ilum alla ricerca di cristalli Kyber."
      icon={<Gem />}
    >
      <EventoSortGate mode="redirect">
        <MinieraGame />
      </EventoSortGate>
    </EventoPage>
  );
}

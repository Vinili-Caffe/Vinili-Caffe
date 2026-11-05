import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { EventoPage } from "@/components/evento/EventoPage";
import { EventoSortGate } from "@/components/evento/EventoSortGate";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const AccademiaGame = dynamic(
  () => import("@/components/evento/AccademiaGame").then((m) => m.AccademiaGame),
  { loading: () => <BoardSkeleton className="mx-auto max-w-3xl px-6" /> },
);

const meta = eventoPageMeta("accademia");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoAccademiaPage() {
  return (
    <EventoPage pageId="accademia" path={meta.path} title="Accademia" text={meta.description}>
      <EventoSortGate mode="redirect">
        <AccademiaGame />
      </EventoSortGate>
    </EventoPage>
  );
}

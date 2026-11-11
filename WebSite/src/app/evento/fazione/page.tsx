import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Shield } from "lucide-react";
import { EventoPage } from "@/components/evento/EventoPage";
import { EventoSortGate } from "@/components/evento/EventoSortGate";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const EventoFactionHub = dynamic(
  () => import("@/components/evento/EventoFactionHub").then((m) => m.EventoFactionHub),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

const meta = eventoPageMeta("fazione");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoFazionePage() {
  return (
    <EventoPage
      pageId="fazione"
      path={meta.path}
      title="Sala"
      accent="di guerra"
      icon={<Shield />}
    >
      <EventoSortGate mode="redirect">
        <EventoFactionHub />
      </EventoSortGate>
    </EventoPage>
  );
}

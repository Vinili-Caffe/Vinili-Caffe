import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Trophy } from "lucide-react";
import { EventoPage } from "@/components/evento/EventoPage";
import { EventoSortGate } from "@/components/evento/EventoSortGate";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const EventoClassifiche = dynamic(
  () => import("@/components/evento/EventoClassifiche").then((m) => m.EventoClassifiche),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

const meta = eventoPageMeta("classifiche");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoClassifichePage() {
  return (
    <EventoPage
      pageId="classifiche"
      path={meta.path}
      title="Sala"
      accent="classifiche"
      text="Ologrammi di tutte le classifiche disponibili dell’evento."
      icon={<Trophy />}
    >
      <EventoSortGate mode="redirect">
        <EventoClassifiche />
      </EventoSortGate>
    </EventoPage>
  );
}

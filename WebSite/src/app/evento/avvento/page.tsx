import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { EventoPage } from "@/components/evento/EventoPage";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const AdventCalendar = dynamic(
  () => import("@/components/evento/AdventCalendar").then((m) => m.AdventCalendar),
  { loading: () => <BoardSkeleton className="mx-auto max-w-3xl px-6" /> },
);

const meta = eventoPageMeta("avvento");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoAvventoPage() {
  return (
    <EventoPage
      pageId="avvento"
      path={meta.path}
      title="Avvento"
      text="25 giorni, 25 caselle: ogni giorno una ricompensa diversa (casse e crediti)."
    >
      <AdventCalendar />
    </EventoPage>
  );
}

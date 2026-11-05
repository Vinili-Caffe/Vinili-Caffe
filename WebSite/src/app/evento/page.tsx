import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { EventoPage } from "@/components/evento/EventoPage";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const EventoHubStatus = dynamic(
  () => import("@/components/evento/EventoHubStatus").then((m) => m.EventoHubStatus),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);
const EventoInventoryPanel = dynamic(
  () => import("@/components/evento/EventoInventoryPanel").then((m) => m.EventoInventoryPanel),
);
const EventoCollectionsHub = dynamic(
  () => import("@/components/evento/EventoCollectionsHub").then((m) => m.EventoCollectionsHub),
);
const EventoCalendarHub = dynamic(
  () => import("@/components/evento/EventoCalendarHub").then((m) => m.EventoCalendarHub),
);
const EventoShopPanel = dynamic(
  () => import("@/components/evento/EventoShopPanel").then((m) => m.EventoShopPanel),
);

const meta = eventoPageMeta("hub");

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: meta.path,
    title: meta.title,
    description: meta.description,
  }),
  robots: { index: false, follow: false },
};

export default function EventoHubPage() {
  return (
    <EventoPage
      pageId="hub"
      path={meta.path}
      title="Centro di Comando"
      text="Il tuo profilo evento: inventari, livello, fazione e missioni del giorno."
    >
      <EventoHubStatus />
      <EventoInventoryPanel />
      <EventoCollectionsHub />
      <EventoCalendarHub />
      <EventoShopPanel />
    </EventoPage>
  );
}

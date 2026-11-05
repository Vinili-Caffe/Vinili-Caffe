import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { EventoPage } from "@/components/evento/EventoPage";
import { EVENTO_BRAND, eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const EventoHubStatus = dynamic(
  () => import("@/components/evento/EventoHubStatus").then((m) => m.EventoHubStatus),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);
const EventoCratesPanel = dynamic(
  () => import("@/components/evento/EventoCratesPanel").then((m) => m.EventoCratesPanel),
);
const EventoArmyPanel = dynamic(
  () => import("@/components/evento/EventoArmyPanel").then((m) => m.EventoArmyPanel),
);
const EventoItemsPanel = dynamic(
  () => import("@/components/evento/EventoItemsPanel").then((m) => m.EventoItemsPanel),
);
const EventoMinigamesPanel = dynamic(
  () => import("@/components/evento/EventoMinigamesPanel").then((m) => m.EventoMinigamesPanel),
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
      title="Centro di comando"
      accent={EVENTO_BRAND}
      text="Il tuo profilo evento: inventari, livello, fazione e missioni del giorno."
    >
      <EventoHubStatus />
      <EventoCratesPanel />
      <EventoArmyPanel />
      <EventoItemsPanel />
      <EventoMinigamesPanel />
      <EventoShopPanel />
    </EventoPage>
  );
}

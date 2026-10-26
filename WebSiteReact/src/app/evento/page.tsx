import type { Metadata } from "next";
import { EventoHubLinks } from "@/components/evento/EventoHubLinks";
import { EventoHubStatus } from "@/components/evento/EventoHubStatus";
import { EventoMinigamesPanel } from "@/components/evento/EventoMinigamesPanel";
import { EventoPage } from "@/components/evento/EventoPage";
import { EventoShopPanel } from "@/components/evento/EventoShopPanel";
import { EVENTO_BRAND, eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";

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
    <EventoPage pageId="hub" path={meta.path} title="Evento" accent={EVENTO_BRAND} text={meta.description}>
      <EventoHubStatus />
      <EventoHubLinks />
      <EventoShopPanel />
      <EventoMinigamesPanel />
    </EventoPage>
  );
}

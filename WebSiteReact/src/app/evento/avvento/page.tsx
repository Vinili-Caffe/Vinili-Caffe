import type { Metadata } from "next";
import { AdventCalendar } from "@/components/evento/AdventCalendar";
import { EventoPage } from "@/components/evento/EventoPage";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";

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

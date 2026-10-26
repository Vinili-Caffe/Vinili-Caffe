import type { Metadata } from "next";
import { EventoComingSoon } from "@/components/evento/EventoComingSoon";
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
    <EventoPage pageId="avvento" path={meta.path} title="Avvento" text={meta.description}>
      <EventoComingSoon
        title="Calendario dell’avvento"
        text="Ogni giorno una casella e una ricompensa diversa. Le ricompense le definiamo insieme più avanti."
      />
    </EventoPage>
  );
}

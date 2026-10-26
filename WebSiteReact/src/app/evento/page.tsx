import type { Metadata } from "next";
import { EventoComingSoon } from "@/components/evento/EventoComingSoon";
import { EventoHubLinks } from "@/components/evento/EventoHubLinks";
import { EventoPage } from "@/components/evento/EventoPage";
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
      <EventoHubLinks />
      <EventoComingSoon
        title="Hub in costruzione"
        text="Qui arriveranno calendario, stato fazioni e accessi rapidi. Per ora usa le tab sopra per le aree già previste."
      />
    </EventoPage>
  );
}

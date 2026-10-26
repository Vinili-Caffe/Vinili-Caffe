import type { Metadata } from "next";
import { AccademiaGame } from "@/components/evento/AccademiaGame";
import { EventoPage } from "@/components/evento/EventoPage";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";

const meta = eventoPageMeta("accademia");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoAccademiaPage() {
  return (
    <EventoPage pageId="accademia" path={meta.path} title="Accademia" text={meta.description}>
      <AccademiaGame />
    </EventoPage>
  );
}

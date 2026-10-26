import type { Metadata } from "next";
import { GaraGame } from "@/components/evento/GaraGame";
import { EventoPage } from "@/components/evento/EventoPage";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";

const meta = eventoPageMeta("gara");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoGaraPage() {
  return (
    <EventoPage pageId="gara" path={meta.path} title="Gara" text={meta.description}>
      <GaraGame />
    </EventoPage>
  );
}

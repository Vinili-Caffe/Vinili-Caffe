import type { Metadata } from "next";
import { EventoPage } from "@/components/evento/EventoPage";
import { SmistamentoQuiz } from "@/components/evento/SmistamentoQuiz";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";

const meta = eventoPageMeta("smistamento");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoSmistamentoPage() {
  return (
    <EventoPage pageId="smistamento" path={meta.path} title="Smistamento" text={meta.description}>
      <SmistamentoQuiz />
    </EventoPage>
  );
}

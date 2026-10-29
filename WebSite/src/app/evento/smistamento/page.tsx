import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { EventoPage } from "@/components/evento/EventoPage";
import { eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const SmistamentoQuiz = dynamic(
  () => import("@/components/evento/SmistamentoQuiz").then((m) => m.SmistamentoQuiz),
  { loading: () => <BoardSkeleton className="mx-auto max-w-3xl px-6" /> },
);

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

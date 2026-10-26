import type { Metadata } from "next";
import { EventoComingSoon } from "@/components/evento/EventoComingSoon";
import { EventoPage } from "@/components/evento/EventoPage";
import { EVENTO_FACTIONS, eventoPageMeta } from "@/lib/evento-starwars";
import { pageSocialMeta } from "@/lib/og";

const meta = eventoPageMeta("smistamento");

export const metadata: Metadata = {
  ...pageSocialMeta({ path: meta.path, title: meta.title, description: meta.description }),
  robots: { index: false, follow: false },
};

export default function EventoSmistamentoPage() {
  return (
    <EventoPage pageId="smistamento" path={meta.path} title="Smistamento" text={meta.description}>
      <ul className="mx-auto mb-6 grid max-w-lg gap-3 px-6 sm:grid-cols-2">
        {EVENTO_FACTIONS.map((f) => (
          <li
            key={f.id}
            className="rounded-2xl bg-black/30 p-4 ring-1 ring-[#f0e6c8]/15"
          >
            <p className="font-display text-xl font-semibold text-[#f0e6c8]">{f.name}</p>
            <p className="mt-1.5 text-sm text-crema/65">{f.blurb}</p>
          </li>
        ))}
      </ul>
      <EventoComingSoon
        title="Quiz di smistamento"
        text="Come Hogwarts: un quiz sul sito assegna Repubblica o Separatisti (ruolo Discord + progresso evento). Domande e pesi dopo."
      />
    </EventoPage>
  );
}

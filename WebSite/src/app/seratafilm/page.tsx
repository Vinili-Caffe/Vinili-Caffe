import type { Metadata } from "next";
import { Clapperboard } from "lucide-react";
import { pageSocialMeta } from "@/lib/og";
import { SerataBoard } from "@/components/seratafilm/SerataBoard";
import { SerataFilmShell } from "@/components/seratafilm/SerataFilmShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/seratafilm/", title: "Serata Film", description: "La serata film di Vinili & Caffè: si guarda insieme in vocale su Discord. Qui trovi quanto manca alla prossima." }),
};

export default function Page() {
  return (
    <SerataFilmShell
      path="/seratafilm/"
      title="Serata Film"
      description="La serata film di Vinili & Caffè: si guarda insieme in vocale su Discord. Qui trovi quanto manca alla prossima."
      heroIcon={<Clapperboard />}
      heroKicker="Eventi"
      heroTitle="Serata"
      heroAccent="film"
      heroText="Locandina e countdown: la serata film del sabato sera su Discord."
    >
      <SerataBoard />
    </SerataFilmShell>
  );
}

import type { Metadata } from "next";
import { Film } from "lucide-react";
import { pageSocialMeta } from "@/lib/og";
import { GrazieBoard } from "@/components/seratafilm/GrazieBoard";
import { SerataFilmShell } from "@/components/seratafilm/SerataFilmShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/seratafilm/grazie/", title: "Grazie ǀ Serata Film", description: "La serata è finita: grazie a chi c’era." }),
};

export default function Page() {
  return (
    <SerataFilmShell
      path="/seratafilm/grazie/"
      title="Grazie ǀ Serata Film"
      description="La serata è finita: grazie a chi c’era."
      heroIcon={<Film />}
      heroKicker="Serata film"
      heroTitle="Grazie"
      heroAccent="per la visione"
    >
      <GrazieBoard />
    </SerataFilmShell>
  );
}

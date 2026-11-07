import type { Metadata } from "next";
import { Film } from "lucide-react";
import { pageSocialMeta } from "@/lib/og";
import { GrazieBoard } from "@/components/seratafilm/GrazieBoard";
import { SerataFilmShell } from "@/components/seratafilm/SerataFilmShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/seratafilm/grazie/", title: "Grazie ǀ Serata Film", description: "Fine della serata — grazie per esserci stati." }),
};

export default function Page() {
  return (
    <SerataFilmShell
      path="/seratafilm/grazie/"
      title="Grazie ǀ Serata Film"
      description="Fine della serata — grazie per esserci stati."
      heroIcon={<Film />}
      heroKicker="Serata film"
      heroTitle="Grazie"
      heroAccent="per la visione"
    >
      <GrazieBoard />
    </SerataFilmShell>
  );
}

import type { Metadata } from "next";
import { LogIn } from "lucide-react";
import { pageSocialMeta } from "@/lib/og";
import { SerataBoard } from "@/components/seratafilm/SerataBoard";
import { SerataFilmShell } from "@/components/seratafilm/SerataFilmShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/seratafilm/accesso-richiesto/", title: "Accesso richiesto ǀ Serata Film", description: "Accedi per entrare nella serata film." }),
};

export default function Page() {
  return (
    <SerataFilmShell
      path="/seratafilm/accesso-richiesto/"
      title="Accesso richiesto ǀ Serata Film"
      description="Accedi per entrare nella serata film."
      heroIcon={<LogIn />}
      heroKicker="Serata film"
      heroTitle="Accesso"
      heroAccent="richiesto"
      heroText="Serve il login Discord (High Staff) per la serata film."
    >
      <SerataBoard />
    </SerataFilmShell>
  );
}

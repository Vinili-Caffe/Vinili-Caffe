import type { Metadata } from "next";
import { Clapperboard } from "lucide-react";
import { pageSocialMeta } from "@/lib/og";
import { SerataBoard } from "@/components/seratafilm/SerataBoard";
import { SerataFilmShell } from "@/components/seratafilm/SerataFilmShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/seratafilm/", title: "Serata Film", description: "Serata film di Vinili & Caffè su Discord: countdown e streaming." }),
};

export default function Page() {
  return (
    <SerataFilmShell
      path="/seratafilm/"
      title="Serata Film"
      description="Serata film di Vinili & Caffè su Discord: countdown e streaming."
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

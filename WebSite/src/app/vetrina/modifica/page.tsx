import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";
import { VetrinaGate, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const ManageListing = dynamic(() => import("@/components/vetrina/manage/ManageListing").then((m) => m.ManageListing), { loading: () => null });

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/modifica/", title: "Vetrina · Gestisci la scheda", description: "Statistiche, aspetto, voti e proprietà della tua scheda in Vetrina." }),
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <VetrinaShell>
      <VetrinaGate>
        <ManageListing />
      </VetrinaGate>
    </VetrinaShell>
  );
}

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { SiteShell } from "@/components/SiteShell";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const GestioneBoard = dynamic(
  () => import("@/components/staff/GestioneBoard").then((m) => m.GestioneBoard),
  { loading: () => null },
);

export const metadata: Metadata = { title: "Gestione · Staff", robots: { index: false } };

export default function Page() {
  return (
    <SiteShell>
      <StaffShell
        title="Gestione"
        accent="staff"
        text="Organico, pex e depex — come sul sito classico."
        requireGestione
      >
        <GestioneBoard />
      </StaffShell>
    </SiteShell>
  );
}

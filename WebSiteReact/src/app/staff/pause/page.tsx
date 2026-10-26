import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { SiteShell } from "@/components/SiteShell";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const PauseBoard = dynamic(
  () => import("@/components/staff/PauseBoard").then((m) => m.PauseBoard),
  { loading: () => null },
);

export const metadata: Metadata = { title: "Calendario · Staff", robots: { index: false } };

export default function Page() {
  return (
    <SiteShell>
      <StaffShell title="Pause" accent="calendario" text="Calendario, richieste e chat sulla pratica.">
        <PauseBoard />
      </StaffShell>
    </SiteShell>
  );
}
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { SiteShell } from "@/components/SiteShell";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const CompitiBoard = dynamic(
  () => import("@/components/staff/CompitiBoard").then((m) => m.CompitiBoard),
  { loading: () => null },
);

export const metadata: Metadata = { title: "Compiti · Staff", robots: { index: false } };

export default function Page() {
  return (
    <SiteShell>
      <StaffShell title="Compiti" accent="settimanali" text="Libro dei compiti: scegli, consegna e revisione High Staff." requireCompiti>
        <CompitiBoard />
      </StaffShell>
    </SiteShell>
  );
}
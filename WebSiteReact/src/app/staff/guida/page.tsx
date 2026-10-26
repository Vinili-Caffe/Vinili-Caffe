import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { SiteShell } from "@/components/SiteShell";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const GuideBrowser = dynamic(
  () => import("@/components/staff/GuideBrowser").then((m) => m.GuideBrowser),
  { loading: () => null },
);

export const metadata: Metadata = { title: "Guida · Staff", robots: { index: false } };

export default function Page() {
  return (
    <SiteShell>
      <StaffShell title="Guida" accent="operativa" text="Manuale del barista: procedure, ruoli e regole del server.">
        <GuideBrowser />
      </StaffShell>
    </SiteShell>
  );
}
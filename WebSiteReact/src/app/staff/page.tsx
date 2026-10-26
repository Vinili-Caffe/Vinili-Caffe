import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { SiteShell } from "@/components/SiteShell";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const StaffProfileRedirect = dynamic(
  () => import("@/components/staffcard/StaffProfileRedirect").then((m) => m.StaffProfileRedirect),
  { loading: () => null },
);

export const metadata: Metadata = { title: "Profilo staff", robots: { index: false } };

export default function Page() {
  return (
    <SiteShell>
      <StaffShell title="Profilo" accent="staff" text="Scheda staff, shop PM e strumenti sul profilo utente.">
        <StaffProfileRedirect embedded />
      </StaffShell>
    </SiteShell>
  );
}

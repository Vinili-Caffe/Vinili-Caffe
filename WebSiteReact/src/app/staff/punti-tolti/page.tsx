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

// sul sito vecchio era un pannello del profilo staff: si apre lì
export const metadata: Metadata = { title: "Punti tolti · Staff", robots: { index: false } };

export default function Page() {
  return (
    <SiteShell>
      <StaffShell title="Punti" accent="tolti" text="Cronologia e revisione punti tolti." requirePuntiTolti>
        <StaffProfileRedirect embedded staffOpen="punti-tolti" />
      </StaffShell>
    </SiteShell>
  );
}

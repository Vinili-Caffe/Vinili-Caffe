import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const StaffProfileRedirect = dynamic(
  () => import("@/components/staffcard/StaffProfileRedirect").then((m) => m.StaffProfileRedirect),
  { loading: () => null },
);

const DESC = "Area staff Vinili & Caffè: scheda, shop PM e strumenti.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/staff/", title: "Profilo staff", description: DESC }),
  robots: { index: false },
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/staff/" title="Profilo staff" description={DESC} pageLabel="Apri area staff" />
      <StaffShell title="Profilo" accent="staff" text="Scheda staff, shop PM e strumenti sul profilo utente.">
        <StaffProfileRedirect embedded />
      </StaffShell>
    </SiteShell>
  );
}

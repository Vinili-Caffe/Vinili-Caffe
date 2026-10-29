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

const DESC = "Cronologia e revisione punti tolti.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/staff/punti-tolti/", title: "Punti tolti · Staff", description: DESC }),
  robots: { index: false },
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/staff/punti-tolti/" title="Punti tolti · Staff" description={DESC} pageLabel="Apri punti tolti" />
      <StaffShell title="Punti" accent="tolti" text={DESC} requirePuntiTolti>
        <StaffProfileRedirect embedded staffOpen="punti-tolti" />
      </StaffShell>
    </SiteShell>
  );
}

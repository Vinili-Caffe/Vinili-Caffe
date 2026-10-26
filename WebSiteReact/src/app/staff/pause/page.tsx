import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const PauseBoard = dynamic(
  () => import("@/components/staff/PauseBoard").then((m) => m.PauseBoard),
  { loading: () => null },
);

const DESC = "Calendario, richieste e chat sulla pratica.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/staff/pause/", title: "Calendario · Staff", description: DESC }),
  robots: { index: false },
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/staff/pause/" title="Calendario · Staff" description={DESC} pageLabel="Apri pause" />
      <StaffShell title="Pause" accent="calendario" text={DESC}>
        <PauseBoard />
      </StaffShell>
    </SiteShell>
  );
}
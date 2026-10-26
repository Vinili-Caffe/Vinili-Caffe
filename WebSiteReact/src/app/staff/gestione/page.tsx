import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const GestioneBoard = dynamic(
  () => import("@/components/staff/GestioneBoard").then((m) => m.GestioneBoard),
  { loading: () => null },
);

const DESC = "Organico, pex e depex — come sul sito classico.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/staff/gestione/", title: "Gestione · Staff", description: DESC }),
  robots: { index: false },
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/staff/gestione/" title="Gestione · Staff" description={DESC} pageLabel="Apri gestione" />
      <StaffShell title="Gestione" accent="staff" text={DESC} requireGestione>
        <GestioneBoard />
      </StaffShell>
    </SiteShell>
  );
}

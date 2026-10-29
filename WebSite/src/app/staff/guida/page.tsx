import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const GuideBrowser = dynamic(
  () => import("@/components/staff/GuideBrowser").then((m) => m.GuideBrowser),
  { loading: () => null },
);

const DESC = "Manuale del barista: procedure, ruoli e regole del server.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/staff/guida/", title: "Guida · Staff", description: DESC }),
  robots: { index: false },
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/staff/guida/" title="Guida · Staff" description={DESC} pageLabel="Apri guida staff" />
      <StaffShell title="Guida" accent="operativa" text={DESC}>
        <GuideBrowser />
      </StaffShell>
    </SiteShell>
  );
}
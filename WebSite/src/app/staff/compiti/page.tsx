import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const StaffShell = dynamic(
  () => import("@/components/staff/StaffShell").then((m) => m.StaffShell),
  { loading: () => null },
);
const CompitiBoard = dynamic(
  () => import("@/components/staff/CompitiBoard").then((m) => m.CompitiBoard),
  { loading: () => null },
);

const DESC = "Libro dei compiti: scegli, consegna e revisione High Staff.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/staff/compiti/", title: "Compiti · Staff", description: DESC }),
  robots: { index: false },
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/staff/compiti/" title="Compiti · Staff" description={DESC} pageLabel="Apri compiti" />
      <StaffShell title="Compiti" accent="settimanali" text={DESC} requireCompiti>
        <CompitiBoard />
      </StaffShell>
    </SiteShell>
  );
}
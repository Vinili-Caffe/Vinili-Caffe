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

const DESC = "Riscatti e gestione premi Partner Manager.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/staff/pm/", title: "Shop premi · Staff", description: DESC }),
  robots: { index: false },
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/staff/pm/" title="Shop premi · Staff" description={DESC} pageLabel="Apri shop PM" />
      <StaffShell title="Shop" accent="premi" text={DESC} requirePmShop>
        <StaffProfileRedirect embedded staffOpen="pm" />
      </StaffShell>
    </SiteShell>
  );
}

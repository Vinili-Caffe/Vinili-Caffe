import type { Metadata } from "next";
import { Palette } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { RolesBrowser } from "@/components/roles/RolesBrowser";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildRoles } from "@/lib/roles";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/ruoli/", title: "Ruoli", description: "I ruoli custom creati dai membri di Vinili & Caffè: scopri chi li ha e richiedi quelli che ti piacciono." }),
};

export default async function RuoliPage() {
  const initial = await loadBuildRoles();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/ruoli/"
        title="Ruoli"
        description="I ruoli custom creati dai membri di Vinili & Caffè: scopri chi li ha e richiedi quelli che ti piacciono."
      />
      <PageHero
        icon={<Palette />}
        kicker="Community"
        title="I ruoli"
        accent="dei membri"
        text="Ruoli personalizzati creati dalla community: chi li ha creati, chi li ha, e come richiederli."
      />
      <RolesBrowser initial={initial} />
    </SiteShell>
  );
}

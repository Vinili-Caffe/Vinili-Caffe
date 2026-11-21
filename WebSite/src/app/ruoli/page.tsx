import type { Metadata } from "next";
import { Palette } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { RolesBrowser } from "@/components/roles/RolesBrowser";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildRoles } from "@/lib/roles";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/ruoli/", title: "Ruoli", description: "I ruoli personalizzati inventati dai membri di Vinili & Caffè: chi li ha creati, chi li porta e come chiederne uno." }),
};

export default async function RuoliPage() {
  const initial = await loadBuildRoles();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/ruoli/"
        title="Ruoli"
        description="I ruoli personalizzati inventati dai membri di Vinili & Caffè: chi li ha creati, chi li porta e come chiederne uno."
      />
      <PageHero
        icon={<Palette />}
        kicker="Community"
        title="I ruoli"
        accent="dei membri"
        text="Sono i ruoli che i membri si sono inventati da soli. Per ognuno vedi chi l'ha creato e chi lo porta, e se ti piace puoi chiederlo anche tu."
      />
      <RolesBrowser initial={initial} />
    </SiteShell>
  );
}

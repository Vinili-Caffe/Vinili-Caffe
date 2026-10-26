import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Suspense } from "react";
import { MyProfileRedirect } from "@/components/profile/MyProfileRedirect";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/profilo/", title: "Il mio profilo", description: "Apre il profilo Discord di chi visita il link." }),
  robots: { index: false },
};

export default function ProfiloPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/profilo/"
        title="Il mio profilo"
        description="Apre il profilo Discord di chi visita il link."
      />
      <Suspense>
        <MyProfileRedirect />
      </Suspense>
    </SiteShell>
  );
}

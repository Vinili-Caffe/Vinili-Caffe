import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Suspense } from "react";
import { MyProfileRedirect } from "@/components/profile/MyProfileRedirect";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/profilo/", title: "Il mio profilo", description: "Apre il tuo profilo su Vinili & Caffè." }),
  robots: { index: false },
};

export default function ProfiloPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/profilo/"
        title="Il mio profilo"
        description="Apre il tuo profilo su Vinili & Caffè."
      />
      <Suspense>
        <MyProfileRedirect />
      </Suspense>
    </SiteShell>
  );
}

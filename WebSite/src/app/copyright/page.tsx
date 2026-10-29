import type { Metadata } from "next";
import { Copyright } from "lucide-react";
import { LegalPage } from "@/components/legal/LegalPage";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { LEGAL_COPYRIGHT } from "@/lib/legal-docs";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/copyright/", title: "Copyright e Licenza", description: "Avvisi ufficiali di proprietà intellettuale e licenza proprietaria di Vinili & Caffè." }),
};

export default function CopyrightPage() {
  const doc = LEGAL_COPYRIGHT;
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/copyright/"
        title="Copyright e Licenza"
        description="Avvisi ufficiali di proprietà intellettuale e licenza proprietaria di Vinili & Caffè."
      />
      <PageHero
        icon={<Copyright />}
        kicker="Legale"
        title="Copyright e"
        accent="Licenza"
        text={doc.subtitle ?? undefined}
      />
      <LegalPage doc={doc} />
    </SiteShell>
  );
}

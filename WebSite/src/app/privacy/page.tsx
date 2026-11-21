import type { Metadata } from "next";
import { Shield } from "lucide-react";
import { LegalPage } from "@/components/legal/LegalPage";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { LEGAL_PRIVACY } from "@/lib/legal-docs";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/privacy/", title: "Privacy Policy", description: "Quali dati raccoglie Vinili & Caffè tramite sito, bot e server Discord, perché li usa e come puoi chiederne copia o cancellazione." }),
};

export default function PrivacyPage() {
  const doc = LEGAL_PRIVACY;
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/privacy/"
        title="Privacy Policy"
        description="Quali dati raccoglie Vinili & Caffè tramite sito, bot e server Discord, perché li usa e come puoi chiederne copia o cancellazione."
      />
      <PageHero
        icon={<Shield />}
        kicker="Legale"
        title="Privacy"
        accent="Policy"
        text={
          doc.updatedIso && doc.updatedLabel
            ? `${doc.updatedPrefix} ${doc.updatedLabel}`
            : undefined
        }
      />
      <LegalPage doc={doc} />
    </SiteShell>
  );
}

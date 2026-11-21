import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { LegalPage } from "@/components/legal/LegalPage";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { LEGAL_TERMS } from "@/lib/legal-docs";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/terms/", title: "Termini di servizio", description: "Le condizioni d’uso del sito, dei bot e della community Discord di Vinili & Caffè." }),
};

export default function TermsPage() {
  const doc = LEGAL_TERMS;
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/terms/"
        title="Termini di servizio"
        description="Le condizioni d’uso del sito, dei bot e della community Discord di Vinili & Caffè."
      />
      <PageHero
        icon={<FileText />}
        kicker="Legale"
        title="Termini di"
        accent="servizio"
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

import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { LegalPage } from "@/components/legal/LegalPage";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { LEGAL_TERMS } from "@/lib/legal-docs";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/terms/", title: "Termini di Servizio", description: "Termini di Servizio di Vinili & Caffè per sito, bot Discord e community." }),
};

export default function TermsPage() {
  const doc = LEGAL_TERMS;
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/terms/"
        title="Termini di Servizio"
        description="Termini di Servizio di Vinili & Caffè per sito, bot Discord e community."
      />
      <PageHero
        icon={<FileText />}
        kicker="Legale"
        title="Termini di"
        accent="Servizio"
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

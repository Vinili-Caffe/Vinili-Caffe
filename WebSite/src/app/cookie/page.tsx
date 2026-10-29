import type { Metadata } from "next";
import { Cookie } from "lucide-react";
import { LegalPage } from "@/components/legal/LegalPage";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { LEGAL_COOKIE } from "@/lib/legal-docs";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/cookie/", title: "Cookie Policy", description: "Cookie e tecnologie simili usati sul sito Vinili & Caffè: sessione, preferenze, sicurezza e misurazione." }),
};

export default function CookiePage() {
  const doc = LEGAL_COOKIE;
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/cookie/"
        title="Cookie Policy"
        description="Cookie e tecnologie simili usati sul sito Vinili & Caffè: sessione, preferenze, sicurezza e misurazione."
      />
      <PageHero
        icon={<Cookie />}
        kicker="Legale"
        title="Cookie"
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

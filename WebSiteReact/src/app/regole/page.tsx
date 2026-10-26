import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { RulesBrowser } from "@/components/rules/RulesBrowser";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildRules } from "@/lib/rules";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/regole/", title: "Regole", description: "Il regolamento di Vinili & Caffè: regole generali, chat testuali e vocali, sanzioni." }),
};

export default async function RegolePage() {
  const rules = await loadBuildRules();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/regole/"
        title="Regole"
        description="Il regolamento di Vinili & Caffè: regole generali, chat testuali e vocali, sanzioni."
      />
      <PageHero
        icon={<ScrollText />}
        kicker="Community & moderazione"
        title="Il"
        accent="regolamento"
        text="Poche regole chiare per tenere il server sicuro e piacevole per tutti. Scegli una sezione e leggile una per una."
      />
      <RulesBrowser initial={rules} />
    </SiteShell>
  );
}

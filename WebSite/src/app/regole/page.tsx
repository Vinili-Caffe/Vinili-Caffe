import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { RulesBrowser } from "@/components/rules/RulesBrowser";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildRules } from "@/lib/rules";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

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
        kicker="Community"
        title="Il"
        accent="regolamento"
        text="Poche regole, scritte chiare. Sotto trovi il testo completo. In dubbio: chat o ticket."
      />
      <section className="mx-auto max-w-4xl px-6 pb-10">
        <p className="text-lg leading-relaxed text-crema/70">
          Rispetta le persone e l’atmosfera del server. Spam, molestie, truffe, contenuti illegali e roba che rovina le vocali non passano. Le sanzioni dipendono da cosa è successo e da quanto capita spesso: non c’è una tabella fissa. Domande?{" "}
          <SmartLink href={page("/faq/")} className="font-medium text-caramel underline decoration-caramel/40 underline-offset-4 hover:text-ember">
            FAQ
          </SmartLink>
          {" "}o{" "}
          <SmartLink href={page("/tickets/")} className="font-medium text-caramel underline decoration-caramel/40 underline-offset-4 hover:text-ember">
            ticket
          </SmartLink>
          .
        </p>
      </section>
      <RulesBrowser initial={rules} />
    </SiteShell>
  );
}
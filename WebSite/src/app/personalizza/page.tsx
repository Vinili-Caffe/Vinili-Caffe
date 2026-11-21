import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Suspense } from "react";
import { Disc3 } from "lucide-react";
import { PersonalizzaBoard } from "@/components/personalizza/PersonalizzaBoard";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/personalizza/", title: "Personalizza", description: "Modifica dal sito il tuo profilo su Vinili & Caffè: rank card, ruoli personalizzati, stanza vocale privata, colori e reazioni." }),
};

export default function PersonalizzaPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/personalizza/"
        title="Personalizza"
        description="Modifica dal sito il tuo profilo su Vinili & Caffè: rank card, ruoli personalizzati, stanza vocale privata, colori e reazioni."
      />
      <PageHero
        icon={<Disc3 />}
        kicker="Profilo"
        title="Personalizza"
        accent="il profilo"
        text="Da qui cambi la tua rank card, i ruoli personalizzati, le impostazioni della privacy e il resto del profilo, senza scrivere comandi."
      />
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl px-6 pb-20">
            <div className="h-40 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10" />
          </div>
        }
      >
        <PersonalizzaBoard />
      </Suspense>
    </SiteShell>
  );
}

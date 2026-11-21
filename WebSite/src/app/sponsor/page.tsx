import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Megaphone } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { SponsorBoard } from "@/components/sponsor/SponsorBoard";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/sponsor/", title: "Sponsor", description: "Sponsorizza il tuo server su Vinili & Caffè: un canale dedicato e uno spazio sul sito, con durate e prezzi indicati." }),
};

export default function SponsorPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/sponsor/"
        title="Sponsor"
        description="Sponsorizza il tuo server su Vinili & Caffè: un canale dedicato e uno spazio sul sito, con durate e prezzi indicati."
      />
      <PageHero
        icon={<Megaphone />}
        kicker="Collaborazioni"
        title="Metti in mostra"
        accent="il tuo server"
        text="Scegli il tipo di sponsorizzazione e quanto deve durare: il prezzo lo vedi subito. Quando hai deciso, apri un ticket con l'High Staff e vi accordate sui dettagli."
      />
      <SponsorBoard />
    </SiteShell>
  );
}

import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Megaphone } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { SponsorBoard } from "@/components/sponsor/SponsorBoard";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/sponsor/", title: "Sponsor", description: "Collaborazioni a pagamento: canale privato e vetrina sul sito." }),
};

export default function SponsorPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/sponsor/"
        title="Sponsor"
        description="Collaborazioni a pagamento: canale privato e vetrina sul sito."
      />
      <PageHero
        icon={<Megaphone />}
        kicker="Collaborazioni"
        title="Metti in mostra"
        accent="il tuo server"
        text="Tipologie, durate e prezzi delle sponsor: componi la tua e apri un ticket High Staff per i dettagli."
      />
      <SponsorBoard />
    </SiteShell>
  );
}

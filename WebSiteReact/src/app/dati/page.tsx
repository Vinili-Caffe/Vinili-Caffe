import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Database } from "lucide-react";
import { DatiBoard } from "@/components/dati/DatiBoard";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/dati/", title: "I tuoi dati", description: "Esporta una copia o richiedi la cancellazione dei dati collegati al tuo account Discord." }),
};

export default function DatiPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/dati/"
        title="I tuoi dati"
        description="Esporta una copia o richiedi la cancellazione dei dati collegati al tuo account Discord."
      />
      <PageHero
        icon={<Database />}
        kicker="Legale"
        title="I tuoi"
        accent="dati"
        text="Esporta una copia o richiedi la cancellazione dei dati collegati al tuo account Discord."
      />
      <DatiBoard />
    </SiteShell>
  );
}

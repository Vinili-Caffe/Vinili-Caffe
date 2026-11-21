import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Scale } from "lucide-react";
import { AppelliBoard } from "@/components/appelli/AppelliBoard";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/appelli/", title: "Appelli", description: "Chiedi la revoca di un ban o di un mute ricevuto sul server Discord di Vinili & Caffè." }),
};

export default function AppelliPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/appelli/"
        title="Appelli"
        description="Richiedi l"
      />
      <PageHero
        icon={<Scale />}
        kicker="Richieste allo staff"
        title="Una seconda"
        accent="possibilità"
        text="Se sei stato bannato o silenziato e pensi di meritare un'altra possibilità, racconta cosa è successo. Lo staff legge ogni richiesta e decide caso per caso."
      />
      <AppelliBoard />
    </SiteShell>
  );
}

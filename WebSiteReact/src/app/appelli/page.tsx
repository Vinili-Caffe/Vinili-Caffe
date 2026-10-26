import type { Metadata } from "next";
import { pageSocialMeta } from "@/lib/og";
import { Scale } from "lucide-react";
import { AppelliBoard } from "@/components/appelli/AppelliBoard";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/appelli/", title: "Appelli", description: "Richiedi l'unban o l'unmute dal server Discord di Vinili & Caffè." }),
};

export default function AppelliPage() {
  return (
    <SiteShell>
      <PageHero
        icon={<Scale />}
        kicker="Richieste allo staff"
        title="Una seconda"
        accent="possibilità"
        text="Richiedi l'unban o l'unmute del tuo account: spiega cosa è successo e lo staff valuterà la tua richiesta."
      />
      <AppelliBoard />
    </SiteShell>
  );
}

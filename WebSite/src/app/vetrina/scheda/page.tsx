import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { VetrinaGate, VetrinaShell } from "@/components/vetrina/VetrinaChrome";

const ListingPage = nextDynamic(() => import("@/components/vetrina/ListingPage").then((m) => m.ListingPage), { loading: () => null });

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/scheda/", title: "Vetrina · Scheda", description: "La scheda di un server o di un bot nella Vetrina di Vinili & Caffè." }),
};

/**
 * Con `output: "export"` i query ?slug= non possono avere metadata dinamici a build.
 * ListingPage aggiorna title + meta OG lato client per le anteprime in-app;
 * Discord/Telegram vedono comunque banner/icon se l’utente apre la scheda già caricata.
 */
export default function Page() {
  return (
    <VetrinaShell>
      <DiscordComponentEmbed
        path="/vetrina/scheda/"
        title="Vetrina · Scheda"
        description="La scheda di un server o di un bot nella Vetrina di Vinili & Caffè."
      />
      <VetrinaGate allowLoggedInPreview>
        <ListingPage />
      </VetrinaGate>
    </VetrinaShell>
  );
}

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaHero } from "@/components/bacheca/VetrinaHero";

const SubmitListing = dynamic(() => import("@/components/bacheca/SubmitListing").then((m) => m.SubmitListing), {
  loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/vetrina/invia/",
    title: "Vetrina · Invia",
    description: "Invia una scheda server o bot alla Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/invia/"
        title="Vetrina · Invia"
        description="Invia una scheda server o bot alla Vetrina."
      />
      <VetrinaHero
        kicker="Invia"
        title={
          <>
            Spazio
            <br />
            sullo scaffale
          </>
        }
        text="Scrivi la scheda, mandala. Poi aspetta la revisione: se passa, sei dietro il vetro."
      />
      <SubmitListing />
    </SiteShell>
  );
}

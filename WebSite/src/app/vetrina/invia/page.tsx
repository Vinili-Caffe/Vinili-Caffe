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
    description: "Invia la scheda del tuo server o bot alla Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/invia/"
        title="Vetrina · Invia"
        description="Invia la scheda del tuo server o bot alla Vetrina."
      />
      <VetrinaHero
        kicker="Vetrina · Invia"
        title={
          <>
            Metti
            <br />
            <span className="text-caramel/90">la tua scheda</span>
          </>
        }
        text="Compili, mandi, aspetti la revisione. Se passa, entri in vetrina — niente scorciatoie."
      />
      <SubmitListing />
    </SiteShell>
  );
}

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaHero } from "@/components/bacheca/VetrinaHero";

const Guidelines = dynamic(() => import("@/components/bacheca/Guidelines").then((m) => m.Guidelines), {
  loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/vetrina/linee-guida-recensioni/",
    title: "Vetrina · Linee guida recensioni",
    description: "Come scrivere recensioni utili nella Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/linee-guida-recensioni/"
        title="Vetrina · Linee guida recensioni"
        description="Come scrivere recensioni utili nella Vetrina."
      />
      <VetrinaHero
        kicker="Vetrina · Recensioni"
        title={
          <>
            Scrivi
            <br />
            <span className="text-caramel/90">cose utili</span>
          </>
        }
        text="Le regole sono poche e chiare: recensioni vere, senza spam, senza attacchi. Il resto lo fa lo staff."
      />
      <Guidelines />
    </SiteShell>
  );
}

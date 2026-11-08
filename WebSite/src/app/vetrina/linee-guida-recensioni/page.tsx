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
    description: "Regole per le recensioni in Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/linee-guida-recensioni/"
        title="Vetrina · Linee guida recensioni"
        description="Regole per le recensioni in Vetrina."
      />
      <VetrinaHero
        kicker="Recensioni"
        title={
          <>
            Regole
            <br />
            corte
          </>
        }
        text="Utile, onesta, senza spam. Il resto lo legge lo staff."
      />
      <Guidelines />
    </SiteShell>
  );
}

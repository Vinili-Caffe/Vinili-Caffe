import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaHero } from "@/components/bacheca/VetrinaHero";

const ModQueue = dynamic(() => import("@/components/bacheca/ModQueue").then((m) => m.ModQueue), {
  loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/vetrina/mod/",
    title: "Mod Vetrina",
    description: "Coda moderazione della Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/mod/"
        title="Mod Vetrina"
        description="Coda moderazione della Vetrina."
      />
      <VetrinaHero
        kicker="Staff · Vetrina"
        title={
          <>
            Coda
            <br />
            <span className="text-caramel/90">in revisione</span>
          </>
        }
        text="Qui si decide cosa entra dietro il vetro. Approva, rimanda, o chiudi con un motivo."
      />
      <ModQueue />
    </SiteShell>
  );
}

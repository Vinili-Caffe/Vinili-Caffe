import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SiteShell } from "@/components/SiteShell";
import { VetrinaHero } from "@/components/bacheca/VetrinaHero";

const MyListings = dynamic(() => import("@/components/bacheca/MyListings").then((m) => m.MyListings), {
  loading: () => null,
});

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/vetrina/le-mie/",
    title: "Vetrina · Le mie schede",
    description: "Le tue schede in Vetrina.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/le-mie/"
        title="Vetrina · Le mie schede"
        description="Le tue schede in Vetrina."
      />
      <VetrinaHero
        kicker="Le mie"
        title={
          <>
            Quello
            <br />
            che hai messo
          </>
        }
        text="Bozze, in revisione, già fuori. Tutto il tuo pezzo di scaffale."
      />
      <MyListings />
    </SiteShell>
  );
}

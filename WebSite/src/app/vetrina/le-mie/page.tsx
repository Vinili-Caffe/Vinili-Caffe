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
    description: "Le tue schede in Vetrina: bozze, in revisione, pubblicate.",
  }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/le-mie/"
        title="Vetrina · Le mie schede"
        description="Le tue schede in Vetrina: bozze, in revisione, pubblicate."
      />
      <VetrinaHero
        kicker="Vetrina · Le mie"
        title={
          <>
            Le tue
            <br />
            <span className="text-caramel/90">schede</span>
          </>
        }
        text="Bozze da finire, cose in revisione, e quelle già dietro il vetro."
      />
      <MyListings />
    </SiteShell>
  );
}

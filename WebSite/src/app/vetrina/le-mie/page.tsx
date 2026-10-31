import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Library } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const MyListings = dynamic(
  () => import("@/components/bacheca/MyListings").then((m) => m.MyListings),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/le-mie/", title: "Vetrina · Le mie schede", description: "Le tue schede in Vetrina Vinili & Caffè." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/le-mie/"
        title="Vetrina · Le mie schede"
        description="Le tue schede in Vetrina Vinili & Caffè."
      />
      <PageHero
        icon={<Library />}
        kicker="Vetrina"
        title="I tuoi"
        accent="dischi"
        text="Bozze, in revisione e pubblicate."
      />
      <MyListings />
    </SiteShell>
  );
}
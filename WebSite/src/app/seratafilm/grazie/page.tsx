import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Film } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { GrazieBoard } from "@/components/seratafilm/GrazieBoard";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/seratafilm/grazie/", title: "Grazie ǀ Serata Film", description: "Fine della serata — grazie per esserci stati." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/seratafilm/grazie/"
        title="Grazie ǀ Serata Film"
        description="Fine della serata — grazie per esserci stati."
      />
      <PageHero icon={<Film />} kicker="Serata film" title="Grazie" accent="per la visione" />
      <GrazieBoard />
    </SiteShell>
  );
}
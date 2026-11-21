import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { WikiBrowser } from "@/components/wiki/WikiBrowser";
import { loadBuildWiki } from "@/lib/wiki";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/wiki/", title: "Wiki", description: "I comandi dei bot Vinili, Caffè e Groove spiegati uno per uno: musica in vocale, livelli, statistiche, voce sintetica e minigiochi." }),
};

export default async function WikiPage() {
  const wiki = await loadBuildWiki();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/wiki/"
        title="Wiki"
        description="I comandi dei bot Vinili, Caffè e Groove spiegati uno per uno: musica in vocale, livelli, statistiche, voce sintetica e minigiochi."
      />
      <PageHero
        icon={<BookOpen />}
        kicker="Wiki dei bot"
        title="La guida ai"
        accent="comandi"
        text="Ogni comando dei nostri bot con due righe che dicono a cosa serve. Tocca quello che ti interessa: si copia da solo e lo incolli su Discord."
      />
      <WikiBrowser initial={wiki} />
    </SiteShell>
  );
}

import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { WikiBrowser } from "@/components/wiki/WikiBrowser";
import { loadBuildWiki } from "@/lib/wiki";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/wiki/", title: "Wiki", description: "Tutti i comandi dei bot Vinili e Caffè: musica, livelli, statistiche, TTS e minigames." }),
};

export default async function WikiPage() {
  const wiki = await loadBuildWiki();
  return (
    <SiteShell>
      <PageHero
        icon={<BookOpen />}
        kicker="Wiki dei bot"
        title="Il menù dei"
        accent="comandi"
        text="Tutti i comandi dei nostri bot, pronti da copiare. Tocca uno e incollalo su Discord."
      />
      <WikiBrowser initial={wiki} />
    </SiteShell>
  );
}

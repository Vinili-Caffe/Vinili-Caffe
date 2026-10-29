import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Clapperboard } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { SerataBoard } from "@/components/seratafilm/SerataBoard";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/seratafilm/", title: "Serata Film", description: "Serata film di Vinili & Caffè su Discord: countdown e streaming." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/seratafilm/"
        title="Serata Film"
        description="Serata film di Vinili & Caffè su Discord: countdown e streaming."
      />
      <PageHero
        icon={<Clapperboard />}
        kicker="Eventi"
        title="Serata"
        accent="film"
        text="Locandina e countdown: la serata film del sabato sera su Discord."
      />
      <SerataBoard />
    </SiteShell>
  );
}
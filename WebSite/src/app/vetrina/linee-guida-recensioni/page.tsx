import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { ScrollText } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const Guidelines = dynamic(
  () => import("@/components/bacheca/Guidelines").then((m) => m.Guidelines),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/linee-guida-recensioni/", title: "Vetrina · Linee guida recensioni", description: "Linee guida per le recensioni in Vetrina." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/linee-guida-recensioni/"
        title="Vetrina · Linee guida recensioni"
        description="Linee guida per le recensioni in Vetrina."
      />
      <PageHero
        icon={<ScrollText />}
        kicker="Vetrina"
        title="Linee guida"
        accent="recensioni"
        text="Regole per le recensioni sulle schede della Vetrina."
      />
      <Guidelines />
    </SiteShell>
  );
}
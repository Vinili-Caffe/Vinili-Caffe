import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Bot } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const BoardsBrowse = dynamic(
  () => import("@/components/bacheca/BoardsBrowse").then((m) => m.BoardsBrowse),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/bacheca/bot/", title: "Bot in Bacheca", description: "Bot Discord in Bacheca Vinili & Caffè." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/bacheca/bot/"
        title="Bot in Bacheca"
        description="Bot Discord in Bacheca Vinili & Caffè."
      />
      <PageHero
        icon={<Bot />}
        kicker="Bacheca"
        title="Scaffale"
        accent="bot"
        text="I bot in vetrina: cerca, filtra e apri la scheda."
      />
      <BoardsBrowse initialKind="bot" />
    </SiteShell>
  );
}
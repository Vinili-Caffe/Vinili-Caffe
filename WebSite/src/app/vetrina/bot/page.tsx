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
  ...pageSocialMeta({ path: "/vetrina/bot/", title: "Bot in Vetrina", description: "Bot Discord in Vetrina Vinili & Caffè." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/bot/"
        title="Bot in Vetrina"
        description="Bot Discord in Vetrina Vinili & Caffè."
      />
      <PageHero
        icon={<Bot />}
        kicker="Vetrina"
        title="Scaffale"
        accent="bot"
        text="I bot in vetrina: cerca, filtra e apri la scheda."
      />
      <BoardsBrowse initialKind="bot" />
    </SiteShell>
  );
}
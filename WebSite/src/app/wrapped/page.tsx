import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { WrappedBoard } from "@/components/wrapped/WrappedBoard";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/wrapped/",
    title: "Vinili Wrapped",
    description: "Il tuo disco community su Vinili & Caffè.",
  }),
  robots: { index: false, follow: false },
};

/** Fuori menu — hero sito + story immersiva solo dopo “Gira il vinile”. */
export default function WrappedPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/wrapped/"
        title="Vinili Wrapped"
        description="Preview studio — non ancora in menu."
      />
      <WrappedBoard />
    </SiteShell>
  );
}

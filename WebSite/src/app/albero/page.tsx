import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { AlberoBoard } from "@/components/albero/AlberoBoard";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/albero/",
    title: "Albero di Natale",
    description: "Appendi la tua palla sull'albero della community Vinili & Caffè.",
  }),
  robots: { index: false, follow: false },
};

export default function AlberoPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/albero/"
        title="Albero di Natale"
        description="Appendi la tua palla sull'albero della community."
      />
      <AlberoBoard />
    </SiteShell>
  );
}

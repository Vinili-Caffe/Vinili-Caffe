import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { MusicQuizGate } from "@/components/music-quiz/MusicQuizGate";
import { pageSocialMeta } from "@/lib/og";

const MusicQuizPartyPageClient = dynamic(() =>
  import("@/components/music-quiz/MusicQuizPartyPageClient").then((m) => m.MusicQuizPartyPageClient),
);

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/music-quiz/party/",
    title: "Music Quiz Party",
    description: "Stanza party/stream Music Quiz.",
  }),
  robots: { index: false, follow: false },
};

export default function MusicQuizPartyPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/music-quiz/party/" title="Music Quiz Party" description="Party room." />
      <MusicQuizGate>
        <Suspense fallback={null}>
          <MusicQuizPartyPageClient />
        </Suspense>
      </MusicQuizGate>
    </SiteShell>
  );
}

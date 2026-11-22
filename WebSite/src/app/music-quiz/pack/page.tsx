import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { MusicQuizGate } from "@/components/music-quiz/MusicQuizGate";
import { pageSocialMeta } from "@/lib/og";

const MusicQuizPackPageClient = dynamic(() =>
  import("@/components/music-quiz/MusicQuizPackPageClient").then((m) => m.MusicQuizPackPageClient),
);

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/music-quiz/pack/",
    title: "Music Quiz",
    description: "Setup e partita Music Quiz.",
  }),
  robots: { index: false, follow: false },
};

export default function MusicQuizPackPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/music-quiz/pack/" title="Music Quiz" description="Pack Music Quiz." />
      <MusicQuizGate>
        <Suspense fallback={null}>
          <MusicQuizPackPageClient />
        </Suspense>
      </MusicQuizGate>
    </SiteShell>
  );
}

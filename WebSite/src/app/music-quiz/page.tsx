import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { MusicQuizGate } from "@/components/music-quiz/MusicQuizGate";
import { pageSocialMeta } from "@/lib/og";

const MusicQuizHub = dynamic(() => import("@/components/music-quiz/MusicQuizHub").then((m) => m.MusicQuizHub));

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/music-quiz/",
    title: "Music Quiz",
    description: "Indovina la canzone — anteprima High Staff.",
  }),
  robots: { index: false, follow: false },
};

export default function MusicQuizPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/music-quiz/"
        title="Music Quiz"
        description="Indovina la canzone — anteprima High Staff."
      />
      <MusicQuizGate>
        <MusicQuizHub />
      </MusicQuizGate>
    </SiteShell>
  );
}

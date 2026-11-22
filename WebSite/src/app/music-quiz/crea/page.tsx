import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { MusicQuizGate } from "@/components/music-quiz/MusicQuizGate";
import { pageSocialMeta } from "@/lib/og";

const MusicQuizCreate = dynamic(() =>
  import("@/components/music-quiz/MusicQuizCreate").then((m) => m.MusicQuizCreate),
);

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/music-quiz/crea/",
    title: "Crea Music Quiz",
    description: "Crea un quiz community — High Staff.",
  }),
  robots: { index: false, follow: false },
};

export default function MusicQuizCreatePage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/music-quiz/crea/" title="Crea Music Quiz" description="Quiz community." />
      <MusicQuizGate>
        <MusicQuizCreate />
      </MusicQuizGate>
    </SiteShell>
  );
}

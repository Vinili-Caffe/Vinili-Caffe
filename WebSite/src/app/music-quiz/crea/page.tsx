import type { Metadata } from "next";
import { Suspense } from "react";
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
    description: "Crea il tuo quiz con i brani che vuoi e fallo giocare a tutti.",
  }),
  robots: { index: false, follow: false },
};

export default function MusicQuizCreatePage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/music-quiz/crea/" title="Crea Music Quiz" description="Quiz community." />
      <MusicQuizGate>
        <Suspense fallback={null}>
          <MusicQuizCreate />
        </Suspense>
      </MusicQuizGate>
    </SiteShell>
  );
}

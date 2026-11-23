"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { page } from "@/lib/site";
import { MusicQuizPartyRoom } from "./MusicQuizPartyRoom";
import { MusicQuizPartyJoin } from "./MusicQuizPartyJoin";

export function MusicQuizPartyPageClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const roomId = String(sp.get("room") || "").replace(/\D/g, "").slice(0, 6);

  if (!roomId) {
    return (
      <MusicQuizPartyJoin
        onJoined={(id) => {
          router.replace(page(`/music-quiz/party/?room=${encodeURIComponent(id)}`));
        }}
      />
    );
  }

  return <MusicQuizPartyRoom roomId={roomId} />;
}

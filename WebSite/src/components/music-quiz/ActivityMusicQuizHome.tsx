"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { MusicQuizGate } from "@/components/music-quiz/MusicQuizGate";
import { isDiscordActivity } from "@/lib/discordActivity";

const MusicQuizHub = dynamic(() => import("@/components/music-quiz/MusicQuizHub").then((m) => m.MusicQuizHub));

/**
 * Nell'Attività Discord non si può fare location.replace verso /music-quiz/:
 * READY dell'SDK arriva una sola volta per iframe — un reload lascia ready() appeso.
 * Quindi sulla home (entry tipica del proxy discordsays) montiamo direttamente il quiz.
 */
export function ActivityMusicQuizHome({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState(false);
  useEffect(() => {
    setActivity(isDiscordActivity());
  }, []);

  if (activity) {
    return (
      <MusicQuizGate>
        <MusicQuizHub />
      </MusicQuizGate>
    );
  }
  return <>{children}</>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Play, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { subscribeSiteRealtime } from "@/lib/site-realtime";
import { activityInstanceId, activityInvite } from "@/lib/discordActivity";
import { loadActivityMusicQuizParty, type MusicQuizPartyRoom } from "@/lib/musicQuiz";

/** segna la stanza come «già entrata», così la stanza non chiede di nuovo il nome */
export function rememberPartyJoined(roomId: string) {
  try {
    const key = "vc_mq_party_joined_v1";
    const prev = JSON.parse(sessionStorage.getItem(key) || "[]") as string[];
    sessionStorage.setItem(key, JSON.stringify([...new Set([...(Array.isArray(prev) ? prev : []), roomId])]));
  } catch {
    /* ignore */
  }
}

/**
 * Dentro l'Attività di Discord: la partita di chi è nella stessa chiamata.
 * Se qualcuno l'ha già aperta si entra con un tocco, altrimenti si spiega come crearla.
 */
export function ActivityCallParty() {
  const { token } = useAuth();
  const router = useRouter();
  const [instance, setInstance] = useState<string | null>(null);
  const [room, setRoom] = useState<MusicQuizPartyRoom | null | undefined>(undefined);

  useEffect(() => setInstance(activityInstanceId()), []);

  const refresh = useCallback(async () => {
    if (!token || !instance) return;
    const r = await loadActivityMusicQuizParty(token, instance);
    if (r.ok) setRoom(r.data.room);
  }, [token, instance]);

  useEffect(() => {
    void refresh();
    if (!instance) return;
    const id = window.setInterval(() => void refresh(), 5000);
    const off = subscribeSiteRealtime((p) => {
      if (p.type === "music_quiz_party") void refresh();
    });
    return () => {
      window.clearInterval(id);
      off();
    };
  }, [refresh, instance]);

  if (!instance || room === undefined) return null;

  const live = room && room.status !== "finished" ? room : null;
  const host = live?.players.find((p) => p.userId === live.hostId);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 rounded-3xl bg-roast p-4 ring-1 ring-caramel/30 sm:flex-row sm:items-center"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-caramel text-ink">
        <Users className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-caramel">Partita in questa chiamata</p>
        {live ? (
          <>
            <p className="truncate font-display text-xl font-semibold text-crema">{live.packTitle}</p>
            <p className="text-xs text-crema/55">
              {host ? `${host.displayName} è l'host` : "In corso"} · {live.players.length}{" "}
              {live.players.length === 1 ? "giocatore" : "giocatori"}
              {live.status !== "lobby" ? " · già iniziata" : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-crema/70">
            Nessuna partita aperta. Scegli un quiz e premi <b className="text-crema">Con la chiamata</b>: gli altri entrano da qui.
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => void activityInvite()}
          className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-crema ring-1 ring-sand/25 transition hover:bg-crema/[0.08]"
        >
          <UserPlus className="size-4" aria-hidden /> Invita
        </button>
        {live ? (
          <button
            type="button"
            onClick={() => {
              rememberPartyJoined(live.roomId);
              router.push(page(`/music-quiz/party/?room=${encodeURIComponent(live.roomId)}`));
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-caramel px-5 text-xs font-semibold text-ink"
          >
            <Play className="size-4 fill-current" aria-hidden /> Entra
          </button>
        ) : null}
      </div>
    </motion.section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Hourglass, RotateCcw, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { preloadClips } from "@/lib/clipCache";
import { SmartLink } from "@/components/SmartLink";
import { subscribeSiteRealtime } from "@/lib/site-realtime";
import { isDiscordActivity } from "@/lib/discordActivity";
import {
  joinMusicQuizParty,
  loadMusicQuizParty,
  MUSIC_QUIZ_ANSWER_MS,
  musicQuizPartyAction,
  type MusicQuizPartyPlayer as Player,
  type MusicQuizPartyRoom as Room,
} from "@/lib/musicQuiz";
import { AnswerGrid, GameStage, QuizTurntable, RevealCard, useCountdown, useQuizClip } from "./QuizStage";
import { MusicQuizPartyLobby } from "./MusicQuizPartyLobby";
import { MusicQuizPartyJoin } from "./MusicQuizPartyJoin";
import { ChatButton, ChatDrawer, useUnread } from "./PartyChat";
import { FloatingReactions, ReactionBar } from "./PartyReactions";

const JOINED_KEY = "vc_mq_party_joined_v1";

function joinedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(JOINED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function markJoined(roomId: string) {
  const s = joinedSet();
  s.add(roomId);
  try {
    sessionStorage.setItem(JOINED_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export function MusicQuizPartyRoom({ roomId }: { roomId: string }) {
  const { token, user } = useAuth();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  /* dentro Discord si entra subito con il proprio nome: niente schermata «Entra» */
  const [entered, setEntered] = useState(() => joinedSet().has(roomId) || isDiscordActivity());
  const upcomingKey = (room?.upcoming || []).join("|");
  useEffect(() => {
    if (upcomingKey) preloadClips(upcomingKey.split("|"));
  }, [upcomingKey]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const me = user?.id || "";
  const [chatOpen, setChatOpen] = useState(false);
  const unread = useUnread(room?.chat || [], me, chatOpen);
  /* se ero nella stanza e non ci sono più, l'host mi ha tolto */
  const wasIn = useRef(false);
  const inRoom = !!room && room.players.some((p) => p.userId === me);
  if (inRoom) wasIn.current = true;
  const removed = !!room && !!me && wasIn.current && !inRoom;

  /* Host appena creato / già in stanza: salta la schermata Entra */
  useEffect(() => {
    if (!token || !me || entered) return;
    let alive = true;
    void loadMusicQuizParty(token, roomId).then((r) => {
      if (!alive || !r.ok) return;
      if (r.data.room.players.some((p) => p.userId === me)) {
        markJoined(roomId);
        setRoom(r.data.room);
        setEntered(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [token, roomId, me, entered]);

  const refresh = useCallback(async () => {
    if (!token || !entered) return;
    const r = await loadMusicQuizParty(token, roomId);
    if (r.ok) setRoom(r.data.room);
    else setErr(r.message);
  }, [token, roomId, entered]);

  useEffect(() => {
    if (!token || !entered) return;
    let alive = true;
    void joinMusicQuizParty(token, roomId).then(async (j) => {
      if (!alive) return;
      if (j.ok) return setRoom(j.data.room);
      const r = await loadMusicQuizParty(token, roomId);
      if (!alive) return;
      if (r.ok) setRoom(r.data.room);
      else setErr(r.message || j.message);
    });
    return () => {
      alive = false;
    };
  }, [token, roomId, entered]);

  useEffect(
    () =>
      subscribeSiteRealtime((p) => {
        if (p.type === "music_quiz_party" && (!p.roomId || p.roomId === roomId)) void refresh();
      }),
    [refresh, roomId],
  );
  useEffect(() => {
    if (!entered) return;
    const id = window.setInterval(() => void refresh(), room?.status === "playing" ? 2500 : 5000);
    return () => window.clearInterval(id);
  }, [refresh, room?.status, entered]);

  async function act(action: string, extra?: Record<string, unknown>) {
    if (!token || busy) return;
    setBusy(true);
    const r = await musicQuizPartyAction(token, roomId, { action, ...extra });
    setBusy(false);
    if (r.ok) {
      setRoom(r.data.room);
      setErr("");
    } else setErr(r.message);
  }

  async function react(emoji: string) {
    if (!token) return;
    const r = await musicQuizPartyAction(token, roomId, { action: "react", emoji });
    if (r.ok && r.data.room) setRoom(r.data.room);
  }

  function goAway() {
    if (isDiscordActivity()) router.replace(page("/"));
    else router.push(page("/music-quiz/"));
  }

  /* esce davvero dalla stanza (così l'host passa a un altro), poi torna ai quiz */
  async function leave() {
    wasIn.current = false;
    if (token) await musicQuizPartyAction(token, roomId, { action: "leave" }).catch(() => null);
    try {
      const s = joinedSet();
      s.delete(roomId);
      sessionStorage.setItem(JOINED_KEY, JSON.stringify([...s]));
    } catch {
      /* ignore */
    }
    goAway();
  }

  if (removed) {
    return (
      <div className={cn("mx-auto max-w-md px-4 pb-16 text-center", isDiscordActivity() ? "pt-10" : "pt-28 sm:pt-32")}>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-ember/15 text-ember">
          <UserX className="size-7" aria-hidden />
        </span>
        <p className="mt-4 font-display text-3xl font-semibold text-crema">Sei fuori dalla stanza</p>
        <p className="mt-2 text-sm text-crema/60">L&apos;host ti ha tolto da questa partita.</p>
        <SmartLink href={page("/music-quiz/")} className="mt-6 inline-flex rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-ink">
          Torna ai quiz
        </SmartLink>
      </div>
    );
  }

  if (!entered) {
    return (
      <MusicQuizPartyJoin
        roomId={roomId}
        onJoined={(id) => {
          markJoined(id);
          setEntered(true);
          if (id !== roomId) router.replace(page(`/music-quiz/party/?room=${encodeURIComponent(id)}`));
        }}
      />
    );
  }

  if (!room) {
    return (
      <div className="mx-auto max-w-md px-4 pb-16 pt-16 text-center">
        {err ? (
          <>
            <p className="font-display text-2xl text-crema">{err}</p>
            <SmartLink href={page("/music-quiz/")} className="mt-5 inline-flex rounded-full bg-caramel px-5 py-2.5 text-sm font-semibold text-ink">
              Torna ai quiz
            </SmartLink>
          </>
        ) : (
          <div className="mx-auto h-40 animate-pulse rounded-3xl bg-crema/[0.05]" />
        )}
      </div>
    );
  }

  /* entrato a partita in corso: aspetta che finisca, poi entra in automatico */
  if (room.meWaiting) {
    const total = room.totalRounds || room.round?.total || 0;
    return (
      <div className={cn("mx-auto max-w-md px-4 pb-16 text-center", isDiscordActivity() ? "pt-10" : "pt-28 sm:pt-32")}>
        <motion.span
          className="mx-auto grid size-20 place-items-center rounded-full bg-caramel/15 ring-1 ring-caramel/40"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Hourglass className="size-8 text-caramel" aria-hidden />
        </motion.span>
        <p className="mt-5 text-xs font-semibold text-caramel">Partita in corso</p>
        <p className="mt-2 font-display text-3xl font-semibold text-crema">{room.packTitle}</p>
        <p className="mt-2 text-sm text-crema/65">
          {total ? `Domanda ${Math.min(total, (room.roundIndex || 0) + 1)} di ${total} · ` : ""}
          {room.players.length} {room.players.length === 1 ? "giocatore" : "giocatori"}
        </p>
        <p className="mx-auto mt-5 max-w-sm rounded-2xl bg-roast/80 px-4 py-3 text-sm text-crema/80 ring-1 ring-sand/15">
          Sei in attesa: entri in gioco appena finisce questa partita, non serve fare niente.
        </p>
        {(room.waiting || []).length > 1 ? (
          <p className="mt-3 text-xs text-crema/50">Aspettano con te: {(room.waiting || []).filter((w) => w.userId !== me).map((w) => w.displayName).join(", ")}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void leave()}
          className="mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 transition hover:bg-crema/[0.06] hover:text-crema"
        >
          Esci
        </button>
      </div>
    );
  }

  const isHost = room.hostId === me;
  const invite =
    typeof window !== "undefined"
      ? `${window.location.origin}${page(`/music-quiz/party/?room=${encodeURIComponent(roomId)}`)}`
      : "";

  if (room.status === "lobby") {
    return (
      <>
        <MusicQuizPartyLobby
          room={room}
          me={me}
          invite={invite}
          busy={busy}
          onAct={act}
          onLeave={() => void leave()}
        />
        {err ? <p className="px-4 pb-6 text-center text-sm text-ember">{err}</p> : null}
      </>
    );
  }

  return (
    <div className={cn("mx-auto max-w-6xl space-y-6 px-4 pb-20", isDiscordActivity() ? "pt-6" : "pt-24 sm:pt-28")}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {room.status === "finished" ? (
            <Podium room={room} me={me} isHost={isHost} busy={busy} onRestart={() => void act("restart")} />
          ) : room.round ? (
            <PartyRound
              key={`${room.roundIndex}-${room.roundStartedAt}`}
              room={room}
              me={me}
              isHost={isHost}
              busy={busy}
              onAnswer={(choice, ms) => void act("answer", ms != null ? { choice, ms } : { choice })}
              onReveal={() => void act("reveal")}
              onNext={() => void act("next")}
            />
          ) : null}
          {room.settings?.chatEnabled !== false ? (
            <div className="mt-4 flex items-center gap-3 rounded-3xl bg-roast/70 p-3 ring-1 ring-sand/10">
              <div className="min-w-0 flex-1">
                <ReactionBar onReact={(emoji) => void react(emoji)} />
              </div>
              <ChatButton unread={unread} onClick={() => setChatOpen(true)} className="size-12" />
            </div>
          ) : null}
          {err ? <p className="mt-4 text-center text-sm text-ember">{err}</p> : null}
        </div>
        <Scoreboard room={room} me={me} />
      </div>
      <FloatingReactions reactions={room.reactions || []} me={me} />
      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        chat={room.chat || []}
        me={me}
        enabled={room.settings?.chatEnabled !== false}
        onSend={(text) => void act("chat", { text })}
      />
    </div>
  );
}

function PartyRound({
  room,
  me,
  isHost,
  busy,
  onAnswer,
  onReveal,
  onNext,
}: {
  room: Room;
  me: string;
  isHost: boolean;
  busy: boolean;
  onAnswer: (choice: number, ms?: number) => void;
  onReveal: () => void;
  onNext: () => void;
}) {
  const round = room.round!;
  const answerMs = room.answerMs || MUSIC_QUIZ_ANSWER_MS;
  const revealed = room.status === "round_result";
  /* presentazione: i brani si sentono solo dallo schermo dell'host, gli altri vedono le risposte */
  const presenting = !!room.settings?.presentationMode || room.mode === "stream";
  const hearsClip = !presenting || isHost;
  const clip = useQuizClip(hearsClip ? round.previewUrl : null, room.clipMs, `${room.roundIndex}-${room.roundStartedAt}`, round.start);
  const skew = useRef((room.serverNow || Date.now()) - Date.now());
  const serverStart = useMemo(
    () => performance.now() - (Date.now() + skew.current - room.roundStartedAt),
    [room.roundStartedAt],
  );
  const left = useCountdown(serverStart, answerMs, !revealed);
  const [picked, setPicked] = useState<number | null>(room.myChoice ?? null);
  /* chi presenta non risponde: non conta */
  const voters = presentingNow(room) ? room.players.filter((p) => p.userId !== room.hostId) : room.players;
  const answered = voters.filter((p) => p.hasAnswered).length;
  const canAnswer = !(presenting && isHost);

  useEffect(() => {
    if (revealed) clip.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const myPoints = room.players.find((p) => p.userId === me)?.lastPoints ?? 0;
  const autoNext = room.settings?.autoNext;

  return (
    <GameStage
      cover={room.packCover}
      top={
        <>
          <span className="text-xs font-semibold text-caramel">
            Domanda {room.roundIndex + 1} di {room.totalRounds}
          </span>
          <span className="text-sm text-crema/65">
            {answered} su {voters.length} hanno risposto
          </span>
        </>
      }
      side={
        <QuizTurntable
          cover={room.packCover}
          clip={clip.state}
          clipMs={room.clipMs}
          left={revealed ? answerMs : left}
          totalMs={answerMs}
          onReplay={clip.replay}
          note={hearsClip ? undefined : "Il brano suona dallo schermo di chi presenta."}
        />
      }
    >
      <p className="font-display text-3xl font-semibold text-crema">Che canzone è?</p>

      {canAnswer ? (
        <AnswerGrid
          options={round.options}
          disabled={revealed || picked != null || left <= 0}
          picked={picked}
          correctIndex={revealed ? round.correctIndex : null}
          timedOut={revealed && picked == null}
          onPick={(i) => {
            setPicked(i);
            /* chi non sente il brano: il tempo lo conta il server dall'inizio del round */
            if (!hearsClip) return onAnswer(i);
            const ms = clip.startedAt != null ? Math.round(performance.now() - clip.startedAt) : answerMs;
            onAnswer(i, ms);
          }}
        />
      ) : (
        <>
          {/* chi presenta mostra le risposte sul suo schermo, senza poterle scegliere */}
          <AnswerGrid
            options={round.options}
            disabled
            picked={null}
            correctIndex={revealed ? round.correctIndex : null}
            timedOut={false}
            onPick={() => {}}
          />
          <p className="text-sm text-crema/55">
            {room.mode === "stream" ? "Stai conducendo la diretta: aspetti le risposte degli altri." : "Stai presentando: fai sentire il brano a tutti e aspetta le risposte."}
          </p>
        </>
      )}

      {!revealed ? (
        isHost && room.mode === "stream" ? (
          <button
            type="button"
            disabled={busy}
            onClick={onReveal}
            className="self-start rounded-full px-3.5 py-1.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:bg-crema/[0.06]"
          >
            Mostra la risposta
          </button>
        ) : null
      ) : (
        <RevealCard
          show
          correct={picked != null && picked === round.correctIndex}
          timeout={picked == null}
          points={myPoints}
          title={round.title || ""}
          artist={round.artist || ""}
          cover={round.cover}
        >
          {isHost && !autoNext ? (
            <button
              type="button"
              disabled={busy}
              onClick={onNext}
              className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-caramel px-4 py-2 text-sm font-semibold text-ink"
            >
              {room.roundIndex + 1 >= room.totalRounds ? "Classifica" : "Avanti"} <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : autoNext ? (
            <span className="ml-2 text-xs text-crema/50">Prossimo round tra poco…</span>
          ) : null}
        </RevealCard>
      )}
    </GameStage>
  );
}

function presentingNow(room: Room) {
  return !!room.settings?.presentationMode || room.mode === "stream";
}

function Scoreboard({ room, me }: { room: Room; me: string }) {
  const revealed = room.status === "round_result";
  const presenting = !!room.settings?.presentationMode || room.mode === "stream";
  const list = presenting ? room.players.filter((p) => p.userId !== room.hostId) : room.players;
  const hidden = !!room.scoresHidden;
  return (
    <aside className="h-fit rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 lg:sticky lg:top-24">
      <h2 className="mb-3 text-xs font-semibold text-crema/55">
        Giocatori · {list.length}
      </h2>
      {hidden ? <p className="-mt-1 mb-3 text-xs text-crema/45">La classifica è nascosta: vedi solo i tuoi punti.</p> : null}
      <ol className="space-y-1.5">
        <AnimatePresence initial={false}>
          {list.map((p, i) => (
            <motion.li
              layout
              key={p.userId}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl px-2.5 py-2",
                p.userId === me ? "bg-caramel/10 ring-1 ring-caramel/30" : "bg-crema/[0.03]",
              )}
            >
              <span className="w-4 text-center text-xs font-semibold tabular-nums text-crema/50">{hidden ? "·" : i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatarUrl || "/images/logo-disco.png"} alt="" className="size-8 shrink-0 rounded-full object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-crema">{p.displayName}</span>
              <PlayerState p={p} room={room} revealed={revealed} />
              <span className="w-10 text-right font-display text-lg font-semibold tabular-nums text-caramel">
                {hidden && p.userId !== me ? "—" : p.score}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </aside>
  );
}

function PlayerState({ p, room, revealed }: { p: Player; room: Room; revealed: boolean }) {
  if (revealed) {
    return p.lastPoints ? (
      <span className="text-xs font-semibold tabular-nums text-emerald-300">+{p.lastPoints}</span>
    ) : (
      <span className="text-xs text-crema/35">—</span>
    );
  }
  if (room.status === "playing") {
    return p.hasAnswered ? (
      <Check className="size-4 text-emerald-300" aria-label="ha risposto" />
    ) : (
      <span className="size-2 animate-pulse rounded-full bg-crema/30" aria-label="sta pensando" />
    );
  }
  return null;
}

function Podium({
  room,
  me,
  isHost,
  busy,
  onRestart,
}: {
  room: Room;
  me: string;
  isHost: boolean;
  busy: boolean;
  onRestart: () => void;
}) {
  const presenting = !!room.settings?.presentationMode || room.mode === "stream";
  const ranked = presenting ? room.players.filter((p) => p.userId !== room.hostId) : room.players;
  const [first, second, third] = ranked;
  const order = [second, first, third].filter(Boolean) as Player[];
  /* classifica «Mai»: niente podio, solo i propri punti */
  if (room.scoresHidden) {
    const mine = room.players.find((p) => p.userId === me);
    return (
      <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 text-center ring-1 ring-sand/15 sm:p-10">
        <p className="text-xs font-semibold text-caramel">{room.packTitle}</p>
        <h1 className="mt-1 font-display text-4xl font-semibold text-crema">Partita finita</h1>
        <p className="mt-6 text-sm text-crema/55">La classifica è nascosta. I tuoi punti:</p>
        <p className="font-display text-6xl font-semibold tabular-nums text-caramel">{mine?.score ?? 0}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {isHost ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRestart}
              className="inline-flex items-center gap-2 rounded-full bg-caramel px-6 py-3 font-semibold text-ink disabled:opacity-60"
            >
              <RotateCcw className="size-4" aria-hidden /> Torna alla lobby
            </button>
          ) : null}
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 text-center ring-1 ring-sand/15 sm:p-10">
      <p className="text-xs font-semibold text-caramel">{room.packTitle}</p>
      <h1 className="mt-1 font-display text-4xl font-semibold text-crema">Classifica finale</h1>
      <div className="mt-10 flex items-end justify-center gap-3">
        {order.map((p) => {
          const place = p === first ? 1 : p === second ? 2 : 3;
          return (
            <motion.div
              key={p.userId}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: place === 1 ? 0.3 : place === 2 ? 0.15 : 0 }}
              className="flex w-28 flex-col items-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.avatarUrl || "/images/logo-disco.png"}
                alt=""
                className={cn("rounded-full object-cover ring-4", place === 1 ? "size-20 ring-caramel" : "size-16 ring-sand/30")}
              />
              <p className="mt-2 w-full truncate text-sm font-semibold text-crema">{p.displayName}</p>
              <p className="font-display text-xl font-semibold tabular-nums text-caramel">{p.score}</p>
              <div
                className={cn(
                  "mt-2 grid w-full place-items-center rounded-t-2xl font-display text-3xl font-semibold text-ink",
                  place === 1
                    ? "h-28 bg-caramel"
                    : place === 2
                      ? "h-20 bg-crema/70"
                      : "h-14 bg-ember/60",
                )}
              >
                {place}
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {isHost ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRestart}
            className="inline-flex items-center gap-2 rounded-full bg-caramel px-6 py-3 font-semibold text-ink disabled:opacity-60"
          >
            <RotateCcw className="size-4" aria-hidden /> Altra partita
          </button>
        ) : null}
        <SmartLink
          href={page("/music-quiz/")}
          className="rounded-full px-5 py-3 text-sm font-semibold text-crema/80 ring-1 ring-sand/25 transition hover:bg-crema/[0.06]"
        >
          Altri quiz
        </SmartLink>
      </div>
    </section>
  );
}

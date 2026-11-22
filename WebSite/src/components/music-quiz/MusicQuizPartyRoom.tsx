"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Copy, Crown, Play, RotateCcw, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { subscribeSiteRealtime } from "@/lib/site-realtime";
import {
  joinMusicQuizParty,
  loadMusicQuizParty,
  MUSIC_QUIZ_ANSWER_MS,
  musicQuizPartyAction,
  type MusicQuizPartyPlayer as Player,
  type MusicQuizPartyRoom as Room,
} from "@/lib/musicQuiz";
import { AnswerGrid, GameStage, QuizTurntable, RevealCard, useCountdown, useQuizClip } from "./QuizStage";

export function MusicQuizPartyRoom({ roomId }: { roomId: string }) {
  const { token, user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const me = user?.id || "";

  const refresh = useCallback(async () => {
    if (!token) return;
    const r = await loadMusicQuizParty(token, roomId);
    if (r.ok) setRoom(r.data.room);
    else setErr(r.message);
  }, [token, roomId]);

  /* entra nella stanza (o la riapre se ci sei già) */
  useEffect(() => {
    if (!token) return;
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
  }, [token, roomId]);

  /* aggiornamenti in tempo reale, più un controllo ogni pochi secondi se la connessione salta */
  useEffect(
    () =>
      subscribeSiteRealtime((p) => {
        if (p.type === "music_quiz_party" && (!p.roomId || p.roomId === roomId)) void refresh();
      }),
    [refresh, roomId],
  );
  useEffect(() => {
    const id = window.setInterval(() => void refresh(), room?.status === "playing" ? 2500 : 6000);
    return () => window.clearInterval(id);
  }, [refresh, room?.status]);

  async function act(action: string, extra?: { choice?: number; ms?: number }) {
    if (!token || busy) return;
    setBusy(true);
    const r = await musicQuizPartyAction(token, roomId, { action, ...extra });
    setBusy(false);
    if (r.ok) {
      setRoom(r.data.room);
      setErr("");
    } else setErr(r.message);
  }

  if (!room) {
    return (
      <div className="mx-auto max-w-md px-4 pb-16 pt-28 text-center">
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

  const isHost = room.hostId === me;
  const invite = typeof window !== "undefined" ? `${window.location.origin}${page(`/music-quiz/party/?room=${encodeURIComponent(roomId)}`)}` : "";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-20 pt-24 sm:pt-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SmartLink href={page(`/music-quiz/pack/?slug=${encodeURIComponent(room.packSlug)}`)} className="inline-flex items-center gap-1.5 text-sm text-crema/60 transition hover:text-crema">
          <ArrowLeft className="size-4" aria-hidden /> {room.packTitle}
        </SmartLink>
        <span className="rounded-full bg-crema/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-crema/70 ring-1 ring-sand/15">
          {room.mode === "stream" ? "In diretta" : "Con gli amici"} · ascolto di {room.clipMs / 1000} s
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {room.status === "lobby" ? (
            <Lobby room={room} isHost={isHost} invite={invite} copied={copied} busy={busy} onCopy={() => {
              void navigator.clipboard?.writeText(invite).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              });
            }} onStart={() => void act("start")} />
          ) : room.status === "finished" ? (
            <Podium room={room} isHost={isHost} busy={busy} onRestart={() => void act("restart")} />
          ) : room.round ? (
            <PartyRound key={`${room.roundIndex}-${room.roundStartedAt}`} room={room} me={me} isHost={isHost} busy={busy} onAnswer={(choice, ms) => void act("answer", { choice, ms })} onReveal={() => void act("reveal")} onNext={() => void act("next")} />
          ) : null}
          {err ? <p className="mt-4 text-center text-sm text-ember">{err}</p> : null}
        </div>
        <Scoreboard room={room} me={me} />
      </div>
    </div>
  );
}

function Lobby({ room, isHost, invite, copied, busy, onCopy, onStart }: { room: Room; isHost: boolean; invite: string; copied: boolean; busy: boolean; onCopy: () => void; onStart: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 text-center ring-1 ring-sand/15 sm:p-10">
      {room.packCover ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={room.packCover} alt="" className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-20 blur-2xl" />
      ) : null}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={room.packCover || "/images/logo-disco.png"} alt="" className="mx-auto size-28 rounded-3xl object-cover ring-1 ring-sand/20" />
        <h1 className="mt-4 font-display text-4xl font-semibold text-crema">{room.packTitle}</h1>
        <p className="mt-2 text-crema/65">
          {room.totalRounds} canzoni. {isHost ? "Manda il link a chi vuoi e avvia quando siete pronti." : "Aspetta che chi ha creato la stanza avvii la partita."}
        </p>
        <div className="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-full bg-espresso/80 p-1.5 pl-4 ring-1 ring-sand/20">
          <span className="min-w-0 flex-1 truncate text-left text-sm text-crema/70">{invite}</span>
          <button type="button" onClick={onCopy} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-crema/10 px-3.5 py-2 text-sm font-semibold text-crema transition hover:bg-crema/15">
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copiato" : "Copia link"}
          </button>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {room.players.map((p) => (
            <motion.span key={p.userId} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-2 rounded-full bg-crema/[0.07] py-1 pl-1 pr-3 text-sm text-crema ring-1 ring-sand/15">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatarUrl || "/images/logo-disco.png"} alt="" className="size-7 rounded-full object-cover" />
              {p.displayName}
              {p.userId === room.hostId ? <Crown className="size-3.5 text-caramel" aria-label="ha creato la stanza" /> : null}
            </motion.span>
          ))}
        </div>
        {isHost ? (
          <button
            type="button"
            disabled={busy}
            onClick={onStart}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-8 py-3.5 text-lg font-bold text-ink transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Play className="size-5 fill-current" aria-hidden /> Avvia la partita
          </button>
        ) : (
          <p className="mt-8 inline-flex items-center gap-2 text-sm text-crema/60">
            <Users className="size-4 animate-pulse" aria-hidden /> In attesa dell&apos;avvio…
          </p>
        )}
      </div>
    </section>
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
  onAnswer: (choice: number, ms: number) => void;
  onReveal: () => void;
  onNext: () => void;
}) {
  const round = room.round!;
  const answerMs = room.answerMs || MUSIC_QUIZ_ANSWER_MS;
  const revealed = room.status === "round_result";
  const clip = useQuizClip(round.previewUrl, room.clipMs, `${room.roundIndex}-${room.roundStartedAt}`);
  /* il tempo segue il server: parte da quando è iniziato il turno, non da quando il brano è arrivato qui */
  const skew = useRef((room.serverNow || Date.now()) - Date.now());
  const serverStart = useMemo(() => performance.now() - (Date.now() + skew.current - room.roundStartedAt), [room.roundStartedAt]);
  const left = useCountdown(serverStart, answerMs, !revealed);
  const [picked, setPicked] = useState<number | null>(room.myChoice ?? null);
  const answered = room.players.filter((p) => p.hasAnswered).length;

  useEffect(() => {
    if (revealed) clip.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const myPoints = room.players.find((p) => p.userId === me)?.lastPoints ?? 0;

  return (
    <GameStage
      cover={room.packCover}
      top={
        <>
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">
            Domanda {room.roundIndex + 1} di {room.totalRounds}
          </span>
          <span className="text-sm text-crema/65">
            {answered} su {room.players.length} hanno risposto
          </span>
        </>
      }
      side={<QuizTurntable cover={room.packCover} clip={clip.state} clipMs={room.clipMs} left={revealed ? answerMs : left} totalMs={answerMs} onReplay={clip.replay} />}
    >
      <p className="font-display text-3xl font-semibold text-crema">Che canzone è?</p>

      <AnswerGrid
        options={round.options}
        disabled={revealed || picked != null || left <= 0}
        picked={picked}
        correctIndex={revealed ? round.correctIndex : null}
        onPick={(i) => {
          setPicked(i);
          const ms = clip.startedAt != null ? Math.round(performance.now() - clip.startedAt) : answerMs;
          onAnswer(i, ms);
        }}
      />

      {!revealed ? (
        isHost && room.mode === "stream" ? (
          <button type="button" disabled={busy} onClick={onReveal} className="self-start rounded-full px-3.5 py-1.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:bg-crema/[0.06]">
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
          {isHost ? (
            <button type="button" disabled={busy} onClick={onNext} className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-bold text-ink">
              {room.roundIndex + 1 >= room.totalRounds ? "Classifica" : "Avanti"} <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : null}
        </RevealCard>
      )}
    </GameStage>
  );
}

function Scoreboard({ room, me }: { room: Room; me: string }) {
  const revealed = room.status === "round_result";
  return (
    <aside className="h-fit rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 lg:sticky lg:top-24">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-crema/55">Giocatori · {room.players.length}</h2>
      <ol className="space-y-1.5">
        <AnimatePresence initial={false}>
          {room.players.map((p, i) => (
            <motion.li
              layout
              key={p.userId}
              className={cn("flex items-center gap-2.5 rounded-2xl px-2.5 py-2", p.userId === me ? "bg-caramel/10 ring-1 ring-caramel/30" : "bg-crema/[0.03]")}
            >
              <span className="w-4 text-center text-xs font-bold tabular-nums text-crema/50">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatarUrl || "/images/logo-disco.png"} alt="" className="size-8 shrink-0 rounded-full object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-crema">{p.displayName}</span>
              <PlayerState p={p} room={room} revealed={revealed} />
              <span className="w-10 text-right font-display text-lg font-semibold tabular-nums text-caramel">{p.score}</span>
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
    return p.hasAnswered ? <Check className="size-4 text-emerald-300" aria-label="ha risposto" /> : <span className="size-2 animate-pulse rounded-full bg-crema/30" aria-label="sta pensando" />;
  }
  return null;
}

function Podium({ room, isHost, busy, onRestart }: { room: Room; isHost: boolean; busy: boolean; onRestart: () => void }) {
  const [first, second, third] = room.players;
  const order = [second, first, third].filter(Boolean) as Player[];
  return (
    <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 text-center ring-1 ring-sand/15 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">{room.packTitle}</p>
      <h1 className="mt-1 font-display text-4xl font-semibold text-crema">Classifica finale</h1>
      <div className="mt-10 flex items-end justify-center gap-3">
        {order.map((p) => {
          const place = p === first ? 1 : p === second ? 2 : 3;
          return (
            <motion.div key={p.userId} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: place === 1 ? 0.3 : place === 2 ? 0.15 : 0 }} className="flex w-28 flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatarUrl || "/images/logo-disco.png"} alt="" className={cn("rounded-full object-cover ring-4", place === 1 ? "size-20 ring-caramel" : "size-16 ring-sand/30")} />
              <p className="mt-2 w-full truncate text-sm font-semibold text-crema">{p.displayName}</p>
              <p className="font-display text-xl font-semibold tabular-nums text-caramel">{p.score}</p>
              <div className={cn("mt-2 grid w-full place-items-center rounded-t-2xl font-display text-3xl font-semibold text-ink", place === 1 ? "h-28 bg-gradient-to-b from-caramel to-ember" : place === 2 ? "h-20 bg-crema/70" : "h-14 bg-ember/60")}>{place}</div>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {isHost ? (
          <button type="button" disabled={busy} onClick={onRestart} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-bold text-ink disabled:opacity-60">
            <RotateCcw className="size-4" aria-hidden /> Altra partita
          </button>
        ) : null}
        <SmartLink href={page("/music-quiz/")} className="rounded-full px-5 py-3 text-sm font-semibold text-crema/80 ring-1 ring-sand/25 transition hover:bg-crema/[0.06]">
          Altri quiz
        </SmartLink>
      </div>
    </section>
  );
}

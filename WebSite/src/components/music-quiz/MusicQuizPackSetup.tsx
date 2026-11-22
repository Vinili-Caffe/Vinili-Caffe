"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Play, Radio, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import {
  createMusicQuizParty,
  loadMusicQuizPack,
  startMusicQuizSession,
  type MusicQuizDifficulty,
  type MusicQuizPackCard,
  type MusicQuizRound,
} from "@/lib/musicQuiz";
import { MusicQuizPlay } from "./MusicQuizPlay";
import { MusicQuizLeaderboard } from "./MusicQuizLeaderboard";
import { MusicQuizComments } from "./MusicQuizComments";

const DIFFS: { id: MusicQuizDifficulty; label: string; hint: string }[] = [
  { id: "5s", label: "5 secondi", hint: "Per scaldarsi" },
  { id: "3s", label: "3 secondi", hint: "Ci vuole orecchio" },
  { id: "1s", label: "1 secondo", hint: "Solo per esperti" },
];

const KIND_LABEL: Record<string, string> = { artist: "Artista", playlist: "Playlist", community: "Quiz della community" };

type Session = {
  sessionId: string;
  clipMs: number;
  answerMs?: number;
  packTitle: string;
  packCover?: string;
  difficulty: MusicQuizDifficulty;
  round: MusicQuizRound;
};

export function MusicQuizPackSetup({ slug }: { slug: string }) {
  const { token } = useAuth();
  const router = useRouter();
  const [pack, setPack] = useState<(MusicQuizPackCard & { trackCount?: number }) | null>(null);
  const [difficulty, setDifficulty] = useState<MusicQuizDifficulty>("5s");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "solo" | "party" | "stream">("");
  const [session, setSession] = useState<Session | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!token || !slug) return;
    let alive = true;
    void loadMusicQuizPack(token, slug).then((r) => {
      if (!alive) return;
      if (!r.ok) setErr(r.message);
      else setPack(r.data.pack);
    });
    return () => {
      alive = false;
    };
  }, [token, slug]);

  async function startSolo() {
    if (!token || !pack || busy) return;
    setBusy("solo");
    setErr("");
    const r = await startMusicQuizSession(token, { slug: pack.slug, difficulty, mode: "solo" });
    setBusy("");
    if (!r.ok) return setErr(r.message);
    setSession({
      sessionId: r.data.sessionId,
      clipMs: r.data.clipMs,
      answerMs: r.data.answerMs,
      packTitle: r.data.packTitle,
      packCover: r.data.packCover || pack.cover,
      difficulty: r.data.difficulty,
      round: r.data.round,
    });
    setRun((n) => n + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startRoom(mode: "party" | "stream") {
    if (!token || !pack || busy) return;
    setBusy(mode);
    setErr("");
    const r = await createMusicQuizParty(token, { slug: pack.slug, difficulty, mode });
    setBusy("");
    if (!r.ok) return setErr(r.message);
    router.push(page(`/music-quiz/party/?room=${encodeURIComponent(r.data.room.roomId)}`));
  }

  if (session) {
    return (
      <MusicQuizPlay
        key={`${session.sessionId}-${run}`}
        sessionId={session.sessionId}
        packSlug={slug}
        packTitle={session.packTitle}
        packCover={session.packCover}
        difficulty={session.difficulty}
        clipMs={session.clipMs}
        answerMs={session.answerMs}
        initialRound={session.round}
        onExit={() => setSession(null)}
        onAgain={() => void startSolo()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 pb-20 pt-2">
      <SmartLink href={page("/music-quiz/")} className="inline-flex items-center gap-1.5 text-sm text-crema/60 transition hover:text-crema">
        <ArrowLeft className="size-4" aria-hidden /> Tutti i quiz
      </SmartLink>

      {/* testata */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 ring-1 ring-sand/15 sm:p-8">
        {pack?.cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={pack.cover} alt="" className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-20 blur-2xl" />
        ) : null}
        <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          {pack ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pack.cover || "/images/logo-disco.png"} alt="" className="size-40 shrink-0 rounded-3xl object-cover shadow-[0_24px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/20" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">{KIND_LABEL[pack.kind || ""] || "Quiz"}</p>
                <h1 className="mt-1 font-display text-4xl font-semibold leading-tight text-crema [overflow-wrap:anywhere] sm:text-5xl">{pack.title}</h1>
                <p className="mt-2 text-sm text-crema/65">
                  {pack.trackCount ? `${pack.trackCount} brani` : "Brani da Deezer"} · {pack.plays ?? 0} partite giocate
                  {pack.authorName ? ` · creato da ${pack.authorName}` : ""}
                </p>
              </div>
            </>
          ) : (
            <div className="h-40 w-full animate-pulse rounded-3xl bg-crema/[0.05]">{err ? <p className="p-6 text-sm text-ember">{err}</p> : null}</div>
          )}
        </div>
      </section>

      {/* difficoltà */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/55">Quanto ascolti</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {DIFFS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDifficulty(d.id)}
              className={cn(
                "rounded-2xl px-3 py-4 text-center ring-1 transition",
                difficulty === d.id ? "bg-caramel/15 ring-caramel/60" : "bg-roast/70 ring-sand/15 hover:ring-caramel/35",
              )}
            >
              <span className={cn("block font-display text-2xl font-semibold", difficulty === d.id ? "text-caramel" : "text-crema")}>{d.label}</span>
              <span className="mt-0.5 block text-xs text-crema/55">{d.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-crema/55">10 canzoni, 4 risposte ciascuna. Hai 15 secondi da quando parte il brano: più rispondi in fretta, più punti prendi.</p>
      </section>

      {/* modi di gioco */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          disabled={!pack || Boolean(busy)}
          onClick={() => void startSolo()}
          className="group relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-caramel to-ember p-5 text-left text-ink disabled:opacity-60"
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink/15">
            <Play className="size-7 fill-current" aria-hidden />
          </span>
          <span>
            <span className="block font-display text-2xl font-semibold">{busy === "solo" ? "Preparo i brani…" : "Gioca da solo"}</span>
            <span className="block text-sm text-ink/75">Il punteggio entra in classifica</span>
          </span>
        </motion.button>
        <ModeCard icon={<Users className="size-5" aria-hidden />} title="Con gli amici" hint="Stanza con link d'invito, rispondete insieme" busy={busy === "party"} disabled={!pack || Boolean(busy)} onClick={() => void startRoom("party")} />
        <ModeCard icon={<Radio className="size-5" aria-hidden />} title="In diretta" hint="Guidi tu la partita, gli altri rispondono" busy={busy === "stream"} disabled={!pack || Boolean(busy)} onClick={() => void startRoom("stream")} />
      </section>

      {err && pack ? <p className="text-sm text-ember">{err}</p> : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <MusicQuizLeaderboard slug={slug} difficulty={difficulty} />
        <MusicQuizComments slug={slug} />
      </div>
    </div>
  );
}

function ModeCard({ icon, title, hint, busy, disabled, onClick }: { icon: React.ReactNode; title: string; hint: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-start gap-3 rounded-3xl bg-roast/80 p-5 text-left ring-1 ring-sand/15 transition hover:-translate-y-0.5 hover:ring-caramel/40 disabled:opacity-60"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-caramel/15 text-caramel">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-crema">{busy ? "Creo la stanza…" : title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-crema/55">{hint}</span>
      </span>
    </button>
  );
}


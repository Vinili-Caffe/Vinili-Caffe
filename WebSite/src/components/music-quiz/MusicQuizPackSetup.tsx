"use client";

import { useSitePresence } from "@/lib/presenceState";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Play, Radio, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { preloadClips } from "@/lib/clipCache";
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
import { QUIZ_CATEGORIES } from "./MusicQuizSettings";
import { MusicQuizComments } from "./MusicQuizComments";
import { MusicQuizSimilar } from "./MusicQuizSimilar";
import { MusicQuizStream } from "./MusicQuizStream";
import { QuizCardMenu } from "./QuizCardMenu";

const DIFFS: { id: MusicQuizDifficulty; label: string; hint: string }[] = [
  { id: "5s", label: "5 secondi", hint: "Per scaldarsi" },
  { id: "3s", label: "3 secondi", hint: "Ci vuole orecchio" },
  { id: "1s", label: "1 secondo", hint: "Solo per esperti" },
];

function categoryLabel(id: string) {
  const c = QUIZ_CATEGORIES.find((x) => x.id === id);
  return c ? `${c.emoji} ${c.label}` : id;
}

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
  /* «In diretta»: la chat della live risponde con 1-4 */
  const [streaming, setStreaming] = useState(false);
  useSitePresence(pack ? { details: `Music Quiz · ${pack.title}`, state: "Sceglie come giocare", image: pack.cover, imageText: pack.title } : null);

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
    /* tutti i brani della partita in anticipo: le domande partono senza aspettare la rete */
    preloadClips(r.data.upcoming || [r.data.round.previewUrl]);
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

  async function startRoom(mode: "party") {
    if (!token || !pack || busy) return;
    setBusy(mode);
    setErr("");
    const r = await createMusicQuizParty(token, { slug: pack.slug, difficulty, mode });
    setBusy("");
    if (!r.ok) return setErr(r.message);
    router.push(page(`/music-quiz/party/?room=${encodeURIComponent(r.data.room.roomId)}`));
  }

  if (streaming && pack) {
    return <MusicQuizStream pack={pack} difficulty={difficulty} onExit={() => setStreaming(false)} />;
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
    <div className="mx-auto max-w-5xl space-y-10 px-4 pb-20 pt-24 sm:pt-28">
      {/* sala d'attesa: chi, quanto ascolti, come giochi */}
      <section className="relative overflow-hidden rounded-[2rem] bg-espresso ring-1 ring-sand/15 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]">
        {pack?.cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={pack.cover} alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-35 blur-3xl" />
        ) : null}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-espresso/30 via-espresso/75 to-espresso" />
        <div className="relative grid grid-cols-1 gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <SmartLink href={page("/music-quiz/")} className="mb-5 inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm text-crema/70 ring-1 ring-sand/15 transition hover:text-crema">
              <ArrowLeft className="size-4" aria-hidden /> Tutti i quiz
            </SmartLink>
            {pack ? (
              <>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pack.cover || "/images/logo-disco.png"} alt="" className="size-40 rounded-3xl object-cover shadow-[0_30px_60px_-25px_rgba(0,0,0,0.95)] ring-1 ring-sand/25 sm:size-48" />
                  {pack.mine ? (
                    <QuizCardMenu
                      slug={pack.slug}
                      title={pack.title}
                      align="left"
                      className="absolute right-2 top-2 z-10"
                      onDeleted={() => router.push(page("/music-quiz/"))}
                    />
                  ) : null}
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-caramel">{KIND_LABEL[pack.kind || ""] || "Quiz"}</p>
                <h1 className="mt-1 font-display text-4xl font-semibold leading-tight text-crema [overflow-wrap:anywhere] sm:text-5xl">{pack.title}</h1>
                <p className="mt-2 text-sm text-crema/65">
                  {pack.trackCount ? `${pack.trackCount} brani` : "Brani da Deezer"} · {pack.plays ?? 0} partite giocate
                  {pack.authorName ? ` · creato da ${pack.authorName}` : ""}
                </p>
                {pack.description ? <p className="mt-3 max-w-md text-sm leading-relaxed text-crema/75">{pack.description}</p> : null}
                {pack.category || pack.tags?.length || pack.visibility === "unlisted" ? (
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5 lg:justify-start">
                    {pack.category ? (
                      <span className="rounded-full bg-crema/[0.08] px-2.5 py-1 text-xs font-semibold text-crema/80">
                        {categoryLabel(pack.category)}
                      </span>
                    ) : null}
                    {pack.visibility === "unlisted" ? (
                      <span className="rounded-full bg-crema/[0.08] px-2.5 py-1 text-xs font-semibold text-crema/60">Non in elenco</span>
                    ) : null}
                    {(pack.tags || []).map((t) => (
                      <span key={t} className="rounded-full px-2.5 py-1 text-xs text-caramel ring-1 ring-caramel/35">
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="w-full">
                <div className="mx-auto size-40 animate-pulse rounded-3xl bg-crema/[0.06] lg:mx-0" />
                {err ? <p className="mt-4 text-ember">{err}</p> : <div className="mx-auto mt-5 h-10 w-2/3 animate-pulse rounded-xl bg-crema/[0.06] lg:mx-0" />}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-crema/60">Quanto ascolti</h2>
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-ink/40 p-1.5 ring-1 ring-sand/10">
                {DIFFS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDifficulty(d.id)}
                    className={cn("relative rounded-xl px-2 py-3 text-center transition", difficulty === d.id ? "text-ink" : "text-crema/75 hover:text-crema")}
                  >
                    {difficulty === d.id ? <motion.span layoutId="mq-diff" className="absolute inset-0 rounded-xl bg-gradient-to-br from-caramel to-ember" transition={{ type: "spring", stiffness: 380, damping: 30 }} /> : null}
                    <span className="relative block font-display text-xl font-semibold">{d.label}</span>
                    <span className={cn("relative block text-[0.7rem]", difficulty === d.id ? "text-ink/70" : "text-crema/50")}>{d.hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-sm text-crema/60">10 canzoni, 4 risposte ciascuna. Hai 30 secondi da quando parte il brano: prima rispondi, più punti prendi.</p>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              disabled={!pack || Boolean(busy)}
              onClick={() => void startSolo()}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-caramel to-ember px-6 py-4 text-ink shadow-[0_20px_40px_-20px_rgba(212,145,80,0.8)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
            >
              <Play className="size-6 fill-current" aria-hidden />
              <span className="font-display text-2xl font-semibold">{busy === "solo" ? "Preparo i brani…" : "Gioca"}</span>
            </motion.button>

            <div className="grid grid-cols-2 gap-2.5">
              <ModeCard icon={<Users className="size-4" aria-hidden />} title="Con gli amici" hint="Link d'invito, rispondete insieme" busy={busy === "party"} disabled={!pack || Boolean(busy)} onClick={() => void startRoom("party")} />
              <ModeCard icon={<Radio className="size-4" aria-hidden />} title="In diretta" hint="La chat della tua live risponde con 1, 2, 3, 4" busy={false} disabled={!pack || Boolean(busy)} onClick={() => { setStreaming(true); window.scrollTo({ top: 0 }); }} />
            </div>
            {err && pack ? <p className="text-sm text-ember">{err}</p> : null}
          </div>
        </div>
      </section>

      {/* classifica a tutta larghezza, poi quiz simili, poi i commenti */}
      <MusicQuizLeaderboard slug={slug} difficulty={difficulty} />
      <MusicQuizSimilar slug={slug} />
      <MusicQuizComments slug={slug} />
    </div>
  );
}

function ModeCard({ icon, title, hint, busy, disabled, onClick }: { icon: React.ReactNode; title: string; hint: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-start gap-2.5 rounded-2xl bg-crema/[0.05] p-3.5 text-left ring-1 ring-sand/15 transition hover:bg-crema/[0.08] hover:ring-caramel/40 disabled:opacity-60"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-caramel/15 text-caramel">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-crema">{busy ? "Creo la stanza…" : title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-crema/55">{hint}</span>
      </span>
    </button>
  );
}

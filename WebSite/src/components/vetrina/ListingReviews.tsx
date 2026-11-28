"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Flag, Heart, LogIn, MessageSquareReply, PenLine, Star, Store } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  createReview,
  likeReview,
  loadReviews,
  replyReview,
  reportReview,
  REPORT_CATEGORIES,
  starDistribution,
  type BoardListing,
  type BoardReview,
  type ReviewSort,
  type ReviewsPage,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/cn";
import { chooseDialog, promptDialog, showToast } from "@/components/ui";
import { SmartLink } from "@/components/SmartLink";
import { Stars } from "./ListingCard";
import { Panel } from "./ListingPage";

const SORTS: { id: ReviewSort; label: string }[] = [
  { id: "relevant", label: "Più utili" },
  { id: "newest", label: "Più recenti" },
  { id: "highest", label: "Voto più alto" },
];
const MIN_LEN = 12;
const RATING_WORDS = ["", "Da evitare", "Così così", "Nella media", "Molto bello", "Imperdibile"];

export function ListingReviews({ listing, onAggregate }: { listing: BoardListing; onAggregate?: (avg: number, count: number) => void }) {
  const { ready, token, login } = useAuth();
  const [sort, setSort] = useState<ReviewSort>("relevant");
  const [pageNum, setPageNum] = useState(1);
  const [data, setData] = useState<ReviewsPage | null>(null);
  const [loading, setLoading] = useState(true);

  const pull = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const r = await loadReviews(token, listing.id, sort, pageNum);
    if (r.ok) setData(r.data);
    setLoading(false);
  }, [ready, token, listing.id, sort, pageNum]);

  useEffect(() => {
    void pull();
  }, [pull]);

  const replace = (rev: BoardReview) =>
    setData((prev) =>
      prev ? { ...prev, reviews: prev.reviews.map((x) => (x.id === rev.id ? rev : x)), mine: prev.mine?.id === rev.id ? rev : prev.mine } : prev,
    );

  const dist = starDistribution(data?.distribution);
  const count = data?.reviewsCount ?? listing.reviewsCount;
  const avg = data?.ratingAvg ?? listing.ratingAvg;
  const maxBar = Math.max(1, ...dist);

  return (
    <div id="recensioni" className="scroll-mt-24">
    <Panel
      title="Recensioni"
      right={
        <SmartLink href={page("/vetrina/linee-guida-recensioni/")} className="text-xs text-crema/45 hover:text-ember">
          Linee Guida
        </SmartLink>
      }
    >
      {/* riepilogo */}
      <div className="grid grid-cols-1 gap-6 rounded-2xl bg-espresso/50 p-5 ring-1 ring-sand/10 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div className="text-center sm:border-r sm:border-sand/10 sm:pr-6">
          <p className="font-display text-6xl font-semibold lining-nums text-crema">{count > 0 ? avg.toFixed(1) : "—"}</p>
          <Stars value={count > 0 ? avg : 0} className="mt-1 text-lg" />
          <p className="mt-1 text-xs text-crema/45">{count > 0 ? `${count.toLocaleString("it-IT")} recensioni` : "Ancora nessuna recensione"}</p>
        </div>
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n} className="flex items-center gap-3 text-xs">
              <span className="flex w-6 items-center justify-end gap-0.5 font-semibold text-crema/60">
                {n}
                <Star className="size-3 fill-ember text-ember" />
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-crema/8">
                <motion.span
                  className="block h-full rounded-full bg-caramel"
                  initial={{ width: 0 }}
                  animate={{ width: `${(dist[n - 1] / maxBar) * 100}%` }}
                  transition={{ duration: 0.7, delay: (5 - n) * 0.05, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
              <span className="w-8 text-right tabular-nums text-crema/45">{dist[n - 1]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* scrivi */}
      {ready && !token ? (
        <button type="button" onClick={login} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-sand/25 p-4 text-crema/65 transition hover:border-ember/50 hover:text-crema">
          <LogIn className="size-4" /> Accedi con Discord per lasciare una recensione
        </button>
      ) : data?.canReview ? (
        <WriteReview
          listingId={listing.id}
          onDone={(avgN, countN) => {
            onAggregate?.(avgN, countN);
            setPageNum(1);
            void pull();
          }}
        />
      ) : data?.isOwner ? (
        <p className="mt-5 flex items-center gap-2 rounded-2xl bg-crema/5 p-4 text-sm text-crema/60 ring-1 ring-sand/10">
          <Store className="size-4 text-ember" /> È la tua scheda: non puoi recensirla, ma puoi rispondere alle recensioni.
        </p>
      ) : null}

      {data?.mine && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold text-ember">La tua recensione</p>
          <ReviewCard review={data.mine} canReply={false} mine onChange={replace} />
        </div>
      )}

      {/* elenco */}
      {count > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sort === s.id}
              onClick={() => {
                setSort(s.id);
                setPageNum(1);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                sort === s.id ? "bg-crema/12 text-crema ring-1 ring-sand/30" : "text-crema/50 hover:text-crema",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className={cn("mt-4 space-y-3 transition-opacity", loading && data && "opacity-50")}>
        {!data && loading
          ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-espresso/40" />)
          : (data?.reviews || [])
              .filter((r) => r.id !== data?.mine?.id)
              .map((r) => <ReviewCard key={r.id} review={r} canReply={Boolean(data?.canReply)} onChange={replace} />)}
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <button type="button" disabled={pageNum <= 1} onClick={() => setPageNum((n) => n - 1)} className="rounded-full p-2 ring-1 ring-sand/20 disabled:opacity-30" aria-label="Pagina precedente">
            <ChevronLeft className="size-4" />
          </button>
          <span className="tabular-nums text-crema/60">
            {data.page} / {data.totalPages}
          </span>
          <button
            type="button"
            disabled={pageNum >= data.totalPages}
            onClick={() => setPageNum((n) => n + 1)}
            className="rounded-full p-2 ring-1 ring-sand/20 disabled:opacity-30"
            aria-label="Pagina successiva"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </Panel>
    </div>
  );
}

function WriteReview({ listingId, onDone }: { listingId: string; onDone: (avg: number, count: number) => void }) {
  const { token } = useAuth();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const shown = hover || rating;

  async function send() {
    if (!token) return showToast("Accedi con Discord per recensire.", true);
    if (!rating) return showToast("Scegli da 1 a 5 stelle", true);
    if (text.trim().length < MIN_LEN) return showToast(`Scrivi almeno ${MIN_LEN} caratteri`, true);
    setBusy(true);
    const r = await createReview(token, listingId, rating, text.trim());
    setBusy(false);
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || "Recensione pubblicata, grazie");
    const d = r.data as unknown as { ratingAvg?: number; reviewsCount?: number };
    onDone(Number(d.ratingAvg) || rating, Number(d.reviewsCount) || 1);
  }

  return (
    <div className="mt-5 rounded-2xl bg-gradient-to-b from-caramel/10 to-transparent p-5 ring-1 ring-caramel/25">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 text-left">
          <PenLine className="size-5 text-ember" />
          <span className="flex-1">
            <span className="block font-semibold text-crema">Com’è stata la tua esperienza?</span>
            <span className="text-sm text-crema/50">Racconta agli altri cosa ti è piaciuto (e cosa no).</span>
          </span>
          <Stars value={0} className="text-xl" />
        </button>
      ) : (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} stelle`}
                    onMouseEnter={() => setHover(n)}
                    onClick={() => setRating(n)}
                    className="p-0.5 transition-transform "
                  >
                    <Star className={cn("size-8 transition-colors", n <= shown ? "fill-ember text-ember" : "text-crema/25")} />
                  </button>
                ))}
              </div>
              <span className="font-script text-2xl text-ember">{RATING_WORDS[shown] || "Dai un voto"}</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1500}
              rows={4}
              placeholder="Atmosfera, staff, eventi, funzioni del bot… cosa ne pensi?"
              className="mt-4 w-full resize-y rounded-2xl bg-espresso/70 p-4 text-crema outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-ember/45"
            />
            <div className="mt-3 flex items-center gap-3">
              <span className={cn("text-xs tabular-nums", text.trim().length < MIN_LEN ? "text-crema/40" : "text-crema/60")}>{text.trim().length}/1500</span>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto text-sm text-crema/50 hover:text-crema">
                Annulla
              </button>
              <button type="button" disabled={busy} onClick={send} className="rounded-full bg-caramel px-5 py-2 text-sm font-semibold text-ink disabled:opacity-60">
                {busy ? "Pubblico…" : "Pubblica recensione"}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function ReviewCard({ review, canReply, mine = false, onChange }: { review: BoardReview; canReply: boolean; mine?: boolean; onChange: (r: BoardReview) => void }) {
  const { token, login } = useAuth();
  const [busy, setBusy] = useState(false);

  async function like() {
    if (!token) return login();
    if (mine) {
      showToast("Non puoi mettere mi piace alla tua recensione.", true);
      return;
    }
    const optimistic = { ...review, likedByMe: !review.likedByMe, likeCount: review.likeCount + (review.likedByMe ? -1 : 1) };
    onChange(optimistic);
    const r = await likeReview(token, review.id);
    if (!r.ok) {
      onChange(review);
      showToast(r.message, true);
    } else if (r.data.review) onChange(r.data.review);
  }

  async function report() {
    if (!token) return login();
    if (mine) {
      showToast("Non puoi segnalare la tua recensione.", true);
      return;
    }
    const category = await chooseDialog({
      title: "Segnala recensione",
      message: "Che tipo di problema hai trovato?",
      choices: REPORT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    });
    if (!category) return;
    const reason = await promptDialog({
      title: "Dettagli della segnalazione",
      inputLabel: "Motivo",
      placeholder: "Perché va rimossa? (minimo 8 caratteri)",
      multiline: true,
    });
    if (reason == null) return;
    if (reason.trim().length < 8) {
      showToast("Scrivi almeno 8 caratteri nel motivo.", true);
      return;
    }
    const r = await reportReview(token, review.id, reason.trim(), category);
    if (!r.ok) {
      showToast(r.message || "Segnalazione non inviata. Riprova.", true);
      return;
    }
    showToast(r.data.message || "Segnalazione inviata allo staff.");
  }

  async function reply() {
    if (!token) return;
    const text = await promptDialog({
      title: review.reply ? "Modifica la risposta" : "Rispondi alla recensione",
      inputLabel: "Risposta pubblica",
      placeholder: "Grazie per la recensione…",
      defaultValue: review.reply?.content || "",
      multiline: true,
    });
    if (text == null) return;
    setBusy(true);
    const r = await replyReview(token, review.id, text.trim(), !text.trim());
    setBusy(false);
    if (!r.ok) return showToast(r.message, true);
    if (r.data.review) onChange(r.data.review);
    showToast(text.trim() ? "Risposta pubblicata" : "Risposta rimossa");
  }

  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-2xl p-4 ring-1 sm:p-5", mine ? "bg-caramel/10 ring-caramel/30" : "bg-espresso/45 ring-sand/10")}>
      <div className="flex items-start gap-3">
        {review.authorAvatarUrl ? (
           
          <img src={review.authorAvatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-sand/20" />
        ) : (
          <span className="size-10 shrink-0 rounded-full bg-mocha" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold text-crema">{review.authorName}</span>
            <Stars value={review.rating} className="text-sm" />
            {review.createdAt ? <span className="text-xs text-crema/40">{timeAgo(review.createdAt)}</span> : null}
          </div>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-crema/80 [overflow-wrap:anywhere]">{review.content}</p>

          {review.reply && (
            <div className="mt-3 rounded-xl border-l-2 border-ember/60 bg-crema/5 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ember">
                <Store className="size-3.5" /> Risposta del proprietario
                {review.reply.at ? <span className="font-normal normal-case tracking-normal text-crema/40">· {timeAgo(review.reply.at)}</span> : null}
              </p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-crema/75 [overflow-wrap:anywhere]">{review.reply.content}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
            <button
              type="button"
              onClick={like}
              disabled={mine}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
                review.likedByMe ? "bg-[#a83a2c]/20 text-[#f0a493]" : "text-crema/50 hover:bg-crema/8 hover:text-crema",
              )}
            >
              <Heart className="size-3.5" fill={review.likedByMe ? "currentColor" : "none"} /> Utile{review.likeCount ? ` · ${review.likeCount}` : ""}
            </button>
            {canReply && (
              <button type="button" disabled={busy} onClick={reply} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-crema/50 hover:bg-crema/8 hover:text-crema">
                <MessageSquareReply className="size-3.5" /> {review.reply ? "Modifica risposta" : "Rispondi"}
              </button>
            )}
            {!mine && (
              <button type="button" onClick={report} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-crema/35 hover:text-crema/70">
                <Flag className="size-3.5" /> Segnala
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

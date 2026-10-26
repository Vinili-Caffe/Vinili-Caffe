"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Coffee, Heart, Loader2, MessageSquareReply } from "lucide-react";
import { replyAsServer, toggleLike, REPLY_MIN, type Review } from "@/lib/reviews";
import { enqueue, isOfflineApiFailure, OFFLINE_TOAST_REACT } from "@/lib/offline-queue";
import { showToast } from "@/components/ui/toast";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { onComposerEnterSend } from "@/lib/composer-keys";
import { Avatar } from "../Avatar";
import { DiscordContent } from "../discord/DiscordContent";
import { Stars } from "./Stars";

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};


export function ReviewCard({
  r,
  token,
  viewerId,
  canReply,
  onChanged,
  i,
}: {
  r: Review;
  token: string | null;
  viewerId?: string;
  canReply: boolean;
  onChanged: () => void;
  i: number;
}) {
  const [liked, setLiked] = useState(r.likedByViewer);
  const [likes, setLikes] = useState(r.likeCount);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(r.serverReply?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = viewerId === r.userId;
  useEffect(() => {
    setLiked(r.likedByViewer);
    setLikes(r.likeCount);
  }, [r.likedByViewer, r.likeCount]);

  const like = async () => {
    if (!token || mine) return;
    // subito a schermo, poi conferma dal server
    setLiked((v) => !v);
    setLikes((n) => n + (liked ? -1 : 1));
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueue("react", { scope: "review", reviewId: r.id });
      showToast(OFFLINE_TOAST_REACT);
      return;
    }
    const res = await toggleLike(token, r.id);
    if (res.ok) {
      setLiked(res.liked);
      setLikes(res.likeCount);
    } else if (isOfflineApiFailure(undefined, res.message)) {
      enqueue("react", { scope: "review", reviewId: r.id });
      showToast(OFFLINE_TOAST_REACT);
    } else {
      setLiked(r.likedByViewer);
      setLikes(r.likeCount);
    }
  };

  const sendReply = async () => {
    if (!token || reply.trim().length < REPLY_MIN) return;
    setBusy(true);
    setErr(null);
    const res = await replyAsServer(token, r.id, reply.trim());
    setBusy(false);
    if (!res.ok) return setErr(res.message);
    setReplying(false);
    onChanged();
  };

  return (
    <motion.article
      id={`vc-review-${r.id}`}
      layout="position"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative scroll-mt-28 rounded-3xl bg-gradient-to-b from-mocha to-roast p-5 ring-1 transition-shadow sm:p-6", mine ? "ring-caramel/40" : "ring-sand/12")}
    >
      <header className="flex items-start gap-3">
        <a href={page(`/user/?id=${r.userId}`)} className="shrink-0">
          <Avatar userId={r.userId} src={r.authorAvatarUrl} name={r.authorName} className="size-11" />
        </a>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {r.authorName}
            {mine && <span className="ml-2 rounded-full bg-caramel/20 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-ember">tu</span>}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-crema/45">
            <Stars value={r.rating} size="size-3.5" />
            <span>{ago(r.createdAt)}</span>
            {r.kind === "staff" && r.staffName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-crema/6 py-0.5 pl-0.5 pr-2 text-crema/65 ring-1 ring-sand/12">
                <Avatar src={r.staffAvatarUrl} name={r.staffName} className="size-4 text-[0.5rem]" /> per {r.staffName}
              </span>
            )}
          </div>
        </div>
        <motion.button
          type="button"
          onClick={like}
          disabled={!token || mine}
          whileTap={{ scale: 0.85 }}
          title={!token ? "Accedi per mettere mi piace" : mine ? "È la tua recensione" : liked ? "Togli mi piace" : "Mi piace"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm tabular-nums ring-1 transition-colors",
            liked ? "bg-rose-500/15 text-rose-300 ring-rose-400/40" : "text-crema/55 ring-sand/15 enabled:hover:text-crema",
          )}
        >
          <motion.span key={String(liked)} initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
            <Heart className="size-4" fill={liked ? "currentColor" : "none"} />
          </motion.span>
          {likes}
        </motion.button>
      </header>

      <DiscordContent text={r.content} className="mt-4 leading-relaxed text-crema/80" />

      {/* risposta ufficiale: server board vs staffer recensito */}
      {r.serverReply?.content && !replying && (
        <div className="mt-4 rounded-2xl bg-caramel/[0.08] p-4 ring-1 ring-caramel/20">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-caramel">
            <Coffee className="size-3.5" /> {r.kind === "staff" ? "Risposta dello staffer" : "Risposta del server"}
          </p>
          <DiscordContent text={r.serverReply.content} className="mt-2 text-sm leading-relaxed text-crema/75" />
        </div>
      )}

      {canReply && !replying && (
        <button type="button" onClick={() => setReplying(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-caramel hover:underline">
          <MessageSquareReply className="size-3.5" />{" "}
          {r.serverReply?.content
            ? "Modifica la risposta"
            : r.kind === "staff"
              ? "Rispondi come staffer"
              : "Rispondi come server"}
        </button>
      )}
      <AnimatePresence>
        {replying && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => onComposerEnterSend(e, () => void sendReply())}
              rows={3}
              maxLength={1200}
              placeholder={r.kind === "staff" ? "Rispondi alla recensione su di te…" : "Rispondi a nome del server…"}
              className="mt-4 w-full resize-y rounded-2xl bg-espresso px-4 py-3 text-sm text-crema ring-1 ring-sand/15 placeholder:text-crema/35 focus:outline-none focus:ring-2 focus:ring-caramel/50"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              {err && <span className="mr-auto text-xs text-red-300">{err}</span>}
              <button type="button" onClick={() => setReplying(false)} className="rounded-full px-3 py-1.5 text-sm text-crema/60 hover:text-crema">
                Annulla
              </button>
              <button
                type="button"
                onClick={sendReply}
                disabled={busy || reply.trim().length < REPLY_MIN}
                className="inline-flex items-center gap-2 rounded-full bg-caramel/25 px-4 py-1.5 text-sm font-semibold text-crema ring-1 ring-caramel/40 disabled:opacity-40"
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />} Pubblica risposta
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Heart, MessageCircle, VenetianMask } from "lucide-react";
import { STATUS, likeProposito, type PropStatus, type Proposito } from "@/lib/propositi";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/cn";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { showToast } from "@/components/ui/toast";
import { BurnFx } from "./BurnFx";

export type BurnPhase = "idle" | "ignite" | "flame" | "ash" | "gone" | "done";

/** Sigillo di ceralacca: rosso se aperto, verde se risolto, grigio se eliminato. */
export function Seal({ status, className }: { status: PropStatus; className?: string }) {
  return (
    <span
      title={STATUS[status]}
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-paper/90 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.35),0_4px_10px_-4px_rgba(0,0,0,0.7)]",
        status === "active" && "bg-[radial-gradient(circle_at_35%_30%,#c0503c,#7a2418)]",
        status === "resolved" && "bg-[radial-gradient(circle_at_35%_30%,#5f9a6a,#2c5634)]",
        status === "soft_deleted" && "bg-[radial-gradient(circle_at_35%_30%,#8a817a,#4a443f)]",
        className,
      )}
    >
      V&C
    </span>
  );
}

/** Una carta proposito sul bancone. */
export function Letter({
  c,
  i,
  token,
  burnPhase = "idle",
  onOpen,
  onUpdate,
}: {
  c: Proposito;
  i: number;
  token: string | null;
  burnPhase?: BurnPhase;
  onOpen: () => void;
  onUpdate: (c: Proposito) => void;
}) {
  const gone = c.status === "soft_deleted";
  const anon = c.anonymous !== false;
  const burning = burnPhase === "ignite" || burnPhase === "flame" || burnPhase === "ash" || burnPhase === "gone";
  const sheetRef = useRef<HTMLDivElement>(null);
  const [liked, setLiked] = useState(c.likedByViewer);
  const [likes, setLikes] = useState(c.likeCount || 0);
  useEffect(() => {
    setLiked(c.likedByViewer);
    setLikes(c.likeCount || 0);
  }, [c.likedByViewer, c.likeCount, c.id]);

  const preview = (c.comments || []).slice(-3);
  const like = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!token) {
      showToast("Accedi per mettere mi piace", true);
      return;
    }
    if (c.isMine) {
      showToast("Non puoi mettere mi piace al tuo proposito", true);
      return;
    }
    const prevLiked = liked;
    const prevLikes = likes;
    setLiked(!prevLiked);
    setLikes(prevLikes + (prevLiked ? -1 : 1));
    const res = await likeProposito(token, c.id);
    if (!res.ok) {
      setLiked(prevLiked);
      setLikes(prevLikes);
      showToast(res.message, true);
      return;
    }
    onUpdate(res.data);
  };

  return (
    <motion.article
      id={`vc-prop-card-${c.id}`}
      layout={!burning}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: burnPhase === "gone" ? 0 : 1, y: 0 }}
      transition={{ duration: burning ? 0.4 : 0.55, delay: Math.min(i, 8) * (burning ? 0.12 : 0.04), ease: [0.22, 1, 0.36, 1] }}
      className={cn("vc-prop-burn mb-6 break-inside-avoid", burning && "pointer-events-none")}
      data-phase={burning ? burnPhase : undefined}
      style={burning ? { animationDelay: `${Math.min(i, 8) * 120}ms` } : undefined}
    >
      <BurnFx active={burning} delayMs={Math.min(i, 8) * 120} seed={c.id} sheetRef={sheetRef} />
      <div
        ref={sheetRef}
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
        className={cn(
          "vc-prop-burn__sheet group relative cursor-pointer overflow-hidden rounded-sm bg-[#ece0c8] bg-[linear-gradient(180deg,rgba(255,250,240,0.5),transparent_30%,transparent_80%,rgba(120,80,40,0.12))] p-6 text-ink shadow-[0_24px_40px_-24px_rgba(0,0,0,1)] transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-ember",
          gone && !burning && "opacity-80",
        )}
      >
        {gone && !burning && (
          <span className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
            <span className="rounded-full bg-ink/75 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-paper/90">
              Eliminato
            </span>
          </span>
        )}

        <div
          className={cn(
            "relative z-[1]",
            gone && !burning && "select-none blur-[3.5px] saturate-50",
          )}
        >
        <div className="flex items-start justify-between gap-4">
          <span className="text-xs text-ink/50">{c.createdAt ? timeAgo(c.createdAt) : ""}</span>
          <Seal status={c.status} className="-mr-2 -mt-2 rotate-[-8deg]" />
        </div>
        <DiscordContent
          text={c.content}
          className="mt-1 line-clamp-[8] font-display text-xl leading-relaxed"
        />
        <div className="mt-5 flex items-end justify-between gap-3">
          <span className="inline-flex items-center gap-3 text-sm text-ink/55 lining-nums">
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="size-4" /> {c.commentCount}
            </span>
            <button
              type="button"
              onClick={like}
              disabled={gone || burning}
              title={!token ? "Accedi per mettere mi piace" : c.isMine ? "È il tuo proposito" : liked ? "Togli mi piace" : "Mi piace"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors",
                liked ? "text-[#a83a2c]" : "hover:text-ink/80",
              )}
            >
              <Heart className="size-4" fill={liked ? "currentColor" : "none"} />
              {likes}
            </button>
            {c.isMine && (
              <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink/70">
                Il tuo
              </span>
            )}
          </span>
          {anon ? (
            <span className="font-script text-2xl text-ink/60">— Anonimo ☕</span>
          ) : (
            <span className="inline-flex max-w-[50%] items-center gap-2 font-script text-xl text-ink/70">
              {c.authorAvatarUrl ? (
                 
                <img src={c.authorAvatarUrl} alt="" className="size-6 rounded-full object-cover ring-1 ring-ink/15" />
              ) : (
                <span className="size-6 rounded-full bg-ink/15" aria-hidden />
              )}
              <span className="truncate">— {c.authorName || "Membro"}</span>
            </span>
          )}
        </div>

        {preview.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-ink/10 pt-3" onClick={(e) => e.stopPropagation()}>
            {preview.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={onOpen}
                className="flex w-full items-start gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-ink/[0.04]"
              >
                {m.anonymous ? (
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink/50">
                    <VenetianMask className="size-3" />
                  </span>
                ) : m.authorAvatarUrl ? (
                   
                  <img src={m.authorAvatarUrl} alt="" className="mt-0.5 size-5 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="mt-0.5 size-5 shrink-0 rounded-full bg-ink/15" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("text-[0.7rem] font-semibold text-ink/55", m.anonymous && "italic")}>{m.authorName}</span>
                  <DiscordContent
                    text={m.content || (m.imageUrls?.length ? "📷 Foto" : "")}
                    className="line-clamp-2 text-sm leading-snug text-ink/70"
                  />
                </span>
              </button>
            ))}
            {c.commentCount > preview.length && (
              <p className="text-center text-[0.7rem] font-semibold uppercase tracking-wider text-ink/40">
                +{c.commentCount - preview.length} · apri per leggere
              </p>
            )}
          </div>
        )}
        </div>
      </div>
    </motion.article>
  );
}

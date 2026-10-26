"use client";

import { motion } from "motion/react";
import { Bug, ChevronDown, ChevronUp, Image as ImageIcon, Lightbulb, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { STATUS, kindLabel, timeAgo, topicLabel, type Status, type Suggestion } from "@/lib/feedback";
import { cn } from "@/lib/cn";
import { DiscordContent } from "@/components/discord/DiscordContent";

/** Timbro dello stato, come quelli a inchiostro. */
export function Stamp({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-md border-2 px-2 py-0.5 font-mono text-[0.65rem] font-black uppercase tracking-[0.18em]",
        status === "accepted" && "border-[#3f7d4e] text-[#3f7d4e]",
        status === "rejected" && "border-[#a83a2c] text-[#a83a2c]",
        status === "pending" && "border-[#9a6a2c] text-[#9a6a2c]",
        className,
      )}
    >
      {STATUS[status]}
    </span>
  );
}

/** Voti su/giù: attivi solo finché il feedback è in valutazione. */
export function Votes({
  up,
  down,
  mineUp,
  mineDown,
  disabled,
  onVote,
  tone = "paper",
}: {
  up: number;
  down: number;
  mineUp: boolean;
  mineDown: boolean;
  disabled?: boolean;
  onVote: (d: "up" | "down") => void;
  tone?: "paper" | "dark";
}) {
  const base = tone === "paper" ? "text-ink/55 hover:bg-ink/8 hover:text-ink" : "text-crema/55 hover:bg-crema/8 hover:text-crema";
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={mineUp}
        aria-label="Mi piace"
        onClick={(e) => {
          e.stopPropagation();
          onVote("up");
        }}
        className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold lining-nums transition-colors disabled:pointer-events-none disabled:opacity-60", mineUp ? "bg-[#3f7d4e]/15 text-[#3f7d4e]" : base)}
      >
        <ChevronUp className="size-4" /> {up}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={mineDown}
        aria-label="Non mi piace"
        onClick={(e) => {
          e.stopPropagation();
          onVote("down");
        }}
        className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold lining-nums transition-colors disabled:pointer-events-none disabled:opacity-60", mineDown ? "bg-[#a83a2c]/15 text-[#a83a2c]" : base)}
      >
        <ChevronDown className="size-4" /> {down}
      </button>
    </span>
  );
}

/** Il biglietto appeso alla lavagna. */
export function NoteCard({ s, i, onOpen, onVote }: { s: Suggestion; i: number; onOpen: () => void; onVote: (d: "up" | "down") => void }) {
  const tilt = ["-rotate-1", "rotate-1", "rotate-0", "-rotate-[0.6deg]", "rotate-[0.8deg]"][i % 5];
  const Icon = s.kind === "bug" ? Bug : Lightbulb;
  return (
    <motion.article
      layout
      id={`vc-suggestion-${s.id}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6 scroll-mt-28 break-inside-avoid"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
        className={cn(
          "group relative cursor-pointer rounded-sm bg-paper p-5 pt-7 text-ink shadow-[0_18px_30px_-18px_rgba(0,0,0,0.9)] transition-transform duration-300 hover:-translate-y-1 hover:rotate-0 focus-visible:outline-2 focus-visible:outline-ember",
          tilt,
          s.status === "rejected" && "bg-[#e6dccb]",
        )}
      >
        {/* puntina */}
        <span className="absolute left-1/2 top-2 size-3.5 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f0b46e,#9a5a24)] shadow-[0_2px_3px_rgba(0,0,0,0.5)]" />
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-ink/60">
            <Icon className="size-3.5" /> {kindLabel(s.kind)} · {topicLabel(s.tag)}
          </span>
          <Stamp status={s.status} className="-rotate-6" />
        </div>
        <DiscordContent text={s.content} className="mt-3 line-clamp-6 font-display text-xl leading-snug" />
        {s.imageUrls.length > 0 && (
          <div className="mt-3 flex gap-2" data-vc-lightbox-gallery>
            {s.imageUrls.slice(0, 3).map((u) => (
              <a key={u} href={u} data-vc-lightbox className="block overflow-hidden rounded-sm shadow ring-1 ring-ink/10">
                <img src={u} alt="" loading="lazy" className="size-16 object-cover" />
              </a>
            ))}
            {s.imageUrls.length > 3 && (
              <span className="flex size-16 items-center justify-center gap-1 rounded-sm bg-ink/8 text-sm font-semibold">
                <ImageIcon className="size-4" />+{s.imageUrls.length - 3}
              </span>
            )}
          </div>
        )}
        {s.status !== "pending" && s.staffReason && (
          <p className="mt-3 border-l-2 border-ink/20 pl-3 text-sm italic text-ink/65">Staff: {s.staffReason}</p>
        )}
        <div className="mt-4 flex items-center gap-2 border-t border-dashed border-ink/15 pt-3">
          <Avatar userId={s.userId} src={s.authorAvatarUrl} name={s.authorName} className="size-6 text-[0.6rem]" />
          <span className="min-w-0 flex-1 truncate text-xs text-ink/60">
            <strong className="font-semibold text-ink/80">{s.authorName}</strong> · {timeAgo(s.createdAt)}
          </span>
          <Votes up={s.upvoteCount} down={s.downvoteCount} mineUp={s.upvotedByViewer} mineDown={s.downvotedByViewer} disabled={s.status !== "pending"} onVote={onVote} />
          <span className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-ink/55 lining-nums">
            <MessageCircle className="size-4" /> {s.commentCount}
          </span>
        </div>
      </div>
    </motion.article>
  );
}

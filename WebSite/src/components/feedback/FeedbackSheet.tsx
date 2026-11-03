"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bug, Check, CornerDownRight, Gavel, Lightbulb, Loader2, Lock, LogIn, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { confirmDialog } from "@/components/ui";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  COMMENT_MAX,
  COMMENT_MIN,
  REASON_MIN,
  addComment,
  decideFeedback,
  deleteComment,
  deleteOwnFeedback,
  editComment,
  kindLabel,
  staffDeleteFeedback,
  timeAgo,
  topicLabel,
  voteComment,
  type Comment,
  type Status,
  type Suggestion,
  type Viewer,
} from "@/lib/feedback";
import { cn } from "@/lib/cn";
import { onComposerEnterSend } from "@/lib/composer-keys";
import { CommentImages, ImageAttachButton, ImageAttachPreview, useImageAttach } from "@/components/ui/image-attach";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { scheduleDeferredDelete } from "@/lib/deferred-delete";
import { Stamp, Votes } from "./NoteCard";

type Props = {
  s: Suggestion;
  token: string | null;
  viewer: Viewer;
  onClose: () => void;
  onLogin: () => void;
  onUpdate: (s: Suggestion) => void;
  onRemoved: (id: string) => void;
  onRestored: (s: Suggestion) => void;
  onEdit: () => void;
  onVote: (d: "up" | "down") => void;
};

/** Il biglietto staccato dalla lavagna: testo intero, foto, discussione e azioni. */
export function FeedbackSheet({ s, token, viewer, onClose, onLogin, onUpdate, onRemoved, onRestored, onEdit, onVote }: Props) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"own" | "staff" | null>(null);
  const [reason, setReason] = useState("");
  const mine = !!viewer && viewer.id === s.userId;
  const mod = !!viewer?.canModerateSuggestions;
  const open = s.status === "pending";

  const chromeId = useId();
  useBodyScrollLock(true);
  useEffect(() => {
    setChromeOpen(`feedback-sheet-${chromeId}`, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      setChromeOpen(`feedback-sheet-${chromeId}`, false);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, chromeId]);

  const run = async <T,>(p: Promise<{ ok: true; data: T } | { ok: false; message: string }>, ok: string, after?: (d: T) => void) => {
    setBusy(true);
    setMsg(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message }), false;
    setMsg({ ok: true, text: ok });
    after?.(r.data);
    return true;
  };

  const decide = (status: Status) => {
    if (!token) return;
    if (status !== "pending" && reason.trim().length < REASON_MIN) return setMsg({ ok: false, text: `Inserisci un motivo di almeno ${REASON_MIN} caratteri.` });
    const label = status === "accepted" ? "Suggerimento accettato." : status === "rejected" ? "Suggerimento rifiutato." : "Rimesso in valutazione.";
    run(decideFeedback(token, s.id, status, reason.trim()), label, (d) => (onUpdate(d), setReason("")));
  };

  const remove = () => {
    if (!token || !confirm) return;
    const mode = confirm;
    setConfirm(null);
    setMsg(null);
    scheduleDeferredDelete({
      onRemove: () => onRemoved(s.id),
      onRestore: () => onRestored(s),
      commit: () => (mode === "own" ? deleteOwnFeedback(token, s.id) : staffDeleteFeedback(token, s.id)),
    });
  };

  const top = s.comments.filter((c) => !c.parentCommentId);
  const replies = (id: string) => s.comments.filter((c) => c.parentCommentId === id);
  const Icon = s.kind === "bug" ? Bug : Lightbulb;

  return (
    <motion.div className="fixed inset-0 z-[80] flex justify-end overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-espresso/80" />
      <motion.aside
        id={`vc-suggestion-${s.id}`}
        role="dialog"
        aria-modal="true"
        aria-label="Discussione"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-roast shadow-2xl ring-1 ring-sand/15"
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-sand/10 bg-roast px-5 py-4 sm:px-7">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-crema/60">
            <Icon className="size-4 text-caramel" /> {kindLabel(s.kind)} · {topicLabel(s.tag)}
          </span>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="ml-auto rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-8 p-5 sm:p-7">
          {/* il biglietto */}
          <article className="relative rounded-sm bg-paper p-6 pt-8 text-ink shadow-[0_18px_30px_-18px_rgba(0,0,0,0.9)]">
            <span className="absolute left-1/2 top-2.5 size-4 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f0b46e,#9a5a24)] shadow" />
            <Stamp status={s.status} className="absolute right-5 top-5 -rotate-6 text-xs" />
            <div className="flex items-center gap-2.5 pr-28">
              <Avatar userId={s.userId} src={s.authorAvatarUrl} name={s.authorName} className="size-9 text-sm" />
              <div className="min-w-0">
                <a href={`/user/?id=${s.userId}`} className="block truncate font-semibold hover:underline">
                  {s.authorName}
                </a>
                <span className="text-xs text-ink/55">{timeAgo(s.createdAt)}</span>
              </div>
            </div>
            <DiscordContent text={s.content} className="mt-4 font-display text-2xl leading-snug" />
            {s.imageUrls.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-vc-lightbox-gallery>
                {s.imageUrls.map((u) => (
                  <a key={u} href={u} data-vc-lightbox className="overflow-hidden rounded-sm ring-1 ring-ink/10">
                    <img src={u} alt="Allegato" loading="lazy" className="aspect-square w-full object-cover transition-transform hover:scale-105" />
                  </a>
                ))}
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-dashed border-ink/15 pt-4">
              <Votes
                up={s.upvoteCount}
                down={s.downvoteCount}
                mineUp={s.upvotedByViewer}
                mineDown={s.downvotedByViewer}
                disabled={!open}
                onVote={(d) => (token ? onVote(d) : onLogin())}
              />
              {!open && <span className="text-xs text-ink/50">Votazione chiusa</span>}
              {mine && open && (
                <span className="ml-auto flex gap-1">
                  <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/8">
                    <Pencil className="size-3.5" /> Modifica
                  </button>
                  <button type="button" onClick={() => setConfirm("own")} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-[#a83a2c] hover:bg-[#a83a2c]/10">
                    <Trash2 className="size-3.5" /> Elimina
                  </button>
                </span>
              )}
            </div>
          </article>

          {/* decisione dello staff */}
          {s.status !== "pending" && s.staffReason && (
            <div className={cn("rounded-2xl p-5 ring-1", s.status === "accepted" ? "bg-[#3f7d4e]/12 ring-[#3f7d4e]/30" : "bg-[#a83a2c]/12 ring-[#a83a2c]/30")}>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-crema/60">
                <Gavel className="size-4" /> Decisione staff
              </p>
              <p className="mt-2 leading-relaxed text-crema/85">{s.staffReason}</p>
            </div>
          )}

          {/* conferma eliminazione */}
          <AnimatePresence>
            {confirm && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl bg-[#a83a2c]/12 p-5 ring-1 ring-[#a83a2c]/30">
                <p className="text-sm text-crema/85">
                  {confirm === "own" ? "Eliminare il tuo suggerimento? Non potrai ripristinarlo." : "Eliminare permanentemente questo suggerimento dal sito? L'operazione non è annullabile."}
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy} onClick={remove} className="inline-flex items-center gap-1.5 rounded-full bg-[#a83a2c] px-4 py-2 text-sm font-semibold text-crema disabled:opacity-60">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Elimina
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-crema/70 hover:bg-crema/8">
                    Annulla
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* High Staff */}
          {mod && (
            <div className="rounded-2xl bg-crema/[0.04] p-5 ring-1 ring-caramel/25">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-caramel">
                <Gavel className="size-4" /> Azioni High Staff
              </p>
              <textarea name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                rows={2}
                placeholder="Motivo (minimo 3 caratteri)"
                className="mt-3 w-full resize-y rounded-xl bg-espresso/60 p-3 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/35 focus:ring-caramel/60"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {s.status !== "accepted" && (
                  <button type="button" disabled={busy} onClick={() => decide("accepted")} className="inline-flex items-center gap-1.5 rounded-full bg-[#3f7d4e] px-4 py-2 text-sm font-semibold text-crema disabled:opacity-60">
                    <Check className="size-4" /> Accetta
                  </button>
                )}
                {s.status !== "rejected" && (
                  <button type="button" disabled={busy} onClick={() => decide("rejected")} className="inline-flex items-center gap-1.5 rounded-full bg-[#a83a2c] px-4 py-2 text-sm font-semibold text-crema disabled:opacity-60">
                    <X className="size-4" /> Rifiuta
                  </button>
                )}
                {s.status !== "pending" && (
                  <button type="button" disabled={busy} onClick={() => decide("pending")} className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 disabled:opacity-60">
                    <RotateCcw className="size-4" /> Rimetti in valutazione
                  </button>
                )}
                <button type="button" onClick={() => setConfirm("staff")} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-[#e2836f] light:text-[#a83a2c] hover:bg-[#a83a2c]/12">
                  <Trash2 className="size-4" /> Elimina definitivamente
                </button>
              </div>
            </div>
          )}

          {msg && <p className={cn("rounded-xl px-4 py-2.5 text-sm font-medium", msg.ok ? "bg-[#3f7d4e]/15 text-[#9fd3ac] light:text-[#2f6b3f]" : "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c]")}>{msg.text}</p>}

          {/* discussione */}
          <section>
            <h3 className="font-display text-2xl font-semibold">
              Discussione <span className="text-crema/40 lining-nums">· {s.commentCount}</span>
            </h3>
            {s.commentCount > s.comments.length && <p className="mt-1 text-xs text-crema/45">Mostrati gli ultimi {s.comments.length} commenti.</p>}
            <ul className="mt-4 space-y-4">
              {top.map((c) => (
                <CommentItem key={c.id} c={c} s={s} token={token} viewer={viewer} onUpdate={onUpdate} replies={replies(c.id)} />
              ))}
              {top.length === 0 && <li className="text-sm text-crema/50">Ancora nessun commento.</li>}
            </ul>
            <div className="mt-5">
              {!open ? (
                <p className="flex items-center gap-2 text-sm text-crema/50">
                  <Lock className="size-4" /> Discussione chiusa
                </p>
              ) : token ? (
                <CommentBox token={token} s={s} onUpdate={onUpdate} />
              ) : (
                <button type="button" onClick={onLogin} className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-4 py-2.5 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/12">
                  <LogIn className="size-4" /> Accedi con Discord per commentare
                </button>
              )}
            </div>
          </section>
        </div>
      </motion.aside>
    </motion.div>
  );
}

function CommentBox({
  token,
  s,
  parent,
  replyToName,
  onUpdate,
  onDone,
}: {
  token: string;
  s: Suggestion;
  parent?: string;
  replyToName?: string;
  onUpdate: (s: Suggestion) => void;
  onDone?: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const attach = useImageAttach();
  const hasImages = attach.images.length > 0;
  const send = async () => {
    if (busy || attach.busy) return;
    if (text.trim().length < COMMENT_MIN && !hasImages) return setErr("Il commento è troppo breve.");
    setBusy(true);
    setErr("");
    const r = await addComment(token, s.id, text.trim(), parent, attach.images);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setText("");
    attach.clear();
    onUpdate(r.data);
    onDone?.();
  };
  return (
    <div>
      <div className="flex items-end gap-2 rounded-2xl bg-espresso/60 p-2 ring-1 ring-sand/15 focus-within:ring-caramel/60">
        <textarea name="message"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
          onKeyDown={(e) => onComposerEnterSend(e, () => void send())}
          onPaste={attach.onPaste}
          rows={parent ? 1 : 2}
          placeholder={replyToName ? `Rispondi a ${replyToName}…` : parent ? "Scrivi una risposta..." : "Scrivi un commento..."}
          className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-crema/35"
        />
        <ImageAttachButton attach={attach} className="mb-0.5 px-2.5 text-crema/60 ring-transparent hover:bg-crema/8 hover:text-crema" />
        <button type="button" onClick={send} disabled={busy || attach.busy || (!text.trim() && !hasImages)} aria-label="Pubblica" className="rounded-full bg-gradient-to-r from-caramel to-ember p-2.5 text-ink disabled:opacity-40">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>
      <ImageAttachPreview attach={attach} />
      {err && <p className="mt-1.5 text-xs text-[#f0a493] light:text-[#a83a2c]">{err}</p>}
    </div>
  );
}

function CommentItem({ c, s, token, viewer, onUpdate, replies, isReply }: { c: Comment; s: Suggestion; token: string | null; viewer: Viewer; onUpdate: (s: Suggestion) => void; replies?: Comment[]; isReply?: boolean }) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.content);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = s.status === "pending";
  const mine = !!viewer && viewer.id === c.userId;
  const canDelete = mine || !!viewer?.canModerateSuggestions;

  const act = async (p: Promise<{ ok: true; data: Suggestion } | { ok: false; message: string }>) => {
    setBusy(true);
    setErr("");
    const r = await p;
    setBusy(false);
    if (!r.ok) return setErr(r.message), false;
    onUpdate(r.data);
    return true;
  };

  return (
    <li className={cn(isReply && "ml-6 border-l border-sand/15 pl-4 sm:ml-10")}>
      <div className="flex gap-3">
        <Avatar userId={c.userId} src={c.authorAvatarUrl} name={c.authorName} className="size-8 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <a href={`/user/?id=${c.userId}`} className="font-semibold hover:underline">
              {c.authorName}
            </a>{" "}
            <span className="text-xs text-crema/40">{timeAgo(c.createdAt)}</span>
          </p>
          {editing ? (
            <div className="mt-1.5">
              <textarea name="draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX))}
                onKeyDown={(e) =>
                  onComposerEnterSend(e, () => {
                    if (!token || busy) return;
                    void act(editComment(token, s.id, c.id, draft.trim())).then((ok) => ok && setEditing(false));
                  })
                }
                rows={2}
                className="w-full rounded-xl bg-espresso/60 p-2.5 text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
              />
              <div className="mt-1.5 flex gap-2 text-sm">
                <button type="button" disabled={busy} onClick={async () => token && (await act(editComment(token, s.id, c.id, draft.trim()))) && setEditing(false)} className="font-semibold text-caramel">
                  Salva
                </button>
                <button type="button" onClick={() => (setEditing(false), setDraft(c.content))} className="text-crema/55">
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <>
              {c.content ? <DiscordContent text={c.content} className="mt-0.5 text-[0.95rem] leading-relaxed text-crema/80" /> : null}
              <CommentImages urls={c.imageUrls} />
            </>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs">
            <Votes
              tone="dark"
              up={c.upvoteCount}
              down={c.downvoteCount}
              mineUp={c.upvotedByViewer}
              mineDown={c.downvotedByViewer}
              disabled={!open || !token || mine || busy}
              onVote={(d) => token && act(voteComment(token, s.id, c.id, d))}
            />
            {open && token && (
              <button type="button" onClick={() => setReplying((r) => !r)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-crema/55 hover:text-crema">
                <CornerDownRight className="size-3.5" /> Rispondi
              </button>
            )}
            {open && mine && !editing && (
              <button type="button" onClick={() => setEditing(true)} className="rounded-full px-2 py-1 font-semibold text-crema/55 hover:text-crema">
                Modifica
              </button>
            )}
            {open && canDelete && token && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!(await confirmDialog({ message: "Eliminare questo commento?", danger: true }))) return;
                  act(deleteComment(token, s.id, c.id));
                }}
                className="rounded-full px-2 py-1 font-semibold text-[#e2836f]/80 hover:text-[#e2836f]"
              >
                Elimina
              </button>
            )}
          </div>
          {err && <p className="mt-1 text-xs text-[#f0a493] light:text-[#a83a2c]">{err}</p>}
          {replying && token && (
            <div className="mt-2">
              <CommentBox
                token={token}
                s={s}
                parent={c.id}
                replyToName={isReply ? c.authorName : undefined}
                onUpdate={onUpdate}
                onDone={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>
      {replies && replies.length > 0 && (
        <ul className="mt-3 space-y-3">
          {replies.map((r) => (
            <CommentItem key={r.id} c={r} s={s} token={token} viewer={viewer} onUpdate={onUpdate} isReply />
          ))}
        </ul>
      )}
    </li>
  );
}

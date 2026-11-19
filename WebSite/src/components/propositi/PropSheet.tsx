"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, CornerDownRight, EyeOff, Heart, Loader2, Lock, Send, Trash2, UserRound, VenetianMask, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  COMMENT_MAX,
  COMMENT_MIN,
  STATUS,
  commentProposito,
  deleteProposito,
  deletePropositoComment,
  editPropositoComment,
  likeProposito,
  likePropositoComment,
  reopenProposito,
  threadComments,
  type PropComment,
  type PropViewer,
  type Proposito,
} from "@/lib/propositi";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/cn";
import { onComposerEnterSend } from "@/lib/composer-keys";
import { CommentImages, ImageAttachButton, ImageAttachPreview, useImageAttach } from "@/components/ui/image-attach";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { showToast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui";
import { EmojiInsertButton, emojiPickText, insertAtCaret } from "@/components/tickets/EmojiInsertButton";
import { Seal } from "./PropLetter";

/** La lettera aperta: testo intero, risposte dello staff, eliminazione High Staff (niente “risolta”: non è un ticket). */
export function PropSheet({ c, token, viewer, onClose, onUpdate }: { c: Proposito; token: string | null; viewer: PropViewer; onClose: () => void; onUpdate: (c: Proposito) => void }) {
  const [reason, setReason] = useState(c.staffReason);
  const [busy, setBusy] = useState<false | "delete" | "like">(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [liked, setLiked] = useState(c.likedByViewer);
  const [likes, setLikes] = useState(c.likeCount || 0);
  const open = c.status === "active";
  const staff = !!viewer?.canAccessStaffBoard;
  const isHighStaff = Boolean(viewer?.canModerate);
  const mod = isHighStaff && !c.isMine;
  const canDeleteOwn = Boolean(c.isMine && token);
  const canDelete = (canDeleteOwn || isHighStaff) && c.status !== "soft_deleted";
  const { roots, byParent } = useMemo(() => threadComments(c.comments || []), [c.comments]);

  useEffect(() => {
    setLiked(c.likedByViewer);
    setLikes(c.likeCount || 0);
  }, [c.likedByViewer, c.likeCount, c.id]);

  const chromeId = useId();
  useBodyScrollLock(true);
  useEffect(() => {
    setChromeOpen(`conf-sheet-${chromeId}`, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      setChromeOpen(`conf-sheet-${chromeId}`, false);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, chromeId]);

  const like = async () => {
    if (!token) {
      showToast("Accedi per mettere mi piace", true);
      return;
    }
    if (c.isMine) {
      showToast("Non puoi mettere mi piace al tuo proposito", true);
      return;
    }
    if (busy === "like") return;
    const prevLiked = liked;
    const prevLikes = likes;
    setLiked(!prevLiked);
    setLikes(prevLikes + (prevLiked ? -1 : 1));
    setBusy("like");
    const r = await likeProposito(token, c.id);
    setBusy(false);
    if (!r.ok) {
      setLiked(prevLiked);
      setLikes(prevLikes);
      showToast(r.message, true);
      return;
    }
    onUpdate(r.data);
  };

  const remove = async () => {
    if (!token) return;
    setBusy("delete");
    setMsg(null);
    const r = await deleteProposito(token, c.id, reason.trim());
    setBusy(false);
    setConfirmDelete(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    onUpdate(r.data);
    setMsg({ ok: true, text: "Proposito eliminato." });
    const tok = token;
    const id = c.id;
    showToast("Eliminato", false, {
      ms: 5000,
      action: {
        label: "Annulla",
        onClick: () => {
          void (async () => {
            const undo = await reopenProposito(tok, id, "Annullamento eliminazione");
            if (undo.ok) {
              onUpdate(undo.data);
              showToast("Eliminazione annullata", false, { ms: 1800 });
            } else {
              showToast(undo.message || "Annullamento non riuscito", true);
            }
          })();
        },
      },
    });
  };

  return (
    <motion.div className="fixed inset-0 z-[80] flex justify-end overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-black/80" />
      <motion.aside
        id={`vc-prop-card-${c.id}`}
        role="dialog"
        aria-modal="true"
        aria-label="Discussione"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="scheme-dark relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[#120b08] shadow-2xl ring-1 ring-sand/10"
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-sand/10 bg-[#120b08] px-5 py-4 sm:px-7">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-crema/55">Proposito · {STATUS[c.status]}</span>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="ml-auto rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-8 p-5 sm:p-7">
          <article className="relative overflow-hidden rounded-sm bg-[#ece0c8] p-6 text-ink shadow-[0_24px_40px_-24px_rgba(0,0,0,1)] sm:p-8">
            <Seal status={c.status} className="absolute -top-4 right-6 z-10 rotate-[-8deg]" />
            {c.status === "soft_deleted" && (
              <p className="relative z-10 mb-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-ink/55">Eliminato</p>
            )}
            <div className={cn(c.status === "soft_deleted" && "select-none blur-[4px] saturate-50")}>
              <p className="text-xs text-ink/50">{c.createdAt ? timeAgo(c.createdAt) : ""}</p>
              <DiscordContent text={c.content} className="mt-3 font-display text-2xl leading-relaxed" />
              <div className="mt-6 flex items-end justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void like()}
                  disabled={busy === "like" || c.status === "soft_deleted"}
                  title={!token ? "Accedi per mettere mi piace" : c.isMine ? "È il tuo proposito" : liked ? "Togli mi piace" : "Mi piace"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm transition-colors",
                    liked ? "bg-[#a83a2c]/12 text-[#a83a2c]" : "text-ink/55 hover:bg-ink/5 hover:text-ink/80",
                  )}
                >
                  <Heart className="size-4" fill={liked ? "currentColor" : "none"} />
                  <span className="lining-nums">{likes}</span>
                </button>
                {c.anonymous !== false ? (
                  <p className="font-script text-3xl text-ink/60">— Anonimo ☕</p>
                ) : (
                  <p className="inline-flex max-w-[60%] items-center gap-2 font-script text-2xl text-ink/70">
                    {c.authorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.authorAvatarUrl} alt="" className="size-7 rounded-full object-cover ring-1 ring-ink/15" />
                    ) : null}
                    <span className="truncate">— {c.authorName || "Membro"}</span>
                  </p>
                )}
              </div>
            </div>
          </article>

          {c.staffReason && c.status !== "active" && (
            <p className="rounded-2xl bg-crema/[0.04] p-5 text-sm leading-relaxed text-crema/75 ring-1 ring-sand/10">
              <strong className="text-crema">Nota dello staff:</strong> {c.staffReason}
            </p>
          )}

          {canDelete && (
            <div className="rounded-2xl bg-crema/[0.04] p-5 ring-1 ring-sand/10">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-crema/45">
                {canDeleteOwn && !isHighStaff ? "Il tuo proposito" : canDeleteOwn ? "Il tuo proposito" : "Moderazione High Staff"}
              </p>
              <p className="mt-1 text-sm text-crema/50">
                {canDeleteOwn && !mod
                  ? "Puoi rimuovere questo proposito. Resta in elenco sfocato."
                  : "Puoi eliminare i propositi della community (abuso, spam, ecc.). Restano in elenco sfocati."}
              </p>
              {confirmDelete ? (
                <div className="mt-3 space-y-3 rounded-xl bg-black/25 p-3">
                  <p className="text-sm text-crema/85">Eliminare questo proposito? Resta in elenco sfocato e i commenti si chiudono.</p>
                  {mod || (isHighStaff && !canDeleteOwn) ? (
                    <input
                      name="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                      placeholder="Motivo (opzionale)"
                      className="w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/35 focus:ring-caramel/60"
                    />
                  ) : null}
                  <div className="flex gap-2">
                    <button type="button" disabled={!!busy} onClick={() => void remove()} className="inline-flex items-center gap-1.5 rounded-full bg-crema px-4 py-1.5 text-sm font-semibold text-espresso disabled:opacity-60">
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Conferma
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-4 py-1.5 text-sm font-semibold text-crema/65 hover:bg-crema/8">
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-[#e2836f] light:text-[#a83a2c] hover:bg-[#a83a2c]/15"
                >
                  <Trash2 className="size-4" /> Elimina
                </button>
              )}
            </div>
          )}

          {msg && <p className={cn("rounded-xl px-4 py-2.5 text-sm font-medium", msg.ok ? "bg-[#3f7d4e]/15 text-[#9fd3ac] light:text-[#2f6b3f]" : "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c]")}>{msg.text}</p>}

          <section>
            <h3 className="font-display text-2xl font-semibold">
              Risposte <span className="text-crema/40 lining-nums">· {c.commentCount}</span>
            </h3>
            <ul className="mt-4 space-y-4">
              {roots.map((m) => (
                <CommentItem
                  key={m.id}
                  m={m}
                  confession={c}
                  token={token}
                  viewer={viewer}
                  open={open}
                  staff={staff}
                  replies={byParent.get(m.id) || []}
                  onUpdate={onUpdate}
                />
              ))}
              {roots.length === 0 && <li className="text-sm text-crema/50">Ancora nessuna risposta.</li>}
            </ul>

            <div className="mt-6">
              {!open ? (
                <p className="flex items-center gap-2 text-sm text-crema/50">
                  <Lock className="size-4" /> Discussione chiusa: non si possono aggiungere commenti.
                </p>
              ) : staff && token ? (
                <CommentComposer token={token} confessionId={c.id} onUpdate={onUpdate} />
              ) : (
                <p className="text-sm text-crema/50">Ai propositi risponde lo staff.</p>
              )}
            </div>
          </section>
        </div>
      </motion.aside>
    </motion.div>
  );
}

function CommentComposer({
  token,
  confessionId,
  parentId,
  replyToName,
  compact,
  onUpdate,
  onDone,
}: {
  token: string;
  confessionId: string;
  parentId?: string;
  replyToName?: string;
  compact?: boolean;
  onUpdate: (c: Proposito) => void;
  onDone?: () => void;
}) {
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const attach = useImageAttach();
  const hasImages = attach.images.length > 0;

  const send = async () => {
    if (busy || attach.busy) return;
    if (text.trim().length < COMMENT_MIN && !hasImages) return setErr(`Scrivi almeno ${COMMENT_MIN} caratteri.`);
    setBusy(true);
    setErr("");
    const r = await commentProposito(token, confessionId, text.trim(), anon, attach.images, parentId || null);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setText("");
    attach.clear();
    onUpdate(r.data);
    onDone?.();
  };

  return (
    <div className={cn("rounded-2xl bg-black/30 p-3 ring-1 ring-sand/15 focus-within:ring-caramel/60", compact && "p-2")}>
      <textarea
        ref={textRef}
        name="message"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
        onKeyDown={(e) => onComposerEnterSend(e, () => void send())}
        onPaste={attach.onPaste}
        rows={compact ? 2 : 3}
        placeholder={replyToName ? `Rispondi a ${replyToName}…` : parentId ? "Scrivi una risposta…" : "Scrivi un commento alla discussione…"}
        className="w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-crema/35"
      />
      <ImageAttachPreview attach={attach} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Visibilità commento" className="inline-flex rounded-full bg-crema/6 p-0.5 text-xs font-semibold">
          {[
            { v: true, label: "Anonimo", icon: <EyeOff className="size-3.5" /> },
            { v: false, label: "Con nome", icon: <UserRound className="size-3.5" /> },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={anon === o.v}
              onClick={() => setAnon(o.v)}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors", anon === o.v ? "bg-crema text-espresso" : "text-crema/60 hover:text-crema")}
            >
              {o.icon} {o.label}
            </button>
          ))}
        </div>
        <EmojiInsertButton
          token={token}
          preferAbove
          onPick={(pick) => {
            const { next } = insertAtCaret(text, emojiPickText(pick), textRef.current, COMMENT_MAX);
            setText(next);
          }}
        />
        <ImageAttachButton attach={attach} />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || attach.busy || (!text.trim() && !hasImages)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {parentId ? "Rispondi" : "Pubblica"}
        </button>
      </div>
      {err && <p className="mt-1.5 text-xs text-[#f0a493] light:text-[#a83a2c]">{err}</p>}
    </div>
  );
}

function CommentItem({
  m,
  confession,
  token,
  viewer,
  open,
  staff,
  replies,
  isReply,
  onUpdate,
}: {
  m: PropComment;
  confession: Proposito;
  token: string | null;
  viewer: PropViewer;
  open: boolean;
  staff: boolean;
  replies?: PropComment[];
  isReply?: boolean;
  onUpdate: (c: Proposito) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [liked, setLiked] = useState(m.likedByViewer);
  const [likes, setLikes] = useState(m.likeCount || 0);
  const canDelete = m.isMine || !!viewer?.canModerate;

  useEffect(() => {
    setLiked(m.likedByViewer);
    setLikes(m.likeCount || 0);
    setDraft(m.content);
  }, [m.likedByViewer, m.likeCount, m.content, m.id]);

  const act = async (p: Promise<{ ok: true; data: Proposito } | { ok: false; message: string }>) => {
    setBusy(true);
    setErr("");
    const r = await p;
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return false;
    }
    onUpdate(r.data);
    return true;
  };

  const like = async () => {
    if (!token) {
      showToast("Accedi per mettere mi piace", true);
      return;
    }
    if (m.isMine) {
      showToast("Non puoi mettere mi piace al tuo commento", true);
      return;
    }
    if (busy) return;
    const prevLiked = liked;
    const prevLikes = likes;
    setLiked(!prevLiked);
    setLikes(prevLikes + (prevLiked ? -1 : 1));
    setBusy(true);
    const r = await likePropositoComment(token, confession.id, m.id);
    setBusy(false);
    if (!r.ok) {
      setLiked(prevLiked);
      setLikes(prevLikes);
      setErr(r.message);
      return;
    }
    onUpdate(r.data);
  };

  return (
    <li className={cn(isReply && "ml-6 border-l border-sand/15 pl-4 sm:ml-10")}>
      <div className="flex gap-3">
        {m.anonymous ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-crema/8 text-crema/60">
            <VenetianMask className="size-4" />
          </span>
        ) : (
          <Avatar src={m.authorAvatarUrl} name={m.authorName} className="size-8 shrink-0 text-xs" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className={cn("font-semibold", m.anonymous && "italic text-crema/70")}>{m.authorName}</span>{" "}
            <span className="text-xs text-crema/40">{m.createdAt ? timeAgo(m.createdAt) : ""}</span>
          </p>
          {editing ? (
            <div className="mt-1.5">
              <textarea
                name="draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX))}
                onKeyDown={(e) =>
                  onComposerEnterSend(e, () => {
                    if (!token || busy) return;
                    void act(editPropositoComment(token, confession.id, m.id, draft.trim())).then((ok) => ok && setEditing(false));
                  })
                }
                rows={2}
                className="w-full rounded-xl bg-black/30 p-2.5 text-sm outline-none ring-1 ring-sand/15 focus:ring-caramel/60"
              />
              <div className="mt-1.5 flex gap-2 text-sm">
                <button
                  type="button"
                  disabled={busy || draft.trim().length < COMMENT_MIN}
                  onClick={async () => token && (await act(editPropositoComment(token, confession.id, m.id, draft.trim()))) && setEditing(false)}
                  className="font-semibold text-caramel disabled:opacity-40"
                >
                  Salva
                </button>
                <button type="button" onClick={() => (setEditing(false), setDraft(m.content))} className="text-crema/55">
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <>
              {m.content ? <DiscordContent text={m.content} className="mt-0.5 leading-relaxed text-crema/80" /> : null}
              <CommentImages urls={m.imageUrls} />
            </>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs">
            <button
              type="button"
              disabled={busy || m.isMine}
              onClick={() => void like()}
              title={!token ? "Accedi per mettere mi piace" : m.isMine ? "È il tuo commento" : liked ? "Togli mi piace" : "Mi piace"}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition-colors",
                liked ? "text-[#e2836f]" : "text-crema/55 hover:text-crema",
              )}
            >
              <Heart className="size-3.5" fill={liked ? "currentColor" : "none"} />
              <span className="lining-nums">{likes}</span>
            </button>
            {open && staff && token && (
              <button type="button" onClick={() => setReplying((r) => !r)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-crema/55 hover:text-crema">
                <CornerDownRight className="size-3.5" /> Rispondi
              </button>
            )}
            {open && m.isMine && !editing && (
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
                  void act(deletePropositoComment(token, confession.id, m.id));
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
              <CommentComposer
                token={token}
                confessionId={confession.id}
                parentId={m.id}
                replyToName={m.authorName}
                compact
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
            <CommentItem
              key={r.id}
              m={r}
              confession={confession}
              token={token}
              viewer={viewer}
              open={open}
              staff={staff}
              isReply
              onUpdate={onUpdate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

"use client";

import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { Check, EyeOff, Loader2, Lock, RotateCcw, Send, Trash2, UserRound, VenetianMask, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  COMMENT_MAX,
  COMMENT_MIN,
  STATUS,
  commentConfession,
  deleteConfession,
  reopenConfession,
  resolveConfession,
  type ConfViewer,
  type Confession,
} from "@/lib/confessionale";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/cn";
import { onComposerEnterSend } from "@/lib/composer-keys";
import { CommentImages, ImageAttachButton, ImageAttachPreview, useImageAttach } from "@/components/ui/image-attach";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { showToast } from "@/components/ui/toast";
import { Seal } from "./Letter";

type Act = "resolve" | "reopen" | "delete";

/** La lettera aperta: testo intero, risposte dello staff, azioni dell'High Staff. */
export function ConfSheet({ c, token, viewer, onClose, onUpdate }: { c: Confession; token: string | null; viewer: ConfViewer; onClose: () => void; onUpdate: (c: Confession) => void }) {
  const [text, setText] = useState("");
  const [anon, setAnon] = useState(true);
  const [reason, setReason] = useState(c.staffReason);
  const [busy, setBusy] = useState<false | "comment" | Act>(false);
  const [confirm, setConfirm] = useState<Act | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const open = c.status === "active";
  const staff = !!viewer?.canAccessStaffBoard;
  const mod = !!viewer?.canModerate && !c.isMine;

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

  const attach = useImageAttach();
  const hasImages = attach.images.length > 0;
  const comment = async () => {
    if (!token) return;
    if (text.trim().length < COMMENT_MIN && !hasImages) return setMsg({ ok: false, text: `Scrivi almeno ${COMMENT_MIN} caratteri.` });
    setBusy("comment");
    setMsg(null);
    const r = await commentConfession(token, c.id, text.trim(), anon, attach.images);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setText("");
    attach.clear();
    onUpdate(r.data);
  };

  const act = async (a: Act) => {
    if (!token) return;
    setBusy(a);
    setMsg(null);
    const fn = a === "resolve" ? resolveConfession : a === "reopen" ? reopenConfession : deleteConfession;
    const r = await fn(token, c.id, reason.trim());
    setBusy(false);
    setConfirm(null);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    onUpdate(r.data);
    if (a === "delete") {
      setMsg({ ok: true, text: "Confessione eliminata (resta visibile in elenco)." });
      const tok = token;
      const id = c.id;
      showToast("Eliminato", false, {
        ms: 5000,
        action: {
          label: "Annulla",
          onClick: () => {
            void (async () => {
              const undo = await reopenConfession(tok, id, "Annullamento eliminazione");
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
      return;
    }
    setMsg({ ok: true, text: a === "resolve" ? "Segnata come risolta." : "Discussione riaperta." });
  };

  const QUESTIONS: Record<Act, string> = {
    resolve: "Segnare questa discussione come risolta?",
    reopen: "Riaprire questa discussione?",
    delete: "Eliminare questa confessione? Il testo resta in elenco, ma la discussione si chiude.",
  };

  return (
    <motion.div className="fixed inset-0 z-[80] flex justify-end overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-black/80" />
      <motion.aside
        id={`vc-conf-card-${c.id}`}
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
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-crema/55">Confessione · {STATUS[c.status]}</span>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="ml-auto rounded-full p-2 text-crema/60 hover:bg-crema/8 hover:text-crema">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-8 p-5 sm:p-7">
          <article className="relative rounded-sm bg-[#ece0c8] p-6 text-ink shadow-[0_24px_40px_-24px_rgba(0,0,0,1)] sm:p-8">
            <Seal status={c.status} className="absolute -top-4 right-6 rotate-[-8deg]" />
            <p className="text-xs text-ink/50">{c.createdAt ? timeAgo(c.createdAt) : ""}</p>
            <DiscordContent
              text={c.content}
              className={cn("mt-3 font-display text-2xl leading-relaxed", c.status === "soft_deleted" && "line-through decoration-ink/30")}
            />
            <p className="mt-6 text-right font-script text-3xl text-ink/60">— Anonimo</p>
          </article>

          {c.staffReason && c.status !== "active" && (
            <p className="rounded-2xl bg-crema/[0.04] p-5 text-sm leading-relaxed text-crema/75 ring-1 ring-sand/10">
              <strong className="text-crema">Nota dello staff:</strong> {c.staffReason}
            </p>
          )}

          {mod && (
            <div className="rounded-2xl bg-crema/[0.04] p-5 ring-1 ring-caramel/25">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-caramel">Azioni High Staff</p>
              <input name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                placeholder="Motivo decisione (opzionale)"
                className="mt-3 w-full rounded-xl bg-black/30 px-3 py-2.5 text-sm outline-none ring-1 ring-sand/15 placeholder:text-crema/35 focus:ring-caramel/60"
              />
              {confirm ? (
                <div className="mt-3 rounded-xl bg-black/25 p-3">
                  <p className="text-sm text-crema/85">{QUESTIONS[confirm]}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={!!busy} onClick={() => act(confirm)} className="inline-flex items-center gap-1.5 rounded-full bg-crema px-4 py-1.5 text-sm font-semibold text-espresso disabled:opacity-60">
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Conferma
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="rounded-full px-4 py-1.5 text-sm font-semibold text-crema/65 hover:bg-crema/8">
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status !== "resolved" && (
                    <button type="button" onClick={() => setConfirm("resolve")} className="inline-flex items-center gap-1.5 rounded-full bg-[#3f7d4e] px-4 py-2 text-sm font-semibold text-crema">
                      <Check className="size-4" /> Segna come risolta
                    </button>
                  )}
                  {c.status !== "active" && (
                    <button type="button" onClick={() => setConfirm("reopen")} className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25">
                      <RotateCcw className="size-4" /> Riapri
                    </button>
                  )}
                  {c.status !== "soft_deleted" && (
                    <button type="button" onClick={() => setConfirm("delete")} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-[#e2836f] light:text-[#a83a2c] hover:bg-[#a83a2c]/15">
                      <Trash2 className="size-4" /> Elimina
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {msg && <p className={cn("rounded-xl px-4 py-2.5 text-sm font-medium", msg.ok ? "bg-[#3f7d4e]/15 text-[#9fd3ac] light:text-[#2f6b3f]" : "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c]")}>{msg.text}</p>}

          <section>
            <h3 className="font-display text-2xl font-semibold">
              Risposte <span className="text-crema/40 lining-nums">· {c.commentCount}</span>
            </h3>
            <ul className="mt-4 space-y-4">
              {c.comments.map((m) => (
                <li key={m.id} className="flex gap-3">
                  {m.anonymous ? (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-crema/8 text-crema/60">
                      <VenetianMask className="size-4" />
                    </span>
                  ) : (
                    <Avatar src={m.authorAvatarUrl} name={m.authorName} className="size-8 shrink-0 text-xs" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className={cn("font-semibold", m.anonymous && "italic text-crema/70")}>{m.authorName}</span>{" "}
                      <span className="text-xs text-crema/40">{m.createdAt ? timeAgo(m.createdAt) : ""}</span>
                    </p>
                    {m.content ? <DiscordContent text={m.content} className="mt-0.5 leading-relaxed text-crema/80" /> : null}
                    <CommentImages urls={m.imageUrls} />
                  </div>
                </li>
              ))}
              {c.comments.length === 0 && <li className="text-sm text-crema/50">Ancora nessuna risposta.</li>}
            </ul>

            <div className="mt-6">
              {!open ? (
                <p className="flex items-center gap-2 text-sm text-crema/50">
                  <Lock className="size-4" /> Discussione chiusa: non si possono aggiungere commenti.
                </p>
              ) : staff && token ? (
                <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-sand/15 focus-within:ring-caramel/60">
                  <textarea name="message"
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
                    onKeyDown={(e) => onComposerEnterSend(e, () => void comment())}
                    onPaste={attach.onPaste}
                    rows={3}
                    placeholder="Scrivi un commento alla discussione…"
                    className="w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-crema/35"
                  />
                  <ImageAttachPreview attach={attach} />
                  <div className="mt-2 flex items-center gap-2">
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
                    <ImageAttachButton attach={attach} />
                    <button type="button" onClick={comment} disabled={!!busy || attach.busy || (!text.trim() && !hasImages)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40">
                      {busy === "comment" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Rispondi
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-crema/50">Alle confessioni risponde lo staff.</p>
              )}
            </div>
          </section>
        </div>
      </motion.aside>
    </motion.div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Link2, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { deleteMusicQuizPack } from "@/lib/musicQuiz";

/** Menu «⋮» sui propri quiz: modifica, copia link, elimina (con conferma). */
export function QuizCardMenu({
  slug,
  title,
  onDeleted,
  className,
  align = "right",
}: {
  slug: string;
  title: string;
  onDeleted?: () => void;
  className?: string;
  align?: "left" | "right";
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(false);
        setConfirm(false);
      }
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), setConfirm(false));
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function copy() {
    const url = `${window.location.origin}${page(`/music-quiz/pack/?slug=${encodeURIComponent(slug)}`)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copia il link del quiz:", url);
    }
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
      setOpen(false);
    }, 1200);
  }

  async function remove() {
    if (!token) return;
    setBusy(true);
    setErr("");
    const r = await deleteMusicQuizPack(token, slug);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setOpen(false);
    onDeleted?.();
  }

  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-crema/85 transition hover:bg-crema/[0.08] hover:text-crema";

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={`Opzioni per ${title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
          setConfirm(false);
        }}
        className="grid size-9 place-items-center rounded-full bg-ink/70 text-crema shadow-lg ring-1 ring-sand/20 backdrop-blur transition hover:bg-ink/90"
      >
        <MoreVertical className="size-4" aria-hidden />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className={cn(
              "absolute top-11 z-30 w-52 rounded-2xl bg-espresso/95 p-1.5 shadow-2xl ring-1 ring-sand/20 backdrop-blur",
              align === "right" ? "right-0" : "left-0",
            )}
            role="menu"
          >
            {confirm ? (
              <div className="p-2">
                <p className="text-sm text-crema">Eliminare «{title}»?</p>
                <p className="mt-1 text-xs text-crema/55">Spariscono anche classifica e commenti. Non si può annullare.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove()}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Elimina
                  </button>
                  <button type="button" onClick={() => setConfirm(false)} className="flex-1 rounded-xl bg-crema/[0.08] px-3 py-2 text-sm font-semibold text-crema">
                    Annulla
                  </button>
                </div>
                {err ? <p className="mt-2 text-xs text-ember">{err}</p> : null}
              </div>
            ) : (
              <>
                <SmartLink href={page(`/music-quiz/crea/?edit=${encodeURIComponent(slug)}`)} className={item} role="menuitem">
                  <Pencil className="size-4" aria-hidden /> Modifica
                </SmartLink>
                <button type="button" onClick={() => void copy()} className={item} role="menuitem">
                  {copied ? <Check className="size-4 text-emerald-400" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
                  {copied ? "Link copiato" : "Copia link"}
                </button>
                <button type="button" onClick={() => setConfirm(true)} className={cn(item, "text-ember hover:text-ember")} role="menuitem">
                  <Trash2 className="size-4" aria-hidden /> Elimina
                </button>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Bug, ImagePlus, Lightbulb, Loader2, Send, X } from "lucide-react";
import { useFormDraft } from "@/components/ui/form-drafts";
import {
  KINDS,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_LEN,
  MIN_LEN,
  TOPICS,
  imageToDataUrl,
  type Board,
  type Kind,
  type Suggestion,
  type Topic,
} from "@/lib/feedback";
import { cn } from "@/lib/cn";
import { useFeedbackApi } from "@/lib/feedback-api";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { UploadRightsHint } from "@/components/UploadRightsHint";

type FeedbackDraft = { kind: Kind; tag: Topic | null; content: string };

const readRaw = (f: File) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = ko;
    r.readAsDataURL(f);
  });

/** Nuovo feedback o modifica del proprio (finché è in valutazione). */
export function Composer({
  token,
  board,
  editing,
  onClose,
  onSaved,
}: {
  token: string;
  board: Board;
  editing?: Suggestion;
  onClose: () => void;
  onSaved: (s: Suggestion, isNew: boolean) => void;
}) {
  const api = useFeedbackApi();
  const [form, setForm] = useState<FeedbackDraft>({
    kind: editing?.kind ?? "suggestion",
    tag: editing?.tag ?? null,
    content: editing?.content ?? "",
  });
  const kind = form.kind;
  const tag = form.tag;
  const text = form.content;
  const setKind = (k: Kind) => setForm((f) => ({ ...f, kind: k }));
  const setTag = (t: Topic | null) => setForm((f) => ({ ...f, tag: t }));
  const setText = (c: string) => setForm((f) => ({ ...f, content: c }));
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const len = text.trim().length;

  const draft = useFormDraft(api.draftKey, form, setForm, {
    watch: true,
    enabled: !editing,
    debounceMs: 280,
    isEmpty: (d) => !d.content.trim() && !d.tag,
  });

  useBodyScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // "Eventi" vale solo per le idee
  useEffect(() => {
    if (kind === "bug" && tag === "eventi") setTag(null);
  }, [kind, tag]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setErr("");
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return setErr(`Hai già raggiunto il massimo di ${MAX_IMAGES} foto.`);
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) continue;
      try {
        // le GIF restano animate se stanno nel limite; il resto viene ridimensionato
        out.push(f.type === "image/gif" && f.size <= MAX_IMAGE_BYTES ? await readRaw(f) : await imageToDataUrl(f));
      } catch {
        setErr("Non riesco a leggere una delle foto.");
      }
    }
    setImages((x) => [...x, ...out].slice(0, MAX_IMAGES));
  };

  const submit = async () => {
    /* feedback del bot: niente argomenti, sono tutti sul bot */
    const useTag: Topic | null = api.topics ? tag : "bots";
    if (!useTag) return setErr("Scegli un argomento prima di inviare.");
    if (len < MIN_LEN) return setErr(`Scrivi almeno ${MIN_LEN} caratteri.`);
    setBusy(true);
    setErr("");
    const res = editing
      ? await api.edit(token, editing.id, { kind, tag: useTag, content: text.trim() })
      : await api.create(token, { board, kind, tag: useTag, content: text.trim(), images });
    setBusy(false);
    if (!res.ok) return setErr(res.message);
    if (!editing) draft.clear();
    onSaved(res.data, !editing);
  };

  return (
    <motion.div className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Chiudi" onClick={() => !busy && onClose()} className="absolute inset-0 bg-ink/80" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Modifica feedback" : "Nuovo feedback"}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-paper p-6 text-ink shadow-2xl sm:rounded-sm sm:p-8"
      >
        <span className="absolute left-1/2 top-3 size-4 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f0b46e,#9a5a24)] shadow" />
        <button type="button" onClick={onClose} disabled={busy} aria-label="Chiudi" className="absolute right-4 top-4 rounded-full p-1.5 text-ink/50 hover:bg-ink/8 hover:text-ink">
          <X className="size-5" />
        </button>
        <h2 className="font-display text-3xl font-bold">{editing ? "Modifica il feedback" : "Scrivi un feedback"}</h2>
        <p className="mt-1 text-sm text-ink/60">Descrivi il caso in modo chiaro: lo leggeranno lo staff e tutta la community.</p>

        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-ink/50">Tipo</p>
        <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-2">
          {KINDS.map((k) => {
            const on = kind === k.id;
            const Icon = k.id === "bug" ? Bug : Lightbulb;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(k.id)}
                className={cn("flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold ring-1 transition-colors", on ? "bg-ink text-paper ring-ink" : "ring-ink/15 hover:bg-ink/5")}
              >
                <Icon className="size-4" /> {k.label}
              </button>
            );
          })}
        </div>

        {api.topics ? (
        <>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-ink/50">Argomento</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TOPICS.map((t) => {
            const off = kind === "bug" && t.id === "eventi";
            return (
              <button
                key={t.id}
                type="button"
                disabled={off}
                aria-pressed={tag === t.id}
                onClick={() => setTag(t.id)}
                title={off ? "Eventi è disponibile solo per le idee" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition-colors disabled:opacity-35",
                  tag === t.id ? "bg-[#9a5a24] text-paper ring-[#9a5a24]" : "ring-ink/15 hover:bg-ink/5",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        </>
        ) : null}

        <label htmlFor="message" className="mt-5 block">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-ink/50">Messaggio</span>
          <textarea id="message" name="message"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            rows={6}
            placeholder="Descrivi l’idea o il problema in modo chiaro..."
            className="mt-2 w-full resize-y rounded-xl bg-white/60 p-4 font-display text-lg leading-snug outline-none ring-1 ring-ink/15 placeholder:text-ink/35 focus:ring-2 focus:ring-[#9a5a24]"
          />
        </label>
        <p className={cn("mt-1 text-right text-xs lining-nums", len < MIN_LEN ? "text-ink/45" : "text-[#3f7d4e]")}>
          {len < MIN_LEN ? `ancora ${MIN_LEN - len} caratteri` : `${len} / ${MAX_LEN}`}
        </p>

        {!editing && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <span key={i} className="relative">
                  <img src={src} alt="" className="size-20 rounded-lg object-cover ring-1 ring-ink/15" />
                  <button
                    type="button"
                    aria-label={`Rimuovi foto ${i + 1}`}
                    onClick={() => setImages((x) => x.filter((_, j) => j !== i))}
                    className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-paper shadow"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink/20 text-xs font-semibold text-ink/55 transition-colors hover:border-[#9a5a24] hover:text-[#9a5a24]"
                >
                  <ImagePlus className="size-5" /> Foto
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink/45">Fino a {MAX_IMAGES} foto (PNG, JPG, WebP o GIF).</p>
            <UploadRightsHint tone="light" className="mt-1" />
            <input name="attachments" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          </div>
        )}

        {err && <p className="mt-4 rounded-lg bg-[#a83a2c]/10 px-3 py-2 text-sm font-medium text-[#a83a2c]">{err}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 font-semibold text-paper transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {editing ? "Salva modifiche" : "Pubblica feedback"}
        </button>
      </motion.div>
    </motion.div>
  );
}

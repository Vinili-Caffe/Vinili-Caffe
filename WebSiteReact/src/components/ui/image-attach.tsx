"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { imageToDataUrl } from "@/lib/feedback";
import { cn } from "@/lib/cn";

export const COMMENT_IMAGES_MAX = 3;

/**
 * Foto da allegare a un commento: tasto "Foto", miniature con la X per toglierle.
 * Le foto si rimpiccioliscono nel browser (max 1600px) prima dell'invio; si possono anche incollare (Ctrl+V)
 * nel campo di testo passando `onPaste={attach.onPaste}`.
 */
export function useImageAttach(max = COMMENT_IMAGES_MAX) {
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = async (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, max - images.length));
    if (!list.length) return;
    setBusy(true);
    setErr("");
    try {
      const out = await Promise.all(list.map((f) => imageToDataUrl(f)));
      setImages((cur) => [...cur, ...out].slice(0, max));
    } catch {
      setErr("Questa foto non si riesce ad aprire.");
    }
    setBusy(false);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    void add(files);
  };

  return { images, busy, err, add, onPaste, remove: (i: number) => setImages((cur) => cur.filter((_, j) => j !== i)), clear: () => setImages([]), max };
}

export type ImageAttachState = ReturnType<typeof useImageAttach>;

/** Tasto per scegliere le foto (va nella riga dei bottoni del commento). */
export function ImageAttachButton({ attach, className }: { attach: ImageAttachState; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const full = attach.images.length >= attach.max;
  return (
    <>
      <input
        ref={input}
        id="vc-comment-images"
        name="commentImages"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void attach.add([...(e.target.files || [])]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={full || attach.busy}
        onClick={() => input.current?.click()}
        title={full ? `Massimo ${attach.max} foto` : "Aggiungi foto"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors disabled:opacity-40",
          className ?? "text-crema/70 ring-sand/20 hover:bg-crema/8 hover:text-crema",
        )}
      >
        {attach.busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
        Foto{attach.images.length ? ` ${attach.images.length}/${attach.max}` : ""}
      </button>
    </>
  );
}

/** Miniature delle foto scelte, prima dell'invio. */
export function ImageAttachPreview({ attach }: { attach: ImageAttachState }) {
  if (!attach.images.length && !attach.err) return null;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {attach.images.map((src, i) => (
            <motion.div
              key={src.slice(-40)}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative size-16 overflow-hidden rounded-xl ring-1 ring-sand/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-cover" data-vc-lightbox-ignore />
              <button
                type="button"
                aria-label="Togli la foto"
                onClick={() => attach.remove(i)}
                className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <X className="size-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {attach.err ? <p className="mt-1 text-xs text-[#e2836f] light:text-[#a83a2c]">{attach.err}</p> : null}
    </div>
  );
}

/** Foto di un commento già pubblicato: si aprono nel visualizzatore. */
export function CommentImages({ urls, className }: { urls?: string[]; className?: string }) {
  if (!urls?.length) return null;
  return (
    <div className={cn("mt-2 flex flex-wrap gap-2", className)} data-vc-lightbox-gallery>
      {urls.map((u) => (
        <a key={u} href={u} data-vc-lightbox className="block overflow-hidden rounded-xl ring-1 ring-sand/15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="Foto nel commento" loading="lazy" className="h-28 w-auto max-w-[14rem] object-cover transition-transform duration-300 hover:scale-105 sm:h-32" />
        </a>
      ))}
    </div>
  );
}

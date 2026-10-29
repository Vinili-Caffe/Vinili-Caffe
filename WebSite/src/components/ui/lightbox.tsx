"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Download, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { createStore } from "./store";

/**
 * Lightbox immagini (E8). Apre da codice o da click su
 * `[data-vc-lightbox]` / `[data-vc-lightbox-gallery]`.
 * Ignora `[data-vc-lightbox-ignore]`, video e click con modificatori.
 */

export type LightboxItem = { url: string; alt: string };

type LightboxState = {
  open: boolean;
  items: LightboxItem[];
  index: number;
  zoom: number;
};

const CLOSED: LightboxState = { open: false, items: [], index: 0, zoom: 1 };
const lightboxStore = createStore<LightboxState>(CLOSED);

export function isVideoUrl(raw: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(raw || ""));
}

export function isImageUrl(raw: string): boolean {
  const u = String(raw || "").trim();
  if (!u || u === "#" || /^javascript:/i.test(u)) return false;
  if (isVideoUrl(u)) return false;
  if (/\.(gif|png|jpe?g|webp|avif|bmp|svg)(\?|#|$)/i.test(u)) return true;
  if (/cdn\.discordapp\.com\/attachments|media\.discordapp\.net\/attachments/i.test(u)) return true;
  if (/media\.tenor\.com|tenor\.com\/.*\.gif|giphy\.com\/media/i.test(u)) return true;
  if (/\/webhooks\/site-(?:web-tickets|bot-feedback|suggestions|[^/]+-workflow-chat)\/files\//i.test(u)) return true;
  if (/\/webhooks\/site-discussion-images\//i.test(u)) return true;
  if (/\/(?:uploads|files|attachments|media)\//i.test(u)) return true;
  return false;
}

function normalizeUrl(raw: string): string {
  const u = String(raw || "").trim();
  if (!u) return "";
  try {
    return new URL(u, window.location.href).href;
  } catch {
    return u;
  }
}

function asImage(raw: string, alt = ""): LightboxItem | null {
  const url = normalizeUrl(raw);
  if (!url || !isImageUrl(url)) return null;
  return { url, alt };
}

export function openLightbox(items: Array<string | { url?: string; src?: string; alt?: string }>, startIndex = 0): boolean {
  const list: LightboxItem[] = [];
  for (const it of items) {
    if (!it) continue;
    const img = typeof it === "string" ? asImage(it) : asImage(it.url || it.src || "", String(it.alt || ""));
    if (img) list.push(img);
  }
  if (!list.length) return false;
  const index = Math.max(0, Math.min(list.length - 1, Number(startIndex) || 0));
  lightboxStore.set({ open: true, items: list, index, zoom: 1 });
  return true;
}

export function closeLightbox() {
  if (!lightboxStore.get().open) return;
  lightboxStore.set(CLOSED);
}

export function lightboxIsOpen(): boolean {
  return lightboxStore.get().open;
}

function showIndex(index: number) {
  const cur = lightboxStore.get();
  if (!cur.open || !cur.items.length) return;
  const n = cur.items.length;
  const i = ((index % n) + n) % n;
  lightboxStore.set({ ...cur, index: i, zoom: 1 });
}

function setZoom(z: number) {
  const cur = lightboxStore.get();
  if (!cur.open) return;
  const zoom = Math.max(1, Math.min(5, Number(z) || 1));
  lightboxStore.set({ ...cur, zoom });
}

function readUrl(el: Element | null): { url: string; alt: string } | null {
  if (!el || el.closest("[data-vc-lightbox-ignore]")) return null;
  let raw = "";
  let alt = el.getAttribute("alt") || el.getAttribute("aria-label") || "";
  if (el instanceof HTMLAnchorElement) raw = el.getAttribute("href") || "";
  else if (el instanceof HTMLImageElement) {
    raw = el.currentSrc || el.getAttribute("src") || el.getAttribute("data-src") || "";
    alt = el.getAttribute("alt") || alt;
  } else {
    const img = el.querySelector("img");
    const href = el.getAttribute("href") || el.getAttribute("data-src") || "";
    if (href) raw = href;
    else if (img) {
      raw = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || "";
      alt = img.getAttribute("alt") || alt;
    }
  }
  const img = asImage(raw, alt);
  return img;
}

const SKIP_SEL = [
  "[data-vc-lightbox-ignore]",
  "[data-vc-avatar]",
  "[data-vc-presence-zone]",
  "[data-vc-ui='lightbox']",
  "header a[href='/']",
  ".vc-boot-logo",
].join(",");

function shouldSkip(el: Element | null): boolean {
  if (!el || !el.closest) return true;
  if (el.closest(SKIP_SEL)) return true;
  // avatar / emoji / icone piccole: non aprire lightbox
  if (el instanceof HTMLImageElement) {
    if (el.hasAttribute("data-vc-avatar") || el.classList.contains("rounded-full")) return true;
    const cls = el.className || "";
    if (/\bsize-(?:3|4|5|6|7|8)\b/.test(cls) && !el.closest("[data-vc-lightbox-gallery]")) return true;
  }
  return false;
}

function collectGallery(gallery: Element, prefer: string) {
  const items: LightboxItem[] = [];
  const seen = new Set<string>();
  gallery.querySelectorAll("a[href], img, [data-vc-lightbox]").forEach((node) => {
    if (shouldSkip(node) && !(node instanceof HTMLAnchorElement)) return;
    const img = readUrl(node);
    if (!img || seen.has(img.url)) return;
    seen.add(img.url);
    items.push(img);
  });
  let index = 0;
  if (prefer) {
    const found = items.findIndex((it) => it.url === prefer);
    if (found >= 0) index = found;
  }
  return items.length ? { items, index } : null;
}

/**
 * Parità vc-image-lightbox: link immagine → apre in sito;
 * img marcate / in gallery / allegati webhook → idem.
 */
function resolveClick(target: Element): { items: LightboxItem[]; index: number } | null {
  if (target.closest("[data-vc-ui='lightbox'], [data-vc-lightbox-ignore]")) return null;

  const anchor = target.closest("a[href]");
  if (anchor instanceof HTMLAnchorElement) {
    if (shouldSkip(anchor)) return null;
    const href = anchor.getAttribute("href") || "";
    const current = asImage(href, anchor.getAttribute("aria-label") || "");
    if (!current) return null;
    const gallery = anchor.closest("[data-vc-lightbox-gallery]");
    if (gallery) return collectGallery(gallery, current.url);
    return { items: [current], index: 0 };
  }

  const imgOnly = target.closest("img");
  if (!imgOnly || shouldSkip(imgOnly)) return null;
  const current = readUrl(imgOnly);
  if (!current) return null;
  const gallery = imgOnly.closest("[data-vc-lightbox-gallery]");
  if (gallery) return collectGallery(gallery, current.url);
  if (
    imgOnly.hasAttribute("data-vc-lightbox") ||
    imgOnly.classList.contains("vc-lightboxable") ||
    imgOnly.closest("[data-vc-lightbox]")
  ) {
    return { items: [current], index: 0 };
  }
  // allegati / upload: apri anche senza marker (come vecchio sito)
  if (/\/(?:webhooks\/site-|uploads\/|files\/|attachments\/|media\/)/i.test(current.url) || /cdn\.discordapp\.com\/attachments|media\.discordapp\.net/i.test(current.url)) {
    return { items: [current], index: 0 };
  }
  return null;
}

export function useLightbox() {
  const state = useSyncExternalStore(lightboxStore.subscribe, lightboxStore.get, () => CLOSED);
  return {
    open: openLightbox,
    close: closeLightbox,
    isOpen: state.open,
    index: state.index,
    items: state.items,
    isImageUrl,
  };
}

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(lightboxStore.subscribe, lightboxStore.get, () => CLOSED);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      if (lightboxStore.get().open) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const resolved = resolveClick(target);
      if (!resolved) return;
      ev.preventDefault();
      ev.stopPropagation();
      openLightbox(resolved.items, resolved.index);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <>
      {children}
      {mounted &&
        createPortal(<AnimatePresence>{state.open && state.items.length ? <Viewer key="vc-lightbox" state={state} /> : null}</AnimatePresence>, document.body)}
    </>
  );
}

/** Visualizzatore a schermo intero: scorri per cambiare foto, trascina giù per chiudere, pizzica o rotella per ingrandire. */
function Viewer({ state }: { state: LightboxState }) {
  useBodyScrollLock(true);
  const reduce = useReducedMotion();
  const item = state.items[state.index];
  const multi = state.items.length > 1;
  const zoomed = state.zoom > 1.01;
  const [dir, setDir] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [pinching, setPinching] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const [bounds, setBounds] = useState({ x: 0, y: 0 });

  const go = (step: number) => {
    setDir(step);
    showIndex(lightboxStore.get().index + step);
  };

  useEffect(() => setLoaded(false), [item?.url]);

  // quanto si può spostare l'immagine ingrandita (metà dell'eccedenza per lato)
  useEffect(() => {
    const img = imgRef.current;
    const frame = frameRef.current;
    if (!img || !frame) return;
    setBounds({
      x: Math.max(0, (img.offsetWidth * state.zoom - frame.clientWidth) / 2),
      y: Math.max(0, (img.offsetHeight * state.zoom - frame.clientHeight) / 2),
    });
  }, [state.zoom, loaded, item?.url]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const k = ev.key;
      if (k === "Escape") closeLightbox();
      else if (k === "ArrowLeft") go(-1);
      else if (k === "ArrowRight") go(1);
      else if (k === "+" || k === "=") setZoom(lightboxStore.get().zoom + 0.5);
      else if (k === "-" || k === "_") setZoom(lightboxStore.get().zoom - 0.5);
      else if (k === "0") setZoom(1);
      else return;
      ev.preventDefault();
      ev.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    const frame = frameRef.current;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      setZoom(lightboxStore.get().zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    frame?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", onKey, true);
      frame?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pizzico con due dita
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: lightboxStore.get().zoom };
      setPinching(true);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom((pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch.current.d));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && pinch.current) {
      pinch.current = null;
      setPinching(false);
    }
  };

  const fade = reduce ? { duration: 0 } : { duration: 0.2 };
  const slide = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 36 };

  return (
    <motion.div
      data-vc-ui="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Foto"
      className="fixed inset-0 z-[120] flex flex-col bg-black/90 text-crema backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
    >
      {/* barra in alto: si nasconde con un tocco sulla foto */}
      <motion.div
        className="absolute inset-x-0 top-0 z-[3] flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5"
        animate={{ opacity: chrome ? 1 : 0, y: chrome ? 0 : -12 }}
        transition={fade}
        style={{ pointerEvents: chrome ? "auto" : "none" }}
      >
        <span className="min-w-12 text-sm font-medium tabular-nums text-crema/80" aria-live="polite">
          {multi ? `${state.index + 1} di ${state.items.length}` : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <IconBtn label={zoomed ? "Rimpicciolisci" : "Ingrandisci"} onClick={() => setZoom(zoomed ? 1 : 2.5)}>
            {zoomed ? <ZoomOut className="size-[1.1rem]" /> : <ZoomIn className="size-[1.1rem]" />}
          </IconBtn>
          <a
            href={item.url}
            target="_blank"
            rel="noopener"
            download
            aria-label="Apri l'originale"
            title="Apri l'originale"
            data-vc-lightbox-ignore
            className={iconBtnCls}
          >
            <Download className="size-[1.1rem]" />
          </a>
          <IconBtn label="Chiudi" onClick={closeLightbox}>
            <X className="size-5" />
          </IconBtn>
        </div>
      </motion.div>

      {/* foto */}
      <div
        ref={frameRef}
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeLightbox();
        }}
      >
        {!loaded && <Loader2 className="absolute size-7 animate-spin text-crema/60" aria-hidden />}
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={item.url}
            className="flex max-h-full max-w-full items-center justify-center"
            initial={{ opacity: 0, x: dir * 80, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: dir * -80 }}
            transition={slide}
          >
            <motion.div
              drag={!pinching}
              dragConstraints={
                zoomed ? { left: -bounds.x, right: bounds.x, top: -bounds.y, bottom: bounds.y } : { left: 0, right: 0, top: 0, bottom: 0 }
              }
              dragElastic={zoomed ? 0.12 : 0.6}
              dragMomentum={zoomed}
              onDragEnd={(_, info) => {
                if (zoomed) return;
                const { offset, velocity } = info;
                if (Math.abs(offset.x) > Math.abs(offset.y)) {
                  if (multi && (offset.x < -70 || velocity.x < -500)) go(1);
                  else if (multi && (offset.x > 70 || velocity.x > 500)) go(-1);
                } else if (offset.y > 110 || velocity.y > 700) closeLightbox();
              }}
              onTap={() => setChrome((c) => !c)}
              onDoubleClick={() => setZoom(zoomed ? 1 : 2.5)}
              animate={zoomed ? undefined : { x: 0, y: 0 }}
              className={cn("flex items-center justify-center", zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
            >
              {/* URL arbitrari (Discord, ticket): next/image non ha i remote pattern. */}
              <motion.img
                ref={imgRef}
                src={item.url}
                alt={item.alt}
                draggable={false}
                onLoad={() => setLoaded(true)}
                animate={{ scale: state.zoom, opacity: loaded ? 1 : 0 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                className="max-h-[calc(100dvh-9rem)] max-w-[100vw] select-none rounded-lg object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] sm:max-w-[min(92vw,1400px)]"
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {multi && (
          <>
            <button type="button" aria-label="Precedente" onClick={() => go(-1)} className={navBtn + " left-2 sm:left-5"}>
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" aria-label="Successiva" onClick={() => go(1)} className={navBtn + " right-2 sm:right-5"}>
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>

      {/* didascalia + miniature */}
      <motion.div
        className="z-[3] flex flex-col items-center gap-2 px-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2"
        animate={{ opacity: chrome ? 1 : 0 }}
        transition={fade}
        style={{ pointerEvents: chrome ? "auto" : "none" }}
      >
        {item.alt && !/^allegato$/i.test(item.alt) ? <p className="max-w-2xl truncate text-center text-sm text-crema/70">{item.alt}</p> : null}
        {multi && (
          <div className="flex max-w-full gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
            {state.items.map((it, i) => (
              <button
                key={it.url}
                type="button"
                aria-label={`Foto ${i + 1}`}
                aria-current={i === state.index}
                onClick={() => (setDir(i > state.index ? 1 : -1), showIndex(i))}
                className={cn(
                  "size-12 shrink-0 overflow-hidden rounded-lg ring-2 transition sm:size-14",
                  i === state.index ? "opacity-100 ring-ember" : "opacity-45 ring-transparent hover:opacity-80",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

const iconBtnCls =
  "inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-crema backdrop-blur transition hover:bg-white/20";

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={iconBtnCls}>
      {children}
    </button>
  );
}

const navBtn =
  "absolute top-1/2 z-[2] hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-crema backdrop-blur transition hover:bg-white/20 sm:inline-flex";

/** Immagine cliccabile che apre il lightbox. */
export function LightboxImage({
  src,
  alt = "",
  className,
  imgClassName,
}: {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <button type="button" onClick={() => openLightbox([{ url: src, alt }])} className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={imgClassName} />
    </button>
  );
}

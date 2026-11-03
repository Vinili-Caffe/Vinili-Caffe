"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Info, Loader2, RotateCcw, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import {
  RANK_COLOR_FIELDS,
  normalizeHex,
  previewRankCard,
  rankFontStack,
  rankFontsCssUrl,
  resetRankCard,
  saveRankCard,
  loadRankCard,
  type RankCardState,
  type RankTheme,
} from "@/lib/personalizza";
import { confirmDialog, Range } from "@/components/ui";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { ColorKnob } from "./ColorKnob";

const MAX_WALL_DATAURL = 8_000_000;
const PREVIEW_CACHE_KEY = "vc_rank_customize_preview_cache_v6";
const PREVIEW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RANK_TAB_STORAGE_KEY = "vc_rank_customize_tab";

/** Come il sito vecchio: max 1600px di larghezza, JPEG che scende di qualità finché ci sta; le GIF restano com'erano. */
async function optimizeWallpaper(file: File): Promise<string> {
  const read = () =>
    new Promise<string>((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result || ""));
      r.onerror = () => ko(new Error("read_failed"));
      r.readAsDataURL(file);
    });
  const dataUrl = await read();
  if (file.type === "image/gif") {
    if (dataUrl.length > MAX_WALL_DATAURL) throw new Error("too_large");
    return dataUrl;
  }
  const img = await new Promise<HTMLImageElement>((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error("load_failed"));
    i.src = dataUrl;
  });
  const scale = img.width > 1600 ? 1600 / img.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const q of [0.86, 0.78, 0.7]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length <= MAX_WALL_DATAURL) return out;
  }
  throw new Error("too_large");
}

/** Gradiente che il bot disegna con lo sfondo "Default" (rankCanvas.js). */
const DEFAULT_WALL_CSS = "linear-gradient(135deg, #1a1f36 0%, #123f78 55%, #006777 100%)";

const FAST_KEYS = new Set<string>([...RANK_COLOR_FIELDS.map((f) => f.key), "overlayOpacity"]);

function themeSignature(t: RankTheme): string {
  return [
    t.panelColor,
    t.primaryTextColor,
    t.multiplierColor,
    t.valueColor,
    t.labelColor,
    t.overlayOpacity,
    t.wallpaperKey,
    t.wallpaperUrl?.slice(0, 64),
    t.wallpaperUrlOmitted ? "stored" : "",
    t.fontKey,
  ].join("|");
}

function themesEqual(a: RankTheme, b: RankTheme) {
  return themeSignature(a) === themeSignature(b);
}

function lightenHex(hex: string, amount = 0.35) {
  const h = normalizeHex(hex).replace("#", "");
  if (h.length !== 6) return normalizeHex(hex);
  const n = (i: number) => Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) + (255 - parseInt(h.slice(i, i + 2), 16)) * amount));
  return `#${[0, 2, 4].map((i) => n(i).toString(16).padStart(2, "0")).join("")}`;
}

/** Cascata come rankPrimaryDrives1 (mergeRankCardTheme lato bot). */
function withColorCascade(partial: Partial<RankTheme>): Partial<RankTheme> {
  const next = { ...partial };
  if (partial.primaryTextColor) {
    const hex = normalizeHex(partial.primaryTextColor);
    next.primaryTextColor = hex;
    next.secondaryTextColor = hex;
    next.progressStartColor = hex;
    next.progressEndColor = lightenHex(hex, 0.35);
    next.ringColor = hex;
  }
  if (partial.labelColor) {
    next.labelColor = normalizeHex(partial.labelColor);
  }
  return next;
}

function loadCachedPreview(signature: string): string {
  try {
    const raw = sessionStorage.getItem(PREVIEW_CACHE_KEY) || localStorage.getItem(PREVIEW_CACHE_KEY) || "";
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { signature?: string; ts?: number; dataUrl?: string };
    if (String(parsed.signature || "") !== signature) return "";
    if (Date.now() - Number(parsed.ts || 0) > PREVIEW_CACHE_TTL_MS) return "";
    const dataUrl = String(parsed.dataUrl || "");
    return dataUrl.startsWith("data:image/") ? dataUrl : "";
  } catch {
    return "";
  }
}

function saveCachedPreview(signature: string, dataUrl: string) {
  try {
    if (!signature || !dataUrl.startsWith("data:image/")) return;
    const serialized = JSON.stringify({ ts: Date.now(), signature, dataUrl });
    try {
      sessionStorage.setItem(PREVIEW_CACHE_KEY, serialized);
    } catch {
      /* quota */
    }
    try {
      localStorage.setItem(PREVIEW_CACHE_KEY, serialized);
    } catch {
      /* quota */
    }
  } catch {
    /* ignore */
  }
}

async function blobUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result || ""));
    r.onerror = () => ko(new Error("read_failed"));
    r.readAsDataURL(blob);
  });
}

function readRankTab(): "colors" | "wallpaper" {
  try {
    const q = new URLSearchParams(window.location.search).get("rankTab");
    if (q === "wallpaper" || q === "sfondo" || q === "wall") return "wallpaper";
    if (q === "colors" || q === "colori") return "colors";
    const stored = sessionStorage.getItem(RANK_TAB_STORAGE_KEY);
    if (stored === "wallpaper") return "wallpaper";
  } catch {
    /* ignore */
  }
  return "colors";
}

function writeRankTab(tab: "colors" | "wallpaper") {
  try {
    sessionStorage.setItem(RANK_TAB_STORAGE_KEY, tab);
    const url = new URL(window.location.href);
    url.searchParams.set("rankTab", tab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

/** Overlay CSS locale durante il drag opacità (niente PNG a ogni tick). */
function LocalOpacityOverlay({
  panelColor,
  live,
  baked,
}: {
  panelColor: string;
  live: number;
  baked: number;
}) {
  const alpha = Math.max(0, Math.min(1, live));
  const bake = Math.max(0, Math.min(1, baked));
  const delta = alpha - bake;
  if (Math.abs(delta) < 0.004) return null;
  if (delta >= 0) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: panelColor || "#202225", opacity: Math.min(0.95, delta * 1.05) }}
      />
    );
  }
  const drop = Math.abs(delta);
  const towardClear = bake > 0.001 ? Math.min(1, drop / bake) : 1;
  const strength = Math.max(drop * 1.35, towardClear * 0.55);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 mix-blend-soft-light"
      style={{ background: "rgba(248, 244, 236, 0.22)", opacity: Math.min(0.98, 0.12 + strength * 0.9) }}
    />
  );
}

/** Deck della rank card: colori, wallpaper, font, anteprima live dal server. */
export function RankDeck({
  initial,
  token,
  onToast,
  onThemeSynced,
}: {
  initial: RankCardState;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  /** Se il polling trova un tema salvato diverso (es. da Discord), aggiorna il parent. */
  onThemeSynced?: (state: RankCardState) => void;
}) {
  const [draft, setDraft] = useState<RankTheme>(() => ({ ...initial.theme }));
  const [saved, setSaved] = useState<RankTheme>(() => ({ ...initial.theme }));
  const [busy, setBusy] = useState(false);
  const [subTab, setSubTab] = useState<"colors" | "wallpaper">("colors");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [opacityDragging, setOpacityDragging] = useState(false);
  const [bakedOpacity, setBakedOpacity] = useState(() => Number(initial.theme.overlayOpacity ?? 0.8));
  const previewObj = useRef<string | null>(null);
  const seqRef = useRef(0);
  const fastRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const canCustomWp = Boolean(initial.permissions?.canUseCustomWallpaper);
  const hasCustom = Boolean(draft.wallpaperUrl || draft.wallpaperUrlOmitted);
  const defaults = initial.defaults;
  const fonts = initial.fonts.length ? initial.fonts : [{ key: "arial", label: "Arial" }];
  const fontIdx = Math.max(
    0,
    fonts.findIndex((f) => f.key === (draft.fontKey || fonts[0]?.key || "arial")),
  );
  const fontLabel = fonts[fontIdx]?.label || fonts[0]?.label || "Arial";
  /* code-point slice: `.slice(0,18)` spezza le emoji → URIError su Safari in encodeURIComponent */
  const sampleText = [...(initial.displayName || initial.username || "Vinili")].slice(0, 18).join("");

  const liveOpacity = Number(draft.overlayOpacity ?? 0.8);
  const opacityDelta = liveOpacity - bakedOpacity;
  const imgFilter = useMemo(() => {
    if (opacityDelta >= -0.004) return undefined;
    const drop = Math.abs(opacityDelta);
    const towardClear = bakedOpacity > 0.001 ? Math.min(1, drop / bakedOpacity) : 1;
    const strength = Math.max(drop * 1.35, towardClear * 0.55);
    const lift = Math.min(0.72, 0.08 + strength * 0.7);
    return `brightness(${1 + lift}) contrast(${1 - lift * 0.42}) saturate(${Math.max(0.55, 1 - lift * 0.35)})`;
  }, [opacityDelta, bakedOpacity]);

  // tab da URL / sessionStorage
  useEffect(() => {
    setSubTab(readRankTab());
  }, []);

  // carica solo i glifi del nome per far vedere ogni font sulle tessere
  useEffect(() => {
    try {
      const href = rankFontsCssUrl(fonts, sampleText);
      if (!href || document.querySelector(`link[href="${CSS.escape(href)}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    } catch {
      /* nome con UTF-16 rotto: niente font subset, la pagina resta usabile */
    }
  }, [fonts, sampleText]);

  useEffect(() => {
    setDraft({ ...initial.theme });
    setSaved({ ...initial.theme });
    setBakedOpacity(Number(initial.theme.overlayOpacity ?? 0.8));
  }, [initial]);

  // cache: se la firma coincide, mostra subito l'ultima PNG
  useEffect(() => {
    const cached = loadCachedPreview(themeSignature(initial.theme));
    if (cached) setPreviewUrl(cached);
  }, [initial.theme]);

  // anteprima server (salta durante drag opacità)
  useEffect(() => {
    if (opacityDragging) return;
    const seq = ++seqRef.current;
    const sig = themeSignature(draft);
    const cached = loadCachedPreview(sig);
    if (cached && !previewUrl) setPreviewUrl(cached);

    const timer = window.setTimeout(async () => {
      setPreviewing(true);
      const url = await previewRankCard(token, draft);
      if (seq !== seqRef.current) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      setPreviewing(false);
      if (!url) return;
      const old = previewObj.current;
      if (old) window.setTimeout(() => URL.revokeObjectURL(old), 600);
      previewObj.current = url;
      setPreviewUrl(url);
      setBakedOpacity(Number(draft.overlayOpacity ?? 0.8));
      void blobUrlToDataUrl(url)
        .then((dataUrl) => saveCachedPreview(sig, dataUrl))
        .catch(() => null);
    }, fastRef.current ? 180 : 420);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewUrl solo seed cache
  }, [draft, token, opacityDragging]);

  useEffect(
    () => () => {
      if (previewObj.current) URL.revokeObjectURL(previewObj.current);
    },
    [],
  );

  // sync tema da altro device / Discord — WS rank_card_changed + fallback lento
  useLiveRefresh(
    async () => {
      if (!themesEqual(draftRef.current, saved)) return;
      const r = await loadRankCard(token);
      if (!r.ok) return;
      if (!themesEqual(r.data.theme, saved)) {
        setDraft({ ...r.data.theme });
        setSaved({ ...r.data.theme });
        setBakedOpacity(Number(r.data.theme.overlayOpacity ?? 0.8));
        onThemeSynced?.(r.data);
      }
    },
    { intervalMs: 120_000, enabled: Boolean(token), boot: false, topics: ["rank_card"] },
  );

  function patch(partial: Partial<RankTheme>) {
    const cascaded = withColorCascade(partial);
    fastRef.current = Object.keys(cascaded).every((k) => FAST_KEYS.has(k));
    setDraft((d) => ({ ...d, ...cascaded }));
  }

  function setRankSubTab(next: "colors" | "wallpaper") {
    setSubTab(next);
    writeRankTab(next);
  }

  async function onSave() {
    if (busy) return;
    setBusy(true);
    const r = await saveRankCard(token, draft);
    setBusy(false);
    if (!r.ok) {
      onToast(r.message, true);
      return;
    }
    setDraft({ ...r.data });
    setSaved({ ...r.data });
    setBakedOpacity(Number(r.data.overlayOpacity ?? 0.8));
    onToast("Salvato. Usa +rank su Discord per vedere la card aggiornata.");
  }

  async function onReset() {
    if (busy) return;
    if (!(await confirmDialog({ message: "Resettare la personalizzazione della rank card?", danger: true }))) return;
    setBusy(true);
    const r = await resetRankCard(token);
    setBusy(false);
    if (!r.ok) {
      onToast(r.message, true);
      return;
    }
    setDraft({ ...r.data });
    setSaved({ ...r.data });
    setBakedOpacity(Number(r.data.overlayOpacity ?? 0.8));
    try {
      sessionStorage.removeItem(PREVIEW_CACHE_KEY);
      localStorage.removeItem(PREVIEW_CACHE_KEY);
    } catch {
      /* ignore */
    }
    onToast(r.message || "Rank card resettata.");
  }

  async function onCustomFile(file: File | null) {
    if (!file || !canCustomWp) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      onToast("Usa un'immagine PNG, JPEG, WebP o GIF.", true);
      return;
    }
    try {
      const dataUrl = await optimizeWallpaper(file);
      patch({ wallpaperUrl: dataUrl, wallpaperKey: "default", wallpaperUrlOmitted: false });
    } catch {
      onToast("Immagine troppo grande per lo sfondo custom.", true);
    }
  }

  const beginOpacityDrag = useCallback(() => {
    setOpacityDragging(true);
    seqRef.current += 1; // invalida preview in volo
  }, []);

  const finishOpacityDrag = useCallback(() => {
    setOpacityDragging(false);
    fastRef.current = true;
    // forza un tick di preview dopo il drag
    setDraft((d) => ({ ...d }));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* anteprima: resta incollata sotto la barra mentre si scorre tra i controlli */}
      <div className="sticky top-[4.25rem] z-20 sm:top-20">
        <div className="rounded-[1.6rem] bg-roast/85 p-2 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.9)] ring-1 ring-caramel/35 backdrop-blur-xl sm:p-2.5">
          <div className="relative aspect-[934/282] overflow-hidden rounded-[1.15rem] bg-espresso/80">
            <AnimatePresence initial={false}>
              {previewUrl ? (
                <motion.img
                  key={previewUrl}
                  src={previewUrl}
                  alt="Anteprima rank card"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ filter: imgFilter }}
                  className={cn(
                    "absolute inset-0 size-full object-contain transition-[filter,opacity] duration-150",
                    previewing && !opacityDragging && "opacity-75 saturate-[0.85]",
                  )}
                />
              ) : (
                <motion.div
                  key="ph"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-crema/40"
                >
                  {previewing && <Loader2 className="size-4 animate-spin text-caramel" />}
                  {previewing ? "Preparo la card…" : "Nessuna anteprima"}
                </motion.div>
              )}
            </AnimatePresence>
            <LocalOpacityOverlay panelColor={String(draft.panelColor || "#202225")} live={liveOpacity} baked={bakedOpacity} />
            <AnimatePresence>
              {previewing && previewUrl && !opacityDragging && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-espresso/85 px-2.5 py-1 text-[0.65rem] font-semibold text-crema/75 ring-1 ring-sand/20 backdrop-blur"
                >
                  <Loader2 className="size-3 animate-spin text-caramel" /> Aggiorno
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-crema/45">
        <span className="font-semibold uppercase tracking-[0.24em] text-caramel">Anteprima live</span> · {initial.displayName} · Lv{" "}
        <span className="lining-nums">{initial.stats.level}</span> · ×{Number(initial.stats.multiplier || 1).toFixed(1)}
      </p>

      {/* controlli */}
      <div className="space-y-4">
        <div className="flex gap-1 rounded-full bg-crema/5 p-1 ring-1 ring-sand/15" role="tablist">
          {(
            [
              ["colors", "Colori & font"],
              ["wallpaper", "Sfondo"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              onClick={() => setRankSubTab(id)}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
                subTab === id ? "bg-caramel text-ink" : "text-crema/65 hover:text-crema",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab === "colors" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {RANK_COLOR_FIELDS.map((f) => (
              <ColorKnob
                key={f.key}
                id={`rank-${f.key}`}
                name={f.key}
                label={f.title}
                subtitle={f.subtitle}
                value={String(draft[f.key] || defaults[f.key] || "#202225")}
                onChange={(hex) => patch({ [f.key]: normalizeHex(hex) })}
              />
            ))}
            <label className="block rounded-2xl bg-espresso/50 px-3 py-3 ring-1 ring-sand/12 sm:col-span-2">
              <span className="flex items-center justify-between text-sm font-semibold">
                Opacità overlay
                <span className="font-mono text-xs text-caramel lining-nums">{Math.round(liveOpacity * 100)}%</span>
              </span>
              <div
                className="mt-2"
                onPointerDown={beginOpacityDrag}
                onPointerUp={finishOpacityDrag}
                onPointerCancel={finishOpacityDrag}
              >
                <Range
                  id="rank-overlay-opacity"
                  min={0}
                  max={100}
                  value={Math.round(liveOpacity * 100)}
                  onChange={(n) => {
                    const next = n / 100;
                    setDraft((d) => ({ ...d, overlayOpacity: next }));
                  }}
                  className="w-full"
                  aria-label="Opacità overlay"
                />
              </div>
            </label>
            <section className="rounded-2xl bg-espresso/50 p-3 ring-1 ring-sand/12 sm:col-span-2" aria-labelledby="rank-font-title">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <h3 id="rank-font-title" className="text-sm font-semibold">
                  Font
                </h3>
                <span className="truncate text-xs text-crema/45">
                  Scelto: <span className="font-semibold text-caramel">{fontLabel}</span>
                </span>
              </div>
              <div role="radiogroup" aria-labelledby="rank-font-title" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fonts.map((f, i) => {
                  const on = i === fontIdx;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => patch({ fontKey: f.key })}
                      className={cn(
                        "group relative min-w-0 rounded-xl px-3 pb-2 pt-2.5 text-left transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out",
                        on
                          ? "bg-caramel/15 ring-2 ring-caramel"
                          : "bg-crema/[0.04] ring-1 ring-sand/12 hover:-translate-y-0.5 hover:bg-crema/[0.07] hover:ring-sand/30",
                      )}
                    >
                      <span
                        className={cn("block truncate text-lg leading-tight", on ? "text-crema" : "text-crema/85")}
                        style={{ fontFamily: rankFontStack(f) }}
                      >
                        {sampleText}
                      </span>
                      <span className={cn("mt-1 block truncate text-[0.68rem] font-medium", on ? "text-caramel" : "text-crema/40")}>
                        {f.label}
                      </span>
                      {on && (
                        <motion.span
                          layoutId="rank-font-check"
                          className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-caramel text-ink"
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {hasCustom && (
                <div className="relative overflow-hidden rounded-2xl ring-2 ring-caramel shadow-[0_0_0_1px_rgba(217,154,91,0.4)]">
                  {draft.wallpaperUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.wallpaperUrl} alt="" className="aspect-video w-full object-cover" />
                  ) : previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-mocha text-crema/40">
                      <ImagePlus className="size-5" />
                    </div>
                  )}
                  <span className="flex items-center justify-center gap-1 bg-espresso/80 px-2 py-1.5 text-[0.7rem] font-semibold text-caramel">
                    <Check className="size-3" strokeWidth={3} /> Il tuo sfondo
                  </span>
                </div>
              )}
              {initial.wallpapers.map((w) => {
                const on = !hasCustom && draft.wallpaperKey === w.key;
                return (
                  <button
                    key={w.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ wallpaperKey: w.key, wallpaperUrl: "", wallpaperUrlOmitted: false })}
                    className={cn(
                      "overflow-hidden rounded-2xl ring-1 transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]",
                      on ? "ring-2 ring-caramel shadow-[0_0_0_1px_rgba(217,154,91,0.4)]" : "ring-sand/15 hover:ring-sand/35",
                    )}
                  >
                    {w.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.previewUrl} alt="" className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="aspect-video" style={{ background: DEFAULT_WALL_CSS }} />
                    )}
                    <span
                      className={cn(
                        "block truncate bg-espresso/80 px-2 py-1.5 text-center text-[0.7rem] font-semibold",
                        on ? "text-caramel" : "text-crema/80",
                      )}
                    >
                      {w.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              className={cn(
                "rounded-2xl p-4 ring-1",
                canCustomWp ? "bg-caramel/10 ring-caramel/25" : "bg-crema/4 ring-sand/12",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
                  {canCustomWp ? <ImagePlus className="size-4" /> : <Info className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Wallpaper personalizzato</p>
                  <p className="mt-0.5 text-xs text-crema/55">
                    {canCustomWp
                      ? "Carica un'immagine (Double Booster / VIP+)."
                      : `Riservato a ${(initial.permissions.wallpaperCustomRoles || ["Double Booster", "VIP+"]).join(" o ")}.`}
                  </p>
                  {canCustomWp && (
                    <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-crema/8 px-4 py-2 text-xs font-semibold ring-1 ring-sand/25 hover:bg-crema/12">
                      <input
                        name="wallpaper"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={(e) => onCustomFile(e.target.files?.[0] || null)}
                      />
                      Scegli file
                    </label>
                  )}
                  {hasCustom && canCustomWp && (
                    <button
                      type="button"
                      onClick={() => patch({ wallpaperUrl: "", wallpaperUrlOmitted: false })}
                      className="ml-2 mt-3 text-xs font-semibold text-sand underline-offset-2 hover:underline"
                    >
                      Rimuovi il tuo sfondo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salva
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-5 py-2.5 text-sm font-semibold text-crema ring-1 ring-sand/25 hover:bg-crema/12 disabled:opacity-60"
          >
            <RotateCcw className="size-4" /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}

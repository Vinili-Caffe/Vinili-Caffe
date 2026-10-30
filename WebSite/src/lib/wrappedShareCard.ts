import { sizedDiscordCdn } from "@/lib/discord-cdn";
import { cdnUrl } from "@/lib/site";
import { fmt, hours, type WrappedPayload } from "@/lib/wrapped";

export type WrappedShareFormat = "story" | "square";

export type WrappedShareCard = {
  id: string;
  label: string;
  format: WrappedShareFormat;
  width: number;
  height: number;
  blob: Blob;
  file: File;
  objectUrl: string;
};

const FONT_DISPLAY = '"Cormorant Garamond", "Cormorant", Georgia, serif';
const FONT_BODY = "Inter, system-ui, sans-serif";
/** JPEG più veloce del PNG; 810px basta su Stories/WhatsApp. */
const STORY_W = 810;
const STORY_H = 1440;
const SQUARE = 810;
const JPEG_Q = 0.86;

type CacheEntry = { key: string; cards: WrappedShareCard[]; at: number };
let cache: CacheEntry | null = null;
let inflight: { key: string; promise: Promise<WrappedShareCard[]> } | null = null;

function cacheKey(data: WrappedPayload) {
  return `${data.user.id}:${data.year}:${data.allTime.level}:${data.allTime.messagesTotal}:${data.allTime.voiceTotalSeconds}:${data.archetype.id}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function loadImage(src: string, cors = true, timeoutMs = 900): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    let done = false;
    const finish = (v: HTMLImageElement | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const t = window.setTimeout(() => finish(null), timeoutMs);
    if (cors) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      window.clearTimeout(t);
      finish(img);
    };
    img.onerror = () => {
      window.clearTimeout(t);
      finish(null);
    };
    img.src = src;
  });
}

function paintBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.12, 40, w * 0.5, h * 0.45, h * 0.85);
  g.addColorStop(0, "#4a3018");
  g.addColorStop(0.4, "#1c120e");
  g.addColorStop(1, "#070504");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.7, h * 0.2, 8, w * 0.7, h * 0.2, w * 0.45);
  glow.addColorStop(0, "rgba(255,170,90,0.2)");
  glow.addColorStop(1, "rgba(255,170,90,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function paintAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  size: number,
  initials: string,
) {
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(217,154,91,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = "#3a2818";
    ctx.fillRect(cx - r, cy - r, size, size);
    ctx.fillStyle = "#e8c49a";
    ctx.font = `600 ${Math.round(size * 0.36)}px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials.slice(0, 2).toUpperCase(), cx, cy + 2);
  }
  ctx.restore();
}

function paintStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
) {
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = "rgba(244,233,216,0.07)";
  ctx.fill();
  ctx.strokeStyle = "rgba(196,160,122,0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(196,160,122,0.75)";
  ctx.font = `600 ${Math.round(h * 0.14)}px ${FONT_BODY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label.toUpperCase(), x + 20, y + 16);

  ctx.fillStyle = "#f4e9d8";
  ctx.font = `600 ${Math.round(h * 0.34)}px ${FONT_DISPLAY}`;
  ctx.fillText(value, x + 20, y + h * 0.42);
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("jpeg_failed"))),
      "image/jpeg",
      JPEG_Q,
    );
  });
}

function revokeLater(url: string) {
  window.setTimeout(() => URL.revokeObjectURL(url), 180_000);
}

async function makeCard(
  data: WrappedPayload,
  format: WrappedShareFormat,
  avatar: HTMLImageElement | null,
  logo: HTMLImageElement | null,
): Promise<WrappedShareCard> {
  const width = format === "story" ? STORY_W : SQUARE;
  const height = format === "story" ? STORY_H : SQUARE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("no_2d");

  paintBg(ctx, width, height);

  const name = data.user.displayName || data.user.username || "Tu";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("");
  const a = data.allTime;
  const pad = format === "story" ? 54 : 48;
  const topY = format === "story" ? 88 : 54;

  if (logo) {
    const lw = 54;
    const lh = (logo.naturalHeight / Math.max(1, logo.naturalWidth)) * lw;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, pad, topY, lw, lh);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "rgba(232,196,154,0.85)";
  ctx.font = `600 22px ${FONT_BODY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`VINILI WRAPPED · ${data.year}`, pad + (logo ? 70 : 0), topY + 28);

  const avatarSize = format === "story" ? 196 : 156;
  const avatarCy = format === "story" ? height * 0.32 : height * 0.34;
  paintAvatar(ctx, avatar, width / 2, avatarCy, avatarSize, initials || "?");

  const titleY = avatarCy + avatarSize / 2 + (format === "story" ? 52 : 36);
  ctx.fillStyle = "#f4e9d8";
  ctx.font = `600 ${format === "story" ? 68 : 54}px ${FONT_DISPLAY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let title = name;
  while (ctx.measureText(title).width > width - pad * 2 && title.length > 4) {
    title = `${title.slice(0, -2)}…`;
  }
  ctx.fillText(title, width / 2, titleY);

  ctx.fillStyle = "#e8c49a";
  ctx.font = `600 ${format === "story" ? 30 : 24}px ${FONT_BODY}`;
  ctx.fillText(data.archetype.label, width / 2, titleY + (format === "story" ? 82 : 66));

  const stats: [string, string][] = [
    ["Livello", `Lv.${a.level}`],
    ["Rank", `#${a.allTimeRank}`],
    ["Messaggi", fmt(a.messagesTotal)],
    a.votesTotal ? ["Voti", fmt(a.votesTotal)] : ["In call", hours(a.voiceTotalSeconds)],
  ];

  const gridTop = format === "story" ? titleY + 156 : titleY + 118;
  const gap = 14;
  const cellW = (width - pad * 2 - gap) / 2;
  const cellH = format === "story" ? 112 : 92;
  stats.forEach(([lab, val], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    paintStat(ctx, pad + col * (cellW + gap), gridTop + row * (cellH + gap), cellW, cellH, lab, val);
  });

  if (format === "story" && a.betterThanPct > 0) {
    const badgeY = gridTop + 2 * (cellH + gap) + 24;
    roundRect(ctx, pad, badgeY, width - pad * 2, 66, 18);
    ctx.fillStyle = "rgba(217,154,91,0.16)";
    ctx.fill();
    ctx.strokeStyle = "rgba(217,154,91,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#f0b46e";
    ctx.font = `600 24px ${FONT_BODY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `Top ${Math.max(1, 100 - a.betterThanPct)}% · meglio del ${a.betterThanPct}%`,
      width / 2,
      badgeY + 33,
    );
  }

  ctx.fillStyle = "rgba(244,233,216,0.45)";
  ctx.font = `500 20px ${FONT_BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("viniliecaffe.it/wrapped", width / 2, height - (format === "story" ? 52 : 36));

  const blob = await canvasToJpegBlob(canvas);
  const fileName = `vinili-wrapped-${data.year}-${format}.jpg`;
  const file = new File([blob], fileName, { type: "image/jpeg" });
  const objectUrl = URL.createObjectURL(blob);
  revokeLater(objectUrl);

  return {
    id: format,
    label: format === "story" ? "Storia (9:16)" : "Quadrata (1:1)",
    format,
    width,
    height,
    blob,
    file,
    objectUrl,
  };
}

async function buildAll(data: WrappedPayload, onFirst?: (card: WrappedShareCard) => void): Promise<WrappedShareCard[]> {
  const avatarUrl = sizedDiscordCdn(data.user.avatarUrl, 256, { animate: false });
  const [avatar, logo] = await Promise.all([
    loadImage(avatarUrl, true, 800),
    loadImage(cdnUrl("/images/logo-disco.png"), false, 600),
  ]);

  const story = await makeCard(data, "story", avatar, logo);
  onFirst?.(story);
  const square = await makeCard(data, "square", avatar, logo);
  return [story, square];
}

/** Prefetch in idle: apre lo sheet già caldo. */
export function prefetchWrappedShareCards(data: WrappedPayload) {
  if (typeof window === "undefined") return;
  const key = cacheKey(data);
  if (cache?.key === key) return;
  if (inflight?.key === key) return;
  const run = () => {
    void buildWrappedShareCards(data).catch(() => {});
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 400);
  }
}

/** Prepara 2 JPEG (storia + quadrata). Cache + progressivo (prima la storia). */
export async function buildWrappedShareCards(
  data: WrappedPayload,
  opts?: { onFirst?: (card: WrappedShareCard) => void },
): Promise<WrappedShareCard[]> {
  const key = cacheKey(data);
  if (cache?.key === key && cache.cards.length) return cache.cards;
  if (inflight?.key === key) return inflight.promise;

  const promise = buildAll(data, opts?.onFirst)
    .then((cards) => {
      cache = { key, cards, at: Date.now() };
      return cards;
    })
    .finally(() => {
      if (inflight?.key === key) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files });
  } catch {
    return false;
  }
}

export async function shareWrappedCard(
  card: WrappedShareCard,
  text: string,
): Promise<"shared" | "downloaded" | "aborted"> {
  try {
    if (canShareFiles([card.file])) {
      await navigator.share({
        title: "Vinili Wrapped",
        text,
        files: [card.file],
      });
      return "shared";
    }
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return "aborted";
  }

  const a = document.createElement("a");
  a.href = card.objectUrl;
  a.download = card.file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "downloaded";
}

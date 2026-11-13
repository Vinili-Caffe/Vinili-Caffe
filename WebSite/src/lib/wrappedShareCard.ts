import { sizedDiscordCdn } from "@/lib/discord-cdn";
import { cdnUrl } from "@/lib/site";
import { fmt, type WrappedPayload } from "@/lib/wrapped";
import { moodForStoryKey } from "@/lib/wrappedMoods";
import { buildStoryCards } from "@/lib/wrappedStories";

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
  return `${data.user.id}:${data.year}:${data.allTime.level}:${data.allTime.messagesTotal}:${data.allTime.voiceTotalSeconds}:${data.allTime.votesTotal}:${data.archetype.id}:recap2`;
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

/** Taglia il testo con "…" finché sta nella larghezza. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  let t = text;
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 2 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Disco grande in un angolo, mezzo fuori dalla card (come nel resoconto). */
function paintCornerRecord(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  if (logo) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, cx - r, cy - r, r * 2, r * 2);
  } else {
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r - i * (r / 22), 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 ? "rgba(0,0,0,0.5)" : "rgba(244,233,216,0.06)";
      ctx.lineWidth = r / 22;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * La card è il resoconto finale del Wrapped: chi sei, i quattro numeri grossi
 * e la scaletta delle schede viste, ognuna col suo dato.
 */
async function makeCard(
  data: WrappedPayload,
  format: WrappedShareFormat,
  avatar: HTMLImageElement | null,
  logo: HTMLImageElement | null,
): Promise<WrappedShareCard> {
  const story = format === "story";
  const width = story ? STORY_W : SQUARE;
  const height = story ? STORY_H : SQUARE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("no_2d");

  const accent = moodForStoryKey("share").accent;
  const stories = buildStoryCards(data);
  const role = stories.find((c) => c.key === "role");
  const tracks = stories.filter((c) => c.key !== "hello" && c.key !== "share" && c.key !== "role" && c.stat);
  const a = data.allTime;
  const name = data.user.displayName || data.user.username || "Tu";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("");
  const pad = story ? 54 : 44;
  const inner = width - pad * 2;

  paintBg(ctx, width, height);

  /* scheda in alto: vinile nell'angolo, avatar, nome e ruolo */
  const boxPad = story ? 30 : 24;
  const avSize = story ? 128 : 96;
  const pillH = story ? 44 : 34;
  const headH = boxPad + avSize + (story ? 26 : 18) + pillH + boxPad;
  /* scaletta: quante righe stanno; poi tutto il blocco va centrato in altezza */
  const minTop = story ? 70 : 40;
  const footH = story ? 90 : 60;
  const listGap = story ? 22 : 16;
  const rowH = story ? 92 : 66;
  const listHead = story ? 64 : 48;
  const maxRows = Math.max(0, Math.floor((height - footH - minTop - headH - listGap - listHead - 20) / rowH));
  const rows = tracks.slice(0, maxRows);
  const listH = rows.length ? listHead + rows.length * rowH + (story ? 14 : 8) : 0;
  const headTop = Math.max(minTop, Math.round((height - footH - (headH + (listH ? listGap + listH : 0))) / 2));
  roundRect(ctx, pad, headTop, inner, headH, 34);
  ctx.fillStyle = "rgba(244,233,216,0.06)";
  ctx.fill();
  ctx.save();
  roundRect(ctx, pad, headTop, inner, headH, 34);
  ctx.clip();
  paintCornerRecord(ctx, logo, pad + inner - (story ? 40 : 30), headTop + (story ? 40 : 30), story ? 170 : 130);
  ctx.restore();
  roundRect(ctx, pad, headTop, inner, headH, 34);
  ctx.strokeStyle = "rgba(196,160,122,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const avCx = pad + boxPad + avSize / 2;
  const avCy = headTop + boxPad + avSize / 2;
  ctx.beginPath();
  ctx.arc(avCx, avCy, avSize / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  paintAvatar(ctx, avatar, avCx, avCy, avSize, initials || "?");

  const textX = pad + boxPad + avSize + (story ? 24 : 18);
  const textW = pad + inner - textX - (story ? 110 : 80);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = accent;
  ctx.font = `600 ${story ? 20 : 16}px ${FONT_BODY}`;
  ctx.fillText(`VINILI WRAPPED · ${data.year}`, textX, avCy - (story ? 58 : 44));
  ctx.fillStyle = "#f4e9d8";
  ctx.font = `600 ${story ? 58 : 44}px ${FONT_DISPLAY}`;
  ctx.fillText(fit(ctx, name, textW), textX, avCy - (story ? 30 : 22));
  ctx.fillStyle = "rgba(244,233,216,0.72)";
  ctx.font = `500 ${story ? 24 : 19}px ${FONT_BODY}`;
  ctx.fillText(fit(ctx, role?.title || data.archetype.label, textW), textX, avCy + (story ? 36 : 28));

  /* livello, classifica e top %: badge sotto il nome (messaggi e vocale stanno già nella scaletta) */
  const pills: { label: string; strong?: boolean }[] = [
    { label: `Livello ${fmt(a.level)}` },
    { label: `#${fmt(a.allTimeRank)} in classifica` },
    ...(a.betterThanPct > 0 ? [{ label: `Top ${Math.max(1, 100 - a.betterThanPct)}% del server`, strong: true }] : []),
  ];
  {
    let x = pad + boxPad;
    const y = headTop + boxPad + avSize + (story ? 26 : 18);
    ctx.font = `700 ${story ? 21 : 16}px ${FONT_BODY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const pill of pills) {
      const w = ctx.measureText(pill.label).width + (story ? 40 : 30);
      if (x + w > pad + inner - boxPad) break;
      roundRect(ctx, x, y, w, pillH, pillH / 2);
      ctx.fillStyle = pill.strong ? accent : "rgba(0,0,0,0.3)";
      ctx.fill();
      if (!pill.strong) {
        ctx.strokeStyle = "rgba(244,233,216,0.18)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.fillStyle = pill.strong ? "#1a120c" : "#f4e9d8";
      ctx.fillText(pill.label, x + (story ? 20 : 15), y + pillH / 2 + 1);
      x += w + (story ? 12 : 9);
    }
  }

  /* la scaletta: le schede viste, una riga per scheda (quante ne stanno) */
  const listTop = headTop + headH + listGap;
  if (rows.length) {
    roundRect(ctx, pad, listTop, inner, listH, 34);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();
    ctx.strokeStyle = "rgba(244,233,216,0.1)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "rgba(196,160,122,0.85)";
    ctx.font = `600 ${story ? 17 : 13}px ${FONT_BODY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("LATO B · LA TUA SCALETTA", pad + boxPad, listTop + (story ? 28 : 20));

    rows.forEach((t, i) => {
      const y = listTop + listHead + i * rowH;
      const mid = y + rowH / 2;
      const tone = moodForStoryKey(t.key).accent;
      const left = pad + boxPad;
      const right = pad + inner - boxPad;
      if (i < rows.length - 1) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(244,233,216,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, y + rowH);
        ctx.lineTo(right, y + rowH);
        ctx.stroke();
        ctx.restore();
      }
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(244,233,216,0.35)";
      ctx.font = `500 ${story ? 18 : 14}px ui-monospace, Menlo, monospace`;
      ctx.fillText(String(i + 1).padStart(2, "0"), left, mid);
      ctx.beginPath();
      ctx.arc(left + (story ? 46 : 36), mid, story ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = tone;
      ctx.fill();

      ctx.textAlign = "right";
      ctx.fillStyle = tone;
      ctx.font = `600 ${story ? 34 : 26}px ${FONT_DISPLAY}`;
      const stat = fit(ctx, t.stat || "", inner * 0.38);
      const statW = ctx.measureText(stat).width;
      ctx.fillText(stat, right, mid);

      const tx = left + (story ? 66 : 52);
      const tw = right - statW - 20 - tx;
      ctx.textAlign = "left";
      ctx.fillStyle = "#f4e9d8";
      ctx.font = `600 ${story ? 25 : 19}px ${FONT_BODY}`;
      const same = t.title === t.stat;
      ctx.fillText(fit(ctx, same ? t.kicker : t.title, tw), tx, same ? mid : mid - (story ? 13 : 10));
      if (!same) {
        ctx.fillStyle = "rgba(244,233,216,0.42)";
        ctx.font = `600 ${story ? 14 : 11}px ${FONT_BODY}`;
        ctx.fillText(fit(ctx, t.kicker.toUpperCase(), tw), tx, mid + (story ? 17 : 13));
      }
    });
  }

  ctx.fillStyle = "rgba(244,233,216,0.45)";
  ctx.font = `500 ${story ? 20 : 16}px ${FONT_BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("viniliecaffe.it/wrapped", width / 2, height - (story ? 40 : 22));

  const blob = await canvasToJpegBlob(canvas);
  const fileName = `vinili-wrapped-${data.year}-${format}.jpg`;
  const file = new File([blob], fileName, { type: "image/jpeg" });
  const objectUrl = URL.createObjectURL(blob);
  revokeLater(objectUrl);

  return {
    id: format,
    label: story ? "Storia (9:16)" : "Quadrata (1:1)",
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
    /* il logo sta sul CDN (altra origine): senza CORS "sporca" la tela e l'immagine non si può più esportare */
    loadImage(cdnUrl("/images/logo-disco.png"), true, 900),
  ]);

  /* se un'immagine blocca comunque l'esportazione, la card si rifà senza immagini invece di fallire */
  const make = async (format: WrappedShareFormat) => {
    try {
      return await makeCard(data, format, avatar, logo);
    } catch {
      return makeCard(data, format, null, null);
    }
  };
  const story = await make("story");
  onFirst?.(story);
  const square = await make("square");
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

import { sizedDiscordCdn } from "@/lib/discord-cdn";
import { cdnUrl } from "@/lib/site";
import { fmt, wrappedPeriodLabel, type WrappedPayload } from "@/lib/wrapped";
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
  return `${data.user.id}:${data.period || "yearly"}:${data.monthKey || data.year}:${data.allTime.level}:${data.allTime.messagesTotal}:${data.allTime.voiceTotalSeconds}:${data.allTime.votesTotal}:${data.archetype.id}:sleeve2`;
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

function revokeCards(cards: WrappedShareCard[] | null | undefined) {
  for (const c of cards || []) {
    try {
      URL.revokeObjectURL(c.objectUrl);
    } catch {
      /* ignore */
    }
  }
}

/** Blob URL fresco da blob (le URL vecchie possono essere già revocate). */
export function objectUrlFromCard(card: WrappedShareCard): string {
  return URL.createObjectURL(card.blob);
}

/** Taglia il testo con "…" finché sta nella larghezza. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  let t = text;
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 2 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/* il nome senza emoji (su un'immagine escono spesso come quadratini) */
function plainName(raw: string) {
  const out = String(raw || "")
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return out || String(raw || "").trim() || "Tu";
}

/** «1.234 messaggi» → numero e unità (h e min per esteso) */
function splitStat(stat?: string) {
  const m = String(stat || "").match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return { num: String(stat || ""), unit: "" };
  const unit = m[2] === "h" ? "ore" : m[2] === "min" ? "minuti" : m[2] || "";
  return { num: m[1]!, unit };
}

/* retino a puntini, come una stampa */
function paintDots(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, step = 18, r = 2.2) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color;
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    for (let xx = x + step / 2; xx < x + w; xx += step) {
      ctx.beginPath();
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* il vinile: il logo del disco, o solchi disegnati se non si carica */
function paintRecord(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (logo) ctx.drawImage(logo, cx - r, cy - r, r * 2, r * 2);
  else {
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r - i * (r / 24), 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.5)";
      ctx.lineWidth = r / 24;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "#c98b50";
    ctx.fill();
  }
  ctx.restore();
}

/**
 * L'immagine da condividere, nello stile del Wrapped: fondo espresso con la fascia terracotta,
 * la tua «busta» color crema (foto, nome, ruolo) con il disco che spunta, e i numeri principali
 * in riquadri a colore pieno, con gli stessi colori delle schede.
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

  const stories = buildStoryCards(data);
  const role = stories.find((c) => c.key === "role");
  const tiles = stories.filter((c) => c.key !== "hello" && c.key !== "share" && c.key !== "role" && c.stat).slice(0, 8);
  const a = data.allTime;
  /* livello, classifica e top %: le pillole sotto la busta, come nel resoconto */
  const pills: { label: string; strong?: boolean }[] = [
    { label: `Livello ${fmt(a.level)}` },
    { label: `#${fmt(a.allTimeRank)} in classifica` },
    ...(a.betterThanPct > 0 ? [{ label: `Top ${Math.max(1, 100 - a.betterThanPct)}% del server`, strong: true }] : []),
  ];
  const name = plainName(data.user.displayName || data.user.username || "Tu");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("");
  const period = wrappedPeriodLabel(data);
  const pad = story ? 56 : 40;

  /* fondo: espresso con la fascia terracotta in diagonale e il retino */
  ctx.fillStyle = "#140d09";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  if (story) {
    ctx.moveTo(0, height * 0.2);
    ctx.lineTo(width, height * 0.12);
    ctx.lineTo(width, height * 0.62);
    ctx.lineTo(0, height * 0.7);
  } else {
    ctx.moveTo(width * 0.52, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height);
    ctx.lineTo(width * 0.34, height);
  }
  ctx.closePath();
  ctx.fillStyle = "#d4512c";
  ctx.fill();
  ctx.clip();
  paintDots(ctx, 0, 0, width, height, "rgba(42,18,10,0.22)", 16, 2);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  /* titolo */
  const titleX = pad;
  let y = story ? 120 : 92;
  ctx.fillStyle = "#f0b46e";
  ctx.font = `700 ${story ? 20 : 15}px ${FONT_BODY}`;
  ctx.fillText(`VINILI & CAFFÈ · WRAPPED ${period.toUpperCase()}`, titleX, y);
  y += story ? 92 : 72;
  ctx.fillStyle = "#f4e9d8";
  ctx.font = `600 ${story ? 96 : 72}px ${FONT_DISPLAY}`;
  ctx.fillText("Il tuo", titleX, y);
  y += story ? 86 : 64;
  ctx.fillStyle = "#f0b46e";
  ctx.font = `italic 600 ${story ? 96 : 72}px ${FONT_DISPLAY}`;
  ctx.fillText("Wrapped", titleX, y);

  /* la busta: in basso a destra nel quadrato, al centro nella storia */
  const sleeve = story ? 400 : 300;
  const sx = story ? (width - sleeve) / 2 - 40 : width - pad - sleeve + 10;
  const sy = story ? y + 46 : pad + 10;
  /* il disco che spunta a destra */
  paintRecord(ctx, logo, sx + sleeve * (story ? 0.98 : 0.82), sy + sleeve / 2, sleeve * 0.45);

  ctx.save();
  ctx.translate(sx + sleeve / 2, sy + sleeve / 2);
  ctx.rotate((-2 * Math.PI) / 180);
  ctx.translate(-(sx + sleeve / 2), -(sy + sleeve / 2));
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = "#f2e6d0";
  ctx.fillRect(sx, sy, sleeve, sleeve);
  ctx.shadowColor = "transparent";
  paintDots(ctx, sx + sleeve * 0.55, sy + sleeve * 0.55, sleeve * 0.45, sleeve * 0.45, "rgba(200,85,61,0.3)", story ? 16 : 12, story ? 2.4 : 1.8);

  const ip = story ? 34 : 22;
  ctx.fillStyle = "rgba(27,20,16,0.7)";
  ctx.font = `700 ${story ? 17 : 12}px ${FONT_BODY}`;
  ctx.textAlign = "left";
  ctx.fillText("VINILI WRAPPED", sx + ip, sy + ip + (story ? 14 : 10));
  ctx.textAlign = "right";
  ctx.fillText(period.toUpperCase(), sx + sleeve - ip, sy + ip + (story ? 14 : 10));

  const av = story ? 124 : 76;
  const acx = sx + ip + av / 2;
  const acy = sy + ip + (story ? 50 : 32) + av / 2;
  ctx.beginPath();
  ctx.arc(acx, acy, av / 2 + (story ? 7 : 5), 0, Math.PI * 2);
  ctx.fillStyle = "#c8553d";
  ctx.fill();
  paintAvatar(ctx, avatar, acx, acy, av, initials || "?");

  ctx.textAlign = "left";
  const nameSize = story ? 56 : 38;
  ctx.fillStyle = "#1b1410";
  ctx.font = `600 ${nameSize}px ${FONT_DISPLAY}`;
  ctx.fillText(fit(ctx, name, sleeve - ip * 2), sx + ip, sy + sleeve - ip - (story ? 54 : 34));
  ctx.fillStyle = "#c8553d";
  ctx.font = `700 ${story ? 19 : 13}px ${FONT_BODY}`;
  ctx.fillText(fit(ctx, `LATO A · ${(role?.title || data.archetype.label).toUpperCase()}`, sleeve - ip * 2), sx + ip, sy + sleeve - ip - (story ? 14 : 8));
  ctx.restore();

  /* le pillole: nella storia sotto la busta, nel quadrato sotto il titolo (a capo se non stanno) */
  const pillH = story ? 44 : 32;
  const pillGap = story ? 10 : 8;
  let pillsBottom = 0;
  {
    const maxX = story ? width - pad : sx - 24;
    let px = pad;
    let py = story ? sy + sleeve + 34 : y + 30;
    ctx.font = `700 ${story ? 19 : 14}px ${FONT_BODY}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const p of pills) {
      const w = ctx.measureText(p.label).width + (story ? 36 : 26);
      if (px + w > maxX && px > pad) {
        px = pad;
        py += pillH + pillGap;
      }
      roundRect(ctx, px, py, w, pillH, pillH / 2);
      ctx.fillStyle = p.strong ? "#f0b46e" : "rgba(244,233,216,0.1)";
      ctx.fill();
      if (!p.strong) {
        ctx.strokeStyle = "rgba(244,233,216,0.25)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.fillStyle = p.strong ? "#140d09" : "#f4e9d8";
      ctx.fillText(p.label, px + (story ? 18 : 13), py + pillH / 2 + 1);
      px += w + pillGap;
    }
    pillsBottom = py + pillH;
    ctx.textBaseline = "alphabetic";
  }

  /* ogni scheda con un dato, in un riquadro a colore pieno (colori delle schede) */
  if (tiles.length) {
    const cols = 2;
    const gap = story ? 14 : 10;
    const top = (story ? pillsBottom : Math.max(sy + sleeve, pillsBottom)) + (story ? 30 : 24);
    const bottom = height - (story ? 76 : 42);
    const rows = Math.ceil(tiles.length / cols);
    const tw = (width - pad * 2 - gap) / cols;
    const th = Math.min(story ? 150 : 120, (bottom - top - gap * (rows - 1)) / rows);
    const k = th / (story ? 150 : 120);
    tiles.forEach((t, i) => {
      const m = moodForStoryKey(t.key);
      const tx = pad + (i % cols) * (tw + gap);
      const ty = top + Math.floor(i / cols) * (th + gap);
      roundRect(ctx, tx, ty, tw, th, Math.max(12, (story ? 24 : 16) * k));
      ctx.fillStyle = m.paper;
      ctx.fill();
      const { num, unit } = splitStat(t.stat);
      const tp = Math.max(12, (story ? 22 : 15) * k);
      ctx.textAlign = "left";
      ctx.fillStyle = m.ink;
      /* in alto: la scheda e il suo titolo («MESSAGGI · COPYMASTER») */
      ctx.globalAlpha = 0.78;
      ctx.font = `700 ${Math.max(10, Math.round((story ? 15 : 12) * Math.max(0.8, k)))}px ${FONT_BODY}`;
      const label = t.title && t.title !== t.stat ? `${t.kicker} · ${t.title}` : t.kicker;
      ctx.fillText(fit(ctx, label.toUpperCase(), tw - tp * 2), tx + tp, ty + tp + 10 * Math.max(0.8, k));
      ctx.globalAlpha = 1;
      /* in basso: il numero grande e l'unità */
      ctx.font = `600 ${Math.round((story ? 60 : 46) * k)}px ${FONT_DISPLAY}`;
      const numText = fit(ctx, num, tw - tp * 2);
      ctx.fillText(numText, tx + tp, ty + th - tp);
      if (unit) {
        const nw = ctx.measureText(numText).width;
        ctx.font = `700 ${Math.max(10, Math.round((story ? 16 : 13) * Math.max(0.8, k)))}px ${FONT_BODY}`;
        ctx.globalAlpha = 0.78;
        ctx.fillText(fit(ctx, unit.toUpperCase(), tw - tp * 2 - nw - 10), tx + tp + nw + 10, ty + th - tp - 3);
        ctx.globalAlpha = 1;
      }
    });
  }

  ctx.fillStyle = "rgba(244,233,216,0.55)";
  ctx.font = `600 ${story ? 20 : 14}px ${FONT_BODY}`;
  ctx.textAlign = story ? "center" : "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("viniliecaffe.it/wrapped", story ? width / 2 : pad, height - (story ? 40 : 18));

  const blob = await canvasToJpegBlob(canvas);
  const slug = data.period === "monthly" ? String(data.monthKey || data.year) : String(data.year);
  const fileName = `vinili-wrapped-${slug}-${format}.jpg`;
  const file = new File([blob], fileName, { type: "image/jpeg" });
  const objectUrl = URL.createObjectURL(blob);

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
  if (cache?.key === key && cache.cards.length) {
    /* Rinnova gli object URL: non devono mai dipendere da un revoke timed. */
    const refreshed = cache.cards.map((c) => {
      try {
        URL.revokeObjectURL(c.objectUrl);
      } catch {
        /* ignore */
      }
      return { ...c, objectUrl: URL.createObjectURL(c.blob) };
    });
    cache = { key, cards: refreshed, at: Date.now() };
    opts?.onFirst?.(refreshed[0]);
    return refreshed;
  }
  if (inflight?.key === key) return inflight.promise;

  const promise = buildAll(data, opts?.onFirst)
    .then((cards) => {
      if (cache) revokeCards(cache.cards);
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

  const url = URL.createObjectURL(card.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = card.file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }, 2_000);
  return "downloaded";
}

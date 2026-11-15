/** Card immagine stile minigiochi (come l’allegato canvas del bot) per le anteprime dashboard. */

const STYLE = {
  bg0: "#2c2419",
  bg1: "#1a1510",
  card: "rgba(247, 241, 232, 0.96)",
  stroke: "rgba(111, 78, 55, 0.5)",
  title: "#8b7355",
  body: "#2c2419",
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [""];
  const words = source.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = word;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [source];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Data URL PNG della card prompt (titolo + righe), come sul bot. Solo browser. */
export function buildMinigamePreviewCardDataUrl(title: string, lines: string[] = []) {
  if (typeof document === "undefined") return "";
  try {
    const width = 900;
    const height = 320;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, STYLE.bg0);
    g.addColorStop(1, STYLE.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const pad = 36;
    const cardX = pad;
    const cardY = pad;
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;
    roundRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.fillStyle = STYLE.card;
    ctx.fill();
    ctx.strokeStyle = STYLE.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    const usable = cardW - 64;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = STYLE.title;
    ctx.font = "600 28px Georgia, 'Times New Roman', serif";
    const titleLines = wrapText(ctx, title || "Minigioco", usable);

    ctx.fillStyle = STYLE.body;
    ctx.font = "600 34px Georgia, 'Times New Roman', serif";
    const bodySource = (lines.length ? lines : []).map((l) => String(l || "").trim()).filter(Boolean);
    const bodyLines: string[] = [];
    for (const line of bodySource.slice(0, 4)) {
      bodyLines.push(...wrapText(ctx, line, usable).slice(0, 3));
    }
    if (!bodyLines.length) bodyLines.push("…");

    const titleH = titleLines.length * 34;
    const bodyH = bodyLines.length * 42;
    const gap = 14;
    let y = cardY + (cardH - (titleH + gap + bodyH)) / 2;

    ctx.fillStyle = STYLE.title;
    ctx.font = "600 28px Georgia, 'Times New Roman', serif";
    for (const line of titleLines) {
      ctx.fillText(line, width / 2, y, usable);
      y += 34;
    }
    y += gap;
    ctx.fillStyle = STYLE.body;
    ctx.font = "600 34px Georgia, 'Times New Roman', serif";
    for (const line of bodyLines.slice(0, 5)) {
      ctx.fillText(line, width / 2, y, usable);
      y += 42;
    }

    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

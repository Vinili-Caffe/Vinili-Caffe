import { AttachmentBuilder } from "discord.js";
import { createCanvas } from "@napi-rs/canvas";
import { logger } from "../../../shared";

export interface RankCardInput {
  tag: string;
  avatarUrl?: string | null;
  level: number;
  rank: number;
  totalExp: number;
  nextThreshold: number;
  progressPercent: number;
  messages: number;
  voiceMinutes: number;
}

/** Rank card PNG (look dark brand) — parità UX vs live canvas. */
export async function renderRankCard(input: RankCardInput): Promise<AttachmentBuilder | null> {
  try {
    const width = 934;
    const height = 282;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#1a1224");
    bg.addColorStop(0.55, "#2a1830");
    bg.addColorStop(1, "#0e0a14");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // avatar circle
    const ax = 120;
    const ay = height / 2;
    const ar = 78;
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 6, 0, Math.PI * 2);
    ctx.fillStyle = "#c9a227";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2038";
    ctx.fill();

    if (input.avatarUrl) {
      try {
        const { loadImage } = await import("@napi-rs/canvas");
        const img = await loadImage(input.avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax, ay, ar - 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img as never, ax - ar + 2, ay - ar + 2, (ar - 2) * 2, (ar - 2) * 2);
        ctx.restore();
      } catch {
        /* fallback letter */
        ctx.fillStyle = "#f7e7b0";
        ctx.font = "bold 48px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((input.tag || "?")[0]!.toUpperCase(), ax, ay);
      }
    } else {
      ctx.fillStyle = "#f7e7b0";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((input.tag || "?")[0]!.toUpperCase(), ax, ay);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff6e0";
    ctx.font = "bold 36px sans-serif";
    ctx.fillText(input.tag.slice(0, 28), 240, 88);

    ctx.fillStyle = "#c9a227";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`LVL ${input.level}`, 240, 130);
    ctx.fillStyle = "#b8a88c";
    ctx.font = "24px sans-serif";
    ctx.fillText(`RANK #${input.rank || "—"}`, 380, 130);

    // progress bar
    const barX = 240;
    const barY = 160;
    const barW = 620;
    const barH = 28;
    roundFill(ctx, barX, barY, barW, barH, 14, "#1c1528");
    const fillW = Math.max(8, Math.floor((barW * Math.min(100, Math.max(0, input.progressPercent))) / 100));
    roundFill(ctx, barX, barY, fillW, barH, 14, "#c9a227");

    ctx.fillStyle = "#e8dcc0";
    ctx.font = "20px sans-serif";
    ctx.fillText(
      `${input.totalExp} / ${input.nextThreshold} EXP · ${input.progressPercent}%`,
      barX,
      barY + 56,
    );
    ctx.fillStyle = "#9a8f7a";
    ctx.fillText(`Msg ${input.messages} · Voice ${input.voiceMinutes}m`, barX, barY + 86);

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "rank.png" });
  } catch (err) {
    logger.warn("[rankCanvas]", err);
    return null;
  }
}

function roundFill(
  ctx: {
    beginPath: () => void;
    moveTo: (x: number, y: number) => void;
    arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void;
    closePath: () => void;
    fillStyle: unknown;
    fill: () => void;
  },
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

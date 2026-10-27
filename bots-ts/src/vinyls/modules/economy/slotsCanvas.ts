import { AttachmentBuilder } from "discord.js";
import { createCanvas } from "@napi-rs/canvas";
import { logger } from "../../../shared";

export interface SlotsCanvasInput {
  reels: string[];
  bet: number;
  payout: number;
  win: boolean;
  hasResult: boolean;
  bank?: number;
  balance?: number;
}

/** Panel PNG allineato al look dark live (semplificato, no GIF frames). */
export async function renderSlotsPng(input: SlotsCanvasInput): Promise<AttachmentBuilder | null> {
  try {
    const width = 720;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#180d18");
    bg.addColorStop(0.5, "#32161f");
    bg.addColorStop(1, "#09070d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(247,213,109,0.12)";
    for (let i = 0; i < 18; i += 1) {
      ctx.beginPath();
      ctx.arc((i * 97) % width, 40 + ((i * 53) % (height - 80)), i % 2 ? 2 : 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    roundRect(ctx, 36, 48, width - 72, 220, 24);
    ctx.fillStyle = "rgba(20,12,18,0.92)";
    ctx.fill();
    ctx.strokeStyle = "#f7d56d";
    ctx.lineWidth = 3;
    ctx.stroke();

    const reels = input.reels?.length === 3 ? input.reels : ["❔", "❔", "❔"];
    const cellW = (width - 120) / 3;
    ctx.font = "72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 3; i += 1) {
      const x = 60 + cellW * i + cellW / 2;
      const y = 160;
      roundRect(ctx, 60 + cellW * i + 10, 78, cellW - 20, 164, 16);
      ctx.fillStyle = "#1a1018";
      ctx.fill();
      ctx.strokeStyle = "rgba(247,213,109,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff8e7";
      ctx.fillText(reels[i] || "❔", x, y);
    }

    ctx.font = "bold 28px sans-serif";
    ctx.fillStyle = "#f7d56d";
    ctx.textAlign = "left";
    ctx.fillText("SLOTS", 48, 310);

    ctx.font = "22px sans-serif";
    ctx.fillStyle = "#f0e6d2";
    ctx.fillText(`Bet ${input.bet}`, 48, 348);
    if (input.hasResult) {
      ctx.fillStyle = input.win ? "#7CFC9A" : "#ff8a8a";
      ctx.fillText(input.win ? `WIN +${input.payout}` : "NO WIN", 200, 348);
    }
    if (input.bank != null) {
      ctx.fillStyle = "#cbb890";
      ctx.fillText(`Bank ${input.bank}`, 420, 348);
    }
    if (input.balance != null) {
      ctx.fillStyle = "#9aa3b2";
      ctx.fillText(`Bal ${input.balance}`, 560, 348);
    }

    const png = canvas.toBuffer("image/png");
    return new AttachmentBuilder(png, { name: "slots-panel.png" });
  } catch (err) {
    logger.warn("[slotsCanvas]", err);
    return null;
  }
}

function roundRect(
  ctx: {
    beginPath: () => void;
    moveTo: (x: number, y: number) => void;
    arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void;
    closePath: () => void;
  },
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

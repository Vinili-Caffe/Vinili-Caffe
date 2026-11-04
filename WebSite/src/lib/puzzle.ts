// Puzzle di Kessel: 6 difficoltà (pezzi / tempo / premi / cooldown).
// Gate = calendario evento / HS.

import type { StaffAccess } from "@/lib/staff";
import { cdnUrl } from "@/lib/site";
import { canAccessEventoPage } from "@/lib/evento-starwars";

export const PUZZLE_TAB_RATIO = 0.2;
export const PUZZLE_CDN_V = "20261104pz1";

export type PuzzleCrateOdds = { crateId: string; weight: number };

export type PuzzleDifficultyId =
  | "facile"
  | "normale"
  | "intermedio"
  | "difficile"
  | "esperto"
  | "impossibile";

export type PuzzleDifficulty = {
  id: PuzzleDifficultyId;
  label: string;
  order: number;
  cols: number;
  rows: number;
  pieces: number;
  timeLimitSec: number;
  cooldownMs: number;
  exp: number;
  crateOdds: PuzzleCrateOdds[];
  imageUrl: string;
};

function puzzleImg(slug: string) {
  return cdnUrl(`/images/starwars/puzzle/${slug}.jpg?v=${PUZZLE_CDN_V}`);
}

export const PUZZLE_DIFFICULTIES: readonly PuzzleDifficulty[] = Object.freeze([
  {
    id: "facile",
    label: "Facile",
    order: 1,
    cols: 4,
    rows: 3,
    pieces: 12,
    timeLimitSec: 80,
    cooldownMs: 30 * 60 * 1000,
    exp: 50,
    crateOdds: [
      { crateId: "alpha", weight: 70 },
      { crateId: "beta", weight: 30 },
    ],
    imageUrl: puzzleImg("puzzle-facile"),
  },
  {
    id: "normale",
    label: "Normale",
    order: 2,
    cols: 4,
    rows: 4,
    pieces: 16,
    timeLimitSec: 130,
    cooldownMs: 30 * 60 * 1000,
    exp: 100,
    crateOdds: [
      { crateId: "alpha", weight: 60 },
      { crateId: "beta", weight: 40 },
    ],
    imageUrl: puzzleImg("puzzle-normale"),
  },
  {
    id: "intermedio",
    label: "Intermedio",
    order: 3,
    cols: 5,
    rows: 4,
    pieces: 20,
    timeLimitSec: 210,
    cooldownMs: 30 * 60 * 1000,
    exp: 150,
    crateOdds: [
      { crateId: "alpha", weight: 50 },
      { crateId: "beta", weight: 50 },
    ],
    imageUrl: puzzleImg("puzzle-intermedio"),
  },
  {
    id: "difficile",
    label: "Difficile",
    order: 4,
    cols: 6,
    rows: 4,
    pieces: 24,
    timeLimitSec: 330,
    cooldownMs: 80 * 60 * 1000,
    exp: 200,
    crateOdds: [
      { crateId: "beta", weight: 70 },
      { crateId: "omega", weight: 30 },
    ],
    imageUrl: puzzleImg("puzzle-difficile"),
  },
  {
    id: "esperto",
    label: "Esperto",
    order: 5,
    cols: 6,
    rows: 6,
    pieces: 36,
    timeLimitSec: 420,
    cooldownMs: 80 * 60 * 1000,
    exp: 250,
    crateOdds: [
      { crateId: "beta", weight: 60 },
      { crateId: "omega", weight: 40 },
    ],
    imageUrl: puzzleImg("puzzle-esperto"),
  },
  {
    id: "impossibile",
    label: "Impossibile",
    order: 6,
    cols: 8,
    rows: 6,
    pieces: 48,
    timeLimitSec: 510,
    cooldownMs: 2 * 60 * 60 * 1000,
    exp: 300,
    crateOdds: [
      { crateId: "beta", weight: 50 },
      { crateId: "omega", weight: 50 },
    ],
    imageUrl: puzzleImg("puzzle-impossibile"),
  },
]);

const BY_ID = new Map(PUZZLE_DIFFICULTIES.map((d) => [d.id, d]));

export function getPuzzleDifficulty(id: string | null | undefined): PuzzleDifficulty | null {
  return BY_ID.get(String(id || "").trim().toLowerCase() as PuzzleDifficultyId) || null;
}

/** Legacy default (prima difficoltà). */
export const PUZZLE_COLS = PUZZLE_DIFFICULTIES[0]!.cols;
export const PUZZLE_ROWS = PUZZLE_DIFFICULTIES[0]!.rows;
export const PUZZLE_PIECE_COUNT = PUZZLE_DIFFICULTIES[0]!.pieces;
export const PUZZLE_ASPECT = 16 / 9;
export const PUZZLE_IMG = PUZZLE_DIFFICULTIES[0]!.imageUrl;

export function formatPuzzleTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

export function formatPuzzleCooldown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function crateOddsLabel(odds: PuzzleCrateOdds[]): string {
  return odds
    .map((o) => `${o.weight}% ${o.crateId}`)
    .join(" · ");
}

export type EdgeSign = -1 | 0 | 1;
export type PieceEdges = { top: EdgeSign; right: EdgeSign; bottom: EdgeSign; left: EdgeSign };

export type EdgeGrid = {
  right: EdgeSign[][];
  bottom: EdgeSign[][];
};

export type PieceHome = "tray" | "hand" | `slot:${string}`;

export type PuzzlePieceState = {
  id: string;
  row: number;
  col: number;
  edges: PieceEdges;
  home: PieceHome;
  seen: boolean;
};

/** Gate puzzle: HS sempre; pubblico solo nella finestra /puzzle/ (3–8 feb 12:00 Rome). */
export function canAccessPuzzle(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean } | null | undefined,
  now = new Date(),
): boolean {
  return canAccessEventoPage("puzzle", access, now);
}

export function pieceId(row: number, col: number): string {
  return `${row}-${col}`;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

export function makeEdges(cols = PUZZLE_COLS, rows = PUZZLE_ROWS): EdgeGrid {
  const right: EdgeSign[][] = [];
  const bottom: EdgeSign[][] = [];
  for (let r = 0; r < rows; r++) {
    right[r] = [];
    for (let c = 0; c < cols - 1; c++) right[r]![c] = Math.random() < 0.5 ? 1 : -1;
  }
  for (let r = 0; r < rows - 1; r++) {
    bottom[r] = [];
    for (let c = 0; c < cols; c++) bottom[r]![c] = Math.random() < 0.5 ? 1 : -1;
  }
  return { right, bottom };
}

export function edgesFor(r: number, c: number, E: EdgeGrid, cols = PUZZLE_COLS, rows = PUZZLE_ROWS): PieceEdges {
  return {
    top: (r === 0 ? 0 : -E.bottom[r - 1]![c]!) as EdgeSign,
    right: (c === cols - 1 ? 0 : E.right[r]![c]!) as EdgeSign,
    bottom: (r === rows - 1 ? 0 : E.bottom[r]![c]!) as EdgeSign,
    left: (c === 0 ? 0 : -E.right[r]![c - 1]!) as EdgeSign,
  };
}

export function buildPieces(E: EdgeGrid, cols = PUZZLE_COLS, rows = PUZZLE_ROWS): PuzzlePieceState[] {
  const pieces: PuzzlePieceState[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pieces.push({
        id: pieceId(r, c),
        row: r,
        col: c,
        edges: edgesFor(r, c, E, cols, rows),
        home: "tray",
        seen: false,
      });
    }
  }
  return pieces;
}

/** Contorno pezzo jigsaw. */
export function piecePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  e: PieceEdges,
  tab: number,
): void {
  const midX = x + w / 2;
  const midY = y + h / 2;
  const neck = tab * 0.55;
  const bulge = tab;

  ctx.beginPath();
  ctx.moveTo(x, y);

  if (!e.top) ctx.lineTo(x + w, y);
  else {
    ctx.lineTo(midX - neck, y);
    ctx.bezierCurveTo(midX - neck, y - bulge * e.top, midX + neck, y - bulge * e.top, midX + neck, y);
    ctx.lineTo(x + w, y);
  }

  if (!e.right) ctx.lineTo(x + w, y + h);
  else {
    ctx.lineTo(x + w, midY - neck);
    ctx.bezierCurveTo(
      x + w + bulge * e.right,
      midY - neck,
      x + w + bulge * e.right,
      midY + neck,
      x + w,
      midY + neck,
    );
    ctx.lineTo(x + w, y + h);
  }

  if (!e.bottom) ctx.lineTo(x, y + h);
  else {
    ctx.lineTo(midX + neck, y + h);
    ctx.bezierCurveTo(
      midX + neck,
      y + h + bulge * e.bottom,
      midX - neck,
      y + h + bulge * e.bottom,
      midX - neck,
      y + h,
    );
    ctx.lineTo(x, y + h);
  }

  if (!e.left) ctx.lineTo(x, y);
  else {
    ctx.lineTo(x, midY + neck);
    ctx.bezierCurveTo(x - bulge * e.left, midY + neck, x - bulge * e.left, midY - neck, x, midY - neck);
    ctx.lineTo(x, y);
  }

  ctx.closePath();
}

export type PiecePaintStatus = "ok" | "wrong" | "locked" | null;

export function renderPieceCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  piece: Pick<PuzzlePieceState, "row" | "col" | "edges">,
  displayW: number,
  displayH: number,
  tab: number,
  cols = PUZZLE_COLS,
  rows = PUZZLE_ROWS,
  status: PiecePaintStatus = null,
): { outerW: number; outerH: number } {
  const pad = tab + 4;
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const outerW = displayW + pad * 2;
  const outerH = displayH + pad * 2;
  canvas.width = Math.ceil(outerW * dpr);
  canvas.height = Math.ceil(outerH * dpr);
  canvas.style.width = `${outerW}px`;
  canvas.style.height = `${outerH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return { outerW, outerH };
  if (!img.naturalWidth || !img.naturalHeight) return { outerW, outerH };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, outerW, outerH);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const ox = pad;
  const oy = pad;
  piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
  ctx.save();
  ctx.clip();

  const sx = (piece.col / cols) * img.naturalWidth;
  const sy = (piece.row / rows) * img.naturalHeight;
  const sw = img.naturalWidth / cols;
  const sh = img.naturalHeight / rows;
  const expandX = (tab / displayW) * sw;
  const expandY = (tab / displayH) * sh;
  ctx.drawImage(
    img,
    sx - expandX,
    sy - expandY,
    sw + expandX * 2,
    sh + expandY * 2,
    ox - tab,
    oy - tab,
    displayW + tab * 2,
    displayH + tab * 2,
  );
  ctx.restore();

  piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
  ctx.strokeStyle = "rgba(201, 162, 39, 0.65)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
  ctx.strokeStyle = "rgba(228, 199, 107, 0.4)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  if (status === "wrong" || status === "ok" || status === "locked") {
    const stroke =
      status === "wrong" ? "rgba(224, 122, 106, 0.95)" : status === "ok" ? "rgba(109, 207, 138, 0.95)" : "rgba(109, 207, 138, 0.75)";
    piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
    ctx.strokeStyle = status === "wrong" ? "rgba(255, 180, 170, 0.35)" : "rgba(180, 255, 200, 0.35)";
    ctx.lineWidth = 5.5;
    ctx.stroke();
  }

  return { outerW, outerH };
}

export function tokenFaceDataUrl(
  img: HTMLImageElement,
  piece: Pick<PuzzlePieceState, "row" | "col">,
  size = 72,
  cols = PUZZLE_COLS,
  rows = PUZZLE_ROWS,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const sx = (piece.col / cols) * img.naturalWidth;
  const sy = (piece.row / rows) * img.naturalHeight;
  const sw = img.naturalWidth / cols;
  const sh = img.naturalHeight / rows;
  const scale = Math.max(size / sw, size / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(img, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function fitBoardSize(wrapW: number, wrapH: number, aspect = PUZZLE_ASPECT, pad = 12): { w: number; h: number } {
  const maxW = Math.max(120, wrapW - pad);
  const maxH = Math.max(100, wrapH - pad);
  const a = aspect > 0.2 ? aspect : PUZZLE_ASPECT;
  let w = maxW;
  let h = w / a;
  if (h > maxH) {
    h = maxH;
    w = h * a;
  }
  return { w, h };
}

export function loadPuzzleImage(src = PUZZLE_IMG): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const done = () => {
        if (!img.naturalWidth) {
          reject(new Error("Immagine puzzle vuota"));
          return;
        }
        resolve(img);
      };
      if (typeof img.decode === "function") {
        img.decode().then(done).catch(done);
      } else {
        done();
      }
    };
    img.onerror = () => reject(new Error("Immagine puzzle non caricata"));
    img.src = src;
  });
}

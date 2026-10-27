// Puzzle galassia: jigsaw client-side. Gate = High Staff via site-staff-access.
// Logica allineata a WebSite/js/puzzle-page.js (puzzleHs9).

import type { StaffAccess } from "@/lib/staff";

export const PUZZLE_COLS = 6;
export const PUZZLE_ROWS = 3;
export const PUZZLE_PIECE_COUNT = PUZZLE_COLS * PUZZLE_ROWS;
export const PUZZLE_TAB_RATIO = 0.2;
/** Ratio immagine star-wars-italia-galaxy (1600×816). */
export const PUZZLE_ASPECT = 1600 / 816;
/** Asset sul sito vero; in beta/anteprima arriva via proxy. */
export const PUZZLE_IMG = "/images/star-wars-italia-galaxy.png?v=20260926puzzleHs9";

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

/** Come puzzle-page.js: isHighStaff || canManage || highStaff. */
export function canAccessPuzzle(
  access: Pick<StaffAccess, "isHighStaff" | "canManage"> & { highStaff?: boolean },
): boolean {
  return Boolean(access.isHighStaff || access.canManage || access.highStaff);
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

/** Contorno pezzo jigsaw (stesso path di puzzle-page.js). */
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
    ctx.bezierCurveTo(midX - neck, y - e.top * bulge * 0.2, midX - bulge * 0.95, y - e.top * bulge, midX, y - e.top * bulge);
    ctx.bezierCurveTo(midX + bulge * 0.95, y - e.top * bulge, midX + neck, y - e.top * bulge * 0.2, midX + neck, y);
    ctx.lineTo(x + w, y);
  }

  if (!e.right) ctx.lineTo(x + w, y + h);
  else {
    ctx.lineTo(x + w, midY - neck);
    ctx.bezierCurveTo(x + w + e.right * bulge * 0.2, midY - neck, x + w + e.right * bulge, midY - bulge * 0.95, x + w + e.right * bulge, midY);
    ctx.bezierCurveTo(x + w + e.right * bulge, midY + bulge * 0.95, x + w + e.right * bulge * 0.2, midY + neck, x + w, midY + neck);
    ctx.lineTo(x + w, y + h);
  }

  if (!e.bottom) ctx.lineTo(x, y + h);
  else {
    ctx.lineTo(midX + neck, y + h);
    ctx.bezierCurveTo(midX + neck, y + h + e.bottom * bulge * 0.2, midX + bulge * 0.95, y + h + e.bottom * bulge, midX, y + h + e.bottom * bulge);
    ctx.bezierCurveTo(midX - bulge * 0.95, y + h + e.bottom * bulge, midX - neck, y + h + e.bottom * bulge * 0.2, midX - neck, y + h);
    ctx.lineTo(x, y + h);
  }

  if (!e.left) ctx.lineTo(x, y);
  else {
    ctx.lineTo(x, midY + neck);
    ctx.bezierCurveTo(x - e.left * bulge * 0.2, midY + neck, x - e.left * bulge, midY - bulge * 0.95, x - e.left * bulge, midY);
    ctx.bezierCurveTo(x - e.left * bulge, midY - bulge * 0.95, x - e.left * bulge * 0.2, midY - neck, x, midY - neck);
    ctx.lineTo(x, y);
  }

  ctx.closePath();
}

export function renderPieceCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  piece: Pick<PuzzlePieceState, "row" | "col" | "edges">,
  displayW: number,
  displayH: number,
  tab: number,
  cols = PUZZLE_COLS,
  rows = PUZZLE_ROWS,
): { outerW: number; outerH: number } {
  const pad = tab + 2;
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
  ctx.drawImage(img, sx - expandX, sy - expandY, sw + expandX * 2, sh + expandY * 2, ox - tab, oy - tab, displayW + tab * 2, displayH + tab * 2);
  ctx.restore();

  piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
  ctx.strokeStyle = "rgba(201, 162, 39, 0.55)";
  ctx.lineWidth = 1.25;
  ctx.stroke();
  piecePath(ctx, ox, oy, displayW, displayH, piece.edges, tab);
  ctx.strokeStyle = "rgba(228, 199, 107, 0.35)";
  ctx.lineWidth = 0.75;
  ctx.stroke();

  return { outerW, outerH };
}

/** Mini anteprima token rivelato (JPEG data URL). */
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

export function fitBoardSize(wrapW: number, wrapH: number, pad = 12): { w: number; h: number } {
  const maxW = Math.max(120, wrapW - pad);
  const maxH = Math.max(100, wrapH - pad);
  let w = maxW;
  let h = w / PUZZLE_ASPECT;
  if (h > maxH) {
    h = maxH;
    w = h * PUZZLE_ASPECT;
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

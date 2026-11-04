"use client";

import { useEffect, useRef } from "react";
import { renderPieceCanvas, type PiecePaintStatus, type PuzzlePieceState } from "@/lib/puzzle";
import { cn } from "@/lib/cn";

/** Canvas pezzo jigsaw: ridisegna quando cambiano size/edges/img/stato. */
export function PuzzlePieceCanvas({
  img,
  piece,
  cellW,
  cellH,
  tab,
  cols,
  rows,
  className,
  locked,
  wrong,
  settled,
  onClick,
}: {
  img: HTMLImageElement;
  piece: PuzzlePieceState;
  cellW: number;
  cellH: number;
  tab: number;
  cols: number;
  rows: number;
  className?: string;
  locked?: boolean;
  wrong?: boolean;
  settled?: boolean;
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pad = tab + 4;
  const outerW = cellW + pad * 2;
  const outerH = cellH + pad * 2;
  const clickable = Boolean(onClick && wrong && !locked);

  const status: PiecePaintStatus = wrong ? "wrong" : settled ? "ok" : locked ? "locked" : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cellW <= 0 || cellH <= 0) return;
    renderPieceCanvas(canvas, img, piece, cellW, cellH, tab, cols, rows, status);
  }, [img, piece, piece.edges, cellW, cellH, tab, cols, rows, status]);

  const shellClass = cn(
    "relative block border-0 bg-transparent p-0",
    locked && "cursor-default",
    wrong && "cursor-pointer opacity-95",
    locked && !settled && "animate-pulse",
    settled && "opacity-100",
    className,
  );
  const shellStyle = { width: outerW, height: outerH };
  const body = <canvas ref={canvasRef} className="block size-full" aria-hidden="true" />;

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Pezzo sbagliato, clicca per rimettere"
        className={shellClass}
        style={shellStyle}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={shellClass} style={shellStyle} aria-hidden={locked || !wrong}>
      {body}
    </div>
  );
}

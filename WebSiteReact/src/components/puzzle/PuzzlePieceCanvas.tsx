"use client";

import { useEffect, useRef } from "react";
import { renderPieceCanvas, type PuzzlePieceState } from "@/lib/puzzle";
import { cn } from "@/lib/cn";

/** Canvas pezzo jigsaw: ridisegna quando cambiano size/edges/img. */
export function PuzzlePieceCanvas({
  img,
  piece,
  cellW,
  cellH,
  tab,
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
  className?: string;
  locked?: boolean;
  wrong?: boolean;
  settled?: boolean;
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pad = tab + 2;
  const outerW = cellW + pad * 2;
  const outerH = cellH + pad * 2;
  const clickable = Boolean(onClick && wrong && !locked);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cellW <= 0 || cellH <= 0) return;
    renderPieceCanvas(canvas, img, piece, cellW, cellH, tab);
  }, [img, piece, piece.edges, cellW, cellH, tab]);

  const shellClass = cn(
    "relative block border-0 bg-transparent p-0",
    locked && "cursor-default",
    wrong && "cursor-pointer opacity-90 brightness-95 saturate-[0.85]",
    settled && "opacity-100",
    className,
  );
  const shellStyle = { width: outerW, height: outerH };
  const body = (
    <>
      <canvas ref={canvasRef} className="block size-full" aria-hidden="true" />
      {locked && !settled ? (
        <span className="pointer-events-none absolute inset-[12%] animate-pulse rounded-sm ring-2 ring-[#6dcf8a]/70" aria-hidden="true" />
      ) : null}
      {wrong ? (
        <span className="pointer-events-none absolute inset-[12%] rounded-sm ring-2 ring-[#e07a6a]/80" aria-hidden="true" />
      ) : null}
    </>
  );

  if (clickable) {
    return (
      <button type="button" onClick={onClick} aria-label="Pezzo sbagliato, clicca per rimettere" className={shellClass} style={shellStyle}>
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PuzzlePieceCanvas } from "@/components/puzzle/PuzzlePieceCanvas";
import { PuzzleConfetti } from "@/components/puzzle/PuzzleConfetti";
import { celebrate } from "@/lib/confetti";
import { useFxCap } from "@/components/effects/DeviceFxProvider";

/** Puzzle finito: oltre ai coriandoli del puzzle, la festa dei due cannoni (come al Wordle). */
function PuzzleWinConfetti({ complete }: { complete: boolean }) {
  const confettiRich = useFxCap("confettiRich");
  useEffect(() => {
    if (complete) celebrate(confettiRich);
  }, [complete, confettiRich]);
  return null;
}
import { cn } from "@/lib/cn";
import {
  PUZZLE_COLS,
  PUZZLE_PIECE_COUNT,
  PUZZLE_ROWS,
  PUZZLE_TAB_RATIO,
  buildPieces,
  fitBoardSize,
  loadPuzzleImage,
  makeEdges,
  shuffle,
  tokenFaceDataUrl,
  type PuzzlePieceState,
} from "@/lib/puzzle";

type SlotMap = Record<string, string | null>;

function trayLabel(left: number, holding: boolean): string {
  if (left) return `Pezzi · clicca per pescare (${left})`;
  if (holding) return "Pezzo in mano · clicca uno slot";
  return "Nessun pezzo";
}

/** Jigsaw 6×3: vassoio → pezzo che segue il puntatore → slot. */
export function PuzzleGame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgError, setImgError] = useState(false);
  const [pieces, setPieces] = useState<PuzzlePieceState[]>([]);
  const [trayOrder, setTrayOrder] = useState<string[]>([]);
  const [slots, setSlots] = useState<SlotMap>({});
  const [handId, setHandId] = useState<string | null>(null);
  const [locked, setLocked] = useState<Record<string, true>>({});
  const [wrong, setWrong] = useState<Record<string, true>>({});
  const [settled, setSettled] = useState<Record<string, true>>({});
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [board, setBoard] = useState({ w: 0, h: 0 });
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [tokenFaces, setTokenFaces] = useState<Record<string, string>>({});
  const settleTimers = useRef<Record<string, number>>({});

  const cellW = board.w / PUZZLE_COLS;
  const cellH = board.h / PUZZLE_ROWS;
  const tab = Math.min(cellW, cellH) * PUZZLE_TAB_RATIO;

  const pieceById = useMemo(() => {
    const m = new Map<string, PuzzlePieceState>();
    for (const p of pieces) m.set(p.id, p);
    return m;
  }, [pieces]);

  const placedCount = useMemo(() => Object.keys(locked).length, [locked]);
  const trayPieces = useMemo(
    () => trayOrder.map((id) => pieceById.get(id)).filter((p): p is PuzzlePieceState => Boolean(p && p.home === "tray")),
    [trayOrder, pieceById],
  );

  const layout = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setBoard(fitBoardSize(rect.width, rect.height));
  }, []);

  const boot = useCallback(() => {
    const E = makeEdges();
    const built = buildPieces(E);
    const order = shuffle(built.map((p) => p.id));
    setPieces(built);
    setTrayOrder(order);
    setSlots({});
    setHandId(null);
    setLocked({});
    setWrong({});
    setSettled({});
    setFlashOk(null);
    setComplete(false);
    setTokenFaces({});
    for (const t of Object.values(settleTimers.current)) window.clearTimeout(t);
    settleTimers.current = {};
  }, []);

  useEffect(() => {
    let alive = true;
    loadPuzzleImage()
      .then((image) => {
        if (!alive) return;
        setImg(image);
        boot();
      })
      .catch(() => {
        if (!alive) return;
        setImgError(true);
      });
    return () => {
      alive = false;
    };
  }, [boot]);

  useEffect(() => {
    layout();
    const raf = requestAnimationFrame(() => layout());
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(layout, 80);
    };
    window.addEventListener("resize", onResize);
    const ro =
      typeof ResizeObserver !== "undefined" && wrapRef.current
        ? new ResizeObserver(() => {
            window.clearTimeout(t);
            t = window.setTimeout(layout, 40);
          })
        : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [layout, img]);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => setPointer({ x: ev.clientX, y: ev.clientY });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !handId) return;
      const piece = pieces.find((p) => p.id === handId);
      if (!piece) return;
      setPieces((prev) => prev.map((p) => (p.id === handId ? { ...p, home: "tray" as const } : p)));
      setTrayOrder((prev) => (prev.includes(handId) ? prev : [...prev, handId]));
      setHandId(null);
      if (img && piece.seen) {
        const url = tokenFaceDataUrl(img, piece);
        if (url) setTokenFaces((prev) => ({ ...prev, [piece.id]: url }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handId, pieces, img]);

  useEffect(() => {
    if (placedCount === PUZZLE_PIECE_COUNT && pieces.length && !complete) setComplete(true);
  }, [placedCount, pieces.length, complete]);

  function updatePiece(id: string, patch: Partial<PuzzlePieceState>) {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function paintToken(piece: PuzzlePieceState, image: HTMLImageElement) {
    if (!piece.seen) return;
    const url = tokenFaceDataUrl(image, piece);
    if (url) setTokenFaces((prev) => ({ ...prev, [piece.id]: url }));
  }

  function returnHandToTray() {
    if (!handId) return;
    const piece = pieceById.get(handId);
    if (!piece) return;
    updatePiece(handId, { home: "tray" });
    setTrayOrder((prev) => (prev.includes(handId) ? prev : [...prev, handId]));
    setHandId(null);
    if (img && piece.seen) paintToken({ ...piece, home: "tray", seen: true }, img);
  }

  function drawPiece(piece: PuzzlePieceState, clientX?: number, clientY?: number) {
    if (complete || piece.home !== "tray") return;
    if (handId) {
      const held = pieceById.get(handId);
      if (held) {
        updatePiece(handId, { home: "tray" });
        setTrayOrder((prev) => (prev.includes(handId) ? prev : [...prev, handId]));
        if (img && held.seen) paintToken({ ...held, home: "tray" }, img);
      }
      setHandId(null);
    }
    const next: PuzzlePieceState = { ...piece, seen: true, home: "hand" };
    updatePiece(piece.id, { seen: true, home: "hand" });
    setTrayOrder((prev) => prev.filter((id) => id !== piece.id));
    setHandId(piece.id);
    if (img) paintToken(next, img);
    if (clientX != null && clientY != null) setPointer({ x: clientX, y: clientY });
  }

  function drawRandom(clientX: number, clientY: number) {
    const pool = trayPieces;
    if (!pool.length) return;
    const covered = pool.filter((p) => !p.seen);
    const pickFrom = covered.length ? covered : pool;
    const piece = pickFrom[Math.floor(Math.random() * pickFrom.length)]!;
    drawPiece(piece, clientX, clientY);
  }

  function detachFromSlot(pieceId: string) {
    setSlots((prev) => {
      const next = { ...prev };
      for (const sid of Object.keys(next)) {
        if (next[sid] === pieceId) next[sid] = null;
      }
      return next;
    });
    setLocked((prev) => {
      if (!prev[pieceId]) return prev;
      const n = { ...prev };
      delete n[pieceId];
      return n;
    });
    setWrong((prev) => {
      if (!prev[pieceId]) return prev;
      const n = { ...prev };
      delete n[pieceId];
      return n;
    });
    setSettled((prev) => {
      if (!prev[pieceId]) return prev;
      const n = { ...prev };
      delete n[pieceId];
      return n;
    });
  }

  function placeInSlot(piece: PuzzlePieceState, slotId: string) {
    const occupant = slots[slotId];
    if (occupant && occupant !== piece.id) {
      if (locked[occupant]) return;
      const other = pieceById.get(occupant);
      detachFromSlot(occupant);
      if (other) {
        updatePiece(occupant, { home: "tray" });
        setTrayOrder((prev) => (prev.includes(occupant) ? prev : [...prev, occupant]));
        if (img && other.seen) paintToken({ ...other, home: "tray" }, img);
      }
    }

    detachFromSlot(piece.id);
    setSlots((prev) => ({ ...prev, [slotId]: piece.id }));
    updatePiece(piece.id, { home: `slot:${slotId}` });
    setHandId((h) => (h === piece.id ? null : h));

    const ok = piece.id === slotId;
    if (ok) {
      setWrong((prev) => {
        if (!prev[piece.id]) return prev;
        const n = { ...prev };
        delete n[piece.id];
        return n;
      });
      setLocked((prev) => ({ ...prev, [piece.id]: true }));
      setFlashOk(slotId);
      window.setTimeout(() => setFlashOk((f) => (f === slotId ? null : f)), 560);
      const prevT = settleTimers.current[piece.id];
      if (prevT) window.clearTimeout(prevT);
      settleTimers.current[piece.id] = window.setTimeout(() => {
        setSettled((prev) => ({ ...prev, [piece.id]: true }));
      }, 900);
    } else {
      setLocked((prev) => {
        if (!prev[piece.id]) return prev;
        const n = { ...prev };
        delete n[piece.id];
        return n;
      });
      setSettled((prev) => {
        if (!prev[piece.id]) return prev;
        const n = { ...prev };
        delete n[piece.id];
        return n;
      });
      setWrong((prev) => ({ ...prev, [piece.id]: true }));
    }
  }

  function onSlotClick(slotId: string) {
    if (complete) return;
    if (handId) {
      const piece = pieceById.get(handId);
      if (piece) placeInSlot(piece, slotId);
      return;
    }
    const occupant = slots[slotId];
    if (occupant && wrong[occupant]) {
      const p = pieceById.get(occupant);
      detachFromSlot(occupant);
      if (p) {
        updatePiece(occupant, { home: "tray" });
        setTrayOrder((prev) => (prev.includes(occupant) ? prev : [...prev, occupant]));
        if (img && p.seen) paintToken({ ...p, home: "tray" }, img);
      }
    }
  }

  function reshuffle() {
    if (!img) return;
    boot();
    const E = makeEdges();
    const rebuilt = buildPieces(E);
    setPieces(rebuilt);
    setTrayOrder(shuffle(rebuilt.map((p) => p.id)));
  }

  const handPiece = handId ? pieceById.get(handId) : null;
  const ready = Boolean(img && pieces.length && board.w > 0);

  if (imgError) {
    return (
      <p className="rounded-2xl bg-caramel/10 px-4 py-3 text-sm text-crema/80 ring-1 ring-caramel/25">
        Errore immagine — riprova più tardi.
      </p>
    );
  }

  if (!img || !pieces.length) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Caricamento puzzle">
        <div className="h-10 animate-pulse rounded-2xl bg-crema/8" />
        <div className="aspect-[1600/816] animate-pulse rounded-3xl bg-crema/6" />
        <div className="h-24 animate-pulse rounded-3xl bg-crema/6" />
      </div>
    );
  }

  return (
    <div className={cn("relative mx-auto flex w-full max-w-5xl flex-col gap-3", handId && "select-none")}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">High Staff</p>
          <h2 className="font-display text-2xl font-semibold text-crema sm:text-3xl">Puzzle galassia</h2>
          <p className="mt-1 text-sm text-crema/55">
            Pesca un pezzo: si svela e ti segue. Clicca lo slot. Esc per rimettere.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="lining-nums text-sm text-crema/85">
            {placedCount} / {PUZZLE_PIECE_COUNT}
          </span>
          <button
            type="button"
            onClick={reshuffle}
            className="rounded-full bg-crema/8 px-4 py-1.5 text-sm font-semibold ring-1 ring-sand/25 transition hover:ring-sand/40"
          >
            Rimescola
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="flex min-h-[220px] flex-1 items-center justify-center rounded-3xl bg-gradient-to-b from-[#121a32]/90 to-[#05070f] p-3 ring-1 ring-[#c9a227]/30 sm:min-h-[280px] sm:p-4"
      >
        <div
          className="relative overflow-visible rounded-2xl bg-[#0a1020]/90 shadow-[inset_0_0_0_1px_rgba(201,162,39,0.2)]"
          style={{
            width: board.w || "100%",
            height: board.h || undefined,
            aspectRatio: board.w ? undefined : "1600/816",
            padding: board.w ? Math.max(10, (board.w / PUZZLE_COLS) * PUZZLE_TAB_RATIO) : 12,
          }}
          aria-label="Quadro da completare"
        >
          {/* griglia guida */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent calc(100% / ${PUZZLE_COLS})),
                repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent calc(100% / ${PUZZLE_ROWS}))
              `,
            }}
            aria-hidden="true"
          />
          {ready
            ? Array.from({ length: PUZZLE_ROWS }, (_, r) =>
                Array.from({ length: PUZZLE_COLS }, (_, c) => {
                  const sid = `${r}-${c}`;
                  const occupant = slots[sid];
                  const occPiece = occupant ? pieceById.get(occupant) : null;
                  const empty = !occupant;
                  return (
                    <div
                      key={sid}
                      role="button"
                      tabIndex={0}
                      aria-label={`Slot ${r + 1},${c + 1}`}
                      onClick={() => onSlotClick(sid)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          onSlotClick(sid);
                        }
                      }}
                      className={cn(
                        "absolute box-border p-0",
                        empty && "outline outline-1 outline-dashed outline-offset-[-3px] outline-caramel/25",
                        empty && handId && "cursor-pointer hover:bg-caramel/15 hover:outline-caramel/75",
                        flashOk === sid && "bg-[#6dcf8a]/20",
                      )}
                      style={{
                        left: c * cellW,
                        top: r * cellH,
                        width: cellW,
                        height: cellH,
                      }}
                    >
                      {occPiece && img ? (
                        <PuzzlePieceCanvas
                          img={img}
                          piece={occPiece}
                          cellW={cellW}
                          cellH={cellH}
                          tab={tab}
                          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                          locked={Boolean(locked[occPiece.id])}
                          wrong={Boolean(wrong[occPiece.id])}
                          settled={Boolean(settled[occPiece.id])}
                        />
                      ) : null}
                    </div>
                  );
                }),
              )
            : null}
        </div>
      </div>

      <div
        aria-label="Pezzi del puzzle"
        onClick={(ev) => {
          if ((ev.target as HTMLElement).closest("[data-puzzle-token]")) return;
          if (!trayPieces.length) return;
          drawRandom(ev.clientX, ev.clientY);
        }}
        className={cn(
          "rounded-3xl bg-roast/70 px-3 py-2.5 ring-1 ring-sand/12 transition hover:ring-caramel/40",
          trayPieces.length === 0 && !handId && "cursor-default opacity-70",
          trayPieces.length > 0 && "cursor-pointer",
        )}
      >
        <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-crema/45">
          {trayLabel(trayPieces.length, Boolean(handId))}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          <AnimatePresence initial={false}>
            {trayPieces.map((p) => (
              <motion.button
                key={p.id}
                type="button"
                data-puzzle-token
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.2 }}
                aria-label={p.seen ? "Pezzo visto" : "Pezzo coperto"}
                onClick={(ev) => {
                  ev.stopPropagation();
                  drawPiece(p, ev.clientX, ev.clientY);
                }}
                className={cn(
                  "size-[clamp(2.1rem,4.2vw,2.85rem)] shrink-0 rounded-md shadow-[0_2px_4px_rgba(0,0,0,0.4)] ring-1 ring-caramel/35 transition hover:-translate-y-0.5 hover:scale-105",
                  p.seen && tokenFaces[p.id]
                    ? "bg-cover bg-center"
                    : "bg-gradient-to-br from-[#5a3a24]/95 to-[#2a1a10]/98",
                )}
                style={p.seen && tokenFaces[p.id] ? { backgroundImage: `url("${tokenFaces[p.id]}")` } : undefined}
              >
                {!p.seen ? (
                  <span
                    className="mx-auto mt-[18%] block size-[64%] rounded-sm border border-caramel/30 bg-[repeating-linear-gradient(-28deg,transparent,transparent_3px,rgba(255,220,180,0.06)_3px,rgba(255,220,180,0.06)_4px)]"
                    aria-hidden="true"
                  />
                ) : null}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {handPiece && img && cellW > 0 ? (
        <>
          <div
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)]"
            style={{ left: pointer.x, top: pointer.y }}
          >
            <PuzzlePieceCanvas img={img} piece={handPiece} cellW={cellW} cellH={cellH} tab={tab} />
          </div>
          <p
            className="pointer-events-none fixed z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-espresso/85 px-3 py-1 text-[0.7rem] font-semibold text-crema/80 ring-1 ring-sand/20"
            style={{ left: pointer.x, top: pointer.y + (cellH + tab * 2) * 0.42 }}
          >
            Clicca uno slot · Esc rimetti
          </p>
        </>
      ) : null}

      <PuzzleConfetti active={complete} />
      <PuzzleWinConfetti complete={complete} />

      <AnimatePresence>
        {complete ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-espresso/80 p-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-sm rounded-[2rem] bg-gradient-to-b from-caramel/15 to-roast p-8 text-center ring-1 ring-caramel/40 shadow-[0_30px_80px_-30px_rgba(212,145,80,0.45)]"
            >
              <p className="font-script text-2xl text-sand">Completato</p>
              <h3 className="mt-1 font-display text-3xl font-semibold">La galassia è di nuovo intera</h3>
              <p className="mt-2 text-sm text-crema/60">Vuoi rifarlo?</p>
              <button
                type="button"
                onClick={reshuffle}
                className="mt-6 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-2.5 font-semibold text-ink transition hover:-translate-y-0.5"
              >
                Ricomincia
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

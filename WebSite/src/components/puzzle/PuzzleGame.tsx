"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PuzzlePieceCanvas } from "@/components/puzzle/PuzzlePieceCanvas";
import { PuzzleConfetti } from "@/components/puzzle/PuzzleConfetti";
import { PuzzleSponsorGate } from "@/components/puzzle/PuzzleSponsorGate";
import { celebrate } from "@/lib/confetti";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { showToast } from "@/components/ui/toast";
import { finishEventoPuzzleAd, startEventoPuzzleAd } from "@/lib/evento-api";
import { cn } from "@/lib/cn";
import {
  PUZZLE_TAB_RATIO,
  buildPieces,
  fitBoardSize,
  formatPuzzleTime,
  loadPuzzleImage,
  makeEdges,
  shuffle,
  tokenFaceDataUrl,
  type PuzzleDifficulty,
  type PuzzlePieceState,
} from "@/lib/puzzle";

function PuzzleWinConfetti({ complete }: { complete: boolean }) {
  const confettiRich = useFxCap("confettiRich");
  useEffect(() => {
    if (complete) celebrate(confettiRich);
  }, [complete, confettiRich]);
  return null;
}

type SlotMap = Record<string, string | null>;

function trayLabel(left: number, holding: boolean): string {
  if (left) return `Pezzi · clicca per pescare (${left})`;
  if (holding) return "Pezzo in mano · clicca uno slot";
  return "Nessun pezzo";
}

export type PuzzleCompletePayload = {
  elapsedMs: number;
  timedOut: boolean;
};

export function PuzzleGame({
  difficulty,
  attemptId,
  token,
  watchSec = 12,
  onExit,
  onComplete,
}: {
  difficulty: PuzzleDifficulty;
  attemptId: string | null;
  token?: string | null;
  watchSec?: number;
  onExit: () => void;
  onComplete: (payload: PuzzleCompletePayload) => void | Promise<void>;
}) {
  const cols = difficulty.cols;
  const rows = difficulty.rows;
  const pieceCount = difficulty.pieces;
  const wrapRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(Date.now());
  const expiresAtRef = useRef(Date.now() + difficulty.timeLimitSec * 1000);
  const completeSent = useRef(false);

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
  const [timedOut, setTimedOut] = useState(false);
  const [board, setBoard] = useState({ w: 0, h: 0 });
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [tokenFaces, setTokenFaces] = useState<Record<string, string>>({});
  const [remainingSec, setRemainingSec] = useState(difficulty.timeLimitSec);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState("");
  const [timeAdsUsed, setTimeAdsUsed] = useState(0);
  const [rewardBoosted, setRewardBoosted] = useState(false);
  const [adGate, setAdGate] = useState<{ kind: "time" | "reward"; adSessionId: string; watchSec: number } | null>(
    null,
  );
  const settleTimers = useRef<Record<string, number>>({});

  const cellW = board.w / cols;
  const cellH = board.h / rows;
  const tab = Math.min(cellW, cellH) * PUZZLE_TAB_RATIO;
  const aspect = img && img.naturalWidth ? img.naturalWidth / img.naturalHeight : 16 / 9;

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
    setBoard(fitBoardSize(rect.width, rect.height, aspect));
  }, [aspect]);

  const boot = useCallback(() => {
    const E = makeEdges(cols, rows);
    const built = buildPieces(E, cols, rows);
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
    setTimedOut(false);
    setTokenFaces({});
    setClaimMsg("");
    setClaiming(false);
    completeSent.current = false;
    startedAtRef.current = Date.now();
    expiresAtRef.current = Date.now() + difficulty.timeLimitSec * 1000;
    setRemainingSec(difficulty.timeLimitSec);
    setTimeAdsUsed(0);
    setRewardBoosted(false);
    setAdGate(null);
    for (const t of Object.values(settleTimers.current)) window.clearTimeout(t);
    settleTimers.current = {};
  }, [cols, rows, difficulty.timeLimitSec]);

  useEffect(() => {
    let alive = true;
    setImg(null);
    setImgError(false);
    loadPuzzleImage(difficulty.imageUrl)
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
  }, [difficulty.imageUrl, boot]);

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
    if (complete || timedOut) return;
    const tick = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0) setTimedOut(true);
    }, 250);
    return () => window.clearInterval(tick);
  }, [complete, timedOut]);

  async function openBoost(kind: "time" | "reward") {
    if (!token || !attemptId || complete || timedOut || adGate) return;
    if (kind === "time" && timeAdsUsed >= 2) return;
    if (kind === "reward" && rewardBoosted) return;
    const start = await startEventoPuzzleAd(token, {
      kind,
      difficultyId: difficulty.id,
      attemptId,
    });
    if (!start?.ok || !start.adSessionId) {
      showToast(start?.message || "Boost non disponibile.", true);
      return;
    }
    setAdGate({ kind, adSessionId: start.adSessionId, watchSec: start.watchSec || watchSec });
  }

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
        const url = tokenFaceDataUrl(img, piece, 72, cols, rows);
        if (url) setTokenFaces((prev) => ({ ...prev, [piece.id]: url }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handId, pieces, img, cols, rows]);

  useEffect(() => {
    if (placedCount === pieceCount && pieces.length && !complete && !timedOut) setComplete(true);
  }, [placedCount, pieces.length, complete, pieceCount, timedOut]);

  useEffect(() => {
    if (!complete || completeSent.current) return;
    completeSent.current = true;
    const elapsedMs = Date.now() - startedAtRef.current;
    setClaiming(true);
    void Promise.resolve(onComplete({ elapsedMs, timedOut: false }))
      .then(() => setClaimMsg(""))
      .catch((err) => setClaimMsg(String(err?.message || "Premio non disponibile.")))
      .finally(() => setClaiming(false));
  }, [complete, onComplete]);

  function updatePiece(id: string, patch: Partial<PuzzlePieceState>) {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function paintToken(piece: PuzzlePieceState, image: HTMLImageElement) {
    if (!piece.seen) return;
    const url = tokenFaceDataUrl(image, piece, 72, cols, rows);
    if (url) setTokenFaces((prev) => ({ ...prev, [piece.id]: url }));
  }

  function drawPiece(piece: PuzzlePieceState, clientX?: number, clientY?: number) {
    if (complete || timedOut || piece.home !== "tray") return;
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
    if (complete || timedOut) return;
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

  const handPiece = handId ? pieceById.get(handId) : null;
  const ready = Boolean(img && pieces.length && board.w > 0);
  const urgent = remainingSec <= 20;

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
        <div className="aspect-video animate-pulse rounded-3xl bg-crema/6" />
        <div className="h-24 animate-pulse rounded-3xl bg-crema/6" />
      </div>
    );
  }

  return (
    <div className={cn("relative mx-auto flex w-full max-w-5xl flex-col gap-3", handId && "select-none")}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">{difficulty.label}</p>
          <h2 className="font-display text-2xl font-semibold text-crema sm:text-3xl">
            {cols}×{rows} · {pieceCount} pezzi
          </h2>
          <p className="mt-1 text-sm text-crema/55">Pesca un pezzo, clicca lo slot. Esc per rimettere.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span
            className={cn(
              "lining-nums rounded-full px-3 py-1 text-sm font-semibold ring-1",
              urgent ? "bg-rose-500/20 text-rose-200 ring-rose-400/40" : "bg-crema/8 text-crema/90 ring-sand/25",
            )}
          >
            {formatPuzzleTime(remainingSec)}
          </span>
          <span className="lining-nums text-sm text-crema/85">
            {placedCount} / {pieceCount}
          </span>
          {attemptId && token && !complete && !timedOut ? (
            <>
              <button
                type="button"
                disabled={timeAdsUsed >= 2}
                onClick={() => void openBoost("time")}
                className="rounded-full bg-[#2ea8ff]/15 px-3 py-1.5 text-xs font-semibold text-[#9fd4ff] ring-1 ring-[#2ea8ff]/35 disabled:opacity-40"
              >
                +45s ({2 - timeAdsUsed})
              </button>
              <button
                type="button"
                disabled={rewardBoosted}
                onClick={() => void openBoost("reward")}
                className="rounded-full bg-caramel/20 px-3 py-1.5 text-xs font-semibold text-sand ring-1 ring-caramel/40 disabled:opacity-40"
              >
                {rewardBoosted ? "Premio ×1.5" : "Boost premio"}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onExit}
            className="rounded-full bg-crema/8 px-4 py-1.5 text-sm font-semibold ring-1 ring-sand/25 transition hover:ring-sand/40"
          >
            Esci
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
            aspectRatio: board.w ? undefined : String(aspect),
            padding: board.w ? Math.max(10, (board.w / cols) * PUZZLE_TAB_RATIO) : 12,
          }}
          aria-label="Quadro da completare"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: `
                repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent calc(100% / ${cols})),
                repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent calc(100% / ${rows}))
              `,
            }}
            aria-hidden="true"
          />
          {ready
            ? Array.from({ length: rows }, (_, r) =>
                Array.from({ length: cols }, (_, c) => {
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
                          cols={cols}
                          rows={rows}
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
          if (!trayPieces.length || timedOut || complete) return;
          drawRandom(ev.clientX, ev.clientY);
        }}
        className={cn(
          "rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast px-3 py-2.5 ring-1 ring-sand/12 transition hover:ring-caramel/40",
          (trayPieces.length === 0 || timedOut || complete) && "cursor-default opacity-70",
          trayPieces.length > 0 && !timedOut && !complete && "cursor-pointer",
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
                  "size-[clamp(2.1rem,4.2vw,2.85rem)] shrink-0 rounded-md shadow-[0_2px_4px_rgba(0,0,0,0.4)] ring-1 ring-caramel/35 transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] hover:scale-105",
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
            <PuzzlePieceCanvas
              img={img}
              piece={handPiece}
              cellW={cellW}
              cellH={cellH}
              tab={tab}
              cols={cols}
              rows={rows}
            />
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
        {complete || timedOut ? (
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
              <p className="font-script text-2xl text-sand">{timedOut ? "Tempo scaduto" : "Completato"}</p>
              <h3 className="mt-1 font-display text-3xl font-semibold">
                {timedOut ? "La ricompensa è persa" : "La mappa è di nuovo intera"}
              </h3>
              <p className="mt-2 text-sm text-crema/60">
                {timedOut
                  ? "Ricomincia dalla selezione quando il cooldown lo consente."
                  : claiming
                    ? "Riconoscimento premio…"
                    : claimMsg || (attemptId ? "Premio assegnato." : "Modalità anteprima · nessun premio.")}
              </p>
              <button
                type="button"
                onClick={onExit}
                className="mt-6 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-2.5 font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
              >
                Torna alle difficoltà
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {adGate && token ? (
        <PuzzleSponsorGate
          watchSec={adGate.watchSec}
          title={adGate.kind === "time" ? "Tempo extra" : "Premio potenziato"}
          subtitle={adGate.kind === "time" ? "+45 secondi al timer" : "EXP ×1.5 e casse migliori"}
          onCancel={() => setAdGate(null)}
          onDone={async () => {
            const out = await finishEventoPuzzleAd(token, adGate.adSessionId);
            const kind = adGate.kind;
            setAdGate(null);
            if (!out?.ok) {
              showToast(out?.message || "Boost fallito.", true);
              return;
            }
            if (kind === "time") {
              const exp = out.expiresAt ? Date.parse(out.expiresAt) : NaN;
              if (Number.isFinite(exp)) expiresAtRef.current = exp;
              else expiresAtRef.current += (out.bonusSec || 45) * 1000;
              setTimeAdsUsed(Number(out.timeAdsLeft != null ? 2 - out.timeAdsLeft : timeAdsUsed + 1));
              showToast(`+${out.bonusSec || 45}s`);
            } else {
              setRewardBoosted(true);
              showToast("Premio potenziato");
            }
          }}
        />
      ) : null}
    </div>
  );
}

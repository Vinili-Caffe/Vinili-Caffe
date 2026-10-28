"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useInView } from "motion/react";
import { cn } from "@/lib/cn";
import { VinylRecord } from "./VinylRecord";
import { getVinylMusicApi, subscribeVinylMusic } from "@/lib/vinyl-music-bus";

const ease = [0.22, 1, 0.36, 1] as const;
const SEC_PER_REV = { 33: 60 / 33.333, 45: 60 / 45 } as const;
const ARM_OFF = -26;
const ARM_ON = 0;
/**
 * Gain audio rispetto a 1 giro = SEC_PER_REV.
 * Lo scrub visuale segue l’angolo reale del dito (1:1); solo l’audio è un filo più “veloce”.
 */
const SCRUB_TIME_GAIN = 2.2;
/** Sotto questa frazione del raggio gli angoli saltano: ignora il campione. */
const SCRUB_MIN_RADIUS = 0.12;
/** px: sotto questa soglia il gesto resta un tap (play/stop), non uno scrub. */
const SCRUB_MOVE_PX = 8;

function pointerAngle(clientX: number, clientY: number, rect: DOMRect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.atan2(clientY - cy, clientX - cx);
}

function unwrapDelta(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pointerRadiusRatio(clientX: number, clientY: number, rect: DOMRect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const r = Math.min(rect.width, rect.height) / 2 || 1;
  return Math.hypot(dx, dy) / r;
}

/**
 * Giradischi visuale: audio/volume/minutaggio dal VinylMusicRoot globale (persistito su disco).
 */
export function Turntable() {
  const vinyl = useSyncExternalStore(subscribeVinylMusic, getVinylMusicApi, () => null);
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { margin: "0px 0px -10% 0px" });
  const inViewRef = useRef(inView);

  const playing = Boolean(vinyl?.on);
  const playingRef = useRef(playing);
  const [rpm, setRpm] = useState<33 | 45>(33);
  const rpmRef = useRef<33 | 45>(33);
  const [draggingArm, setDraggingArm] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const draggingArmRef = useRef(false);
  const scrubbingRef = useRef(false);
  const armAngle = useMotionValue(ARM_OFF);
  const platterRotate = useMotionValue(0);
  const spinSpeed = useRef(0);
  const dragStart = useRef({ x: 0, angle: ARM_OFF });
  const platterEl = useRef<HTMLDivElement>(null);
  const scrubStart = useRef({
    lastRad: 0,
    hasAngle: false,
    deg: 0,
    audio: 0,
    moved: false,
    pendingSeek: 0,
    turns: 0,
  });
  const platterTap = useRef<{
    active: boolean;
    x: number;
    y: number;
    audio: number;
  } | null>(null);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    rpmRef.current = rpm;
  }, [rpm]);
  useEffect(() => {
    inViewRef.current = inView;
  }, [inView]);

  useEffect(() => {
    if (draggingArmRef.current || scrubbingRef.current) return;
    const target = playing ? 1 : 0;
    const from = spinSpeed.current;
    const ctrl = animate(from, target, {
      duration: playing ? 1.1 : 2.2,
      ease: playing ? "easeOut" : [0.3, 0, 0.2, 1],
      onUpdate: (v) => {
        spinSpeed.current = v;
      },
    });
    return () => ctrl.stop();
  }, [playing, draggingArm, scrubbing]);

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const spinning = spinSpeed.current > 0.001;
      const active = scrubbingRef.current || playingRef.current || spinning;
      // fuori viewport e fermo: stop RAF (riparte quando play/inView cambia)
      if (!inViewRef.current && !active) {
        raf = 0;
        return;
      }
      if (!scrubbingRef.current && spinning && inViewRef.current) {
        const sec = SEC_PER_REV[rpmRef.current];
        const degPerMs = 360 / (sec * 1000);
        platterRotate.set(platterRotate.get() + degPerMs * dt * spinSpeed.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, platterRotate, playing, inView]);

  useEffect(() => {
    if (draggingArmRef.current) return;
    animate(armAngle, playing ? ARM_ON : ARM_OFF, {
      duration: playing ? 1.2 : 0.9,
      ease,
    });
  }, [playing, draggingArm, armAngle]);

  const toggle = () => {
    vinyl?.toggle();
  };

  const endArmDrag = useCallback(() => {
    if (!draggingArmRef.current) return;
    draggingArmRef.current = false;
    setDraggingArm(false);
    vinyl?.setScrubbing(false);
    const a = armAngle.get();
    const on = a > (ARM_OFF + ARM_ON) / 2;
    vinyl?.setPlaying(on);
    animate(armAngle, on ? ARM_ON : ARM_OFF, { duration: 0.35, ease });
  }, [armAngle, vinyl]);

  const beginScrub = useCallback(
    (clientX: number, clientY: number, audioT: number) => {
      if (scrubbingRef.current) return;
      scrubbingRef.current = true;
      setScrubbing(true);
      vinyl?.setScrubbing(true);
      const el = platterEl.current;
      const rect = el?.getBoundingClientRect();
      const nearHub = rect ? pointerRadiusRatio(clientX, clientY, rect) < SCRUB_MIN_RADIUS : true;
      scrubStart.current = {
        lastRad: !nearHub && rect ? pointerAngle(clientX, clientY, rect) : 0,
        hasAngle: !nearHub && !!rect,
        deg: platterRotate.get(),
        audio: audioT,
        moved: false,
        pendingSeek: audioT,
        turns: 0,
      };
    },
    [platterRotate, vinyl],
  );

  const endScrub = useCallback(() => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setScrubbing(false);
    if (scrubStart.current.moved) {
      const dur = vinyl?.getDuration() || 0;
      let t = scrubStart.current.pendingSeek;
      if (dur > 0) t = ((t % dur) + dur) % dur;
      vinyl?.seekTo(Math.max(0, t));
    }
    vinyl?.setScrubbing(false);
  }, [vinyl]);

  const endPlatterGesture = useCallback(() => {
    const tap = platterTap.current;
    platterTap.current = null;
    if (scrubbingRef.current) {
      endScrub();
      return;
    }
    if (!tap?.active) return;
    vinyl?.toggle();
  }, [endScrub, vinyl]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (draggingArmRef.current) {
        const dx = e.clientX - dragStart.current.x;
        const next = Math.max(ARM_OFF, Math.min(ARM_ON + 4, dragStart.current.angle - dx * 0.22));
        armAngle.set(next);
        const shouldPlay = next > ARM_OFF + 10;
        if (shouldPlay !== playingRef.current) vinyl?.setPlaying(shouldPlay);
        return;
      }
      const tap = platterTap.current;
      if (tap?.active && !scrubbingRef.current) {
        const dist = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
        if (dist >= SCRUB_MOVE_PX) {
          platterTap.current = null;
          beginScrub(e.clientX, e.clientY, tap.audio);
        } else {
          return;
        }
      }
      if (scrubbingRef.current) {
        const el = platterEl.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (pointerRadiusRatio(e.clientX, e.clientY, rect) < SCRUB_MIN_RADIUS) {
          scrubStart.current.hasAngle = false;
          return;
        }
        const rad = pointerAngle(e.clientX, e.clientY, rect);
        if (!scrubStart.current.hasAngle) {
          scrubStart.current.lastRad = rad;
          scrubStart.current.hasAngle = true;
          return;
        }
        const dRad = unwrapDelta(scrubStart.current.lastRad, rad);
        scrubStart.current.lastRad = rad;
        if (Math.abs(dRad) < 1e-6) return;
        scrubStart.current.turns += dRad / (Math.PI * 2);
        if (Math.abs(scrubStart.current.turns) > 0.01) scrubStart.current.moved = true;
        platterRotate.set(scrubStart.current.deg + scrubStart.current.turns * 360);
        scrubStart.current.pendingSeek =
          scrubStart.current.audio + scrubStart.current.turns * SEC_PER_REV[rpmRef.current] * SCRUB_TIME_GAIN;
      }
    };
    const onUp = () => {
      endArmDrag();
      endPlatterGesture();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [armAngle, beginScrub, endArmDrag, endPlatterGesture, platterRotate, vinyl]);

  const onArmPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    draggingArmRef.current = true;
    setDraggingArm(true);
    dragStart.current = { x: e.clientX, angle: armAngle.get() };
    vinyl?.setScrubbing(true);
  };

  const onPlatterPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const audioT = vinyl?.getCurrentTime() || 0;
    scrubStart.current.moved = false;
    platterTap.current = { active: true, x: e.clientX, y: e.clientY, audio: audioT };
  };

  const setRpmSafe = (v: 33 | 45) => {
    if (v === rpmRef.current) {
      vinyl?.setPlaying(true);
      return;
    }
    setRpm(v);
    vinyl?.setPlaying(true);
  };

  return (
    <div ref={wrap} className="relative mx-auto w-[min(88vw,30rem)] select-none">
      <div className="absolute inset-[-10%] rounded-[3rem] bg-[radial-gradient(circle_at_40%_50%,rgba(240,180,110,0.25),transparent_60%)] blur-2xl" />

      <div className="relative aspect-[1.18/1] rounded-[1.6rem] bg-[linear-gradient(135deg,#3a2618_0%,#24160e_45%,#2e1d13_70%,#1a100a_100%)] p-[5%] shadow-[0_50px_90px_-40px_rgba(0,0,0,1),inset_0_1px_0_rgba(255,230,200,0.12),inset_0_-2px_0_rgba(0,0,0,0.5)] ring-1 ring-black/60">
        <div className="pointer-events-none absolute inset-0 rounded-[1.6rem] bg-[repeating-linear-gradient(100deg,rgba(255,220,180,0.035)_0_2px,transparent_2px_9px)]" />

        <div className="relative aspect-square h-full">
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(#8b8f96,#e4e7eb,#7a7e85,#d6d9dd,#8b8f96,#eceff2,#7a7e85)] p-[2.2%] shadow-[0_18px_30px_-10px_rgba(0,0,0,0.9)]">
            <motion.div
              ref={platterEl}
              style={{ rotate: platterRotate }}
              onPointerDown={onPlatterPointerDown}
              className={cn(
                "relative size-full rounded-full bg-[repeating-conic-gradient(#2b2d31_0_4deg,#3a3d42_4deg_8deg)] p-[1.5%] touch-none will-change-transform",
                scrubbing ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing",
              )}
              aria-label={playing ? "Ferma (trascina e rilascia per avanti/indietro)" : "Avvia la musica"}
              role="button"
            >
              <VinylRecord rpm={rpm} className="pointer-events-none size-full rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" />
            </motion.div>
          </div>
          <div className="pointer-events-none absolute inset-[3.5%] rounded-full bg-[conic-gradient(from_200deg,transparent_0deg,rgba(255,240,220,0.18)_35deg,transparent_75deg,transparent_195deg,rgba(255,240,220,0.09)_225deg,transparent_255deg)]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-[3.2%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-white to-zinc-500 shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
        </div>

        <motion.svg
          viewBox="0 0 118 100"
          className="pointer-events-none absolute inset-0 z-[5] size-full overflow-visible"
          style={{ transformOrigin: "95.5% 15%", rotate: armAngle }}
          aria-hidden
        >
          <defs>
            <linearGradient id="vc-arm-metal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f4e9d8" />
              <stop offset="0.5" stopColor="#c4a07a" />
              <stop offset="1" stopColor="#7d5f42" />
            </linearGradient>
            <filter id="vc-arm-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#000" floodOpacity="0.45" />
            </filter>
          </defs>
          <g filter="url(#vc-arm-soft)">
            <rect x="108.5" y="2" width="8" height="9" rx="2" fill="#1a110c" stroke="#c4a07a" strokeWidth="0.6" />
            <circle cx="112.7" cy="15" r="7" fill="#1a110c" stroke="#5a4330" strokeWidth="1" />
            <circle cx="112.7" cy="15" r="3.4" fill="url(#vc-arm-metal)" />
          </g>
          <path
            d="M112.7 15 L110.2 48 Q109.2 56 102.5 61 L86 68.5"
            fill="none"
            stroke="url(#vc-arm-metal)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.95"
          />
          <g transform="rotate(-28 84 70)" filter="url(#vc-arm-soft)">
            <ellipse cx="84" cy="72.2" rx="7" ry="2.2" fill="#000" opacity="0.28" />
            <rect x="78" y="67.2" width="11" height="5.8" rx="1.2" fill="url(#vc-arm-metal)" stroke="#1a110c" strokeWidth="0.55" />
            <rect x="79.2" y="72.6" width="2.2" height="1.6" rx="0.4" fill="#1a110c" />
          </g>
        </motion.svg>

        <motion.div className="pointer-events-none absolute inset-0 z-20" style={{ transformOrigin: "95.5% 15%", rotate: armAngle }}>
          <button
            type="button"
            aria-label={playing ? "Sposta la puntina" : "Metti la puntina sul vinile"}
            onPointerDown={onArmPointerDown}
            className={cn("pointer-events-auto absolute touch-none rounded-full", draggingArm ? "cursor-grabbing" : "cursor-grab")}
            style={{ left: "66%", top: "60%", width: "12%", height: "14%" }}
          />
        </motion.div>

        <div className="absolute left-[2.2%] top-[3.5%] z-30 flex flex-col gap-1">
          {([33, 45] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setRpmSafe(v)}
              className={cn(
                "rounded-md px-2 py-0.5 font-mono text-[0.62rem] font-semibold tracking-wider ring-1 transition-colors",
                rpm === v ? "bg-sand/90 text-espresso ring-sand" : "bg-black/40 text-crema/60 ring-crema/15 hover:text-crema",
              )}
              aria-pressed={rpm === v}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="absolute bottom-[4%] left-[2.2%] z-30">
          <motion.button
            type="button"
            onClick={toggle}
            whileTap={{ scale: 0.92 }}
            className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-b from-zinc-300 to-zinc-500 text-[0.55rem] font-bold uppercase tracking-wider text-zinc-900 shadow-[0_4px_0_#3f3f46,0_8px_14px_rgba(0,0,0,0.6)] active:translate-y-[2px] active:shadow-[0_2px_0_#3f3f46]"
            aria-label={playing ? "Stop" : "Start"}
          >
            {playing ? "Stop" : "Start"}
            <span
              className={cn(
                "absolute -top-2.5 right-1 size-1.5 rounded-full transition-[transform,opacity,background-color] duration-500",
                playing ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" : "bg-red-900",
              )}
            />
          </motion.button>
        </div>

        {["right-[2.5%] bottom-[3%]", "right-[18%] bottom-[3%]"].map((p) => (
          <span key={p} className={cn("absolute size-1.5 rounded-full bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]", p)} />
        ))}
      </div>
    </div>
  );
}

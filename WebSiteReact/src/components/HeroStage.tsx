"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { DISCORD_INVITE } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { getVinylMusicApi, subscribeVinylMusic } from "@/lib/vinyl-music-bus";
import { VinylRecord } from "@/components/VinylRecord";
import { cn } from "@/lib/cn";

const ease = [0.22, 1, 0.36, 1] as const;
const SEC_PER_REV = 60 / 33.333;
const ARM_OFF = -26;
const ARM_ON = 0;
const SCRUB_TIME_GAIN = 2.2;
const SCRUB_MIN_RADIUS = 0.12;
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
  const r = Math.min(rect.width, rect.height) / 2 || 1;
  return Math.hypot(clientX - cx, clientY - cy) / r;
}

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" aria-hidden className={className} fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.44-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

function ChatBubble({
  className,
  delay = 0,
  large,
}: {
  className?: string;
  delay?: number;
  large?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={cn(
        "rounded-[1.1rem] rounded-br-md",
        "bg-[linear-gradient(145deg,#8a8278_0%,#5c564e_48%,#3a362f_100%)]",
        "shadow-[0_14px_28px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-2px_4px_rgba(0,0,0,0.35)]",
        "ring-1 ring-black/35",
        large ? "px-4 py-3" : "px-3 py-2",
        className,
      )}
      animate={reduce ? undefined : { y: [0, -4, 0] }}
      transition={{ duration: 3.2 + delay, delay, repeat: Infinity, ease: "easeInOut" }}
    >
      <span className={cn("flex", large ? "gap-1.5" : "gap-1")}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn("rounded-full bg-white/55", large ? "size-1.5" : "size-1")}
            style={{ boxShadow: "0 0.5px 0 rgba(0,0,0,0.35)" }}
          />
        ))}
      </span>
    </motion.div>
  );
}

/**
 * Card hero: look promo + braccio apri/chiudi + scrub piatto (come Turntable).
 */
export function HeroStage({ className }: { className?: string }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const vinyl = useSyncExternalStore(subscribeVinylMusic, getVinylMusicApi, () => null);
  const playing = Boolean(vinyl?.on);
  const playingRef = useRef(playing);

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
  const platterTap = useRef<{ active: boolean; x: number; y: number; audio: number } | null>(null);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

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
      if (!scrubbingRef.current && spinSpeed.current > 0.001) {
        const degPerMs = 360 / (SEC_PER_REV * 1000);
        platterRotate.set(platterRotate.get() + degPerMs * dt * spinSpeed.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, platterRotate, playing]);

  useEffect(() => {
    if (draggingArmRef.current) return;
    animate(armAngle, playing ? ARM_ON : ARM_OFF, {
      duration: playing ? 1.2 : 0.9,
      ease,
    });
  }, [playing, draggingArm, armAngle]);

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
          scrubStart.current.audio + scrubStart.current.turns * SEC_PER_REV * SCRUB_TIME_GAIN;
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

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative mx-auto w-full max-w-[21.5rem] sm:max-w-[25rem]", className)}
    >
      {/* Alone decorativo: classe senza blur-2xl/3xl nel parent della UI (gate opacity). */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_50%_40%,rgba(217,154,91,0.42),transparent_62%)] opacity-90"
        style={{ filter: "blur(42px)" }}
      />

      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className={cn(
          "relative overflow-visible rounded-[1.9rem]",
          /* opaco: niente glass / backdrop-blur (matchava gate opacity 0.14) */
          "bg-[linear-gradient(155deg,#4a3426_0%,#2a1b12_42%,#1a110c_100%)]",
          "p-5 shadow-[0_44px_96px_-36px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,230,200,0.14),inset_0_-2px_0_rgba(0,0,0,0.45)]",
          "ring-1 ring-black/55 sm:p-6",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[1.9rem] bg-[repeating-linear-gradient(100deg,rgba(255,220,180,0.04)_0_2px,transparent_2px_9px)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[1.9rem] bg-[radial-gradient(ellipse_at_90%_0%,rgba(255,210,160,0.12),transparent_42%)]"
        />

        <div className="relative z-[1] flex items-start justify-between">
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener"
            aria-label={t("common.discord")}
            className={cn(
              "inline-flex size-[3.15rem] items-center justify-center rounded-full",
              "bg-gradient-to-br from-[#8b9af5] via-[#5865f2] to-[#3b45b5] text-white",
              "shadow-[0_16px_32px_-10px_rgba(88,101,242,0.95),inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-4px_8px_rgba(0,0,0,0.4)]",
              "ring-1 ring-white/30 transition-transform hover:-translate-y-0.5 active:scale-95",
            )}
          >
            <DiscordMark className="size-[1.4rem]" />
          </a>
          <span className="mt-2.5 flex gap-1.5 pr-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-[5px] rounded-full bg-[#f4e9d8]/45 shadow-[0_1px_0_rgba(0,0,0,0.45)]" />
            ))}
          </span>
        </div>

        <div className="relative mt-5">
          <div
            className={cn(
              "relative mx-auto aspect-square w-[88%] max-w-[18rem]",
              "rounded-[1.35rem]",
              "bg-[linear-gradient(135deg,#3a2618_0%,#24160e_45%,#2e1d13_70%,#1a100a_100%)]",
              "p-[6%]",
              "shadow-[0_26px_48px_-16px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,230,200,0.12),inset_0_-12px_24px_rgba(0,0,0,0.55)]",
              "ring-1 ring-black/60",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[1.35rem] bg-[radial-gradient(ellipse_at_25%_15%,rgba(255,230,200,0.14),transparent_48%)]"
            />

            <div
              className={cn(
                "relative size-full rounded-full",
                "bg-[conic-gradient(#8b8f96,#e4e7eb,#7a7e85,#d6d9dd,#8b8f96,#eceff2,#7a7e85)]",
                "p-[2.4%] shadow-[0_18px_30px_-10px_rgba(0,0,0,0.9)]",
              )}
            >
              <motion.div
                ref={platterEl}
                style={{ rotate: platterRotate }}
                onPointerDown={onPlatterPointerDown}
                className={cn(
                  "relative size-full touch-none rounded-full bg-[repeating-conic-gradient(#2b2d31_0_4deg,#3a3d42_4deg_8deg)] p-[1.5%] will-change-transform outline-none",
                  scrubbing ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing",
                )}
                role="button"
                tabIndex={0}
                aria-label={
                  playing
                    ? "Ferma (trascina per avanti/indietro)"
                    : "Avvia la musica (o trascina il braccio)"
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    vinyl?.toggle();
                  }
                }}
              >
                <VinylRecord className="pointer-events-none size-full rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" />
              </motion.div>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[8%] rounded-full bg-[conic-gradient(from_200deg,transparent_0deg,rgba(255,240,220,0.2)_35deg,transparent_75deg)]"
            />

            {/* braccio: stesso pivot/SVG del Turntable — trascina per play/stop */}
            <motion.svg
              viewBox="0 0 118 100"
              className="pointer-events-none absolute inset-0 z-[5] size-full overflow-visible"
              style={{ transformOrigin: "95.5% 15%", rotate: armAngle }}
              aria-hidden
            >
              <defs>
                <linearGradient id="vc-hero-arm-metal" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#f4e9d8" />
                  <stop offset="0.5" stopColor="#c4a07a" />
                  <stop offset="1" stopColor="#7d5f42" />
                </linearGradient>
                <filter id="vc-hero-arm-soft" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#000" floodOpacity="0.45" />
                </filter>
              </defs>
              <g filter="url(#vc-hero-arm-soft)">
                <rect x="108.5" y="2" width="8" height="9" rx="2" fill="#1a110c" stroke="#c4a07a" strokeWidth="0.6" />
                <circle cx="112.7" cy="15" r="7" fill="#1a110c" stroke="#5a4330" strokeWidth="1" />
                <circle cx="112.7" cy="15" r="3.4" fill="url(#vc-hero-arm-metal)" />
              </g>
              <path
                d="M112.7 15 L110.2 48 Q109.2 56 102.5 61 L86 68.5"
                fill="none"
                stroke="url(#vc-hero-arm-metal)"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.95"
              />
              <g transform="rotate(-28 84 70)" filter="url(#vc-hero-arm-soft)">
                <ellipse cx="84" cy="72.2" rx="7" ry="2.2" fill="#000" opacity="0.28" />
                <rect x="78" y="67.2" width="11" height="5.8" rx="1.2" fill="url(#vc-hero-arm-metal)" stroke="#1a110c" strokeWidth="0.55" />
                <rect x="79.2" y="72.6" width="2.2" height="1.6" rx="0.4" fill="#1a110c" />
              </g>
            </motion.svg>
            <motion.div
              className="pointer-events-none absolute inset-0 z-20"
              style={{ transformOrigin: "95.5% 15%", rotate: armAngle }}
            >
              <button
                type="button"
                aria-label={playing ? "Alza la puntina" : "Metti la puntina sul vinile"}
                onPointerDown={onArmPointerDown}
                className={cn(
                  "pointer-events-auto absolute touch-none rounded-full",
                  draggingArm ? "cursor-grabbing" : "cursor-grab",
                )}
                style={{ left: "66%", top: "60%", width: "12%", height: "14%" }}
              />
            </motion.div>

            <span
              aria-hidden
              className="absolute bottom-[5.5%] right-[8%] size-2.5 rounded-[3px] bg-gradient-to-b from-[#55504a] to-[#1c1a17] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.7)]"
            />
          </div>

          <div className="pointer-events-none absolute -right-0.5 top-[18%] flex flex-col items-end gap-2.5 sm:right-1" aria-hidden>
            <ChatBubble className="mr-5 scale-[0.92] opacity-90" delay={0.4} />
            <ChatBubble large delay={0} />
          </div>
        </div>

        <div className="relative z-[1] mt-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5" aria-hidden>
            <span className="size-10 rounded-full bg-[linear-gradient(145deg,#3a342e,#14110e)] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)] ring-2 ring-black/40" />
            <div className="flex -space-x-2.5">
              {["#e2c49a", "#9a6a3c", "#f2e6d2"].map((c, i) => (
                <span
                  key={c}
                  className="size-8 rounded-full ring-2 ring-[#1a110c]/95"
                  style={{
                    background: `linear-gradient(145deg, ${c}, #2a1c12)`,
                    zIndex: 3 - i,
                    boxShadow: "0 4px 10px -4px rgba(0,0,0,0.7)",
                  }}
                />
              ))}
            </div>
          </div>

          <motion.a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener"
            whileHover={reduce ? undefined : { y: -3, scale: 1.035 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className={cn(
              "inline-flex min-w-[8.5rem] items-center justify-center rounded-full",
              "bg-gradient-to-b from-[#e0b080] to-[#b06535]",
              "px-8 py-3.5 text-[0.95rem] font-semibold tracking-wide text-white",
              "shadow-[0_16px_34px_-12px_rgba(176,101,53,0.95),inset_0_1px_0_rgba(255,245,230,0.55),inset_0_-3px_0_rgba(90,45,18,0.35)]",
              "ring-1 ring-white/20",
            )}
          >
            Entra
            <span className="sr-only"> — {t("common.discord")}</span>
          </motion.a>
        </div>
      </motion.div>
    </motion.div>
  );
}

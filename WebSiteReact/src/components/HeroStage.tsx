"use client";

import {
  useCallback,
  useEffect,
  useId,
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

function TonearmSvg({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 130" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${uid}-m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#d8d4cc" />
          <stop offset="100%" stopColor="#6a655c" />
        </linearGradient>
        <linearGradient id={`${uid}-head`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3632" />
          <stop offset="100%" stopColor="#12100e" />
        </linearGradient>
        <filter id={`${uid}-sh`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
      <g filter={`url(#${uid}-sh)`}>
        <ellipse cx="74" cy="18" rx="13" ry="12" fill="#0e0c0a" />
        <circle cx="74" cy="16" r="11.5" fill="#1a1612" stroke="#cfc9be" strokeWidth="1.5" />
        <circle cx="74" cy="16" r="6.2" fill={`url(#${uid}-m)`} />
        <circle cx="74" cy="16" r="2.2" fill="#2a2620" />
        <circle cx="74" cy="15.2" r="0.7" fill="#fff" opacity="0.45" />
        <path
          d="M74 16 L69 58 Q66 78 48 92 L26 108"
          fill="none"
          stroke={`url(#${uid}-m)`}
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <path
          d="M74 16 L69 58 Q66 78 48 92 L26 108"
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1.1"
          strokeLinecap="round"
          transform="translate(-1.1 -0.6)"
        />
        <g transform="rotate(-36 24 110)">
          <ellipse cx="24" cy="114" rx="11" ry="3" fill="#000" opacity="0.35" />
          <rect x="12" y="104" width="24" height="11" rx="2.2" fill={`url(#${uid}-head)`} stroke="#8a847a" strokeWidth="0.6" />
          <rect x="14" y="106" width="18" height="3" rx="1" fill={`url(#${uid}-m)`} opacity="0.35" />
          <rect x="16" y="114.5" width="3.5" height="2.4" rx="0.4" fill="#0a0806" />
        </g>
      </g>
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
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-12 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_50%_40%,rgba(217,154,91,0.48),transparent_62%)] blur-3xl"
      />

      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className={cn(
          "relative overflow-visible rounded-[1.9rem]",
          "bg-[linear-gradient(165deg,rgba(70,64,58,0.55)_0%,rgba(36,32,28,0.68)_45%,rgba(18,16,14,0.78)_100%)]",
          "p-5 shadow-[0_44px_96px_-36px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.16)]",
          "ring-1 ring-white/12 backdrop-blur-2xl sm:p-6",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[1.9rem] bg-[radial-gradient(ellipse_at_90%_0%,rgba(255,210,160,0.1),transparent_42%)]"
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
              <span key={i} className="size-[5px] rounded-full bg-white/35 shadow-[0_1px_0_rgba(0,0,0,0.45)]" />
            ))}
          </span>
        </div>

        <div className="relative mt-5">
          <div
            className={cn(
              "relative mx-auto aspect-square w-[84%] max-w-[17.25rem]",
              "rounded-[1.35rem]",
              "bg-[linear-gradient(150deg,#4a4641_0%,#2c2926_38%,#161412_100%)]",
              "p-[7.5%]",
              "shadow-[0_26px_48px_-16px_rgba(0,0,0,0.95),0_2px_0_rgba(255,255,255,0.1),inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-14px_28px_rgba(0,0,0,0.5)]",
              "ring-1 ring-black/55",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[1.35rem] bg-[radial-gradient(ellipse_at_25%_15%,rgba(255,255,255,0.16),transparent_48%)]"
            />

            <div
              className={cn(
                "relative size-full rounded-full",
                "bg-[conic-gradient(from_195deg,#f4f1ea,#9a958c,#efebe3,#5a5650,#f7f4ee,#8a857c,#ebe7e0)]",
                "p-[2.6%] shadow-[0_14px_26px_-8px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.5)]",
              )}
            >
              <motion.div
                ref={platterEl}
                style={{ rotate: platterRotate }}
                onPointerDown={onPlatterPointerDown}
                className={cn(
                  "relative size-full touch-none rounded-full will-change-transform outline-none",
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
                <VinylRecord className="pointer-events-none size-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)]" />
              </motion.div>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-[4%] rounded-full bg-[conic-gradient(from_205deg,transparent_0deg,rgba(255,250,240,0.32)_24deg,transparent_58deg)]"
              />
            </div>

            {/* braccio: ruota dal pivot; trascina per play/stop */}
            <motion.div
              className="pointer-events-none absolute inset-0 z-10 overflow-visible"
              style={{ transformOrigin: "88% 12%", rotate: armAngle }}
            >
              <TonearmSvg className="absolute -right-[4%] top-0 h-[82%] w-[46%]" />
            </motion.div>
            <motion.div
              className="pointer-events-none absolute inset-0 z-20"
              style={{ transformOrigin: "88% 12%", rotate: armAngle }}
            >
              <button
                type="button"
                aria-label={playing ? "Alza la puntina" : "Metti la puntina sul vinile"}
                onPointerDown={onArmPointerDown}
                className={cn(
                  "pointer-events-auto absolute touch-none rounded-full",
                  draggingArm ? "cursor-grabbing" : "cursor-grab",
                )}
                style={{ left: "58%", top: "52%", width: "22%", height: "22%" }}
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
                  className="size-8 rounded-full ring-2 ring-[#12100e]/90"
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

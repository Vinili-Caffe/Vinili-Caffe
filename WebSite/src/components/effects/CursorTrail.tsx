"use client";

import { useEffect, useRef, useState } from "react";
import { EFFECT_KEYS, effectEnabled, isDesktopPointer } from "@/lib/site-effects";
import { isPerfPaused } from "@/lib/perf-pause";
import { useDeviceFx } from "./DeviceFxProvider";

const SEGMENTS = 16;
const SEGMENT_LEN = 11;
const LINE_WIDTH = 2.6;
const MOVE_SQ = 1;
const IDLE_MS = 240;

/**
 * Scia SVG del cursore (desktop only). Attiva solo con cap `pointerFx`.
 */
export function CursorTrail() {
  const { caps, ready } = useDeviceFx();
  const [active, setActive] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const gradRef = useRef<SVGLinearGradientElement>(null);

  useEffect(() => {
    if (!ready || !caps.pointerFx) {
      setActive(false);
      return;
    }
    if (!effectEnabled(EFFECT_KEYS.cursorTrail, true) || !isDesktopPointer()) {
      setActive(false);
      return;
    }
    setActive(true);
  }, [ready, caps.pointerFx]);

  useEffect(() => {
    if (!active) return;
    const svg = svgRef.current;
    const path = pathRef.current;
    const grad = gradRef.current;
    if (!svg || !path || !grad) return;

    const points: { x: number; y: number }[] = [];
    const mouse = { x: -9999, y: -9999, active: false };
    let lastMoveAt = 0;
    let rafId = 0;
    let running = false;
    let lastPointerType = "";

    const resize = () => {
      svg.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
    };

    const seed = (x: number, y: number) => {
      points.length = 0;
      for (let i = 0; i < SEGMENTS; i++) points.push({ x, y });
    };

    const clear = () => {
      running = false;
      path.setAttribute("d", "");
      mouse.active = false;
    };

    const shouldIgnore = (type: string) => {
      if (type === "touch") return true;
      if (lastPointerType === "touch" && (!type || type === "mouse")) return true;
      return false;
    };

    const simulate = () => {
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]!;
        const cur = points[i]!;
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const ratio = SEGMENT_LEN / dist;
        cur.x = prev.x + dx * ratio;
        cur.y = prev.y + dy * ratio;
      }
    };

    const buildD = () => {
      if (points.length < 2) return "";
      let d = `M ${points[0]!.x} ${points[0]!.y}`;
      for (let i = 1; i < points.length - 2; i++) {
        const cx = (points[i]!.x + points[i + 1]!.x) * 0.5;
        const cy = (points[i]!.y + points[i + 1]!.y) * 0.5;
        d += ` Q ${points[i]!.x} ${points[i]!.y} ${cx} ${cy}`;
      }
      const a = points[points.length - 2]!;
      const b = points[points.length - 1]!;
      d += ` Q ${a.x} ${a.y} ${b.x} ${b.y}`;
      return d;
    };

    const draw = () => {
      if (!mouse.active || points.length < 2) {
        path.setAttribute("d", "");
        return;
      }
      const head = points[0]!;
      const tail = points[points.length - 1]!;
      grad.setAttribute("x1", String(head.x));
      grad.setAttribute("y1", String(head.y));
      grad.setAttribute("x2", String(tail.x));
      grad.setAttribute("y2", String(tail.y));
      path.setAttribute("d", buildD());
    };

    const tick = () => {
      if (document.hidden || !mouse.active) {
        clear();
        return;
      }
      simulate();
      draw();
      if (performance.now() - lastMoveAt > IDLE_MS) {
        clear();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    const onMove = (ev: PointerEvent | MouseEvent, pointerType: string) => {
      if (document.hidden || isPerfPaused()) return;
      const type = pointerType || ("pointerType" in ev ? String(ev.pointerType || "") : "");
      if (type) lastPointerType = type;
      if (shouldIgnore(type || lastPointerType)) return;

      const x = ev.clientX;
      const y = ev.clientY;
      if (typeof x !== "number" || typeof y !== "number") return;
      const dx = x - mouse.x;
      const dy = y - mouse.y;
      if (mouse.active && dx * dx + dy * dy < MOVE_SQ) return;

      lastMoveAt = performance.now();
      if (!mouse.active) {
        seed(x, y);
        mouse.active = true;
      }
      mouse.x = x;
      mouse.y = y;
      if (!points.length) seed(x, y);
      points[0]!.x = x;
      points[0]!.y = y;
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    const onPointer = (ev: PointerEvent) => onMove(ev, ev.pointerType || "");
    const onMouse = (ev: MouseEvent) =>
      onMove(ev, lastPointerType === "touch" ? "touch" : "mouse");
    document.addEventListener("pointermove", onPointer, { passive: true, capture: true });
    document.addEventListener("mousemove", onMouse, { passive: true, capture: true });
    document.documentElement.addEventListener("mouseleave", clear, { passive: true });
    const onVis = () => {
      if (document.visibilityState === "hidden" && rafId) {
        cancelAnimationFrame(rafId);
        clear();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointermove", onPointer, true);
      document.removeEventListener("mousemove", onMouse, true);
      document.documentElement.removeEventListener("mouseleave", clear);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);

  if (!active) return null;

  return (
    <svg
      ref={svgRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[2147483645] m-0 block h-dvh w-screen overflow-visible border-0 p-0"
    >
      <defs>
        <linearGradient ref={gradRef} id="vc-cursor-trail-grad" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f4e2cc" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f4e2cc" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path
        ref={pathRef}
        fill="none"
        stroke="url(#vc-cursor-trail-grad)"
        strokeWidth={LINE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        d=""
      />
    </svg>
  );
}

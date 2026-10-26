"use client";

import { useEffect, useRef, useState } from "react";
import { EFFECT_KEYS, effectEnabled, isDesktopPointer } from "@/lib/site-effects";
import { isPerfPaused } from "@/lib/perf-pause";
import { useDeviceFx } from "./DeviceFxProvider";

/**
 * Alone calda che segue il cursore.
 * Solo se la cap `pointerFx` è on (metriche + FPS).
 */
export function CursorLight() {
  const { caps, ready } = useDeviceFx();
  const [on, setOn] = useState(false);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !caps.pointerFx) {
      setOn(false);
      return;
    }
    if (!effectEnabled(EFFECT_KEYS.cursorLight, true) || !isDesktopPointer()) {
      setOn(false);
      return;
    }
    setOn(true);
  }, [ready, caps.pointerFx]);

  useEffect(() => {
    if (!on) return;
    const node = el.current;
    if (!node) return;
    let raf = 0;
    let x = -9999;
    let y = -9999;
    let visible = false;

    const paint = () => {
      raf = 0;
      node.style.transform = `translate3d(${x - 60}px, ${y - 60}px, 0)`;
      node.style.opacity = visible ? "1" : "0";
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType === "touch" || isPerfPaused()) return;
      x = ev.clientX;
      y = ev.clientY;
      visible = true;
      schedule();
    };
    const hide = () => {
      visible = false;
      schedule();
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", hide, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hide();
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", hide);
    };
  }, [on]);

  useEffect(() => {
    const root = document.documentElement;
    if (!on) {
      root.classList.remove("vc-site-cursor-on");
      return;
    }
    root.classList.add("vc-site-cursor-on");
    return () => root.classList.remove("vc-site-cursor-on");
  }, [on]);

  if (!on) return null;

  return (
    <div
      ref={el}
      id="vc-site-cursor-light"
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[2147480500] size-[120px] rounded-full opacity-0 will-change-transform"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, rgba(236,205,176,0.28) 0%, rgba(212,168,136,0.12) 42%, transparent 70%)",
        transform: "translate3d(-9999px,-9999px,0)",
      }}
    />
  );
}

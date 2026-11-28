"use client";

import { useCallback, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/cn";
import { useTheme, type ResolvedTheme } from "@/lib/theme";

type TransitionVariant = "circle" | "diamond" | "star";

type Props = {
  className?: string;
  duration?: number;
  variant?: TransitionVariant;
  fromCenter?: boolean;
};

function clipPaths(
  variant: TransitionVariant,
  cx: number,
  cy: number,
  maxR: number,
  vw: number,
  vh: number,
): [string, string] {
  const px = (x: number) => `${(x / vw) * 100}%`;
  const py = (y: number) => `${(y / vh) * 100}%`;
  const pt = (x: number, y: number) => `${px(x)} ${py(y)}`;
  const toR = (r: number) => `${(r / (Math.hypot(vw, vh) / Math.SQRT2)) * 100}%`;

  if (variant === "diamond") {
    const R = maxR * Math.SQRT2;
    const end = [pt(cx, cy - R), pt(cx + R, cy), pt(cx, cy + R), pt(cx - R, cy)].join(", ");
    const collapsed = Array.from({ length: 4 }, () => pt(cx, cy)).join(", ");
    return [`polygon(${collapsed})`, `polygon(${end})`];
  }
  if (variant === "star") {
    const R = maxR * Math.SQRT2 * 1.03;
    const inner = 0.42;
    const poly = (radius: number) => {
      const verts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const oa = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        verts.push(pt(cx + radius * Math.cos(oa), cy + radius * Math.sin(oa)));
        const ia = oa + Math.PI / 5;
        verts.push(pt(cx + radius * inner * Math.cos(ia), cy + radius * inner * Math.sin(ia)));
      }
      return `polygon(${verts.join(", ")})`;
    };
    return [poly(Math.max(2, R * 0.025)), poly(R)];
  }
  return [`circle(0% at ${pt(cx, cy)})`, `circle(${toR(maxR)} at ${pt(cx, cy)})`];
}

/**
 * Theme toggle con View Transitions (Magic UI), agganciato a useTheme VC
 * (`data-vc-theme` / localStorage), non a class "dark".
 */
export function AnimatedThemeToggler({
  className,
  duration = 450,
  variant = "circle",
  fromCenter = false,
}: Props) {
  const { resolved, setPref } = useTheme();
  const dark = resolved === "dark";
  const btnRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);

  const toggle = useCallback(() => {
    const button = btnRef.current;
    if (!button || busy.current) return;

    const next: ResolvedTheme = dark ? "light" : "dark";
    const apply = () => setPref(next);

    const startVT = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } })
      .startViewTransition;

    if (typeof startVT !== "function") {
      apply();
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x: number;
    let y: number;
    if (fromCenter) {
      x = vw / 2;
      y = vh / 2;
    } else {
      const r = button.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    const maxR = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
    const paths = clipPaths(variant, x, y, maxR, vw, vh);
    const root = document.documentElement;
    root.dataset.magicuiThemeVt = "active";
    root.style.setProperty("--magicui-theme-toggle-vt-duration", `${duration}ms`);
    root.style.setProperty("--magicui-theme-vt-clip-from", paths[0]);

    const cleanup = () => {
      busy.current = false;
      delete root.dataset.magicuiThemeVt;
      root.style.removeProperty("--magicui-theme-toggle-vt-duration");
      root.style.removeProperty("--magicui-theme-vt-clip-from");
    };

    busy.current = true;
    const transition = startVT.call(document, () => {
      flushSync(apply);
    });
    transition.finished.finally(cleanup).catch(() => cleanup());
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: paths },
          {
            duration,
            easing: variant === "star" ? "linear" : "ease-in-out",
            fill: "forwards",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {});
  }, [dark, setPref, duration, variant, fromCenter]);

  return (
    <button
      type="button"
      ref={btnRef}
      onClick={toggle}
      aria-label={dark ? "Passa al tema chiaro" : "Passa al tema scuro"}
      title={dark ? "Tema scuro" : "Tema chiaro"}
      className={cn(
        "relative inline-flex h-9 w-[3.4rem] shrink-0 items-center rounded-full bg-crema/10 p-1 ring-1 ring-sand/20 transition-colors hover:bg-crema/15",
        className,
      )}
    >
      <span className="absolute inset-y-0 left-1.5 flex items-center text-caramel" aria-hidden>
        <Sun className="size-3.5" />
      </span>
      <span className="absolute inset-y-0 right-1.5 flex items-center text-sand/70" aria-hidden>
        <Moon className="size-3.5" />
      </span>
      <span
        className={cn(
          "relative z-10 flex size-7 items-center justify-center rounded-full bg-gradient-to-b from-caramel to-ember text-ink shadow-sm transition-transform duration-300",
          dark ? "translate-x-[1.35rem]" : "translate-x-0",
        )}
        aria-hidden
      >
        {dark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      </span>
      <span className="sr-only">Cambia tema</span>
    </button>
  );
}

"use client";

import {
  Children,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";
import { useDeviceFx } from "@/components/effects/DeviceFxProvider";
import { cn } from "@/lib/cn";

gsap.registerPlugin(ScrollTrigger);

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Props = {
  children: ReactNode;
  className?: string;
  textClassName?: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  stagger?: number;
  distance?: number;
};

/** React Bits · ScrollFloat (TS+TW): testo che sale allo scroll via GSAP. */
export function ScrollFloat({
  children,
  className,
  textClassName,
  scrollContainerRef,
  stagger = 0.03,
  distance = 100,
}: Props) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const { allowMotion, ready } = useDeviceFx();
  const [mounted, setMounted] = useState(false);

  const text = useMemo(() => {
    const parts = Children.toArray(children);
    return parts.every((p) => typeof p === "string" || typeof p === "number") ? parts.join("") : null;
  }, [children]);

  useEffect(() => setMounted(true), []);

  useIsoLayout(() => {
    const el = containerRef.current;
    const textEl = textRef.current;
    if (!el || !textEl || !mounted) return;
    if (reduce || (ready && !allowMotion)) return;
    if (scrollContainerRef && !scrollContainerRef.current) return;

    const scroller = scrollContainerRef?.current || window;
    const chars = el.querySelectorAll<HTMLElement>("[data-char]");
    const targets = chars.length ? Array.from(chars) : [textEl];
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          scroller,
          start: "top 85%",
          end: "bottom 55%",
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
      gsap.set(targets, { opacity: 0, yPercent: Math.max(40, distance * 0.8), willChange: "opacity, transform" });
      tl.to(targets, {
        opacity: 1,
        yPercent: 0,
        ease: "power2.out",
        stagger,
        duration: 1,
      });
    });

    return () => mm.revert();
  }, [mounted, reduce, allowMotion, ready, stagger, distance, scrollContainerRef, text]);

  const split =
    text === null
      ? null
      : text.split(/(\s+)/).map((word, wi) =>
          word.trim() === "" ? (
            word
          ) : (
            <span key={`w${wi}`} className="inline-block whitespace-nowrap">
              {Array.from(word).map((char, ci) => (
                <span key={`c${wi}-${ci}`} data-char className="inline-block will-change-transform">
                  {char}
                </span>
              ))}
            </span>
          ),
        );

  return (
    <h2 ref={containerRef} className={cn("overflow-hidden", className)}>
      {text !== null ? <span className="sr-only">{text}</span> : null}
      <span
        ref={textRef}
        className={cn("inline-block leading-tight", textClassName)}
        aria-hidden={text !== null ? true : undefined}
      >
        {split ?? children}
      </span>
    </h2>
  );
}

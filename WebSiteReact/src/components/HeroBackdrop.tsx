"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export const HERO_PROMO_POSTER = "/images/hero-promo-16x9.jpg";
export const HERO_PROMO_VIDEO = "/images/hero-promo-16x9.mp4";
export const HERO_PROMO_VIDEO_MOBILE = "/images/hero-promo-16x9-mobile.mp4";

/**
 * Sfondo hero: loop promo Vinili & Caffè (MP4) al posto della foto locale.
 * Reduced-motion → solo poster. Evento: passa `videoSrc={null}`.
 */
export function HeroBackdrop({
  poster = HERO_PROMO_POSTER,
  posterMobile,
  videoSrc = HERO_PROMO_VIDEO,
  videoSrcMobile = HERO_PROMO_VIDEO_MOBILE,
  imgClassName = "size-full object-cover",
  priority = false,
}: {
  poster?: string;
  posterMobile?: string;
  videoSrc?: string | null;
  videoSrcMobile?: string | null;
  imgClassName?: string;
  priority?: boolean;
}) {
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const wantVideo = Boolean(videoSrc) && !reduce;

  useEffect(() => {
    if (!wantVideo || !videoSrc) {
      setSrc(null);
      return;
    }
    const pick = () => {
      const mobile = window.matchMedia("(max-width: 640px)").matches;
      setSrc(mobile && videoSrcMobile ? videoSrcMobile : videoSrc);
    };
    pick();
    const mq = window.matchMedia("(max-width: 640px)");
    mq.addEventListener("change", pick);
    return () => mq.removeEventListener("change", pick);
  }, [wantVideo, videoSrc, videoSrcMobile]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    const tryPlay = () => {
      void v.play().catch(() => {});
    };
    tryPlay();
    const onVis = () => {
      if (document.hidden) v.pause();
      else tryPlay();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [src]);

  return (
    <div className="absolute inset-0 -z-20 overflow-hidden">
      <picture>
        {posterMobile ? (
          <source
            media="(max-width: 640px)"
            srcSet={posterMobile}
            type={posterMobile.endsWith(".webp") ? "image/webp" : undefined}
          />
        ) : null}
        <img
          src={poster}
          alt=""
          width={1600}
          height={900}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          className={`absolute inset-0 ${imgClassName}`}
        />
      </picture>
      {src ? (
        <video
          key={src}
          ref={videoRef}
          className={`absolute inset-0 ${imgClassName}`}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

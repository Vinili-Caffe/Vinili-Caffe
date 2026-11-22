"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";
import { isChristmasSeason } from "@/lib/site-effects";
import { cdnUrl } from "@/lib/site";

/** Atmosfera café senza testo/UI finta — da integrare con hero reale. */
export const HERO_ATMO_POSTER = cdnUrl("/images/hero-cafe-atmosphere.jpg");
export const HERO_ATMO_VIDEO = cdnUrl("/images/hero-cafe-atmosphere.mp4");
export const HERO_ATMO_VIDEO_MOBILE = cdnUrl("/images/hero-cafe-atmosphere-mobile.mp4");
/** Poster più “corto” per PageHero tagliato. */
export const HERO_ATMO_BAND = cdnUrl("/images/hero-cafe-atmosphere-band.jpg");

/** Varianti Natale (stessa atmosfera, periodo `isChristmasSeason`). */
export const HERO_ATMO_POSTER_XMAS = cdnUrl("/images/hero-cafe-atmosphere-xmas.jpg");
export const HERO_ATMO_VIDEO_XMAS = cdnUrl("/images/hero-cafe-atmosphere-xmas.mp4");
export const HERO_ATMO_VIDEO_MOBILE_XMAS = cdnUrl("/images/hero-cafe-atmosphere-xmas-mobile.mp4");
export const HERO_ATMO_BAND_XMAS = cdnUrl("/images/hero-cafe-atmosphere-xmas-band.jpg");
export const HERO_ATMO_POSTER_MOBILE_XMAS = cdnUrl("/images/hero-cafe-atmosphere-xmas-mobile.jpg");

const ATMO_SWAP = new Map<string, string>([
  [HERO_ATMO_POSTER, HERO_ATMO_POSTER_XMAS],
  [HERO_ATMO_BAND, HERO_ATMO_BAND_XMAS],
  [HERO_ATMO_VIDEO, HERO_ATMO_VIDEO_XMAS],
  [HERO_ATMO_VIDEO_MOBILE, HERO_ATMO_VIDEO_MOBILE_XMAS],
]);

function useChristmasAtmo() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(isChristmasSeason());
    sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return on;
}

/**
 * Sfondo hero animato (atmosfera). Reduced-motion → solo poster.
 * Evento: passa `videoSrc={null}` + poster galassia.
 * In stagione Natale scambia automaticamente i media atmosfera default.
 */
export function HeroBackdrop({
  poster = HERO_ATMO_POSTER,
  posterMobile,
  videoSrc = HERO_ATMO_VIDEO,
  videoSrcMobile = HERO_ATMO_VIDEO_MOBILE,
  imgClassName = "size-full object-cover",
  priority = false,
  objectPosition = "center",
  seasonal = true,
}: {
  poster?: string;
  posterMobile?: string;
  videoSrc?: string | null;
  videoSrcMobile?: string | null;
  imgClassName?: string;
  priority?: boolean;
  objectPosition?: string;
  /** Se true, in Natale usa hero-cafe-atmosphere-xmas.* al posto dei default. */
  seasonal?: boolean;
}) {
  const reduce = useReducedMotionSafe();
  const xmas = useChristmasAtmo();
  const swap = seasonal && xmas;
  const resolvedPoster = swap && poster ? ATMO_SWAP.get(poster) || poster : poster;
  const resolvedPosterMobile =
    swap && !posterMobile && (poster === HERO_ATMO_POSTER || poster === HERO_ATMO_BAND)
      ? HERO_ATMO_POSTER_MOBILE_XMAS
      : posterMobile
        ? swap
          ? ATMO_SWAP.get(posterMobile) || posterMobile
          : posterMobile
        : undefined;
  const resolvedVideo =
    videoSrc == null ? null : swap ? ATMO_SWAP.get(videoSrc) || videoSrc : videoSrc;
  const resolvedVideoMobile =
    videoSrcMobile == null
      ? null
      : swap
        ? ATMO_SWAP.get(videoSrcMobile) || videoSrcMobile
        : videoSrcMobile;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const wantVideo = Boolean(resolvedVideo) && !reduce;

  useEffect(() => {
    if (!wantVideo || !resolvedVideo) {
      setSrc(null);
      return;
    }
    const pick = () => {
      const mobile = window.matchMedia("(max-width: 640px)").matches;
      setSrc(mobile && resolvedVideoMobile ? resolvedVideoMobile : resolvedVideo);
    };
    pick();
    const mq = window.matchMedia("(max-width: 640px)");
    mq.addEventListener("change", pick);
    return () => mq.removeEventListener("change", pick);
  }, [wantVideo, resolvedVideo, resolvedVideoMobile]);

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

  const posStyle = { objectPosition } as const;

  return (
    <div className="absolute inset-0 -z-20 overflow-hidden">
      <picture>
        {resolvedPosterMobile ? (
          <source
            media="(max-width: 640px)"
            srcSet={resolvedPosterMobile}
            type={resolvedPosterMobile.endsWith(".webp") ? "image/webp" : undefined}
          />
        ) : null}
        <img
          src={resolvedPoster}
          alt=""
          width={1600}
          height={900}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          className={`absolute inset-0 ${imgClassName}`}
          style={posStyle}
        />
      </picture>
      {src ? (
        <video
          key={src}
          ref={videoRef}
          className={`absolute inset-0 ${imgClassName}`}
          style={posStyle}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={resolvedPoster}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

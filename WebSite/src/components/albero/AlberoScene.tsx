"use client";

import { useState } from "react";

/** Salotto natalizio full-bleed: video loop (mp4), fallback foto se il video non parte. */
export function AlberoScene() {
  const [videoOk, setVideoOk] = useState(true);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0a0604]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/albero-salotto-natale.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center sm:object-[58%_45%]"
        draggable={false}
      />
      {videoOk ? (
        <video
          className="absolute inset-0 h-full w-full object-cover object-center sm:object-[58%_45%]"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/images/albero-salotto-natale.jpg"
          aria-hidden
          onError={() => setVideoOk(false)}
        >
          <source src="/images/albero-salotto-natale.mp4" type="video/mp4" />
        </video>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/15" />
    </div>
  );
}

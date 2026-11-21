"use client";

import { useState } from "react";
import { cdnUrl } from "@/lib/site";

/* foto e video stanno sul CDN (public/images non va su git né sul sito) */
const PHOTO = cdnUrl("/images/albero-salotto-natale.jpg");
const VIDEO = cdnUrl("/images/albero-salotto-natale.mp4");

/** Salotto natalizio full-bleed: video loop (mp4), fallback foto se il video non parte. */
export function AlberoScene() {
  const [videoOk, setVideoOk] = useState(true);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0a0604]">
      { }
      <img
        src={PHOTO}
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
          poster={PHOTO}
          aria-hidden
          onError={() => setVideoOk(false)}
        >
          <source src={VIDEO} type="video/mp4" />
        </video>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/15" />
    </div>
  );
}

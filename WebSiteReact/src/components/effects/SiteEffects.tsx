"use client";

import dynamic from "next/dynamic";
import { SiteCursor } from "./SiteCursor";
import { NavBusyCursor } from "./NavBusyCursor";
import { TypingPause } from "./TypingPause";
import { PhonePreviewMode } from "./PhonePreviewMode";

// Effetti "extra": all'apertura non disegnano niente, quindi si caricano dopo in un file a parte
// (alleggerisce il codice comune a tutte le pagine).
const HalloweenFx = dynamic(() => import("./HalloweenFx").then((m) => m.HalloweenFx), { ssr: false });
const CursorLight = dynamic(() => import("./CursorLight").then((m) => m.CursorLight), { ssr: false });
const CursorTrail = dynamic(() => import("./CursorTrail").then((m) => m.CursorTrail), { ssr: false });
const ClickSpark = dynamic(() => import("./ClickSpark").then((m) => m.ClickSpark), { ssr: false });
const TypeSfx = dynamic(() => import("./TypeSfx").then((m) => m.TypeSfx), { ssr: false });
const PullToRefresh = dynamic(() => import("./PullToRefresh").then((m) => m.PullToRefresh), { ssr: false });
const InstallPrompt = dynamic(() => import("./InstallPrompt").then((m) => m.InstallPrompt), { ssr: false });
const SocialPhonePromo = dynamic(() => import("./SocialPhonePromo").then((m) => m.SocialPhonePromo), { ssr: false });

/** Effetti globali montati da SiteShell. */
export function SiteEffects() {
  return (
    <>
      <PhonePreviewMode />
      <TypingPause />
      <HalloweenFx />
      <SiteCursor />
      <NavBusyCursor />
      <CursorLight />
      <CursorTrail />
      <ClickSpark />
      <TypeSfx />
      <PullToRefresh />
      <SocialPhonePromo />
      <InstallPrompt />
    </>
  );
}

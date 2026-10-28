"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useEventoChrome } from "@/components/evento/EventoChrome";
import { SiteCursor } from "./SiteCursor";
import { NavBusyCursor } from "./NavBusyCursor";
import { TypingPause } from "./TypingPause";
import { PhonePreviewMode } from "./PhonePreviewMode";
import { ensurePwaInstallCapture } from "@/lib/pwa-install";

// Effetti "extra": all'apertura non disegnano niente, quindi si caricano dopo in un file a parte
// (alleggerisce il codice comune a tutte le pagine).
const HalloweenFx = dynamic(() => import("./HalloweenFx").then((m) => m.HalloweenFx), { ssr: false });
const StarWarsFx = dynamic(() => import("./StarWarsFx").then((m) => m.StarWarsFx), { ssr: false });
const CursorLight = dynamic(() => import("./CursorLight").then((m) => m.CursorLight), { ssr: false });
const CursorTrail = dynamic(() => import("./CursorTrail").then((m) => m.CursorTrail), { ssr: false });
const ClickSpark = dynamic(() => import("./ClickSpark").then((m) => m.ClickSpark), { ssr: false });
const TypeSfx = dynamic(() => import("./TypeSfx").then((m) => m.TypeSfx), { ssr: false });
const PullToRefresh = dynamic(() => import("./PullToRefresh").then((m) => m.PullToRefresh), { ssr: false });
const InstallPrompt = dynamic(() => import("./InstallPrompt").then((m) => m.InstallPrompt), { ssr: false });
const SocialPhonePromo = dynamic(() => import("./SocialPhonePromo").then((m) => m.SocialPhonePromo), { ssr: false });

/** Effetti globali montati da SiteShell. Su /evento: SW al posto di Halloween. */
export function SiteEffects() {
  const evento = useEventoChrome();
  const [fxReady, setFxReady] = useState(false);

  useEffect(() => {
    ensurePwaInstallCapture();
    let cancelled = false;
    const arm = () => {
      if (cancelled) return;
      setFxReady(true);
    };
    /* Dopo sipario: non competere con LCP (timeout semplice, niente narrowing ric). */
    const timeoutHandle = window.setTimeout(arm, 700);
    const onReady = () => arm();
    if (document.documentElement.classList.contains("vc-boot-ready")) arm();
    else window.addEventListener("vc-boot-ready", onReady, { once: true });
    const poll = window.setInterval(() => {
      if (document.documentElement.classList.contains("vc-boot-ready")) {
        arm();
        window.clearInterval(poll);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeoutHandle);
      window.removeEventListener("vc-boot-ready", onReady);
    };
  }, []);

  return (
    <>
      <PhonePreviewMode />
      <TypingPause />
      <SiteCursor />
      <NavBusyCursor />
      {fxReady ? (
        <>
          {evento ? <StarWarsFx /> : <HalloweenFx />}
          <CursorLight />
          <CursorTrail />
          <ClickSpark />
          <TypeSfx />
          <PullToRefresh />
          <SocialPhonePromo />
          <InstallPrompt />
        </>
      ) : null}
    </>
  );
}

"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { MotionConfig } from "motion/react";
import { ApiOutageBanner } from "./ApiOutageBanner";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import { ScrollToTop } from "./ScrollToTop";
import { SponsorAd } from "./SponsorAd";
import { SiteEffects } from "./effects/SiteEffects";
import { BootGate } from "./effects/BootGate";
import { RealtimeBoot } from "./effects/RealtimeBoot";
import { ViewState } from "./effects/ViewState";
import { SourceGuard } from "./effects/SourceGuard";
import { StorageGc } from "./effects/StorageGc";
import { ErrorReporter } from "./effects/ErrorReporter";
import { VitalsReporter } from "./effects/VitalsReporter";
import { DeepLinkFocus } from "./effects/DeepLinkFocus";
import { DeviceFxProvider, useDeviceFx } from "./effects/DeviceFxProvider";
import { PresenceRoot } from "./presence/PresenceRoot";
import { ViewAsProvider } from "./view-as/ViewAsChrome";
import { UiProviders } from "./ui/providers";
import { ScrollProgress } from "./magicui/scroll-progress";
import { EventoChromeProvider } from "./evento/EventoChrome";
import { EVENTO_CHROME_BYPASS } from "@/lib/evento-starwars";

function RichScrollProgress() {
  const { caps } = useDeviceFx();
  if (!caps.scrollChrome) return null;
  return <ScrollProgress className="top-0" />;
}

const CookieConsent = dynamic(() => import("./CookieConsent").then((m) => m.CookieConsent), { ssr: false });
const NotifLiveToasts = dynamic(() => import("./notifications/NotifLiveToasts").then((m) => m.NotifLiveToasts), { ssr: false });
const NotifPageRead = dynamic(() => import("./notifications/NotifPageRead").then((m) => m.NotifPageRead), { ssr: false });
const PushSync = dynamic(() => import("./notifications/PushSync").then((m) => m.PushSync), { ssr: false });
const NotifNavigate = dynamic(() => import("./notifications/NotifNavigate").then((m) => m.NotifNavigate), { ssr: false });
const PwaKeepLinks = dynamic(() => import("./effects/PwaKeepLinks").then((m) => m.PwaKeepLinks), { ssr: false });
const VinylMusicRoot = dynamic(() => import("./vinyl/VinylMusicRoot").then((m) => m.VinylMusicRoot), { ssr: false });
const ItsTimeIntro = dynamic(() => import("./effects/ItsTimeIntro").then((m) => m.ItsTimeIntro), { ssr: false });
const EventoMusic = dynamic(() => import("./evento/EventoMusic").then((m) => m.EventoMusic), { ssr: false });
const OfflineQueueBoot = dynamic(() => import("./effects/OfflineQueueBoot").then((m) => m.OfflineQueueBoot), { ssr: false });

function ShellMotion({ children }: { children: React.ReactNode }) {
  const { allowMotion, ready } = useDeviceFx();
  const reducedMotion = !ready ? "user" : allowMotion ? "never" : "user";
  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;
}

type SiteShellChrome = "site" | "evento";

/**
 * Navbar + footer del sito.
 * `chrome="evento"`: stesse shell, link nav/footer = pagine evento + BGM SW.
 */
export function SiteShell({
  children,
  chrome = "site",
}: {
  children: React.ReactNode;
  chrome?: SiteShellChrome;
}) {
  const evento = chrome === "evento" && EVENTO_CHROME_BYPASS;
  return (
    <DeviceFxProvider>
      <ShellMotion>
        <UiProviders>
          <ViewAsProvider>
            <EventoChromeProvider active={evento}>
              <ErrorReporter />
              <VitalsReporter />
              <DeepLinkFocus />
              <BootGate />
              <RealtimeBoot />
              <OfflineQueueBoot />
              <StorageGc />
              <SourceGuard />
              <RichScrollProgress />
              <ViewState />
              <Suspense fallback={null}>
                <ScrollToTop />
                <NotifPageRead />
                <PushSync />
                <NotifNavigate />
                <PwaKeepLinks />
              </Suspense>
              <PresenceRoot />
              <ApiOutageBanner />
              {!evento ? <SponsorAd /> : null}
              <Navbar />
              {/* alto almeno quanto lo schermo: il footer parte sotto e non "salta" mentre la pagina carica (CLS) */}
              <main className="min-h-dvh">{children}</main>
              <Footer />
              <CookieConsent />
              <NotifLiveToasts />
              {evento ? <EventoMusic /> : <VinylMusicRoot />}
              {/* easter egg: "It's time" 1×/giorno alla prima pagina, poi stop */}
              {!evento ? <ItsTimeIntro /> : null}
              <SiteEffects />
            </EventoChromeProvider>
          </ViewAsProvider>
        </UiProviders>
      </ShellMotion>
    </DeviceFxProvider>
  );
}

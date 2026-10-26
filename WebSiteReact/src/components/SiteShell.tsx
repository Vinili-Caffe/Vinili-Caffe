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
import { DeepLinkFocus } from "./effects/DeepLinkFocus";
import { DeviceFxProvider, useDeviceFx } from "./effects/DeviceFxProvider";
import { PresenceRoot } from "./presence/PresenceRoot";
import { ViewAsProvider } from "./view-as/ViewAsChrome";
import { UiProviders } from "./ui/providers";
import { ScrollProgress } from "./magicui/scroll-progress";
import { EventoFooter } from "./evento/EventoFooter";
import { EventoMusic } from "./evento/EventoMusic";
import { EventoStarfield } from "./evento/EventoStarfield";
import { EventoTopNav } from "./evento/EventoTopNav";
import { EVENTO_CHROME_BYPASS } from "@/lib/evento-starwars";
function RichScrollProgress() {
  const { caps } = useDeviceFx();
  if (!caps.scrollChrome) return null;
  return <ScrollProgress className="top-0" />;
}

// banner cookie, avvisi notifiche e pulsante "torna su": compaiono dopo l'avvio, si caricano a parte
const CookieConsent = dynamic(() => import("./CookieConsent").then((m) => m.CookieConsent), { ssr: false });
const NotifLiveToasts = dynamic(() => import("./notifications/NotifLiveToasts").then((m) => m.NotifLiveToasts), { ssr: false });
const NotifPageRead = dynamic(() => import("./notifications/NotifPageRead").then((m) => m.NotifPageRead), { ssr: false });
const PushSync = dynamic(() => import("./notifications/PushSync").then((m) => m.PushSync), { ssr: false });
const NotifNavigate = dynamic(() => import("./notifications/NotifNavigate").then((m) => m.NotifNavigate), { ssr: false });
const PwaKeepLinks = dynamic(() => import("./effects/PwaKeepLinks").then((m) => m.PwaKeepLinks), { ssr: false });
const BackToTopFab = dynamic(() => import("./BackToTopFab").then((m) => m.BackToTopFab), { ssr: false });
const VinylMusicRoot = dynamic(() => import("./vinyl/VinylMusicRoot").then((m) => m.VinylMusicRoot), { ssr: false });
const OfflineQueueBoot = dynamic(() => import("./effects/OfflineQueueBoot").then((m) => m.OfflineQueueBoot), { ssr: false });

function ShellMotion({ children }: { children: React.ReactNode }) {
  const { allowMotion, ready } = useDeviceFx();
  // finché non c’è il profilo: rispetta OS; poi override soft se il device regge
  const reducedMotion = !ready ? "user" : allowMotion ? "never" : "user";
  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;
}

type SiteShellChrome = "site" | "evento";

/** Navbar + footer comuni. `chrome="evento"` = bypass UI Star Wars (nav/tema/musica). */
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
            <ErrorReporter />
            <DeepLinkFocus />
            <BootGate />
            <RealtimeBoot />
            <OfflineQueueBoot />
            <StorageGc />
            <SourceGuard />
            {!evento ? <RichScrollProgress /> : null}
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
            {evento ? <EventoStarfield /> : null}
            {evento ? <EventoTopNav /> : <Navbar />}
            <main className={evento ? "relative min-h-[70dvh] text-[#f0e6c8]" : "min-h-[70dvh]"}>
              {children}
            </main>
            {evento ? <EventoFooter /> : <Footer />}
            <CookieConsent />
            <NotifLiveToasts />
            <BackToTopFab />
            {evento ? <EventoMusic /> : <VinylMusicRoot />}
            {!evento ? <SiteEffects /> : null}
          </ViewAsProvider>
        </UiProviders>
      </ShellMotion>
    </DeviceFxProvider>
  );
}

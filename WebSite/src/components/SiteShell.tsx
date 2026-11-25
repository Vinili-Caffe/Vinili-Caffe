"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MotionConfig } from "motion/react";
import { ApiOutageBanner } from "./ApiOutageBanner";
import { Footer } from "./Footer";
import { UiTextTranslator } from "./UiTextTranslator";
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
import { SiteMotionRoot } from "./motion/SiteMotionRoot";
import { GuildMentionsProvider } from "./GuildMentionsProvider";
import { isDiscordActivity } from "@/lib/discordActivity";
import { QuizBackButton } from "./QuizBackButton";

function RichScrollProgress() {
  const { caps } = useDeviceFx();
  if (!caps.scrollChrome) return null;
  return <ScrollProgress className="top-0" />;
}

const CookieConsent = dynamic(() => import("./CookieConsent").then((m) => m.CookieConsent), { ssr: false });
const AgeGate = dynamic(() => import("./AgeGate").then((m) => m.AgeGate), { ssr: false });
const NotifLiveToasts = dynamic(() => import("./notifications/NotifLiveToasts").then((m) => m.NotifLiveToasts), { ssr: false });
const NotifPageRead = dynamic(() => import("./notifications/NotifPageRead").then((m) => m.NotifPageRead), { ssr: false });
const PushSync = dynamic(() => import("./notifications/PushSync").then((m) => m.PushSync), { ssr: false });
const NotifNavigate = dynamic(() => import("./notifications/NotifNavigate").then((m) => m.NotifNavigate), { ssr: false });
const PwaKeepLinks = dynamic(() => import("./effects/PwaKeepLinks").then((m) => m.PwaKeepLinks), { ssr: false });
const PwaShellHealth = dynamic(() => import("./effects/PwaShellHealth").then((m) => m.PwaShellHealth), { ssr: false });
const VinylMusicRoot = dynamic(() => import("./vinyl/VinylMusicRoot").then((m) => m.VinylMusicRoot), { ssr: false });
const ItsTimeIntro = dynamic(() => import("./effects/ItsTimeIntro").then((m) => m.ItsTimeIntro), { ssr: false });
const EventoMusic = dynamic(() => import("./evento/EventoMusic").then((m) => m.EventoMusic), { ssr: false });
const OfflineQueueBoot = dynamic(() => import("./effects/OfflineQueueBoot").then((m) => m.OfflineQueueBoot), { ssr: false });

function ShellMotion({ children }: { children: React.ReactNode }) {
  const { allowMotion, ready } = useDeviceFx();
  /* off device → always: Motion rispetta reduced-motion su tutta la shell */
  const reducedMotion = !ready ? "user" : allowMotion ? "never" : "always";
  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;
}

type SiteShellChrome = "site" | "evento" | "app" | "activity";

/**
 * Navbar + footer del sito.
 * `chrome="evento"`: stesse shell, link nav/footer = pagine evento + BGM SW.
 * `chrome="app"`: solo i servizi del sito (login, notifiche, errori…), senza navbar, footer, sponsor e musica:
 * la pagina disegna da sé il proprio guscio (dashboard del bot).
 * `chrome="activity"` / auto su discordsays: solo Music Quiz, niente nav/footer/sponsor/consent.
 */
export function SiteShell({
  children,
  chrome = "site",
}: {
  children: React.ReactNode;
  chrome?: SiteShellChrome;
}) {
  const [activityHost, setActivityHost] = useState(false);
  useEffect(() => {
    const on = isDiscordActivity();
    setActivityHost(on);
    if (on) document.documentElement.dataset.vcActivity = "1";
    else delete document.documentElement.dataset.vcActivity;
  }, []);

  const mode: SiteShellChrome = activityHost ? "activity" : chrome;
  const evento = mode === "evento" && EVENTO_CHROME_BYPASS;
  const app = mode === "app";
  const activity = mode === "activity";
  const bare = app || activity;

  return (
    <DeviceFxProvider>
      <ShellMotion>
        <SiteMotionRoot smoothScroll={!bare}>
          <UiProviders>
            <GuildMentionsProvider>
              <ViewAsProvider>
                <EventoChromeProvider active={evento}>
                  <ErrorReporter />
                  <UiTextTranslator />
                  {!activity ? <VitalsReporter /> : null}
                  <DeepLinkFocus />
                  <BootGate />
                  <RealtimeBoot />
                  {!activity ? <OfflineQueueBoot /> : null}
                  <StorageGc />
                  <SourceGuard />
                  {!bare ? <RichScrollProgress /> : null}
                  <ViewState />
                  <Suspense fallback={null}>
                    {!activity ? <ScrollToTop /> : null}
                    {!activity ? (
                      <>
                        <NotifPageRead />
                        <PushSync />
                        <NotifNavigate />
                        <PwaKeepLinks />
                        <PwaShellHealth />
                      </>
                    ) : null}
                  </Suspense>
                  <PresenceRoot />
                  {!activity ? <ApiOutageBanner /> : null}
                  {activity ? (
                    <>
                      <main className="min-h-dvh bg-espresso text-crema">{children}</main>
                    </>
                  ) : app ? (
                    children
                  ) : (
                    <>
                      {!evento ? <SponsorAd /> : null}
                      <Navbar />
                      <QuizBackButton />
                      {/* alto almeno quanto lo schermo: il footer parte sotto e non "salta" mentre la pagina carica (CLS) */}
                      <main className="min-h-dvh">{children}</main>
                      <Footer />
                    </>
                  )}
                  {!activity ? (
                    <>
                      <CookieConsent />
                      <AgeGate />
                      <NotifLiveToasts />
                    </>
                  ) : null}
                  {evento ? <EventoMusic /> : bare ? null : <VinylMusicRoot />}
                  {/* easter egg: "It's time" 1×/giorno alla prima pagina, poi stop */}
                  {!evento && !bare ? <ItsTimeIntro /> : null}
                  {!activity ? <SiteEffects /> : null}
                </EventoChromeProvider>
              </ViewAsProvider>
            </GuildMentionsProvider>
          </UiProviders>
        </SiteMotionRoot>
      </ShellMotion>
    </DeviceFxProvider>
  );
}

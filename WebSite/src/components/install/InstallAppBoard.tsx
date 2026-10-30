"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  MoreVertical,
  Share,
  Smartphone,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { BTN_GHOST, BTN_PRIMARY_LG, PANEL } from "@/lib/ui";
import { cn } from "@/lib/cn";
import { cdnUrl } from "@/lib/site";
import {
  confirmPwaInstalledByUser,
  detectInstallSurface,
  detectPwaAlreadyInstalled,
  ensurePwaInstallCapture,
  promptHeldBip,
  subscribeBip,
  type BIPEvent,
  type InstallSurface,
} from "@/lib/pwa-install";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-caramel/20 font-display text-sm font-semibold text-ember ring-1 ring-caramel/35">
        {n}
      </span>
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-crema/75 sm:text-[0.95rem]">{children}</p>
    </li>
  );
}

export function InstallAppBoard() {
  const { t } = useI18n();
  const { token, ready } = useAuth();
  const [surface, setSurface] = useState<InstallSurface | null>(null);
  const [already, setAlready] = useState(false);
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    ensurePwaInstallCapture(token);
    const s = detectInstallSurface();
    setSurface(s);
    let alive = true;
    void detectPwaAlreadyInstalled(token).then((ok) => {
      if (!alive) return;
      if (ok) {
        setAlready(true);
        if (s === "standalone") setDone(true);
      }
    });
    const unsub = subscribeBip(setBip);
    const onInstalled = () => {
      setDone(true);
      setAlready(true);
      setSurface("standalone");
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [ready, token]);

  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await promptHeldBip(token);
      if (outcome === "accepted") {
        setDone(true);
        setAlready(true);
        setSurface("standalone");
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmAlready = async () => {
    await confirmPwaInstalledByUser(token);
    setAlready(true);
  };

  if (!surface) {
    return (
      <div className="mx-auto max-w-2xl px-6 pb-24">
        <div className={cn(PANEL, "h-48 animate-pulse p-6 sm:p-8")} />
      </div>
    );
  }

  const showInstalled = surface === "standalone" || done || already;
  const label = showInstalled
    ? t("install.deviceStandalone")
    : surface === "ios-safari" || surface === "ios-other"
      ? t("install.deviceIos")
      : surface === "android"
        ? t("install.deviceAndroid")
        : surface === "in-app"
          ? t("install.deviceInApp")
          : t("install.deviceDesktop");

  return (
    <div className="mx-auto max-w-2xl px-6 pb-24">
      <div className={cn(PANEL, "relative overflow-hidden p-6 sm:p-8")}>
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cdnUrl("/images/pwa-icon-192.png")}
            alt=""
            width={64}
            height={64}
            className="size-16 rounded-2xl ring-1 ring-sand/25 shadow-[0_12px_30px_-12px_rgba(212,145,80,0.45)]"
          />
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sand ring-1 ring-sand/20">
              <Smartphone className="size-3 text-caramel" aria-hidden />
              {label}
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-crema sm:text-3xl">{t("install.cardTitle")}</h2>
          </div>
        </div>

        {showInstalled ? (
          <div className="mt-8 space-y-4">
            <p className="flex items-start gap-2 text-crema/80">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" aria-hidden />
              <span>{surface === "standalone" || done ? t("install.alreadyBody") : t("install.alreadyBrowser")}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <SmartLink href={page("/")} className={BTN_PRIMARY_LG}>
                {t("install.goHome")}
              </SmartLink>
              <SmartLink href={page("/notifications/")} className={BTN_GHOST}>
                {t("install.goNotif")}
              </SmartLink>
            </div>
          </div>
        ) : null}

        {!showInstalled && surface === "ios-safari" ? (
          <div className="mt-8 space-y-5">
            <p className="text-sm leading-relaxed text-crema/70">{t("install.iosLead")}</p>
            <button type="button" onClick={() => void confirmAlready()} className={cn(BTN_PRIMARY_LG, "w-full sm:w-auto")}>
              <CheckCircle2 className="size-4" aria-hidden />
              {t("install.alreadyCta")}
            </button>
            <p className="text-xs leading-relaxed text-crema/50">{t("install.alreadyCtaHint")}</p>
            <ol className="space-y-3.5 border-t border-sand/10 pt-5">
              <Step n={1}>
                {t("install.iosStep1Before")}{" "}
                <Share className="inline size-4 -translate-y-0.5 text-caramel" aria-hidden />{" "}
                <strong className="text-crema">{t("install.iosStep1Share")}</strong>
                {t("install.iosStep1After")}
              </Step>
              <Step n={2}>
                {t("install.iosStep2Before")}{" "}
                <strong className="text-crema">{t("install.iosStep2Add")}</strong>
                {t("install.iosStep2After")}
              </Step>
              <Step n={3}>{t("install.iosStep3")}</Step>
            </ol>
          </div>
        ) : null}

        {!showInstalled && surface === "ios-other" ? (
          <div className="mt-8 space-y-4">
            <p className="text-sm leading-relaxed text-crema/70">{t("install.iosOtherLead")}</p>
            <p className="rounded-2xl bg-crema/5 px-4 py-3 text-sm text-crema/75 ring-1 ring-sand/15">{t("install.iosOtherHint")}</p>
            <button type="button" onClick={() => void confirmAlready()} className={cn(BTN_GHOST, "w-full sm:w-auto")}>
              <CheckCircle2 className="size-4" aria-hidden />
              {t("install.alreadyCta")}
            </button>
          </div>
        ) : null}

        {!showInstalled && surface === "in-app" ? (
          <div className="mt-8 space-y-4">
            <p className="text-sm leading-relaxed text-crema/70">{t("install.inAppLead")}</p>
            <ol className="space-y-3.5">
              <Step n={1}>{t("install.inAppStep1")}</Step>
              <Step n={2}>{t("install.inAppStep2")}</Step>
            </ol>
            <a href={page("/app/")} target="_blank" rel="noopener noreferrer" className={cn(BTN_PRIMARY_LG, "mt-2")}>
              <ExternalLink className="size-4" aria-hidden />
              {t("install.openBrowser")}
            </a>
          </div>
        ) : null}

        {!showInstalled && (surface === "android" || surface === "desktop") ? (
          <div className="mt-8 space-y-5">
            {bip ? (
              <>
                <p className="text-sm leading-relaxed text-crema/70">{t("install.canInstallLead")}</p>
                <button type="button" disabled={busy} onClick={() => void install()} className={cn(BTN_PRIMARY_LG, "w-full sm:w-auto")}>
                  <Download className="size-4" aria-hidden />
                  {busy ? t("common.loading") : t("install.ctaNow")}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-crema/70">
                  {surface === "android" ? t("install.androidManualLead") : t("install.desktopManualLead")}
                </p>
                <button type="button" onClick={() => void confirmAlready()} className={cn(BTN_GHOST, "w-full sm:w-auto")}>
                  <CheckCircle2 className="size-4" aria-hidden />
                  {t("install.alreadyCta")}
                </button>
                <ol className="space-y-3.5">
                  <Step n={1}>
                    {t("install.menuStep1Before")}{" "}
                    <MoreVertical className="inline size-4 -translate-y-0.5 text-caramel" aria-hidden />{" "}
                    {t("install.menuStep1After")}
                  </Step>
                  <Step n={2}>
                    {t("install.menuStep2Before")}{" "}
                    <strong className="text-crema">{t("install.menuStep2Install")}</strong>
                    {t("install.menuStep2After")}
                  </Step>
                </ol>
              </>
            )}
          </div>
        ) : null}
      </div>

      {!showInstalled ? (
        <ul className="mt-8 space-y-3">
          {[t("install.benefit1"), t("install.benefit2"), t("install.benefit3")].map((b) => (
            <li key={b} className="flex gap-2.5 text-sm text-crema/65">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-caramel" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Cookie } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SmartLink } from "./SmartLink";
import {
  hasAnalyticsConsent,
  hasCookieChoice,
  isCookieBannerSkippedPath,
  loadGtagIfConsented,
  rememberCookieConsent,
  trackPageView,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";

/**
 * Banner consenso cookie + boot GA solo dopo «Accetta».
 * Chiave localStorage: `vc_cookie_consent` (come il sito vecchio).
 * Rifiuto facile: niente login Discord / VIP.
 */
export function CookieConsent() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const trackedPath = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("vc_phone_preview") === "1") {
        setOpen(false);
        return;
      }
    } catch {
      /* ignore */
    }
    if (hasAnalyticsConsent()) {
      loadGtagIfConsented();
      setOpen(false);
      return;
    }
    if (hasCookieChoice()) {
      setOpen(false);
      return;
    }
    if (isCookieBannerSkippedPath(pathname)) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (!hasAnalyticsConsent()) {
      trackedPath.current = null;
      return;
    }
    loadGtagIfConsented();
    if (trackedPath.current === null) {
      trackedPath.current = pathname;
      return;
    }
    if (trackedPath.current === pathname) return;
    trackedPath.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  function choose(choice: CookieConsentChoice) {
    rememberCookieConsent(choice);
    setOpen(false);
    if (choice === "accepted") {
      loadGtagIfConsented();
      trackedPath.current = pathname;
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="vc-cookie-consent"
          role="dialog"
          aria-modal="false"
          aria-label={t("cookie.aria")}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          data-vc-cookie-banner
          data-vc-float-cover="cookie"
          className="vc-cookie-banner fixed inset-x-0 bottom-3 z-[70] flex justify-center px-3 sm:bottom-4"
        >
          <div
            className="w-full max-w-[26rem] rounded-3xl bg-roast/95 p-3.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] ring-1 ring-sand/25 backdrop-blur-md sm:p-4"
            role="document"
          >
            <div className="flex gap-3">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25"
                aria-hidden
              >
                <Cookie className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">
                  {t("cookie.kicker")}
                </p>
                <p id="vc-cookie-consent-text" className="mt-1 text-sm leading-snug text-crema/90">
                  {t("cookie.bodyBefore")}{" "}
                  <SmartLink
                    href="/cookie/"
                    className="font-medium text-sand underline decoration-sand/60 underline-offset-2 hover:text-crema"
                  >
                    {t("cookie.essentials")}
                  </SmartLink>{" "}
                  {t("cookie.bodyMid")}{" "}
                  <SmartLink
                    href="/cookie/"
                    className="font-medium text-sand underline decoration-sand/60 underline-offset-2 hover:text-crema"
                  >
                    {t("cookie.policy")}
                  </SmartLink>
                  .
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => choose("rejected")}
                className="rounded-full bg-crema/8 px-3.5 py-2 text-sm font-semibold text-crema/90 ring-1 ring-sand/25 transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:bg-crema/12 hover:ring-sand/40 active:scale-[0.97]"
              >
                {t("cookie.reject")}
              </button>
              <button
                type="button"
                onClick={() => choose("accepted")}
                className="rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink shadow-[0_10px_24px_-12px_rgba(212,145,80,0.55)] transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
              >
                {t("cookie.accept")}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

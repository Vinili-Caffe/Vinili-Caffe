"use client";

import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/cookie-consent";

/**
 * Google Analytics (gtag) su tutte le pagine, insieme a Vercel Analytics / GTM.
 * Lo script è sempre in pagina; la misurazione resta spenta finché non c’è consenso
 * (`CookieConsent` → `loadGtagIfConsented` aggiorna Consent Mode, anche per GTM).
 */
export function GoogleAnalytics() {
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="vc-gtag-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
(function () {
  var granted = false;
  try {
    var ls = window.localStorage && window.localStorage.getItem("vc_cookie_consent");
    var ss = window.sessionStorage && window.sessionStorage.getItem("vc_cookie_consent");
    var leg = window.localStorage && window.localStorage.getItem("vc_cookie_banner_ack_v3");
    granted = ls === "accepted" || ss === "accepted" || leg === "accepted";
    if (!granted && typeof document !== "undefined" && document.cookie) {
      granted = /(?:^|; )vc_cookie_consent=accepted(?:;|$)/.test(document.cookie)
        || /(?:^|; )vc_cookie_banner_ack_v3=accepted(?:;|$)/.test(document.cookie);
    }
  } catch (e) {}
  gtag("consent", "default", {
    ad_storage: granted ? "granted" : "denied",
    ad_user_data: granted ? "granted" : "denied",
    ad_personalization: granted ? "granted" : "denied",
    analytics_storage: granted ? "granted" : "denied",
    wait_for_update: 500
  });
  gtag("js", new Date());
  gtag("config", "${GA_MEASUREMENT_ID}", {
    anonymize_ip: true,
    send_page_view: true
  });
  if (granted) window.__vcGtagLoaded = true;
})();
        `}
      </Script>
    </>
  );
}

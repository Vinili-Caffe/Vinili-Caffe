"use client";

import Script from "next/script";
import { GTM_CONTAINER_ID } from "@/lib/cookie-consent";

/**
 * Google Tag Manager (`GTM-NTXR52LM`) su tutte le pagine.
 * Condivide `dataLayer` con gtag; il Consent Mode è impostato da `GoogleAnalytics`
 * prima del caricamento di gtm.js.
 */
export function GoogleTagManager() {
  return (
    <>
      <Script id="vc-gtm" strategy="afterInteractive">
        {`
(function(w,d,s,l,i){
  w[l]=w[l]||[];
  w[l].push({'gtm.start': new Date().getTime(), event:'gtm.js'});
  var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
  j.async=true;
  j.id='vc-gtm-js';
  j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
  f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');
window.__vcGtmLoaded = true;
        `}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}`}
          height={0}
          width={0}
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
}

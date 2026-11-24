"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

/**
 * Immagine del Number Quiz. Nell'Attività di Discord le immagini passano dal nostro server
 * (/webhooks/site-number-quiz/img): se una non si carica, la si scarica con fetch (che lì funziona sempre)
 * e la si mostra come dati; se non va nemmeno così, sparisce invece di restare rotta.
 */
export function NQImg({ src, alt = "", ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src?: string }) {
  const [shown, setShown] = useState(src);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    setShown(src);
    setFailed(false);
    tried.current = false;
  }, [src]);

  function onError() {
    if (!tried.current && src && src.startsWith("/webhooks/")) {
      tried.current = true;
      void fetch(src)
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => {
          if (!b) return setFailed(true);
          const fr = new FileReader();
          fr.onload = () => setShown(String(fr.result));
          fr.onerror = () => setFailed(true);
          fr.readAsDataURL(b);
        })
        .catch(() => setFailed(true));
      return;
    }
    setFailed(true);
  }

  if (!shown || failed) return null;
  /* dentro l'iframe di Discord il caricamento «pigro» a volte non parte mai: lì si carica subito */
  const inActivity = typeof window !== "undefined" && /\.discordsays\.com$/i.test(window.location.hostname);
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...rest} loading={inActivity ? "eager" : rest.loading} src={shown} alt={alt} onError={onError} />;
}

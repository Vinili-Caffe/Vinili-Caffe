"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Handshake, X } from "lucide-react";
import {
  SPONSOR_DISMISS_KEY,
  readSponsorAd,
  sponsorAdLive,
  sponsorHref,
  type SponsorAdConfig,
} from "@/lib/sponsor-ad";

const DISMISS_EVENT = "vc-sponsor-dismiss";

function subscribeDismiss(cb: () => void) {
  window.addEventListener(DISMISS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(DISMISS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function dismissedId() {
  try {
    return String(localStorage.getItem(SPONSOR_DISMISS_KEY) || "");
  } catch {
    return "";
  }
}

function setDismissed(id: string | null) {
  try {
    if (id) localStorage.setItem(SPONSOR_DISMISS_KEY, id);
    else localStorage.removeItem(SPONSOR_DISMISS_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

function subscribeCfg(cb: () => void) {
  window.addEventListener("vc-sponsor-ad", cb);
  return () => window.removeEventListener("vc-sponsor-ad", cb);
}

/** Vetrina in home del prodotto Sponsor "Sito web". Legge window.__VC_SITE_SPONSOR_AD. */
export function SponsorAd() {
  const path = usePathname() || "/";
  const home = path === "/" || path === "";
  const cfg = useSyncExternalStore<SponsorAdConfig | null>(subscribeCfg, readSponsorAd, () => null);
  const dismissed = useSyncExternalStore(subscribeDismiss, dismissedId, () => "");

  if (!home || !cfg || !sponsorAdLive(cfg)) return null;

  const id = String(cfg.id || "site-sponsor").trim() || "site-sponsor";
  const title = String(cfg.title || "Server partner").trim() || "Server partner";
  const badge = String(cfg.badge || "Sponsor").trim() || "Sponsor";
  const description = String(cfg.description || "").trim();
  const href = sponsorHref(cfg.buttonUrl);
  const label = String(cfg.buttonLabel || "").trim() || `Entra su ${title}`;
  const hidden = dismissed === id;

  return (
    <>
      <AnimatePresence>
        {!hidden && (
          <motion.section
            id="vc-site-sponsor-ad-home"
            role="region"
            aria-label="Sponsor in evidenza"
            data-vc-sponsor-ad={id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-[max(0.85rem,env(safe-area-inset-bottom))] left-3 z-40 w-[min(20rem,calc(100vw-1.5rem))]"
          >
            <div className="relative rounded-2xl bg-gradient-to-b from-caramel/15 to-roast p-3.5 pr-10 shadow-[0_24px_60px_-28px_rgba(212,145,80,0.55)] ring-1 ring-caramel/40">
              <button
                type="button"
                aria-label="Nascondi sponsor"
                onClick={() => setDismissed(id)}
                className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-lg bg-black/25 text-crema/80 ring-1 ring-white/15 hover:bg-caramel/20 hover:text-crema"
              >
                <X className="size-3.5" />
              </button>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-caramel/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ember ring-1 ring-caramel/30">
                <Handshake className="size-3.5" aria-hidden />
                {badge}
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold leading-tight text-crema">{title}</h2>
              {description ? <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-crema/75">{description}</p> : null}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  aria-label={`${label} (link esterno)`}
                  className="mt-3 inline-flex rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
                >
                  {label}
                </a>
              ) : null}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {hidden && (
        <button
          type="button"
          id="vc-site-sponsor-reopen"
          aria-controls="vc-site-sponsor-ad-home"
          aria-label="Riapri sponsor"
          onClick={() => setDismissed(null)}
          className="fixed bottom-[max(0.85rem,env(safe-area-inset-bottom))] left-3 z-40 inline-flex items-center gap-2 rounded-full bg-roast/95 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-crema shadow-lg ring-1 ring-caramel/35 hover:ring-caramel/60"
        >
          <Handshake className="size-3.5 text-ember" aria-hidden />
          Sponsor
        </button>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, Share, X } from "lucide-react";
import { useChromeOpenListener } from "@/lib/chrome-open";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const LS_KEY = "vc_install_prompt_v1";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const SHOW_AFTER_MS = 25_000;

function snoozed() {
  try {
    const at = Number(localStorage.getItem(LS_KEY) || 0);
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return true;
  }
}
function snooze() {
  try {
    localStorage.setItem(LS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
function standalone() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
function iosSafari() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV/i.test(ua);
}

/**
 * Invito discreto a installare il sito come app (notifiche più affidabili, soprattutto su iPhone).
 * Android/Chrome: pulsante che apre l'installazione del browser. iPhone (Safari): due passaggi da fare a mano.
 * Compare dopo ~25 s, mai se già installata; "non ora" lo nasconde per 30 giorni.
 */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(false);

  useEffect(() => useChromeOpenListener(setChromeOpen), []);

  useEffect(() => {
    if (standalone() || snoozed()) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    if (iosSafari()) setIos(true);
    const t = window.setTimeout(() => setShow(true), SHOW_AFTER_MS);
    const onInstalled = () => {
      snooze();
      setShow(false);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const visible = show && !chromeOpen && (Boolean(evt) || ios);
  const close = () => {
    snooze();
    setShow(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          role="dialog"
          aria-label="Installa l'app"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-sm rounded-3xl bg-roast/95 p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/20 backdrop-blur-xl sm:bottom-5"
        >
          <button type="button" onClick={close} aria-label="Non ora" className="absolute right-3 top-3 rounded-full p-1 text-crema/45 hover:bg-crema/8 hover:text-crema">
            <X className="size-4" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/pwa-icon-192.png" alt="" className="size-12 shrink-0 rounded-2xl ring-1 ring-sand/20" />
            <div className="min-w-0">
              <p className="font-display text-xl font-semibold leading-tight">Vinili &amp; Caffè sul telefono</p>
              {ios ? (
                <p className="mt-1 text-sm leading-relaxed text-crema/65">
                  Tocca <Share className="inline size-4 -translate-y-0.5 text-caramel" aria-label="Condividi" /> e poi{" "}
                  <strong className="text-crema">Aggiungi a schermata Home</strong>: notifiche più affidabili e apertura con un tocco.
                </p>
              ) : (
                <p className="mt-1 text-sm leading-relaxed text-crema/65">Si apre come un'app, con le notifiche più affidabili.</p>
              )}
            </div>
          </div>
          {!ios && evt ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await evt.prompt();
                    await evt.userChoice;
                  } catch {
                    /* ignore */
                  }
                  setEvt(null);
                  close();
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2.5 text-sm font-semibold text-ink"
              >
                <Download className="size-4" /> Installa
              </button>
              <button type="button" onClick={close} className="rounded-full px-4 py-2.5 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 hover:bg-crema/8">
                Non ora
              </button>
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

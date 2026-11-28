"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Turnstile, preloadTurnstile } from "@/components/ui/Turnstile";
import { createStore } from "./store";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type GateRequest = {
  id: number;
  siteKey: string;
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (token: string | null) => void;
};

const gateStore = createStore<GateRequest | null>(null);
let seq = 0;

function finish(token: string | null) {
  const cur = gateStore.get();
  if (!cur) return;
  gateStore.set(null);
  cur.resolve(token);
}

/** Modal Turnstile: resolve col token, o null se annulli. */
export function turnstileGate(opts: {
  siteKey: string;
  title?: string;
  message?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  const siteKey = String(opts.siteKey || "").trim();
  if (!siteKey) return Promise.resolve("");
  preloadTurnstile();
  const pending = gateStore.get();
  if (pending) finish(null);
  return new Promise((resolve) => {
    gateStore.set({
      id: ++seq,
      siteKey,
      title: String(opts.title || "Verifica anti-robot").trim() || "Verifica anti-robot",
      message: String(opts.message || "Conferma di non essere un robot per continuare.").trim(),
      confirmLabel: String(opts.confirmLabel || "Continua").trim() || "Continua",
      resolve,
    });
  });
}

export function TurnstileGateProvider({ children }: { children: React.ReactNode }) {
  const req = useSyncExternalStore(gateStore.subscribe, gateStore.get, () => null);
  const [token, setToken] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setToken("");
  }, [req?.id]);
  useEffect(() => {
    setChromeOpen("ui-turnstile-gate", Boolean(req));
    return () => setChromeOpen("ui-turnstile-gate", false);
  }, [req]);
  useBodyScrollLock(Boolean(req));

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  return (
    <>
      {children}
      {mounted
        ? createPortal(
            <AnimatePresence>
              {req ? (
                <motion.div
                  key={req.id}
                  className="fixed inset-0 z-[120] flex items-end justify-center bg-espresso/70 p-4 backdrop-blur-sm sm:items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) finish(null);
                  }}
                >
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="vc-turnstile-gate-title"
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                    className="relative w-full max-w-md rounded-3xl bg-gradient-to-b from-roast to-espresso p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-sand/20"
                  >
                    <button
                      type="button"
                      aria-label="Chiudi"
                      onClick={() => finish(null)}
                      className="absolute right-3 top-3 rounded-full p-2 text-crema/50 hover:bg-crema/8 hover:text-crema"
                    >
                      <X className="size-4" />
                    </button>
                    <div className="flex items-start gap-3 pr-8">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/30">
                        <ShieldCheck className="size-5" />
                      </span>
                      <div>
                        <h2 id="vc-turnstile-gate-title" className="font-display text-xl font-semibold text-crema">
                          {req.title}
                        </h2>
                        <p className="mt-1 text-sm leading-relaxed text-crema/65">{req.message}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex justify-center">
                      <Turnstile siteKey={req.siteKey} onToken={setToken} />
                    </div>
                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => finish(null)}
                        className="flex-1 rounded-full bg-crema/8 px-4 py-2.5 text-sm font-semibold text-crema/70 ring-1 ring-sand/15 hover:text-crema"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        disabled={!token}
                        onClick={() => finish(token)}
                        className="flex-1 rounded-full bg-caramel px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-45"
                      >
                        {token ? req.confirmLabel : <Loader2 className="mx-auto size-4 animate-spin" />}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

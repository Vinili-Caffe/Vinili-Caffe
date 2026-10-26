"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { createStore } from "./store";

/**
 * Toast di sito (E8). Una sola notifica alla volta, come `VcSiteToast`.
 * `showToast` funziona da qualsiasi client component se `ToastProvider` è montato (SiteShell).
 */

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  /** Resta finché non chiami `hideToast` (massimo 12s, salvo `bootLoad`). */
  pending?: boolean;
  sticky?: boolean;
  /** Caricamento di boot: non si rimonta se è già visibile; failsafe 8s. */
  bootLoad?: boolean;
  /** Durata in ms. Default 1400, errore 2800. Ignorata se pending. */
  ms?: number;
  /** CTA opzionale (es. Annulla soft-delete). */
  action?: ToastAction;
};

export type ToastItem = {
  id: number;
  text: string;
  error: boolean;
  pending: boolean;
  boot: boolean;
  action?: ToastAction;
};

const toastStore = createStore<ToastItem | null>(null);
let seq = 0;
let hideTimer: number | null = null;
let lingerTimer: number | null = null;
let failsafeTimer: number | null = null;

function looksPending(text: string) {
  return /[…]$|\.\.\.$/.test(text.trim());
}

function disarm() {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (lingerTimer != null) {
    window.clearTimeout(lingerTimer);
    lingerTimer = null;
  }
  if (failsafeTimer != null) {
    window.clearTimeout(failsafeTimer);
    failsafeTimer = null;
  }
}

function armFailsafe() {
  if (failsafeTimer != null) return;
  failsafeTimer = window.setTimeout(() => {
    failsafeTimer = null;
    hideToast();
  }, 8000);
}

export function hideToast() {
  if (typeof window === "undefined") return;
  disarm();
  toastStore.set(null);
}

/** Nasconde il toast di caricamento dopo `ms` (default 450), come `hideLoadLinger`. */
export function hideLoadLinger(ms = 450) {
  if (typeof window === "undefined") return;
  const delay = Number.isFinite(ms) && ms >= 0 ? ms : 450;
  if (lingerTimer != null) window.clearTimeout(lingerTimer);
  lingerTimer = window.setTimeout(() => {
    lingerTimer = null;
    hideToast();
  }, delay);
}

export function showToast(message: string, isError = false, opts: ToastOptions = {}) {
  if (typeof window === "undefined") return;
  const text = String(message ?? "").trim();
  if (!text) {
    hideToast();
    return;
  }
  const pending = opts.pending === true || opts.sticky === true || (!isError && looksPending(text));
  const boot = opts.bootLoad === true || (pending && /caricamento/i.test(text));
  const current = toastStore.get();
  if (boot && current?.boot) {
    armFailsafe();
    return;
  }
  disarm();
  toastStore.set({ id: ++seq, text, error: isError, pending, boot, action: opts.action });
  if (pending) {
    if (boot) {
      armFailsafe();
      return;
    }
    hideTimer = window.setTimeout(() => hideToast(), 12000);
    return;
  }
  const ms = Number(opts.ms);
  const delay = Number.isFinite(ms) && ms > 0 ? ms : isError ? 2800 : 1400;
  hideTimer = window.setTimeout(() => hideToast(), delay);
}

export function useToast() {
  const current = useSyncExternalStore(toastStore.subscribe, toastStore.get, () => null);
  return { toast: current, show: showToast, hide: hideToast, hideLoadLinger };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toast = useSyncExternalStore(toastStore.subscribe, toastStore.get, () => null);
  return (
    <>
      {children}
      <div
        data-vc-ui="toast"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[130] flex justify-center px-4"
      >
        <AnimatePresence>
          {toast ? (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "flex max-w-[min(92vw,28rem)] items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold shadow-2xl ring-1",
                toast.action && "pointer-events-auto",
                toast.error
                  ? "bg-roast text-crema ring-[#e2836f]/50"
                  : toast.pending
                    ? "bg-mocha text-crema ring-sand/30"
                    : "bg-gradient-to-r from-caramel to-ember text-ink ring-caramel/30",
              )}
            >
              <span aria-hidden className="inline-flex size-4 shrink-0 items-center justify-center">
                {toast.error ? (
                  <X className="size-4" />
                ) : toast.pending ? (
                  <Loader2 className="size-4 motion-safe:animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </span>
              <p className="min-w-0 flex-1 text-left leading-snug">{toast.text}</p>
              {toast.action ? (
                <button
                  type="button"
                  className="pointer-events-auto shrink-0 rounded-full bg-ink/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wide hover:bg-ink/30"
                  onClick={() => {
                    const fn = toast.action?.onClick;
                    hideToast();
                    fn?.();
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}

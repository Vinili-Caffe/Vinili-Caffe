"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WifiOff } from "lucide-react";

const EVT = "vc:api-outage";

/** Banner quando le /webhooks/ falliscono (502/503/504 o rete). */
export function ApiOutageBanner() {
  const [down, setDown] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ down?: boolean }>).detail;
      setDown(!!d?.down);
    };
    window.addEventListener(EVT, on as EventListener);

    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      try {
        const res = await orig(...args);
        const url = String(typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "");
        if (url.includes("/webhooks/")) {
          const bad = res.status === 502 || res.status === 503 || res.status === 504;
          window.dispatchEvent(new CustomEvent(EVT, { detail: { down: bad } }));
          if (!bad) window.dispatchEvent(new CustomEvent(EVT, { detail: { down: false } }));
        }
        return res;
      } catch (err) {
        const url = String(typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "");
        // una richiesta annullata non vuol dire che il bot è giù
        const aborted = (err as { name?: string })?.name === "AbortError";
        if (!aborted && url.includes("/webhooks/")) window.dispatchEvent(new CustomEvent(EVT, { detail: { down: true } }));
        throw err;
      }
    };

    return () => {
      window.removeEventListener(EVT, on as EventListener);
      window.fetch = orig;
    };
  }, []);

  return (
    <AnimatePresence>
      {down && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-ember/95 px-4 py-2.5 text-sm font-semibold text-ink shadow-lg"
          role="status"
        >
          <WifiOff className="size-4" />
          Servizi temporaneamente non raggiungibili. Riprovo…
        </motion.div>
      )}
    </AnimatePresence>
  );
}

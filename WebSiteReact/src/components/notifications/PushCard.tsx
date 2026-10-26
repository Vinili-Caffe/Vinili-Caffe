"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { disablePush, enablePush, pushIsOn, pushSupported } from "@/lib/push";
import { cn } from "@/lib/cn";

/** Attiva/disattiva le notifiche push su questo dispositivo (ticket, risposte, menzioni…). */
export function PushCard({ token }: { token: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const supported = typeof window === "undefined" || pushSupported();

  useEffect(() => {
    pushIsOn().then(setOn).catch(() => setOn(false));
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMsg("");
    const r = on ? await disablePush(token) : await enablePush(token);
    setBusy(false);
    if (!r.ok) return setMsg(r.message || "Operazione non riuscita.");
    setOn(!on);
  };

  return (
    <div className={cn("mt-6 flex flex-wrap items-center gap-4 rounded-2xl p-5 ring-1", on ? "bg-crema/[0.04] ring-sand/12" : "bg-caramel/10 ring-caramel/30")}>
      {on ? <BellRing className="size-6 shrink-0 text-ember" /> : <BellOff className="size-6 shrink-0 text-caramel" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{on ? "Notifiche push attive su questo dispositivo" : "Notifiche push spente su questo dispositivo"}</p>
        <p className="mt-0.5 text-sm text-crema/60">
          {supported ? "Ricevi gli avvisi del sito anche a pagina chiusa." : "Questo browser non le supporta. Su iPhone aggiungi il sito alla schermata Home."}
        </p>
        {msg && <p className="mt-1 text-sm text-[#e2836f] light:text-[#a83a2c]">{msg}</p>}
      </div>
      {supported && on !== null && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60",
            on ? "bg-crema/8 ring-1 ring-sand/25 hover:bg-crema/12" : "bg-gradient-to-r from-caramel to-ember text-ink",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : on ? <BellOff className="size-4" /> : <BellRing className="size-4" />} {on ? "Disattiva" : "Attiva"}
        </button>
      )}
    </div>
  );
}

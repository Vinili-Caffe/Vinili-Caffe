"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { disablePush, enablePush, pushIsOn, pushSupported } from "@/lib/push";
import { cn } from "@/lib/cn";

type Props = {
  token: string;
  /** Riga compatta per sheet campanella (pc + telefono). */
  compact?: boolean;
  className?: string;
};

/** Attiva/disattiva le notifiche push su questo dispositivo (ticket, risposte, menzioni…). */
export function PushCard({ token, compact = false, className }: Props) {
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

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-2xl px-3 py-2.5 ring-1",
          on ? "bg-crema/[0.04] ring-sand/12" : "bg-caramel/10 ring-caramel/30",
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          {on ? <BellRing className="size-4 shrink-0 text-ember" /> : <BellOff className="size-4 shrink-0 text-caramel" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-crema">{on ? "Push attive" : "Push spente"}</p>
            <p className="text-[0.7rem] leading-snug text-crema/50">
              {supported
                ? "Avvisi anche a pagina chiusa"
                : "Su iPhone: aggiungi l’app alla Home"}
            </p>
          </div>
          {supported && on !== null ? (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={on ? "Disattiva notifiche push" : "Attiva notifiche push"}
              disabled={busy}
              onClick={() => void toggle()}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full border-0 p-0 transition-colors disabled:opacity-50",
                on ? "bg-caramel" : "bg-crema/15 ring-1 ring-sand/25",
              )}
            >
              {busy ? (
                <Loader2 className="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-ink" />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-0.5 size-5 rounded-full bg-crema shadow transition-[left] duration-200 ease-out",
                    on ? "left-[calc(100%-1.375rem)]" : "left-0.5",
                  )}
                />
              )}
            </button>
          ) : null}
        </div>
        {msg ? <p className="mt-1.5 text-xs text-[#e2836f] light:text-[#a83a2c]">{msg}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center gap-4 rounded-2xl p-5 ring-1",
        on ? "bg-crema/[0.04] ring-sand/12" : "bg-caramel/10 ring-caramel/30",
        className,
      )}
    >
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
          onClick={() => void toggle()}
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

"use client";

import { useEffect, useState } from "react";
import { BatteryCharging, BellOff, BellRing, ChevronDown, Loader2, Send } from "lucide-react";
import { disablePush, enablePush, pushIsOn, pushSupported, testPush } from "@/lib/push";
import { cn } from "@/lib/cn";

type AndroidKind = "samsung" | "xiaomi" | "brave" | "other";

/** Android e, se si capisce, la marca o il browser (cambiano i passaggi per le impostazioni). */
async function detectAndroid(): Promise<AndroidKind | null> {
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return null;
  const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
  if (brave && (await brave.isBrave?.().catch(() => false))) return "brave";
  if (/SM-|SAMSUNG|SamsungBrowser|Galaxy/i.test(ua)) return "samsung";
  if (/Xiaomi|Redmi|POCO|\bMi \d|\bM2\d{3}[A-Z]/i.test(ua)) return "xiaomi";
  return "other";
}

/**
 * Su Android le push arrivano tramite il browser: se il sistema lo mette a dormire (risparmio batteria,
 * "app in sospensione", avvio automatico negato) arrivano solo ad app aperta. Il sito non può cambiarlo:
 * qui si spiega come sistemarlo dalle impostazioni del telefono.
 */
function AndroidPushTips({ kind, compact }: { kind: AndroidKind; compact?: boolean }) {
  const steps: React.ReactNode[] =
    kind === "brave"
      ? [
          <>Apri Brave → <b>Impostazioni → Privacy e sicurezza</b>.</>,
          <>Attiva <b>Usa i servizi Google per le notifiche push</b> (senza, le notifiche arrivano solo con Brave aperto).</>,
          <>Poi <b>Impostazioni del telefono → App → Brave → Batteria → Senza restrizioni</b>.</>,
        ]
      : [
          <><b>Impostazioni → App → Chrome → Batteria</b> e scegli <b>Senza restrizioni</b>.</>,
          ...(kind === "samsung"
            ? [<><b>Impostazioni → Assistenza dispositivo → Batteria → Limiti utilizzo in background</b>: togli Chrome da <b>App in sospensione</b> e <b>App in sospensione profonda</b>, e disattiva <b>Sospendi app inutilizzate</b>.</>]
            : kind === "xiaomi"
              ? [<><b>Impostazioni → App → Gestisci app → Chrome</b>: attiva <b>Avvio automatico</b> e in <b>Risparmio batteria</b> scegli <b>Nessuna restrizione</b>.</>]
              : [<>Se il telefono ha voci come <b>Avvio automatico</b> o <b>App in sospensione</b>, attiva o togli Chrome da lì.</>]),
          <>Controlla che le notifiche di <b>Chrome</b> e di <b>Vinili & Caffè</b> siano attive nelle impostazioni del telefono.</>,
        ];
  return (
    <details className={cn("group mt-2 rounded-xl bg-crema/[0.04] ring-1 ring-sand/12", compact ? "px-2.5 py-1.5" : "px-3.5 py-2.5")}>
      <summary className={cn("flex cursor-pointer list-none items-center gap-2 font-semibold text-crema/80 [&::-webkit-details-marker]:hidden", compact ? "text-xs" : "text-sm")}>
        <BatteryCharging className="size-4 shrink-0 text-caramel" aria-hidden />
        <span className="min-w-0 flex-1">Arrivano solo con l&apos;app aperta?</span>
        <ChevronDown className="size-4 shrink-0 text-crema/45 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className={cn("mt-2 text-crema/65", compact ? "text-xs" : "text-sm")}>
        <p>Su Android le notifiche passano dal browser: se il telefono lo mette a dormire per risparmiare batteria, arrivano solo quando riapri l&apos;app.</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-caramel">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <p className="mt-2 text-crema/50">Dopo averlo fatto, chiudi l&apos;app del tutto: la prossima notifica dovrebbe arrivare anche così.</p>
      </div>
    </details>
  );
}

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
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [android, setAndroid] = useState<AndroidKind | null>(null);
  const supported = typeof window === "undefined" || pushSupported();

  useEffect(() => {
    pushIsOn().then(setOn).catch(() => setOn(false));
    detectAndroid()
      .then(setAndroid)
      .catch(() => setAndroid(null));
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMsg("");
    const r = on ? await disablePush(token) : await enablePush(token);
    setBusy(false);
    if (!r.ok) return setMsg(r.message || "Operazione non riuscita.");
    setOn(!on);
    setTest(null);
  };

  const sendTest = async () => {
    setTesting(true);
    setTest(null);
    setTest(await testPush(token));
    setTesting(false);
  };

  const testLine = test ? (
    <p className={cn("mt-1.5 text-xs leading-snug", test.ok ? "text-crema/65" : "text-[#e2836f] light:text-[#a83a2c]")}>{test.message}</p>
  ) : null;

  const testButton = (extra?: string) => (
    <button
      type="button"
      onClick={() => void sendTest()}
      disabled={testing}
      className={cn("inline-flex items-center gap-1.5 rounded-full font-semibold text-crema/80 ring-1 ring-sand/25 hover:bg-crema/8 disabled:opacity-60", extra)}
    >
      {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Prova
    </button>
  );

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
          {on ? testButton("px-2.5 py-1 text-xs") : null}
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
        {testLine}
        {on && android ? <AndroidPushTips kind={android} compact /> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-6 flex flex-col gap-3 rounded-2xl p-4 ring-1 sm:gap-4 sm:p-5",
        on ? "bg-crema/[0.04] ring-sand/12" : "bg-caramel/10 ring-caramel/30",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {on ? <BellRing className="mt-0.5 size-6 shrink-0 text-ember" /> : <BellOff className="mt-0.5 size-6 shrink-0 text-caramel" />}
        <div className="min-w-0 flex-1">
          <p className="text-pretty font-semibold leading-snug">
            {on ? "Notifiche push attive su questo dispositivo" : "Notifiche push spente su questo dispositivo"}
          </p>
          <p className="mt-0.5 text-pretty text-sm leading-snug text-crema/60">
            {supported ? "Ricevi gli avvisi del sito anche a pagina chiusa." : "Questo browser non le supporta. Su iPhone aggiungi il sito alla schermata Home."}
          </p>
          {msg && <p className="mt-1 text-sm text-[#e2836f] light:text-[#a83a2c]">{msg}</p>}
          {testLine}
        </div>
      </div>
      {supported && on !== null ? (
        <div className="flex flex-wrap items-center gap-2 pl-9 sm:pl-9">
          {on ? testButton("px-3.5 py-2 text-sm") : null}
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={busy}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60",
              on ? "bg-crema/8 ring-1 ring-sand/25 hover:bg-crema/12" : "bg-gradient-to-r from-caramel to-ember text-ink",
            )}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : on ? <BellOff className="size-4" /> : <BellRing className="size-4" />} {on ? "Disattiva" : "Attiva"}
          </button>
        </div>
      ) : null}
      {on && android ? <AndroidPushTips kind={android} /> : null}
    </div>
  );
}

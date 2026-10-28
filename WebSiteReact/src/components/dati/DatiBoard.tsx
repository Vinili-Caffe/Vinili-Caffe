"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FolderOpen,
  Info,
  Loader2,
  LogIn,
  Mail,
  Shield,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SmartLink } from "@/components/SmartLink";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  eraseGdprData,
  exportGdprData,
  labelFor,
  summarizeCounts,
  type CountItem,
  type EraseResult,
} from "@/lib/gdpr";

type Busy = "export" | "preview" | "erase" | null;
type Flash = { text: string; error?: boolean; ok?: boolean } | null;

/** Cartellina dell'archivio: metafora della pagina (dossier dietro al bancone). */
function ArchiveFolder({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto w-40 select-none", className)} aria-hidden>
      <div className="absolute -top-2 left-6 h-4 w-16 rounded-t-md bg-caramel/70" />
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-caramel/15 to-roast p-4 shadow-[0_24px_50px_-28px_rgba(212,145,80,0.55)] ring-1 ring-caramel/40">
        <div className="space-y-2">
          <span className="block h-2 rounded-full bg-crema/15" />
          <span className="block h-2 w-[80%] rounded-full bg-crema/10" />
          <span className="block h-2 w-[60%] rounded-full bg-crema/10" />
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-espresso/60 px-3 py-2 ring-1 ring-sand/15">
          <FolderOpen className="size-4 text-ember" />
          <span className="font-display text-sm font-semibold text-crema/80">GDPR</span>
        </div>
      </div>
    </div>
  );
}

function CountList({ items }: { items: CountItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-crema/45">Nessuna voce.</p>;
  }
  return (
    <ul className="divide-y divide-sand/10">
      {items.map((it) => (
        <li key={it.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
          <span className="min-w-0 flex-1 text-sm text-crema/80">{labelFor(it.key)}</span>
          <span className="font-display text-lg font-semibold lining-nums text-caramel">{it.n}</span>
          {it.detail && <span className="w-full text-xs text-crema/45">{it.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function Card({
  icon,
  title,
  tone = "default",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "default" | "danger" | "info";
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "rounded-3xl p-6 ring-1 sm:p-7",
        tone === "danger" && "bg-roast/70 ring-[#a83a2c]/35",
        tone === "info" && "bg-gradient-to-b from-caramel/15 to-roast ring-caramel/40 shadow-[0_30px_80px_-30px_rgba(212,145,80,0.35)]",
        tone === "default" && "bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-sand/15",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 [&>svg]:size-5",
            tone === "danger" ? "bg-[#a83a2c]/20 text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/35" : "bg-caramel/15 text-ember ring-caramel/25",
          )}
        >
          {icon}
        </span>
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
      </div>
      <div className="mt-4 space-y-4 text-crema/75">{children}</div>
    </article>
  );
}

/** L'archivio GDPR: export JSON, anteprima e cancellazione con conferma esplicita. */
export function DatiBoard() {
  const { ready, token, login } = useAuth();
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmToken, setConfirmToken] = useState("");
  const [preview, setPreview] = useState<EraseResult | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [askErase, setAskErase] = useState(false);

  useEffect(() => {
    if (!flash) return;
    const ms = flash.error ? 4200 : flash.ok ? 2800 : 2200;
    const id = setTimeout(() => setFlash(null), ms);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!askErase) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setAskErase(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [askErase, busy]);

  const status = (text: string, opts?: { error?: boolean; ok?: boolean }) =>
    setFlash({ text, error: opts?.error, ok: opts?.ok });

  const onExport = async () => {
    if (busy) return;
    if (!token) {
      status("Per esportare o cancellare i tuoi dati devi accedere con Discord.", { error: true });
      return login();
    }
    setBusy("export");
    status("Preparazione export…");
    const r = await exportGdprData(token);
    setBusy(null);
    if (!r.ok) return status(r.message, { error: true });
    if ("tooLarge" in r && r.tooLarge) return status(r.message, { error: true });
    status("Export scaricato.", { ok: true });
  };

  const onPreview = async () => {
    if (busy) return;
    if (!token) {
      status("Per esportare o cancellare i tuoi dati devi accedere con Discord.", { error: true });
      return login();
    }
    setBusy("preview");
    status("Calcolo anteprima…");
    const r = await eraseGdprData(token, { confirm: false });
    setBusy(null);
    if (!r.ok) return status(r.message, { error: true });
    setPreview(r.data);
    status("Anteprima pronta. Nessun dato cancellato.", { ok: true });
  };

  const runErase = async () => {
    if (busy || !token) return;
    const tokenConfirm = confirmToken.trim();
    if (!tokenConfirm) {
      status("Digita username o ID Discord per confermare.", { error: true });
      setAskErase(false);
      return;
    }
    setBusy("erase");
    status("Cancellazione in corso…");
    const r = await eraseGdprData(token, { confirm: true, confirmToken: tokenConfirm });
    setBusy(null);
    setAskErase(false);
    if (!r.ok) return status(r.message, { error: true });
    setPreview(r.data);
    setConfirmToken("");
    status(r.data.message || "Cancellazione completata.", { ok: true });
  };

  const onEraseClick = () => {
    if (busy) return;
    if (!token) {
      status("Per esportare o cancellare i tuoi dati devi accedere con Discord.", { error: true });
      return login();
    }
    if (!confirmToken.trim()) {
      status("Digita username o ID Discord per confermare.", { error: true });
      return;
    }
    setAskErase(true);
  };

  if (!ready) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 pb-20">
        <div className="h-40 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10" />
        <div className="h-56 animate-pulse rounded-3xl bg-roast/40 ring-1 ring-sand/10" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 pb-20">
      <Reveal>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <ArchiveFolder className="shrink-0" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="font-script text-3xl text-caramel">L&apos;archivio</p>
            <p className="mt-1 text-crema/65">
              Qui puoi esercitare i diritti GDPR sui dati personali trattati da <strong className="text-crema">Vinili &amp; Caffè</strong>{" "}
              (sito web e bot Discord) collegati al tuo account Discord.
            </p>
            <p className="mt-2 text-sm text-crema/50">
              Per i dettagli sul trattamento consulta la{" "}
              <SmartLink href="/privacy/" className="text-caramel underline-offset-2 hover:underline">
                Privacy Policy
              </SmartLink>
              .
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.06}>
        <Card icon={<Info />} title="Cosa puoi fare">
          <ul className="space-y-2 text-sm leading-relaxed">
            <li>
              <strong className="text-crema">Esportare</strong> una copia di tutti i tuoi dati.
            </li>
            <li>
              <strong className="text-crema">Anteprima</strong> di cosa verrebbe cancellato e cosa resterebbe.
            </li>
            <li>
              <strong className="text-crema">Cancellare</strong> i dati eliminabili (alcuni possono restare per moderazione, pagamenti o
              obblighi di legge).
            </li>
          </ul>
          <p className="text-sm">
            Serve l&apos;accesso con Discord. Per richieste diverse apri un{" "}
            <SmartLink href="/tickets/" className="text-caramel underline-offset-2 hover:underline">
              ticket
            </SmartLink>{" "}
            o scrivi a <strong className="text-crema">supporto@viniliecaffe.it</strong>.
          </p>
          <div className="flex flex-wrap gap-3">
            <SmartLink
              href="/tickets/"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
            >
              <Ticket className="size-4" /> Apri un ticket
            </SmartLink>
            <a
              href="mailto:supporto@viniliecaffe.it"
              className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-5 py-2.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:ring-sand/40"
            >
              <Mail className="size-4" /> Scrivi via email
            </a>
          </div>
        </Card>
      </Reveal>

      {!token ? (
        <Reveal delay={0.1}>
          <Card icon={<LogIn />} title="Accedi per continuare" tone="info">
            <p>Per esportare o cancellare i tuoi dati devi accedere con Discord.</p>
            <button
              type="button"
              onClick={login}
              className="inline-flex items-center gap-2 rounded-full bg-[#5865f2] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(88,101,242,0.7)]"
            >
              <LogIn className="size-4" /> Login con Discord
            </button>
          </Card>
        </Reveal>
      ) : (
        <>
          <Reveal delay={0.1}>
            <Card icon={<Download />} title="Esporta i tuoi dati">
              <p>Scarica in un file tutti i dati legati al tuo account Discord.</p>
              <button
                type="button"
                disabled={!!busy}
                onClick={onExport}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60"
              >
                {busy === "export" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Scarica i miei dati
              </button>
            </Card>
          </Reveal>

          <AnimatePresence>
            {preview && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.35 }}
              >
                <Card icon={<Eye />} title={preview.preview ? "Anteprima cancellazione" : "Esito cancellazione"} tone="info">
                  <p>
                    {preview.message ||
                      (preview.preview
                        ? "Solo anteprima: non è stato cancellato nulla. Controlla cosa verrebbe eliminato e cosa resterebbe."
                        : "Cancellazione completata per i dati eliminabili.")}
                  </p>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">
                      {preview.preview ? "Cosa verrebbe eliminato" : "Cosa è stato eliminato"}
                    </h3>
                    <div className="mt-3 rounded-2xl bg-espresso/50 p-4 ring-1 ring-sand/10">
                      <CountList items={summarizeCounts(preview.deleted)} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">
                      Cosa resterebbe (obblighi / sicurezza)
                    </h3>
                    <div className="mt-3 rounded-2xl bg-espresso/50 p-4 ring-1 ring-sand/10">
                      <CountList items={summarizeCounts(preview.retained)} />
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <Reveal delay={0.14}>
            <Card icon={<Trash2 />} title="Cancella i tuoi dati" tone="danger">
              <p>
                Puoi richiedere la cancellazione dei dati eliminabili. Restano eventuali dati necessari a moderazione, pagamenti o obblighi di
                legge. L&apos;operazione non si può annullare.
              </p>
              <button
                type="button"
                disabled={!!busy}
                onClick={onPreview}
                className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-5 py-2.5 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:ring-sand/40 disabled:opacity-60"
              >
                {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                Anteprima cancellazione
              </button>
              <label className="block">
                <span className="text-sm text-crema/70">Per confermare, digita il tuo username Discord o il tuo ID</span>
                <input
                  type="text"
                  name="gdpr-confirm"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!!busy}
                  placeholder="username o ID"
                  value={confirmToken}
                  onChange={(e) => setConfirmToken(e.target.value)}
                  className="mt-2 w-full rounded-xl bg-espresso/70 px-4 py-3 text-crema outline-none ring-1 ring-sand/15 placeholder:text-crema/30 focus:ring-2 focus:ring-caramel/70 disabled:opacity-60"
                />
              </label>
              <div className="flex gap-3 rounded-2xl bg-caramel/10 p-4 text-sm leading-relaxed text-crema/80 ring-1 ring-caramel/25">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-caramel" />
                <p>Dopo la conferma l&apos;eliminazione dei dati rimovibili non si può annullare.</p>
              </div>
              <button
                type="button"
                disabled={!!busy}
                onClick={onEraseClick}
                className="inline-flex items-center gap-2 rounded-full bg-[#a83a2c] px-5 py-2.5 text-sm font-semibold text-crema transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60"
              >
                {busy === "erase" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Cancella i miei dati
              </button>
            </Card>
          </Reveal>
        </>
      )}

      <Reveal delay={0.16}>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-crema/45">
          <span className="inline-flex items-center gap-1.5">
            <Shield className="size-3.5 text-caramel" /> Altre policy
          </span>
          <SmartLink href="/privacy/" className="hover:text-crema">
            Privacy
          </SmartLink>
          <SmartLink href="/cookie/" className="hover:text-crema">
            Cookie
          </SmartLink>
          <SmartLink href="/terms/" className="hover:text-crema">
            Termini
          </SmartLink>
          <SmartLink href="/copyright/" className="hover:text-crema">
            Copyright
          </SmartLink>
        </div>
      </Reveal>

      <AnimatePresence>
        {flash && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
              "fixed bottom-6 left-1/2 z-[70] flex max-w-[min(92vw,28rem)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-2xl ring-1 backdrop-blur-xl",
              flash.error ? "bg-[#a83a2c]/15 text-[#c4553f] ring-[#a83a2c]/40" : flash.ok ? "bg-roast/95 text-crema ring-caramel/35" : "bg-roast/95 text-crema/85 ring-sand/20",
            )}
          >
            {flash.error ? <AlertTriangle className="size-4 shrink-0" /> : flash.ok ? <CheckCircle2 className="size-4 shrink-0 text-caramel" /> : <Loader2 className="size-4 shrink-0 animate-spin text-caramel" />}
            <span>{flash.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {askErase && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" aria-label="Annulla" disabled={!!busy} onClick={() => setAskErase(false)} className="absolute inset-0 bg-black/75" />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="gdpr-erase-title"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="relative w-full max-w-md rounded-t-3xl bg-roast p-6 shadow-2xl ring-1 ring-sand/15 sm:rounded-3xl"
            >
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setAskErase(false)}
                aria-label="Chiudi"
                className="absolute right-4 top-4 rounded-full p-1.5 text-crema/50 hover:bg-crema/8 hover:text-crema disabled:opacity-50"
              >
                <X className="size-5" />
              </button>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#a83a2c]/20 text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/35">
                  <Trash2 className="size-5" />
                </span>
                <p id="gdpr-erase-title" className="font-display text-2xl font-semibold">
                  Cancellare i dati?
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-crema/65">
                Confermi la cancellazione dei tuoi dati eliminabili? L&apos;operazione non si può annullare.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={runErase}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#a83a2c] px-5 py-3 text-sm font-semibold text-crema disabled:opacity-60"
                >
                  {busy === "erase" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Cancella
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => setAskErase(false)}
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-crema/8 px-5 py-3 text-sm font-semibold text-crema ring-1 ring-sand/25 disabled:opacity-60"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

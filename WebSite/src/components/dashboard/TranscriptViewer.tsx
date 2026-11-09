"use client";

import { TextTranscriptView } from "./TextTranscriptView";
import { extractTextTranscriptFromHtml } from "@/lib/transcript-text";
import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, LogIn } from "lucide-react";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { useAuth } from "@/lib/auth";
import { extractPlainTranscript, loadTranscript, readTranscriptToken, type TranscriptMeta } from "@/lib/transcript";

type Gate = { title: string; body: string; error?: string; hideLogin?: boolean; status?: number };

/** Viewer transcript: API reale `/ticket-transcript/:token`; HTML in iframe, testo semplice via DiscordContent. */
export function TranscriptViewer() {
  const { ready, token, user, login, logout } = useAuth();
  const [tokenParam, setTokenParam] = useState("");
  const [gate, setGate] = useState<Gate | null>(null);
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState<string | null>(null);
  const [meta, setMeta] = useState<TranscriptMeta | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const plain = useMemo(() => (html ? extractPlainTranscript(html) ?? extractTextTranscriptFromHtml(html) : null), [html]);

  useEffect(() => {
    setTokenParam(readTranscriptToken(typeof window !== "undefined" ? window.location.search : ""));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!tokenParam) {
      setLoading(false);
      setGate({
        title: "Link transcript non valido",
        body: "Apri il link completo ricevuto alla chiusura del ticket (parametro t).",
        hideLogin: true,
      });
      return;
    }
    if (!token) {
      setLoading(false);
      setGate({
        title: "Accedi per vedere il transcript",
        body: "Solo l’autore del ticket o lo staff con i permessi giusti possono aprirlo. Accedi con Discord per confermare la tua identità.",
      });
      return;
    }

    let alive = true;
    setLoading(true);
    setGate(null);
    setHtml(null);
    loadTranscript(tokenParam, token).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok) {
        setGate({
          title: r.status === 403 ? "Accesso negato" : "Transcript",
          body:
            r.status === 403 && user
              ? `Sei connesso come ${user.global_name || user.username}. Prova con un altro account staff, oppure chiedi a chi ha chiuso il ticket.`
              : r.message,
          error: r.message,
          hideLogin: !r.needLogin && r.status !== 403,
        });
        if (r.needLogin) logout();
        return;
      }
      setMeta(r.meta);
      setHtml(r.html);
    });
    return () => {
      alive = false;
    };
  }, [ready, token, tokenParam, user, logout]);

  useEffect(() => {
    if (!html || plain) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
  }, [html, plain]);

  if (!ready || loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-crema/60" role="status">
        <Loader2 className="size-8 animate-spin text-caramel" />
        <p className="text-sm">Caricamento…</p>
      </div>
    );
  }

  if (gate) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/85 to-roast p-6 text-center ring-1 ring-sand/15 sm:p-8">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <FileText className="size-6" />
        </span>
        <p className="mt-4 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-caramel">Ticket · accesso riservato</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-crema">{gate.title}</h1>
        <p className="mt-3 text-sm text-crema/60">{gate.body}</p>
        {gate.error && gate.error !== gate.body && <p className="mt-3 text-sm text-red-300">{gate.error}</p>}
        {!gate.hideLogin && (
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                if (/cambia account/i.test(gate.title) || gate.error?.includes("negato")) logout();
                login();
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865f2] px-4 py-3 text-sm font-bold text-white"
            >
              <LogIn className="size-4" />
              {gate.status === 403 || /negato/i.test(gate.title) ? "Cambia account Discord" : "Accedi con Discord"}
            </button>
            {user && (
              <p className="text-xs text-crema/60">
                Sessione: {user.global_name || user.username}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const title = meta?.number ? `ticket-${meta.number}` : "transcript";
  const metaLine = [meta?.userTag, meta?.type ? meta.type.charAt(0).toUpperCase() + meta.type.slice(1) : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="overflow-hidden rounded-2xl bg-roast/80 ring-1 ring-sand/10">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand/10 px-4 py-3 sm:px-5">
        <h1 className="font-display text-xl font-semibold text-crema">{title}</h1>
        {metaLine && <p className="text-xs text-crema/50">{metaLine}</p>}
      </header>

      {plain ? (
        <div className="max-h-[75vh] overflow-y-auto">
          <TextTranscriptView text={plain} token={token} />
        </div>
      ) : (
        <iframe
          title={title}
          src={blobUrl ?? undefined}
          className="h-[70vh] w-full border-0 bg-[#1e1f22]"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      )}
    </section>
  );
}

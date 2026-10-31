"use client";

import { useEffect, useState } from "react";
import { LogIn, ThumbsUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  castListingVote,
  loadListing,
  progressVoteSession,
  startVoteSession,
  type BoardListing,
  type VoteSession,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { Checkbox } from "@/components/ui";
import { SmartLink } from "../SmartLink";

function useParams() {
  const [slug, setSlug] = useState("");
  const [id, setId] = useState("");
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      setSlug(p.get("slug") || "");
      setId(p.get("id") || "");
    } catch {}
  }, []);
  return { slug, id };
}

/** Cabina voto: countdown → sponsor → conferma (come API vote-session). */
export function VoteListing() {
  const { slug, id: idQ } = useParams();
  const { ready, token, login } = useAuth();
  const [listing, setListing] = useState<BoardListing | null>(null);
  const [session, setSession] = useState<VoteSession | null>(null);
  const [step, setStep] = useState<"idle" | "countdown" | "ad" | "ready" | "done">("idle");
  const [left, setLeft] = useState(0);
  const [remind, setRemind] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !slug) return;
    loadListing(slug, token).then((r) => {
      if (r.ok) setListing(r.data.listing);
      else setErr(r.message);
    });
  }, [ready, slug, token]);

  useEffect(() => {
    if (step !== "countdown" && step !== "ad") return;
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [step, left]);

  const listingId = idQ || listing?.id || "";

  async function begin() {
    if (!token) return login();
    if (!listingId) {
      setErr("Scheda non pronta.");
      return;
    }
    setErr("");
    setBusy(true);
    const r = await startVoteSession(token, listingId);
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setSession(r.data);
    const sec = Math.max(0, Number(r.data.countdownSeconds) || 0);
    if (sec > 0) {
      setStep("countdown");
      setLeft(sec);
    } else {
      await finishCountdown(r.data);
    }
  }

  async function finishCountdown(sess = session) {
    if (!token || !listingId || !sess) return;
    const r = await progressVoteSession(token, listingId, sess.sessionId, "countdown");
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    const adSec = Math.max(0, Number(sess.adSeconds) || 0);
    if (sess.ads?.provider && sess.ads.provider !== "none" && adSec > 0) {
      await progressVoteSession(token, listingId, sess.sessionId, "ad", true);
      setStep("ad");
      setLeft(adSec);
    } else {
      if (sess.ads?.provider && sess.ads.provider !== "none") {
        await progressVoteSession(token, listingId, sess.sessionId, "ad");
      }
      setStep("ready");
    }
  }

  async function finishAd() {
    if (!token || !listingId || !session) return;
    const r = await progressVoteSession(token, listingId, session.sessionId, "ad");
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setStep("ready");
  }

  useEffect(() => {
    if (step === "countdown" && left === 0 && session) void finishCountdown();
    if (step === "ad" && left === 0) void finishAd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, left]);

  async function confirm() {
    if (!token || !listingId || !session) return;
    setBusy(true);
    const r = await castListingVote(token, listingId, session.sessionId, { remind });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    setMsg(r.data.message || "Voto registrato. Grazie!");
    setStep("done");
    if (r.data.listing) setListing(r.data.listing);
  }

  if (ready && !token) {
    return (
      <section className="mx-auto max-w-md px-6 pb-24 text-center">
        <p className="font-display text-3xl">Vota questa scheda</p>
        <p className="mt-2 text-crema/60">Serve il login Discord.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-lg px-6 pb-24">
      <div className="rounded-[2rem] bg-gradient-to-b from-mocha to-roast p-7 ring-1 ring-sand/15 shadow-[0_30px_80px_-30px_rgba(212,145,80,0.4)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Sessione di voto</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">{listing?.name || "Scheda"}</h2>
        <p className="mt-2 text-sm text-crema/55">Completa il percorso (countdown e sponsor se richiesti), poi conferma.</p>

        {err && <p className="mt-4 text-sm text-ember">{err}</p>}
        {msg && <p className="mt-4 text-sm text-emerald-300">{msg}</p>}

        {step === "idle" && (
          <button
            type="button"
            disabled={busy || !listingId}
            onClick={begin}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember py-3.5 font-semibold text-ink disabled:opacity-50"
          >
            <ThumbsUp className="size-4" /> Inizia
          </button>
        )}

        {(step === "countdown" || step === "ad") && (
          <div className="mt-8 text-center">
            <p className="text-sm text-crema/50">{step === "countdown" ? "Preparazione…" : "Sponsor…"}</p>
            <p className="mt-3 font-display text-6xl lining-nums text-sand">{left}</p>
          </div>
        )}

        {step === "ready" && (
          <div className="mt-8 space-y-4">
            <label className="flex items-center gap-2 text-sm text-crema/70">
              <Checkbox checked={remind} onChange={setRemind} />
              Ricordami al prossimo voto
            </label>
            {session?.turnstileRequired && (
              <p className="rounded-2xl bg-crema/5 p-3 text-xs text-crema/55 ring-1 ring-sand/15">
                Anti-robot attivo sul sito: se il voto fallisce, riprova da www o completa Turnstile quando disponibile in beta.
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              className="w-full rounded-full bg-gradient-to-r from-caramel to-ember py-3.5 font-semibold text-ink disabled:opacity-50"
            >
              Conferma voto
            </button>
          </div>
        )}

        {step === "done" && (
          <SmartLink href={page(slug ? `/vetrina/scheda/?slug=${encodeURIComponent(slug)}` : "/vetrina/")} className="mt-8 inline-flex w-full justify-center rounded-full bg-crema/10 py-3 text-sm font-semibold ring-1 ring-sand/25">
            Torna alla scheda
          </SmartLink>
        )}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Bot, Check, Clock, LogIn, Server, ThumbsUp, Tv } from "lucide-react";
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
import { cn } from "@/lib/cn";

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
  const [total, setTotal] = useState(0);

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
      setTotal(sec);
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
      setTotal(adSec);
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
      <section className="mx-auto max-w-md px-6 pb-28 text-center">
        <ThumbsUp className="mx-auto size-12 text-ember" />
        <p className="mt-4 font-display text-4xl">Un voto, un passo avanti</p>
        <p className="mt-2 text-crema/60">Per votare accedi con Discord: ogni account può votare di nuovo dopo qualche ora.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi con Discord
        </button>
      </section>
    );
  }

  const accent = listing && /^#[0-9a-f]{6}$/i.test(listing.accent || "") ? listing.accent : "#d99a5b";
  const KindIcon = listing?.kind === "bot" ? Bot : Server;
  const stepIndex = step === "idle" ? 0 : step === "countdown" ? 1 : step === "ad" ? 2 : 3;
  const STEPS = [
    { label: "Attesa", icon: Clock },
    { label: "Sponsor", icon: Tv },
    { label: "Conferma", icon: ThumbsUp },
  ];
  const R = 54;
  const C = 2 * Math.PI * R;
  const frac = total > 0 ? left / total : 0;
  const back = page(slug ? `/vetrina/scheda/?slug=${encodeURIComponent(slug)}` : "/vetrina/");

  return (
    <section className="mx-auto max-w-xl px-4 pb-28 sm:px-6">
      <div className="overflow-hidden rounded-[2rem] bg-roast ring-1 ring-sand/15 shadow-[0_40px_90px_-40px_rgba(217,154,91,0.55)]">
        {/* scheda votata */}
        <div className="relative p-6 sm:p-7" style={{ background: `radial-gradient(120% 140% at 0% 0%, ${accent}55, transparent 60%)` }}>
          {listing?.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.bannerUrl} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
          ) : null}
          <div className="relative flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-2 ring-crema/15" style={{ background: `${accent}55` }}>
              {listing?.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.iconUrl} alt="" className="size-full object-cover" />
              ) : (
                <KindIcon className="size-7 text-crema/70" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-ember">Stai votando</p>
              <p className="truncate font-display text-3xl font-semibold">{listing?.name || "…"}</p>
              {listing ? <p className="text-sm text-crema/55">{(listing.votesMonth || 0).toLocaleString("it-IT")} voti questo mese</p> : null}
            </div>
          </div>
        </div>

        {/* passaggi */}
        <ol className="flex items-center gap-2 border-y border-sand/10 px-6 py-4 sm:px-7">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const doneStep = stepIndex > n || step === "done";
            const current = stepIndex === n;
            const Icon = s.icon;
            return (
              <li key={s.label} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors",
                    doneStep ? "bg-ember text-ink ring-ember" : current ? "bg-caramel/20 text-ember ring-caramel/50" : "text-crema/35 ring-sand/20",
                  )}
                >
                  {doneStep ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span className={cn("text-sm font-semibold", current || doneStep ? "text-crema" : "text-crema/40")}>{s.label}</span>
                {i < STEPS.length - 1 && <span className={cn("h-px flex-1", doneStep ? "bg-ember/60" : "bg-sand/15")} />}
              </li>
            );
          })}
        </ol>

        <div className="p-6 sm:p-8">
          {err && <p className="mb-5 rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/25">{err}</p>}

          {step === "idle" && (
            <div className="text-center">
              <p className="text-crema/65">Un breve conto alla rovescia, a volte uno sponsor, e poi confermi. Ci vogliono pochi secondi.</p>
              <button
                type="button"
                disabled={busy || !listingId}
                onClick={begin}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember py-4 text-lg font-bold text-ink transition hover:-translate-y-0.5 disabled:opacity-50"
              >
                <ThumbsUp className="size-5" /> {busy ? "Preparo…" : "Inizia a votare"}
              </button>
            </div>
          )}

          {(step === "countdown" || step === "ad") && (
            <div className="flex flex-col items-center text-center">
              <div className="relative size-36">
                <svg viewBox="0 0 120 120" className="size-full -rotate-90">
                  <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeWidth="8" className="text-crema/10" />
                  <motion.circle
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    stroke="url(#vote-ring)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    animate={{ strokeDashoffset: C * (1 - frac) }}
                    transition={{ duration: 0.9, ease: "linear" }}
                  />
                  <defs>
                    <linearGradient id="vote-ring" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#d99a5b" />
                      <stop offset="100%" stopColor="#f0b46e" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-display text-6xl font-semibold lining-nums text-crema">{left}</span>
              </div>
              <p className="mt-4 text-crema/60">{step === "countdown" ? "Un attimo, sto preparando il voto…" : "Grazie allo sponsor la vetrina resta gratuita."}</p>
            </div>
          )}

          {step === "ready" && (
            <div className="space-y-5">
              <label className="flex items-center gap-3 rounded-2xl bg-espresso/50 p-4 text-sm text-crema/75 ring-1 ring-sand/12">
                <Checkbox checked={remind} onChange={setRemind} />
                Avvisami quando posso votare di nuovo
              </label>
              {session?.turnstileRequired && (
                <p className="rounded-2xl bg-crema/5 p-3 text-xs text-crema/55 ring-1 ring-sand/15">Controllo anti-robot attivo: se il voto non passa, ricarica la pagina e riprova.</p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={confirm}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember py-4 text-lg font-bold text-ink transition hover:-translate-y-0.5 disabled:opacity-50"
              >
                <Check className="size-5" /> {busy ? "Registro…" : "Conferma il voto"}
              </button>
            </div>
          )}

          {step === "done" && (
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
              <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-caramel to-ember text-ink shadow-[0_0_60px_-10px_rgba(240,180,110,0.8)]">
                <Check className="size-10" strokeWidth={3} />
              </span>
              <p className="mt-5 font-display text-3xl font-semibold">Voto registrato!</p>
              <p className="mt-2 text-crema/60">{msg || "Grazie: hai dato una spinta a questa scheda."}</p>
              <SmartLink href={back} className="mt-6 inline-flex items-center gap-2 rounded-full bg-crema/10 px-5 py-2.5 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15">
                <ArrowLeft className="size-4" /> Torna alla scheda
              </SmartLink>
            </motion.div>
          )}
        </div>
      </div>
      {step !== "done" && (
        <p className="mt-5 text-center text-sm">
          <SmartLink href={back} className="text-crema/45 hover:text-crema">
            ← Torna alla scheda
          </SmartLink>
        </p>
      )}
    </section>
  );
}

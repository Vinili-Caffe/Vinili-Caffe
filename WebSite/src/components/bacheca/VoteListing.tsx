"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowUpRight, Bot, Check, Clock, Disc3, Flame, LogIn, Server, ShieldCheck, ThumbsUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  castListingVote,
  loadBoardsConfig,
  loadListing,
  progressVoteSession,
  setVoteReminder,
  startVoteSession,
  type BoardListing,
  type VoteSession,
} from "@/lib/boards";
import { SITE_DISCORD_INVITE } from "@/lib/og";
import { page } from "@/lib/site";
import { Checkbox, showToast } from "@/components/ui";
import { Turnstile, preloadTurnstile } from "@/components/ui/Turnstile";
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

function formatNextVote(iso?: string | null) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** House ad della community — sponsorizza la cabina voto gratuita. */
function SponsorHouseCard({ prominent }: { prominent?: boolean }) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl bg-gradient-to-br from-roast to-espresso p-5 text-left ring-1 ring-sand/20",
        prominent ? "mt-6 shadow-[0_30px_70px_-35px_rgba(217,154,91,0.75)] ring-ember/35 sm:p-6" : "mt-5 sm:max-w-xs",
      )}
    >
      <span className="inline-flex items-center rounded-full bg-caramel/20 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-ember ring-1 ring-caramel/35">
        Sponsor
      </span>
      {prominent ? <p className="mt-3 font-script text-xl text-caramel/90">Grazie allo sponsor</p> : null}
      <p className={cn("font-display font-semibold text-crema", prominent ? "mt-1 text-3xl" : "mt-2.5 text-2xl")}>Vinili &amp; Caffè</p>
      <p className="mt-1.5 text-sm leading-relaxed text-crema/60">
        Entra nella community su Discord: chiacchiere, eventi e una mano a chi mette server e bot in vetrina, che resta gratis per tutti.
      </p>
      <SmartLink
        href={SITE_DISCORD_INVITE}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-bold text-ink transition hover:-translate-y-0.5"
      >
        <Disc3 className="size-4" /> Entra su Discord <ArrowUpRight className="size-3.5" />
      </SmartLink>
    </div>
  );
}

/** Cabina voto: countdown (al posto sponsor finché AdSense non è ok) → Turnstile → conferma. */
export function VoteListing() {
  const { slug, id: idQ } = useParams();
  const { ready, token, login } = useAuth();
  const [listing, setListing] = useState<BoardListing | null>(null);
  const [session, setSession] = useState<VoteSession | null>(null);
  const [step, setStep] = useState<"idle" | "countdown" | "ad" | "ready" | "done">("idle");
  const [left, setLeft] = useState(0);
  const [remind, setRemind] = useState(true);
  const [remindAt, setRemindAt] = useState<string | null>(null);
  const [remindBusy, setRemindBusy] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [cfgSiteKey, setCfgSiteKey] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [nextVoteHint, setNextVoteHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(0);
  const [voteStreak, setVoteStreak] = useState(0);

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
  const siteKey = String(session?.turnstileSiteKey || cfgSiteKey || "").trim();
  const needsCaptcha = Boolean(session?.turnstileRequired);
  const adsEnabled = Boolean(session?.ads?.provider && session.ads.provider !== "none");

  useEffect(() => {
    if (!ready) return;
    void loadBoardsConfig("", token).then((c) => c?.turnstileSiteKey && setCfgSiteKey(c.turnstileSiteKey));
  }, [ready, token]);

  /* Durante il countdown: script Turnstile già in cache + widget montato (nascosto se non ancora ready). */
  useEffect(() => {
    if (step === "countdown" || step === "ad" || step === "ready") {
      if (siteKey) preloadTurnstile();
    }
  }, [step, siteKey]);

  async function begin() {
    if (!token) return login();
    if (!listingId) {
      setErr("Scheda non pronta.");
      return;
    }
    setErr("");
    setNextVoteHint("");
    setBusy(true);
    /* Precarica Cloudflare subito, anche prima della risposta sessione. */
    if (cfgSiteKey) preloadTurnstile();
    const r = await startVoteSession(token, listingId);
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      showToast(r.message, true);
      const next = formatNextVote(r.nextVoteAt);
      if (next) setNextVoteHint(next);
      return;
    }
    setSession(r.data);
    if (r.data.turnstileSiteKey) preloadTurnstile();
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
      showToast(r.message, true);
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
      showToast(r.message, true);
      return;
    }
    setStep("ready");
  }

  useEffect(() => {
    if (step === "countdown" && left === 0 && session) void finishCountdown();
    if (step === "ad" && left === 0) void finishAd();
     
  }, [step, left]);

  async function confirm() {
    if (!token || !listingId || !session) return;
    if (needsCaptcha && !captcha) {
      const msg = "Completa la verifica anti-robot qui sopra.";
      setErr(msg);
      showToast(msg, true);
      return;
    }
    setBusy(true);
    setErr("");
    const r = await castListingVote(token, listingId, session.sessionId, { remind, turnstileToken: captcha });
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      showToast(r.message, true);
      setCaptcha("");
      setCaptchaKey((n) => n + 1);
      return;
    }
    setRemindAt(r.data.remindAt || null);
    const okMsg = r.data.message || "Voto registrato. Grazie!";
    setMsg(okMsg);
    showToast(okMsg);
    setVoteStreak(Math.max(0, Number(r.data.voteStreak) || 0));
    setStep("done");
    if (r.data.listing) setListing(r.data.listing);
  }

  if (ready && !token) {
    return (
      <section className="mx-auto max-w-md px-6 pb-28 text-center">
        <ThumbsUp className="mx-auto size-12 text-ember" />
        <p className="mt-4 font-display text-4xl">Un voto, un passo avanti</p>
        <p className="mt-2 text-crema/60">Per votare entra con Discord. Ogni account può votare di nuovo dopo qualche ora.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi con Discord
        </button>
      </section>
    );
  }

  const accent = listing && /^#[0-9a-f]{6}$/i.test(listing.accent || "") ? listing.accent : "#d99a5b";
  const KindIcon = listing?.kind === "bot" ? Bot : Server;
  /* Senza sponsor: Attesa → Verifica → Conferma */
  const STEPS = adsEnabled
    ? [
        { label: "Attesa", icon: Clock },
        { label: "Sponsor", icon: ShieldCheck },
        { label: "Conferma", icon: ThumbsUp },
      ]
    : [
        { label: "Attesa", icon: Clock },
        { label: "Verifica", icon: ShieldCheck },
        { label: "Conferma", icon: ThumbsUp },
      ];
  const stepIndex =
    step === "idle"
      ? 0
      : step === "countdown"
        ? 1
        : step === "ad"
          ? 2
          : step === "ready"
            ? adsEnabled
              ? 3
              : 2
            : 3;
  const R = 54;
  const C = 2 * Math.PI * R;
  const frac = total > 0 ? left / total : 0;
  const back = page(slug ? `/vetrina/scheda/?slug=${encodeURIComponent(slug)}` : "/vetrina/");
  const turnstileLive = Boolean(siteKey) && (step === "countdown" || step === "ad" || step === "ready");

  return (
    <section className="mx-auto max-w-xl px-4 pb-28 sm:px-6">
      <div className="overflow-hidden rounded-[2rem] bg-roast ring-1 ring-sand/15 shadow-[0_40px_90px_-40px_rgba(217,154,91,0.55)]">
        <div className="relative p-6 sm:p-7" style={{ background: `radial-gradient(120% 140% at 0% 0%, ${accent}55, transparent 60%)` }}>
          {listing?.bannerUrl ? (
             
            <img src={listing.bannerUrl} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
          ) : null}
          <div className="relative flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-2 ring-crema/15" style={{ background: `${accent}55` }}>
              {listing?.iconUrl ? (
                 
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
          {err && (
            <div className="mb-5 rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/25">
              <p>{err}</p>
              {nextVoteHint ? <p className="mt-1 text-xs text-ember/80">Di nuovo dal {nextVoteHint}</p> : null}
            </div>
          )}

          {step === "idle" && (
            <div className="text-center">
              <p className="text-crema/65">
                {adsEnabled
                  ? "Qualche secondo di attesa con il nostro sponsor di casa, poi confermi il voto."
                  : "Un conto alla rovescia di pochi secondi e la verifica anti-robot: poi confermi il voto."}
              </p>
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
            <div className={cn("flex flex-col items-center gap-6", step === "ad" ? "text-center sm:flex-col" : "text-center sm:flex-row sm:items-start sm:justify-center sm:text-left")}>
              <div className="flex shrink-0 flex-col items-center sm:items-center">
                <div className={cn("relative", step === "ad" ? "size-40" : "size-36")}>
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
                <p className="mt-4 max-w-xs text-crema/60">
                  {step === "countdown"
                    ? adsEnabled
                      ? "Un attimo, sto preparando il voto…"
                      : "Attendi qualche secondo: nel frattempo carico la verifica di Cloudflare…"
                    : "La vetrina resta gratuita grazie al supporto della community."}
                </p>
              </div>
              <SponsorHouseCard prominent={step === "ad"} />
            </div>
          )}

          {/* Turnstile montato una sola volta da countdown→ready (niente remount che invalida il token). */}
          {turnstileLive ? (
            <div
              className={cn(
                "rounded-2xl bg-espresso/50 p-4 ring-1 ring-sand/12",
                step === "ready" ? "mt-0" : "mt-5",
                step !== "ready" && adsEnabled ? "sr-only" : "",
              )}
            >
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">Verifica anti-robot</p>
              <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptcha} />
              {captcha && step === "ready" ? (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-crema/50">
                  <Check className="size-3.5 text-ember" /> Verifica pronta
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "ready" && (
            <div className="mt-5 space-y-5">
              <label className="flex items-center gap-3 rounded-2xl bg-espresso/50 p-4 text-sm text-crema/75 ring-1 ring-sand/12">
                <Checkbox checked={remind} onChange={setRemind} />
                Avvisami quando posso votare di nuovo
              </label>
              <button
                type="button"
                disabled={busy || (needsCaptcha && !captcha)}
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
              {voteStreak > 0 ? (
                <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-ember/15 px-4 py-2 text-sm font-semibold text-ember ring-1 ring-ember/30">
                  <Flame className="size-4 animate-streak-flicker" fill="currentColor" />
                  Streak {voteStreak}
                  {voteStreak >= 7 ? ` · traguardo ${voteStreak >= 30 ? "30+" : voteStreak >= 14 ? "14" : "7"}` : ""}
                </p>
              ) : null}
              <label className="mx-auto mt-5 flex max-w-sm items-center gap-3 rounded-2xl bg-espresso/50 p-4 text-left text-sm text-crema/75 ring-1 ring-sand/12">
                <Checkbox
                  checked={remind}
                  disabled={remindBusy}
                  onChange={async (next) => {
                    if (!token || !listingId) return;
                    setRemindBusy(true);
                    const r = await setVoteReminder(token, listingId, next);
                    setRemindBusy(false);
                    if (!r.ok) return showToast(r.message, true);
                    setRemind(r.data.enabled);
                    setRemindAt(r.data.remindAt);
                    showToast(r.data.enabled ? "Ti avviso quando puoi rivotare" : "Promemoria tolto");
                  }}
                />
                <span>
                  Avvisami quando posso votare di nuovo
                  {remind && remindAt ? (
                    <span className="block text-xs text-crema/45">
                      {new Date(remindAt).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : null}
                </span>
              </label>
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

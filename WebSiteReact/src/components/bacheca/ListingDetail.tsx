"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Bot, Flag, LogIn, Server, Star, ThumbsUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { bumpListing, kindLabel, loadListing, reportListing, statusLabel, type BoardListing } from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { promptDialog } from "@/components/ui";
import { SmartLink } from "../SmartLink";
import { DiscordContent } from "../discord/DiscordContent";

function useSlug() {
  const [slug, setSlug] = useState("");
  useEffect(() => {
    try {
      setSlug(new URLSearchParams(location.search).get("slug") || "");
    } catch {
      setSlug("");
    }
  }, []);
  return slug;
}

/** Scheda completa di un bot o server in bacheca. */
export function ListingDetail() {
  const slug = useSlug();
  const { ready, token, login } = useAuth();
  const [listing, setListing] = useState<BoardListing | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!ready || !slug) return;
    let alive = true;
    setErr("");
    loadListing(slug, token).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setErr(r.message);
        setListing(null);
        return;
      }
      setListing(r.data.listing);
    });
    return () => {
      alive = false;
    };
  }, [ready, slug, token]);

  const invite = listing?.kind === "bot" ? listing.botInviteUrl : listing?.inviteUrl;

  async function onBump() {
    if (!token || !listing) return login();
    setBusy("bump");
    const r = await bumpListing(token, listing.id);
    setBusy("");
    setMessage(r.ok ? r.data.message || "Scheda riposizionata." : r.message);
    if (r.ok && r.data.listing) setListing(r.data.listing);
  }

  async function onReport() {
    if (!token || !listing) return login();
    const reason = await promptDialog({
      title: "Segnala scheda",
      inputLabel: "Motivo",
      placeholder: "Perché segnali questa scheda? (min. qualche parola)",
      multiline: true,
    });
    if (!reason || reason.trim().length < 8) return;
    setBusy("report");
    const r = await reportListing(token, listing.id, reason.trim());
    setBusy("");
    setMessage(r.ok ? r.data.message || "Segnalazione inviata." : r.message);
  }

  if (!slug) {
    return (
      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <p className="text-crema/60">Manca lo slug della scheda. Torna alla <SmartLink href={page("/bacheca/")} className="text-caramel underline">bacheca</SmartLink>.</p>
      </section>
    );
  }

  if (!listing && !err) {
    return (
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div className="h-64 animate-pulse rounded-[2rem] bg-roast/60 ring-1 ring-sand/10" />
      </section>
    );
  }

  if (err || !listing) {
    return (
      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <p className="font-display text-3xl text-crema/80">Disco non trovato</p>
        <p className="mt-2 text-crema/55">{err || "Questa scheda non è disponibile."}</p>
        <SmartLink href={page("/bacheca/")} className="mt-6 inline-flex rounded-full bg-crema/8 px-5 py-2.5 text-sm font-semibold ring-1 ring-sand/25">
          Torna alla bacheca
        </SmartLink>
      </section>
    );
  }

  const accent = listing.accent || "#d49150";

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <motion.article
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[2rem] bg-gradient-to-b from-caramel/15 to-roast ring-1 ring-sand/15 shadow-[0_30px_80px_-30px_rgba(212,145,80,0.35)]"
      >
        {listing.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.bannerUrl} alt="" className="h-40 w-full object-cover sm:h-52" />
        )}
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div
              className="mx-auto flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-sand/25 sm:mx-0 sm:size-32"
              style={{ background: `radial-gradient(circle at 35% 30%, ${accent}66, #1a100c 72%)` }}
            >
              {listing.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.iconUrl} alt="" className="size-full object-cover" />
              ) : listing.kind === "bot" ? (
                <Bot className="size-10 text-sand/70" />
              ) : (
                <Server className="size-10 text-sand/70" />
              )}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">
                {kindLabel(listing.kind)} · {statusLabel(listing.status)}
              </p>
              <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">{listing.name}</h1>
              {listing.tagline && <p className="mt-2 text-lg text-crema/65">{listing.tagline}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {listing.ratingAvg > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-crema/8 px-3 py-1 text-sm ring-1 ring-sand/15">
                    <Star className="size-3.5 fill-caramel text-caramel" />
                    {listing.ratingAvg.toFixed(1)} · {listing.reviewsCount} recensioni
                  </span>
                )}
                {listing.votesMonth > 0 && (
                  <span className="rounded-full bg-crema/8 px-3 py-1 text-sm ring-1 ring-sand/15">{listing.votesMonth} voti questo mese</span>
                )}
                {listing.categories.map((c) => (
                  <span key={c} className="rounded-full bg-crema/6 px-3 py-1 text-xs ring-1 ring-sand/12">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {invite && (
              <a
                href={invite}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink hover:-translate-y-0.5"
              >
                {listing.kind === "bot" ? "Invita il bot" : "Entra nel server"} <ArrowUpRight className="size-4" />
              </a>
            )}
            <SmartLink
              href={page(`/bacheca/vota/?slug=${encodeURIComponent(listing.slug)}&id=${encodeURIComponent(listing.id)}`)}
              className="inline-flex items-center gap-2 rounded-full bg-crema/10 px-5 py-2.5 text-sm font-semibold ring-1 ring-sand/25"
            >
              <ThumbsUp className="size-4" /> Vota
            </SmartLink>
            <button
              type="button"
              disabled={busy === "bump"}
              onClick={onBump}
              className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-5 py-2.5 text-sm font-semibold ring-1 ring-sand/20 disabled:opacity-50"
            >
              Riposiziona
            </button>
            <button
              type="button"
              disabled={busy === "report"}
              onClick={onReport}
              className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-crema/55 hover:text-crema")}
            >
              <Flag className="size-4" /> Segnala
            </button>
            {!token && ready && (
              <button type="button" onClick={login} className="inline-flex items-center gap-2 text-sm text-caramel">
                <LogIn className="size-4" /> Accedi per votare
              </button>
            )}
          </div>

          {message && <p className="mt-4 text-sm text-sand">{message}</p>}

          <div className="mt-10 border-t border-sand/10 pt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Sul retro</p>
            <div className="prose-vc mt-4 text-crema/80 leading-relaxed">
              {listing.description ? <DiscordContent text={listing.description} /> : <p className="text-crema/45">Nessuna descrizione.</p>}
            </div>
            {listing.visitorNotes && (
              <div className="mt-6 rounded-2xl bg-crema/5 p-4 ring-1 ring-sand/12">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">Note per i visitatori</p>
                <p className="mt-2 text-sm text-crema/70">{listing.visitorNotes}</p>
              </div>
            )}
            {listing.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {listing.tags.map((t) => (
                  <span key={t} className="rounded-full bg-mocha/60 px-3 py-1 text-xs text-crema/60 ring-1 ring-sand/12">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.article>
    </section>
  );
}

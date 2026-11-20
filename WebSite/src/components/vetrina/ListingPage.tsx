"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  CalendarDays,
  Check,
  Flag,
  Globe,
  Handshake,
  Hash,
  Languages,
  Link2,
  LogIn,
  RefreshCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  SOCIAL_LABELS,
  bumpListing,
  kindLabel,
  labelOf,
  listingFeatures,
  loadBoardsConfig,
  loadListing,
  reportListing,
  statusLabel,
  type BoardListing,
  type BoardsConfig,
  type SocialKey,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/cn";
import { promptDialog, showToast } from "@/components/ui";
import { SmartLink } from "@/components/SmartLink";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { Stars } from "./ListingCard";
import { ListingReviews } from "./ListingReviews";

function useSlug() {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSlug(new URLSearchParams(location.search).get("slug") || "");
    } catch {
      setSlug("");
    }
  }, []);
  return slug;
}

const fmt = (n: number) => n.toLocaleString("it-IT");

/** Scheda completa di un server o bot in vetrina. */
export function ListingPage() {
  const slug = useSlug();
  const { ready, token, login } = useAuth();
  const [listing, setListing] = useState<BoardListing | null>(null);
  const [cfg, setCfg] = useState<BoardsConfig | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ready || !slug) return;
    let alive = true;
    setErr("");
    void loadListing(slug, token).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setErr(r.message);
        setListing(null);
        return;
      }
      setListing(r.data.listing);
    });
    void loadBoardsConfig("", token).then((c) => alive && c && setCfg(c));
    return () => {
      alive = false;
    };
  }, [ready, slug, token]);

  useEffect(() => {
    if (listing?.name) document.title = `${listing.name} · Vetrina · Vinili & Caffè`;
  }, [listing?.name]);

  if (slug === null || (slug && !listing && !err)) {
    return (
      <>
        <div className="h-80 animate-pulse bg-roast/60" />
        <div className="mx-auto mt-8 grid max-w-6xl gap-6 px-6 lg:grid-cols-[1fr_20rem]">
          <div className="h-80 animate-pulse rounded-3xl bg-roast/50" />
          <div className="h-80 animate-pulse rounded-3xl bg-roast/50" />
        </div>
      </>
    );
  }

  if (!slug || err || !listing) {
    return (
      <>
        <section className="mx-auto max-w-xl px-6 py-24 text-center">
          <p className="font-display text-5xl text-crema/85">Disco non trovato</p>
          <p className="mt-3 text-crema/55">{err || "Questa scheda non c’è, oppure non è (ancora) pubblica."}</p>
          <SmartLink href={page("/vetrina/")} className="mt-8 inline-flex items-center gap-2 rounded-full bg-crema/8 px-5 py-2.5 font-semibold ring-1 ring-sand/25">
            <ArrowLeft className="size-4" /> Torna alla vetrina
          </SmartLink>
        </section>
      </>
    );
  }

  const l = listing;
  const accent = /^#[0-9a-f]{6}$/i.test(l.accent || "") ? l.accent : "#d99a5b";
  const invite = l.kind === "bot" ? l.botInviteUrl : l.inviteUrl;
  const feats = listingFeatures(l);
  const members = Number(l.stats?.members) || 0;
  const socials = Object.entries(l.socials || {}).filter(([, v]) => v) as [SocialKey, string][];
  const KindIcon = l.kind === "bot" ? Bot : Server;
  const voteHref = page(`/vetrina/vota/?slug=${encodeURIComponent(l.slug)}&id=${encodeURIComponent(l.id)}`);

  async function onBump() {
    if (!token) return login();
    setBusy("bump");
    const r = await bumpListing(token, l.id);
    setBusy("");
    showToast(r.ok ? r.data.message || "Scheda riposizionata in cima." : r.message, !r.ok);
    if (r.ok && r.data.listing) setListing({ ...l, ...r.data.listing });
  }

  async function onReport() {
    if (!token) return login();
    const reason = await promptDialog({
      title: "Segnala questa scheda",
      inputLabel: "Motivo",
      placeholder: "Cosa non va? (contenuti, link, regole…)",
      multiline: true,
    });
    if (!reason || reason.trim().length < 8) return;
    setBusy("report");
    const r = await reportListing(token, l.id, reason.trim());
    setBusy("");
    showToast(r.ok ? r.data.message || "Segnalazione inviata allo staff." : r.message, !r.ok);
  }

  async function onShare() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      showToast("Link della scheda copiato");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Non riesco a copiare il link", true);
    }
  }

  return (
    <>
      {/* ─── copertina ─── */}
      <header className="relative isolate overflow-hidden pb-10 pt-8 sm:pt-10">
        <div className="absolute inset-0 -z-10">
          {l.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.bannerUrl} alt="" className="size-full scale-105 object-cover opacity-60 blur-[2px]" />
          ) : (
            <div className="size-full" style={{ background: `radial-gradient(70% 90% at 20% 0%, ${accent}aa, transparent 65%), radial-gradient(60% 80% at 100% 20%, ${accent}44, transparent 60%)` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-espresso/40 via-espresso/75 to-espresso" />
        </div>
        <div className="mx-auto max-w-6xl px-6">
          <SmartLink href={page(l.kind === "bot" ? "/vetrina/bot/" : "/vetrina/server/")} className="inline-flex items-center gap-1.5 text-sm text-crema/60 hover:text-crema">
            <ArrowLeft className="size-4" /> {l.kind === "bot" ? "Tutti i bot" : "Tutti i server"}
          </SmartLink>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end"
          >
            <div
              className="relative size-32 shrink-0 overflow-hidden rounded-[2rem] shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)] ring-4 ring-espresso/80 sm:size-40"
              style={{ background: `radial-gradient(circle at 35% 30%, ${accent}88, #1a110c 75%)` }}
            >
              {l.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.iconUrl} alt="" className="size-full object-cover" />
              ) : (
                <KindIcon className="absolute inset-0 m-auto size-14 text-sand/70" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-ember">
                <KindIcon className="size-4" /> {kindLabel(l.kind)}
                {l.status !== "approved" && <span className="rounded-full bg-crema/10 px-2 py-0.5 tracking-wider text-crema/80">{statusLabel(l.status)}</span>}
                {l.nsfw && <span className="rounded-full bg-[#a83a2c] px-2 py-0.5 tracking-wider text-crema">18+</span>}
              </p>
              <h1 className="mt-2 font-display text-5xl font-semibold leading-[1.02] text-crema sm:text-6xl">{l.name}</h1>
              {l.tagline && <p className="mt-3 max-w-2xl text-lg text-crema/70">{l.tagline}</p>}
              {l.stats?.guildTag ? (
                <span
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-bold"
                  style={{ background: `${l.stats.guildTagBadgeColor || accent}33`, color: l.stats.guildTagBadgeColor || "#f4e9d8" }}
                  title="Tag del server su Discord"
                >
                  {l.stats.guildTagBadgeUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.stats.guildTagBadgeUrl} alt="" className="size-4" />
                  ) : null}
                  {l.stats.guildTag}
                </span>
              ) : null}
            </div>
          </motion.div>

          {/* azioni */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {invite ? (
              <a
                href={invite}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-bold text-ink shadow-[0_18px_40px_-18px_rgba(240,180,110,0.9)] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
              >
                {l.kind === "bot" ? "Aggiungi il bot" : "Entra nel server"} <ArrowUpRight className="size-4" />
              </a>
            ) : null}
            <SmartLink href={voteHref} className="inline-flex items-center gap-2 rounded-full bg-crema/12 px-5 py-3 font-semibold text-crema ring-1 ring-sand/30 backdrop-blur transition hover:bg-crema/18">
              <ThumbsUp className="size-4" /> Vota
            </SmartLink>
            <IconAction label="Riposiziona in cima" onClick={onBump} disabled={busy === "bump"}>
              <RefreshCcw className={cn("size-4", busy === "bump" && "animate-spin")} />
            </IconAction>
            <IconAction label={copied ? "Copiato" : "Copia link"} onClick={onShare}>
              {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            </IconAction>
            <IconAction label="Segnala" onClick={onReport} disabled={busy === "report"}>
              <Flag className="size-4" />
            </IconAction>
            {!token && ready && (
              <button type="button" onClick={login} className="inline-flex items-center gap-2 text-sm text-ember">
                <LogIn className="size-4" /> Accedi per votare e recensire
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── numeri ─── */}
      <div className="mx-auto mt-8 grid max-w-6xl grid-cols-2 gap-3 px-6 sm:grid-cols-4">
        {l.kind !== "bot" && members > 0 ? (
          <StatTile icon={<Users />} label="Membri" value={fmt(members)} />
        ) : (
          <StatTile icon={<Sparkles />} label="Punteggio" value={l.score > 0 ? fmt(Math.round(l.score)) : "—"} hint="posizione in vetrina" />
        )}
        <StatTile
          icon={<Star />}
          label="Valutazione"
          value={l.reviewsCount > 0 ? l.ratingAvg.toFixed(1) : "—"}
          hint={l.reviewsCount > 0 ? `${fmt(l.reviewsCount)} recensioni` : "ancora nessuna"}
        />
        <StatTile icon={<ThumbsUp />} label="Voti del mese" value={fmt(l.votesMonth || 0)} />
        <StatTile icon={<RefreshCcw />} label="Riposizionamenti" value={fmt(l.bumps7d || 0)} hint="ultimi 7 giorni" />
      </div>

      {/* ─── contenuto ─── */}
      <div className="mx-auto mt-8 grid max-w-6xl gap-6 px-6 pb-28 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <Panel title="Descrizione">
            {l.description ? (
              <DiscordContent text={l.description} className="leading-relaxed text-crema/80 [&_a]:text-ember [&_a]:underline" />
            ) : (
              <p className="text-crema/45">Il proprietario non ha ancora scritto una descrizione.</p>
            )}
            {l.visitorNotes && (
              <div className="mt-6 rounded-2xl bg-caramel/10 p-4 ring-1 ring-caramel/25">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">Note per chi entra</p>
                <p className="mt-2 text-sm leading-relaxed text-crema/75">{l.visitorNotes}</p>
              </div>
            )}
          </Panel>
          <ListingReviews listing={l} onAggregate={(avg, count) => setListing((prev) => (prev ? { ...prev, ratingAvg: avg, reviewsCount: count } : prev))} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Panel title="Informazioni">
            <dl className="space-y-4 text-sm">
              {l.categories.length > 0 && (
                <InfoRow icon={<Sparkles />} label="Categorie">
                  <div className="flex flex-wrap gap-1.5">
                    {l.categories.map((c) => (
                      <SmartLink key={c} href={page(`/vetrina/?category=${encodeURIComponent(c)}`)} className="rounded-full bg-crema/8 px-2.5 py-0.5 capitalize ring-1 ring-sand/15 hover:text-ember">
                        {labelOf(cfg?.categoryLabels, c)}
                      </SmartLink>
                    ))}
                  </div>
                </InfoRow>
              )}
              {l.locales.length > 0 && (
                <InfoRow icon={<Languages />} label="Lingue">
                  {l.locales.map((x) => labelOf(cfg?.localeLabels, x)).join(" · ")}
                </InfoRow>
              )}
              {(feats.acceptsPartnerships || feats.requireVerification || feats.paidFeaturesAvailable) && (
                <InfoRow icon={<BadgeCheck />} label="Caratteristiche">
                  <ul className="space-y-1.5">
                    {feats.acceptsPartnerships && (
                      <li className="flex items-center gap-2">
                        <Handshake className="size-4 text-ember" /> Partnership aperte
                      </li>
                    )}
                    {feats.requireVerification && (
                      <li className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-ember" /> Verifica all’ingresso
                      </li>
                    )}
                    {feats.paidFeaturesAvailable && (
                      <li className="flex items-center gap-2">
                        <Sparkles className="size-4 text-ember" /> Funzioni premium disponibili
                      </li>
                    )}
                  </ul>
                </InfoRow>
              )}
              {(l.siteUrl || socials.length > 0) && (
                <InfoRow icon={<Globe />} label="Link">
                  <div className="flex flex-wrap gap-1.5">
                    {l.siteUrl && (
                      <a href={l.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-crema/8 px-2.5 py-0.5 ring-1 ring-sand/15 hover:text-ember">
                        Sito <ArrowUpRight className="size-3" />
                      </a>
                    )}
                    {socials.map(([k, url]) => (
                      <a key={k} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-crema/8 px-2.5 py-0.5 ring-1 ring-sand/15 hover:text-ember">
                        {SOCIAL_LABELS[k] || k} <ArrowUpRight className="size-3" />
                      </a>
                    ))}
                  </div>
                </InfoRow>
              )}
              {l.createdAt && (
                <InfoRow icon={<CalendarDays />} label="In vetrina">
                  da {timeAgo(l.createdAt)}
                  {l.updatedAt ? <span className="text-crema/40"> · aggiornata {timeAgo(l.updatedAt)}</span> : null}
                </InfoRow>
              )}
            </dl>
            {(l.authorName || l.authorAvatarUrl) && (
              <div className="mt-5 flex items-center gap-3 border-t border-sand/10 pt-4">
                {l.authorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.authorAvatarUrl} alt="" className="size-10 rounded-full object-cover ring-2 ring-sand/20" />
                ) : (
                  <span className="size-10 rounded-full bg-mocha" />
                )}
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-crema/40">Messa in vetrina da</p>
                  <p className="truncate font-semibold text-crema">{l.authorName || "Membro"}</p>
                </div>
              </div>
            )}
          </Panel>

          {l.tags.length > 0 && (
            <Panel title="Tag">
              <div className="flex flex-wrap gap-1.5">
                {l.tags.map((t) => (
                  <SmartLink key={t} href={page(`/vetrina/?tag=${encodeURIComponent(t)}`)} className="inline-flex items-center gap-0.5 rounded-full bg-mocha/70 px-2.5 py-1 text-xs text-crema/65 ring-1 ring-sand/12 transition-colors hover:text-ember hover:ring-ember/40">
                    <Hash className="size-3" />
                    {t}
                  </SmartLink>
                ))}
              </div>
            </Panel>
          )}

          <SmartLink
            href={voteHref}
            className="group block overflow-hidden rounded-3xl p-6 ring-1 ring-caramel/30"
            style={{ background: `radial-gradient(120% 120% at 0% 0%, ${accent}44, transparent 60%), #1a110c` }}
          >
            <p className="font-script text-2xl text-ember">Ti piace?</p>
            <p className="mt-1 font-display text-2xl font-semibold">Dagli una spinta</p>
            <p className="mt-2 text-sm text-crema/60">Ogni voto lo fa salire in vetrina. Puoi votare di nuovo ogni {cfg?.voteCooldownHours || 12} ore.</p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-crema px-4 py-2 text-sm font-bold text-ink transition-transform group-hover:-translate-y-0.5">
              <ThumbsUp className="size-4" /> Vota ora
            </span>
          </SmartLink>
        </aside>
      </div>
    </>
  );
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-12 items-center justify-center rounded-full bg-crema/8 text-crema/75 ring-1 ring-sand/20 backdrop-blur transition hover:bg-crema/14 hover:text-crema disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StatTile({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-roast p-4 ring-1 ring-sand/12">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-crema/45 [&>svg]:size-3.5 [&>svg]:text-caramel">
        {icon} {label}
      </p>
      <p className="mt-2 font-display text-3xl font-semibold lining-nums text-crema">{value}</p>
      {hint ? <p className="text-xs text-crema/40">{hint}</p> : null}
    </div>
  );
}

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-crema/40 [&>svg]:size-3.5">
        {icon} {label}
      </dt>
      <dd className="text-crema/80">{children}</dd>
    </div>
  );
}

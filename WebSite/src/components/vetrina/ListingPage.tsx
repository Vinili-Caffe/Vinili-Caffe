"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { InstagramIcon, TikTokIcon, TwitchIcon, YoutubeIcon } from "@/components/dashboard/guild/LivePlatformIcons";
import { ListingActivity } from "./ListingActivity";
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
  LifeBuoy,
  MonitorSmartphone,
  Rocket,
  Settings2,
  Terminal,
  UserRound,
  Wallet,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  SOCIAL_LABELS,
  bumpListing,
  labelOf,
  listingFeatures,
  localeFlagUrl,
  loadRelatedListings,
  BUMP_COOLDOWN_MS,
  trackListing,
  type TrackEvent,
  type BotCommand,
  type TrafficSource,
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
import { ListingCard, Stars } from "./ListingCard";
import { ListingReviews } from "./ListingReviews";
import { VETRINA_FROM_KEY, VetrinaHeroBg } from "./VetrinaChrome";
import { EMPTY_FILTERS, VetrinaSearch, listHref } from "./VetrinaSearch";

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

const SOCIAL_ICON: Partial<Record<SocialKey, ComponentType<{ className?: string }>>> = {
  website: Globe,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
  twitch: TwitchIcon,
};

/** Da dove arriva la visita: pagina della vetrina da cui si è aperta la scheda, o referrer. */
function visitSource(): { source: TrafficSource; lead?: string } {
  try {
    const raw = sessionStorage.getItem(VETRINA_FROM_KEY);
    sessionStorage.removeItem(VETRINA_FROM_KEY);
    const saved = raw ? (JSON.parse(raw) as { from?: string; at?: number }) : null;
    if (saved?.from && Date.now() - Number(saved.at || 0) < 120_000) {
      const u = new URL(saved.from, location.origin);
      const p = u.pathname.replace(/\/+$/, "/");
      const q = u.searchParams;
      if (q.get("q")) return { source: "search", lead: q.get("q") || "" };
      if (q.get("tag")) return { source: "tag", lead: q.get("tag") || "" };
      if (q.get("category")) return { source: "category", lead: q.get("category") || "" };
      if (/\/vetrina\/$/.test(p)) return { source: "landing" };
      if (/\/vetrina\//.test(p)) return { source: "list" };
      return { source: "site" };
    }
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (!ref) return { source: "direct" };
    return { source: ref.origin === location.origin ? "site" : "external" };
  } catch {
    return { source: "direct" };
  }
}

const deviceOf = (): "desktop" | "mobile" => {
  try {
    return matchMedia("(pointer: coarse)").matches || /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
};

/** Scheda completa di un server o bot in vetrina. */
export function ListingPage() {
  const slug = useSlug();
  const { ready, token, login, user } = useAuth();
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

  /* una visita per scheda aperta (non conta quelle del proprietario) */
  const trackedId = useRef("");
  const isOwner = Boolean(user?.id && listing?.ownerUserId && user.id === listing.ownerUserId);
  useEffect(() => {
    if (!listing?.id || trackedId.current === listing.id) return;
    trackedId.current = listing.id;
    if (isOwner) return;
    trackListing(listing.id, "view", { ...visitSource(), device: deviceOf() }, token);
  }, [listing?.id, isOwner, token]);
  const track = (event: TrackEvent) => {
    if (listing?.id && !isOwner) trackListing(listing.id, event, {}, token);
  };

  useEffect(() => {
    if (listing?.name) document.title = `${listing.name} · Vetrina · Vinili & Caffè`;
  }, [listing?.name]);

  if (slug === null || (slug && !listing && !err)) {
    return (
      <>
        <div className="h-96 animate-pulse bg-roast/60" />
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
  const isBot = l.kind === "bot";
  const serverCount = Number(l.serverCount) || 0;
  const commands = Array.isArray(l.commands) ? l.commands : [];
  const socials = Object.entries(l.socials || {}).filter(([, v]) => v) as [SocialKey, string][];
  const KindIcon = l.kind === "bot" ? Bot : Server;
  const voteHref = page(`/vetrina/vota/?slug=${encodeURIComponent(l.slug)}&id=${encodeURIComponent(l.id)}`);

  async function onBump() {
    if (!token) return login();
    setBusy("bump");
    const r = await bumpListing(token, l.id);
    setBusy("");
    if (!r.ok) {
      showToast(r.message, true);
      const next = (r as { nextBumpAt?: string }).nextBumpAt;
      if (next) setListing({ ...l, bumpedAt: new Date(new Date(next).getTime() - BUMP_COOLDOWN_MS).toISOString() });
      return;
    }
    showToast("Bump fatto: il server è tornato in cima.");
    setListing({ ...l, bumpedAt: r.data.bumpedAt || new Date().toISOString(), bumps7d: (l.bumps7d || 0) + 1 });
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
    track("share");
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
      <header className="relative isolate overflow-hidden pb-10 pt-24 sm:pt-28">
        {l.bannerUrl ? (
          <div className="absolute inset-0 -z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.bannerUrl} alt="" className="size-full object-cover opacity-70" />
            <div
              className="absolute inset-0"
              style={{
                background: [
                  `radial-gradient(ellipse 90% 45% at 50% 0%, ${accent}33, transparent 55%)`,
                  "linear-gradient(to bottom, rgba(14,9,6,0.35) 0%, rgba(14,9,6,0.7) 45%, rgba(14,9,6,0.92) 80%, var(--color-espresso) 100%)",
                ].join(", "),
              }}
            />
          </div>
        ) : (
          <VetrinaHeroBg />
        )}
        <div className="mx-auto max-w-6xl px-6">
          {/* stessa ricerca degli elenchi: porta all'elenco con i filtri scelti */}
          <VetrinaSearch
            deferred
            className="mx-auto mb-8 max-w-2xl"
            kind={l.kind === "bot" ? "bot" : "server"}
            cfg={cfg}
            filters={EMPTY_FILTERS}
            onApply={(f) => {
              window.location.href = listHref(l.kind === "bot" ? "bot" : "server", f);
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10"
          >
            <div className="min-w-0">
              {(l.status !== "approved" || l.nsfw) && (
                <p className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase">
                  {l.status !== "approved" && <span className="rounded-full bg-crema/10 px-2 py-0.5 tracking-wider text-crema/80">{statusLabel(l.status)}</span>}
                  {l.nsfw && <span className="rounded-full bg-[#a83a2c] px-2 py-0.5 tracking-wider text-crema">18+</span>}
                </p>
              )}
              {/* logo affiancato al nome */}
              <div className="flex items-center gap-4 sm:gap-6">
                <div
                  className="relative size-20 shrink-0 overflow-hidden rounded-[1.5rem] shadow-[0_24px_50px_-22px_rgba(0,0,0,0.9)] ring-4 ring-espresso/80 sm:size-28 sm:rounded-[1.75rem]"
                  style={{ background: `radial-gradient(circle at 35% 30%, ${accent}88, #1a110c 75%)` }}
                >
                  {l.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.iconUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <KindIcon className="absolute inset-0 m-auto size-10 text-sand/70" />
                  )}
                </div>
                <h1 className="min-w-0 font-display text-4xl font-semibold leading-[1.02] text-crema sm:text-6xl">{l.name}</h1>
              </div>
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
                onClick={() => track("invite")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-bold text-ink shadow-[0_18px_40px_-18px_rgba(240,180,110,0.9)] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
              >
                {l.kind === "bot" ? "Aggiungi il bot" : "Entra nel server"} <ArrowUpRight className="size-4" />
              </a>
            ) : null}
            <IconAction label={copied ? "Copiato" : "Copia link"} onClick={onShare}>
              {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            </IconAction>
            <IconAction label="Segnala" onClick={onReport} disabled={busy === "report"}>
              <Flag className="size-4" />
            </IconAction>
            {isOwner ? (
              <SmartLink
                href={page(`/vetrina/modifica/?id=${encodeURIComponent(l.id)}`)}
                className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-4 py-3 text-sm font-semibold text-crema/85 ring-1 ring-sand/25 transition hover:bg-crema/15"
              >
                <Settings2 className="size-4" /> Gestisci
              </SmartLink>
            ) : null}
            {!token && ready && (
              <button type="button" onClick={login} className="inline-flex items-center gap-2 text-sm text-ember">
                <LogIn className="size-4" /> Accedi per votare e recensire
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── numeri ─── */}
      <div className={cn("mx-auto mt-8 grid max-w-6xl grid-cols-2 gap-3 px-6", (isBot ? serverCount > 0 : members > 0) && "sm:grid-cols-3")}>
        {!isBot && members > 0 ? <StatTile icon={<Users />} label="Membri" value={fmt(members)} /> : null}
        {isBot && serverCount > 0 ? <StatTile icon={<Server />} label="Server" value={fmt(serverCount)} /> : null}
        <ActionTile
          icon={<ThumbsUp />}
          label="Voti del mese"
          value={fmt(l.votesMonth || 0)}
          action={
            <SmartLink href={voteHref} onClick={() => track("vote")} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-bold text-ink transition hover:-translate-y-0.5">
              <ThumbsUp className="size-4" /> Vota
            </SmartLink>
          }
        />
        {/* bump: solo per i server, una volta ogni 2 ore */}
        {!isBot ? <BumpTile listing={l} busy={busy === "bump"} onBump={() => void onBump()} /> : null}
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
          {isBot && commands.length > 0 ? <CommandsPanel commands={commands} prefix={l.prefix || ""} /> : null}
          <RelatedListings listing={l} token={token} />
          <ListingReviews listing={l} onAggregate={(avg, count) => setListing((prev) => (prev ? { ...prev, ratingAvg: avg, reviewsCount: count } : prev))} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Panel title="Informazioni">
            <dl className="space-y-4 text-sm">
              {l.categories.length > 0 && (
                <InfoRow icon={<Sparkles />} label="Categorie">
                  <div className="flex flex-wrap gap-1.5">
                    {l.categories.map((c) => (
                      <SmartLink key={c} href={page(`/vetrina/${isBot ? "bot" : "server"}/?category=${encodeURIComponent(c)}`)} className="rounded-full bg-crema/8 px-2.5 py-0.5 capitalize ring-1 ring-sand/15 hover:text-ember">
                        {labelOf(cfg?.categoryLabels, c)}
                      </SmartLink>
                    ))}
                  </div>
                </InfoRow>
              )}
              {l.locales.length > 0 && (
                <InfoRow icon={<Languages />} label="Lingue">
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {l.locales.map((x) => {
                      const flag = localeFlagUrl(x);
                      return (
                        <span key={x} className="inline-flex items-center gap-1.5">
                          {flag ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={flag} alt="" width={20} height={15} loading="lazy" className="h-[15px] w-5 rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
                          ) : null}
                          {labelOf(cfg?.localeLabels, x)}
                        </span>
                      );
                    })}
                  </div>
                </InfoRow>
              )}
              {((!isBot && (feats.acceptsPartnerships || feats.requireVerification)) || feats.paidFeaturesAvailable || (isBot && (feats.webInterface || feats.userInstallable || feats.paidTier))) && (
                <InfoRow icon={<BadgeCheck />} label="Caratteristiche">
                  <ul className="space-y-1.5">
                    {isBot && (
                      <li className="flex items-center gap-2">
                        <Wallet className="size-4 text-ember" /> {feats.paidTier === "paid" ? "A pagamento" : "Gratis"}
                      </li>
                    )}
                    {isBot && feats.webInterface && (
                      <li className="flex items-center gap-2">
                        <MonitorSmartphone className="size-4 text-ember" /> Interfaccia web
                      </li>
                    )}
                    {isBot && feats.userInstallable && (
                      <li className="flex items-center gap-2">
                        <UserRound className="size-4 text-ember" /> Installabile come app utente
                      </li>
                    )}
                    {!isBot && feats.acceptsPartnerships && (
                      <li className="flex items-center gap-2">
                        <Handshake className="size-4 text-ember" /> Partnership aperte
                      </li>
                    )}
                    {!isBot && feats.requireVerification && (
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
              {(l.siteUrl || socials.length > 0 || (isBot && l.supportUrl)) && (
                <InfoRow icon={<Globe />} label="Link">
                  <div className="flex flex-wrap gap-1.5">
                    {isBot && l.supportUrl && (
                      <a href={l.supportUrl} onClick={() => track("link")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 py-0.5 pl-2 pr-2.5 ring-1 ring-sand/15 hover:text-ember">
                        <LifeBuoy className="size-3.5" /> Supporto <ArrowUpRight className="size-3 opacity-60" />
                      </a>
                    )}
                    {l.siteUrl && (
                      <a href={l.siteUrl} onClick={() => track("link")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 py-0.5 pl-2 pr-2.5 ring-1 ring-sand/15 hover:text-ember">
                        <Globe className="size-3.5" /> Sito <ArrowUpRight className="size-3 opacity-60" />
                      </a>
                    )}
                    {socials
                      /* il sito è già sopra: niente doppione */
                      .filter(([k, url]) => !(k === "website" && url === l.siteUrl))
                      .map(([k, url]) => {
                        const Icon = SOCIAL_ICON[k] || Link2;
                        return (
                          <a key={k} href={url} onClick={() => track("link")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 py-0.5 pl-2 pr-2.5 ring-1 ring-sand/15 hover:text-ember">
                            <Icon className="size-3.5" /> {SOCIAL_LABELS[k] || k} <ArrowUpRight className="size-3 opacity-60" />
                          </a>
                        );
                      })}
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
                  <p className="text-xs uppercase tracking-[0.2em] text-crema/40">{isBot ? "Sviluppatore" : "Messa in vetrina da"}</p>
                  <p className="truncate font-semibold text-crema">{l.authorName || "Membro"}</p>
                </div>
              </div>
            )}
          </Panel>

          {!isBot && <ListingActivity listingId={l.id} token={token} />}

          {isBot && (l.prefix || serverCount > 0) && (
            <Panel title="Dettagli">
              <dl className="space-y-4 text-sm">
                {l.prefix ? (
                  <InfoRow icon={<Terminal />} label="Prefisso">
                    <code className="rounded-md bg-espresso/70 px-2 py-0.5 font-mono text-base text-crema ring-1 ring-sand/15">{l.prefix}</code>
                  </InfoRow>
                ) : null}
                {serverCount > 0 ? (
                  <InfoRow icon={<Server />} label="Server">
                    <span className="font-display text-xl font-semibold tabular-nums text-crema">{fmt(serverCount)}</span>
                  </InfoRow>
                ) : null}
              </dl>
            </Panel>
          )}

          {isBot && l.supportServer ? (
            <Panel title="Server di supporto">
              <SmartLink href={page(`/vetrina/scheda/?slug=${encodeURIComponent(l.supportServer.slug)}`)} className="group flex items-center gap-3 rounded-2xl bg-espresso/50 p-3 ring-1 ring-sand/12 transition hover:ring-ember/40">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-mocha">
                  {l.supportServer.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.supportServer.iconUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Server className="size-5 text-crema/60" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-crema group-hover:text-ember">{l.supportServer.name}</span>
                  {l.supportServer.members ? <span className="text-xs text-crema/50">{fmt(l.supportServer.members)} membri</span> : null}
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-crema/40 group-hover:text-ember" />
              </SmartLink>
            </Panel>
          ) : null}

          {l.tags.length > 0 && (
            <Panel title="Tag">
              <div className="flex flex-wrap gap-1.5">
                {l.tags.map((t) => (
                  <SmartLink key={t} href={page(`/vetrina/${isBot ? "bot" : "server"}/?tag=${encodeURIComponent(t)}`)} className="inline-flex items-center gap-0.5 rounded-full bg-mocha/70 px-2.5 py-1 text-xs text-crema/65 ring-1 ring-sand/12 transition-colors hover:text-ember hover:ring-ember/40">
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

/** Comandi del bot, filtrabili per tipo. */
function CommandsPanel({ commands, prefix }: { commands: BotCommand[]; prefix: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const shown = commands.filter((c) => !q || `${c.name} ${c.description}`.toLowerCase().includes(q.toLowerCase()));
  const list = open || q ? shown : shown.slice(0, 8);
  const label = (c: BotCommand) => (c.type === "prefix" ? `${prefix}${c.name}` : c.type === "slash" ? `/${c.name}` : c.name);
  return (
    <Panel
      title={`Comandi (${commands.length})`}
      right={
        commands.length > 6 ? (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca un comando…"
            aria-label="Cerca un comando"
            className="h-9 w-40 rounded-full bg-espresso/60 px-3.5 text-sm text-crema ring-1 ring-sand/15 outline-none placeholder:text-crema/30 focus:ring-caramel/50 sm:w-52"
          />
        ) : undefined
      }
    >
      <ul className="divide-y divide-sand/10">
        {list.map((c, i) => (
          <li key={`${c.type}-${c.name}-${i}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
            <code className="shrink-0 font-mono text-sm font-semibold text-ember">
              {label(c)}
              {c.usage ? <span className="font-normal text-crema/45"> {c.usage}</span> : null}
            </code>
            <span className="min-w-0 text-sm text-crema/70">{c.description || <span className="text-crema/35">—</span>}</span>
            {c.type === "user" || c.type === "message" ? (
              <span className="shrink-0 rounded-full bg-crema/8 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-crema/50 sm:ml-auto">
                {c.type === "user" ? "menu utente" : "menu messaggio"}
              </span>
            ) : null}
          </li>
        ))}
        {!list.length ? <li className="py-6 text-center text-sm text-crema/45">Nessun comando trovato.</li> : null}
      </ul>
      {!q && shown.length > 8 ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 text-sm font-semibold text-crema/60 hover:text-ember">
          {open ? "Mostra meno" : `Mostra tutti (${shown.length})`}
        </button>
      ) : null}
    </Panel>
  );
}

/** Card dei numeri con il pulsante dentro (Vota, Bump). */
function ActionTile({ icon, label, value, hint, action }: { icon: ReactNode; label: string; value: string; hint?: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-2xl bg-roast p-4 ring-1 ring-sand/12 sm:flex-row">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-crema/45 [&>svg]:size-3.5 [&>svg]:text-caramel">
          {icon} {label}
        </p>
        <p className="mt-2 font-display text-3xl font-semibold lining-nums text-crema">{value}</p>
        {hint ? <p className="text-xs text-crema/40">{hint}</p> : null}
      </div>
      <div className="shrink-0 sm:self-end">{action}</div>
    </div>
  );
}

/** Card del bump (solo server): un bump ogni 2 ore, con il tempo che manca. */
function BumpTile({ listing, busy, onBump }: { listing: BoardListing; busy: boolean; onBump: () => void }) {
  const until = listing.bumpedAt ? new Date(listing.bumpedAt).getTime() + BUMP_COOLDOWN_MS : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [until]);
  const left = Math.max(0, until - now);
  const mins = Math.ceil(left / 60000);
  const wait = left ? (mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`) : "";
  return (
    <ActionTile
      icon={<Rocket />}
      label="Bump"
      value={(listing.bumps7d || 0).toLocaleString("it-IT")}
      hint={wait ? `prossimo tra ${wait}` : "ultimi 7 giorni · anche con /bump su Discord"}
      action={
        <button
          type="button"
          onClick={onBump}
          disabled={busy || Boolean(wait)}
          title={wait ? `Il prossimo bump tra ${wait}` : "Riporta il server in cima all'elenco"}
          className="inline-flex items-center gap-2 rounded-full bg-crema/12 px-5 py-2.5 text-sm font-semibold text-crema ring-1 ring-sand/30 transition hover:bg-crema/18 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Rocket className={cn("size-4", busy && "animate-pulse")} /> {wait ? "In attesa" : "Bump"}
        </button>
      }
    />
  );
}

/** Bot in vetrina presenti nel server (o server in vetrina che usano il bot). */
function RelatedListings({ listing, token }: { listing: BoardListing; token?: string | null }) {
  const [items, setItems] = useState<BoardListing[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadRelatedListings(listing.id, token).then((r) => alive && setItems(r.ok ? r.data.items || [] : []));
    return () => {
      alive = false;
    };
  }, [listing.id, token]);
  if (!items || !items.length) return null;
  const isBot = listing.kind === "bot";
  return (
    <Panel title={isBot ? "Server che lo usano" : "Bot di questo server"} right={<span className="text-sm text-crema/45">{items.length} in vetrina</span>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.slice(0, 6).map((it, i) => (
          <ListingCard key={it.id} listing={it} i={i} />
        ))}
      </div>
    </Panel>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, BarChart3, Bot, Cable, LogIn, Palette, Rocket, Server, ShieldAlert, Star, Terminal, Webhook, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadMyListing, type BoardListing, type ListingTransfer } from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { GlobalSaveBar } from "@/components/dashboard/guild/bits";
import { VetrinaHeroBg } from "../VetrinaChrome";

const AnalyticsTab = dynamic(() => import("./AnalyticsTab").then((m) => m.AnalyticsTab), { ssr: false, loading: () => <TabSkeleton /> });
const OwnershipTab = dynamic(() => import("./OwnershipTab").then((m) => m.OwnershipTab), { ssr: false, loading: () => <TabSkeleton /> });
const SubmitListing = dynamic(() => import("@/components/bacheca/SubmitListing").then((m) => m.SubmitListing), { ssr: false, loading: () => <TabSkeleton /> });
const VoteHookTab = dynamic(() => import("./VoteHookTab").then((m) => m.VoteHookTab), { ssr: false, loading: () => <TabSkeleton /> });
const ReviewHookTab = dynamic(() => import("./ReviewHookTab").then((m) => m.ReviewHookTab), { ssr: false, loading: () => <TabSkeleton /> });
const BumpHookTab = dynamic(() => import("./BumpHookTab").then((m) => m.BumpHookTab), { ssr: false, loading: () => <TabSkeleton /> });
const CommandsTab = dynamic(() => import("./CommandsTab").then((m) => m.CommandsTab), { ssr: false, loading: () => <TabSkeleton /> });
const ConnectionsTab = dynamic(() => import("./ConnectionsTab").then((m) => m.ConnectionsTab), { ssr: false, loading: () => <TabSkeleton /> });

type TabId = "statistiche" | "voti" | "bump" | "recensioni" | "comandi" | "connessioni" | "aspetto" | "proprieta";
type Group = { label: string; tabs: { id: TabId; label: string; icon: LucideIcon }[] };
/* schede bot: niente premi nel server, ma comandi e server di supporto */
const BOT_GROUPS: Group[] = [
  { label: "Panoramica", tabs: [{ id: "statistiche", label: "Statistiche", icon: BarChart3 }] },
  {
    label: "Il tuo bot",
    tabs: [
      { id: "comandi", label: "Comandi e API", icon: Terminal },
      { id: "connessioni", label: "Connessioni", icon: Cable },
    ],
  },
  { label: "La tua pagina", tabs: [{ id: "aspetto", label: "Aspetto", icon: Palette }] },
  { label: "Zona pericolosa", tabs: [{ id: "proprieta", label: "Trasferisci o elimina", icon: ShieldAlert }] },
];
const GROUPS: Group[] = [
  { label: "Panoramica", tabs: [{ id: "statistiche", label: "Statistiche", icon: BarChart3 }] },
  {
    label: "Premi nel server",
    tabs: [
      { id: "voti", label: "Voti", icon: Webhook },
      { id: "bump", label: "Bump", icon: Rocket },
      { id: "recensioni", label: "Recensioni", icon: Star },
    ],
  },
  { label: "La tua pagina", tabs: [{ id: "aspetto", label: "Aspetto", icon: Palette }] },
  { label: "Zona pericolosa", tabs: [{ id: "proprieta", label: "Trasferisci o elimina", icon: ShieldAlert }] },
];
const TAB_IDS = [...GROUPS, ...BOT_GROUPS].flatMap((g) => g.tabs.map((t) => t.id));

function normalizeTab(raw: string): TabId {
  if (raw === "api") return "voti";
  return TAB_IDS.includes(raw as TabId) ? (raw as TabId) : "statistiche";
}

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-64 animate-pulse rounded-xl bg-crema/6" />
      <div className="h-72 animate-pulse rounded-3xl bg-crema/5" />
    </div>
  );
}

function useQuery() {
  const [q, setQ] = useState<{ id: string; tab: TabId } | null>(null);
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      setQ({ id: p.get("id") || "", tab: normalizeTab(p.get("tab") || "") });
    } catch {
      setQ({ id: "", tab: "statistiche" });
    }
  }, []);
  return q;
}

/** Gestione scheda: server (stats, voti, recensioni…) o bot (stats, comandi, connessioni…), aspetto e proprietà. */
export function ManageListing() {
  const q = useQuery();
  const { ready, token, login } = useAuth();
  const [tab, setTab] = useState<TabId>("statistiche");
  const [listing, setListing] = useState<BoardListing | null>(null);
  const [transfer, setTransfer] = useState<ListingTransfer | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (q) setTab(q.tab);
  }, [q]);

  useEffect(() => {
    if (!ready || !token || !q?.id) return;
    let alive = true;
    void loadMyListing(token, q.id).then((r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.message);
      setListing(r.data.listing);
      setTransfer(r.data.transfer || null);
    });
    return () => {
      alive = false;
    };
  }, [ready, token, q?.id]);

  /* vecchi link ?tab=api → voti */
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      if (p.get("tab") !== "api") return;
      const u = new URL(location.href);
      u.searchParams.set("tab", "voti");
      history.replaceState(history.state, "", u.toString());
      setTab("voti");
    } catch {
      /* niente */
    }
  }, []);

  const go = (id: TabId) => {
    setTab(id);
    try {
      const u = new URL(location.href);
      u.searchParams.set("tab", id);
      history.replaceState(history.state, "", u.toString());
    } catch {
      /* niente */
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (ready && !token) {
    return (
      <Centered>
        <p className="font-display text-4xl">Gestisci la tua scheda</p>
        <p className="mt-2 text-crema/60">Accedi con Discord per vedere statistiche e impostazioni.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </Centered>
    );
  }
  if (q && !q.id) return <Centered>Nessuna scheda indicata.</Centered>;
  if (err) {
    return (
      <Centered>
        <p className="text-ember">{err}</p>
        <SmartLink href={page("/vetrina/le-mie/")} className="mt-5 inline-flex rounded-full bg-crema/10 px-5 py-2.5 text-sm font-semibold ring-1 ring-sand/25">
          Le mie schede
        </SmartLink>
      </Centered>
    );
  }
  const isBot = listing?.kind === "bot";
  const groups = isBot ? BOT_GROUPS : GROUPS;
  /* una tab dell'altro tipo (es. voti su un bot) torna alle statistiche */
  const shown: TabId = listing && !groups.some((g) => g.tabs.some((t) => t.id === tab)) ? "statistiche" : tab;

  return (
    <>
      <header className="relative isolate overflow-hidden pb-8 pt-24 sm:pt-28">
        {listing?.bannerUrl ? (
          <div className="absolute inset-0 -z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={listing.bannerUrl} alt="" className="size-full object-cover opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-b from-espresso/50 via-espresso/80 to-espresso" />
          </div>
        ) : (
          <VetrinaHeroBg />
        )}
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 pb-28 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="-mt-20 min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl bg-roast/90 p-5 ring-1 ring-sand/15 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-mocha ring-1 ring-sand/20">
                {listing?.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={listing.iconUrl} alt="" className="size-full object-cover" />
                ) : isBot ? (
                  <Bot className="size-6 text-crema/60" />
                ) : (
                  <Server className="size-6 text-crema/60" />
                )}
              </span>
              <div className="min-w-0">
                <p className="line-clamp-2 font-display text-xl font-semibold leading-tight">{listing?.name || "…"}</p>
                {listing?.slug && listing.status === "approved" ? (
                  <SmartLink href={page(`/vetrina/scheda/?slug=${encodeURIComponent(listing.slug)}`)} className="mt-0.5 inline-flex items-center gap-1 text-xs text-crema/50 hover:text-ember">
                    Vedi la scheda <ArrowUpRight className="size-3" />
                  </SmartLink>
                ) : null}
              </div>
            </div>

            <nav data-lenis-prevent className="mt-5 flex min-w-0 gap-1.5 overflow-x-auto pb-1 lg:block lg:space-y-5 lg:overflow-visible lg:pb-0" aria-label="Sezioni">
              {groups.map((g) => (
                <div key={g.label} className="contents lg:block">
                  <p className="hidden px-3 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/40 lg:block">{g.label}</p>
                  {g.tabs.map((t) => {
                    const Icon = t.icon;
                    const active = shown === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => go(t.id)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors lg:w-full",
                          active ? "text-crema" : "text-crema/55 hover:bg-crema/5 hover:text-crema",
                          t.id === "proprieta" && !active && "text-[#f0a493]/70 hover:text-[#f0a493]",
                        )}
                      >
                        {active ? <motion.span layoutId="vc-manage-tab" className="absolute inset-0 rounded-xl bg-crema/10 ring-1 ring-sand/15" transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : null}
                        <Icon className="relative size-4" />
                        <span className="relative whitespace-nowrap">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 pt-2">
          {!listing || !token ? (
            <TabSkeleton />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={shown} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                {shown === "statistiche" && <AnalyticsTab listingId={listing.id} token={token} />}
                {shown === "voti" && <VoteHookTab listing={listing} token={token} />}
                {shown === "bump" && <BumpHookTab listing={listing} token={token} />}
                {shown === "recensioni" && <ReviewHookTab listing={listing} token={token} />}
                {shown === "comandi" && <CommandsTab listing={listing} token={token} />}
                {shown === "connessioni" && <ConnectionsTab listing={listing} token={token} />}
                {shown === "aspetto" && <SubmitListing editId={listing.id} />}
                {shown === "proprieta" && <OwnershipTab listing={listing} token={token} transfer={transfer} onTransfer={setTransfer} />}
              </motion.div>
            </AnimatePresence>
          )}
        </section>
      </div>
      {shown !== "aspetto" ? <GlobalSaveBar /> : null}
    </>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <section className="mx-auto max-w-xl px-6 pb-28 pt-40 text-center">{children}</section>;
}

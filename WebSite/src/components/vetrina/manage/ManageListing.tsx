"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, BarChart3, ExternalLink, LogIn, Palette, Server, ShieldAlert, Webhook, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadMyListing, type BoardListing, type ListingTransfer } from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui";
import { SmartLink } from "@/components/SmartLink";
import { GlobalSaveBar } from "@/components/dashboard/guild/bits";
import { VetrinaHeroBg } from "../VetrinaChrome";

const AnalyticsTab = dynamic(() => import("./AnalyticsTab").then((m) => m.AnalyticsTab), { ssr: false, loading: () => <TabSkeleton /> });
const OwnershipTab = dynamic(() => import("./OwnershipTab").then((m) => m.OwnershipTab), { ssr: false, loading: () => <TabSkeleton /> });
const SubmitListing = dynamic(() => import("@/components/bacheca/SubmitListing").then((m) => m.SubmitListing), { ssr: false, loading: () => <TabSkeleton /> });
const VetrinaVotesPanel = dynamic(() => import("@/components/dashboard/guild/community/BumpVotesPanel").then((m) => m.VetrinaVotesPanel), {
  ssr: false,
  loading: () => <TabSkeleton />,
});

type TabId = "statistiche" | "api" | "aspetto" | "proprieta";
const GROUPS: { label: string; tabs: { id: TabId; label: string; icon: LucideIcon }[] }[] = [
  { label: "Panoramica", tabs: [{ id: "statistiche", label: "Statistiche", icon: BarChart3 }] },
  {
    label: "La tua pagina",
    tabs: [
      { id: "aspetto", label: "Aspetto", icon: Palette },
      { id: "api", label: "API e voti", icon: Webhook },
    ],
  },
  { label: "Zona pericolosa", tabs: [{ id: "proprieta", label: "Trasferisci o elimina", icon: ShieldAlert }] },
];
const TAB_IDS = GROUPS.flatMap((g) => g.tabs.map((t) => t.id));

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
      const tab = (p.get("tab") || "") as TabId;
      setQ({ id: p.get("id") || "", tab: TAB_IDS.includes(tab) ? tab : "statistiche" });
    } catch {
      setQ({ id: "", tab: "statistiche" });
    }
  }, []);
  return q;
}

/** Pagina di gestione di una scheda server: statistiche, aspetto, voti nel server, proprietà. */
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
  if (listing && listing.kind === "bot") {
    return (
      <Centered>
        <p className="font-display text-3xl">Per ora la gestione completa è solo per i server</p>
        <SmartLink href={page(`/vetrina/invia/?edit=${encodeURIComponent(listing.id)}`)} className="mt-5 inline-flex rounded-full bg-crema px-5 py-2.5 text-sm font-bold text-ink">
          Modifica il bot
        </SmartLink>
      </Centered>
    );
  }

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
        {/* barra laterale */}
        <aside className="-mt-20 min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl bg-roast/90 p-5 ring-1 ring-sand/15 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-mocha ring-1 ring-sand/20">
                {listing?.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={listing.iconUrl} alt="" className="size-full object-cover" />
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
              {GROUPS.map((g) => (
                <div key={g.label} className="contents lg:block">
                  <p className="hidden px-3 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/40 lg:block">{g.label}</p>
                  {g.tabs.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
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

        {/* contenuto */}
        <section className="min-w-0 pt-2">
          {!listing || !token ? (
            <TabSkeleton />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                {tab === "statistiche" && <AnalyticsTab listingId={listing.id} token={token} />}
                {tab === "aspetto" && <SubmitListing editId={listing.id} />}
                {tab === "api" && <ApiTab listing={listing} token={token} />}
                {tab === "proprieta" && <OwnershipTab listing={listing} token={token} transfer={transfer} onTransfer={setTransfer} />}
              </motion.div>
            </AnimatePresence>
          )}
        </section>
      </div>
      {/* la tab Aspetto ha già la sua barra delle modifiche non salvate */}
      {tab !== "aspetto" ? <GlobalSaveBar /> : null}
    </>
  );
}

function ApiTab({ listing, token }: { listing: BoardListing; token: string }) {
  return (
    <div className="space-y-6">
      <div className="border-b border-sand/10 pb-6">
        <h2 className="font-display text-4xl font-semibold">API e voti</h2>
        <p className="mt-1 max-w-2xl text-crema/55">
          Quando qualcuno vota la scheda, il bot di Vinili &amp; Caffè può ringraziarlo in un canale del tuo server e dargli un ruolo per qualche ora.
        </p>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-espresso/60 px-4 py-3 text-sm text-crema/65 ring-1 ring-sand/12">
        Serve il bot nel server e il modulo <span className="font-semibold text-crema">Voti</span> acceso in dashboard.
        <SmartLink href={page(`/dashboard/guild/?id=${encodeURIComponent(listing.discordId)}`)} className="inline-flex items-center gap-1 font-semibold text-ember hover:underline">
          Apri la dashboard <ExternalLink className="size-3.5" />
        </SmartLink>
      </p>
      <VetrinaVotesPanel guildId={listing.discordId} token={token} onToast={(m, e) => showToast(m, Boolean(e))} />
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <section className="mx-auto max-w-xl px-6 pb-28 pt-40 text-center">{children}</section>;
}

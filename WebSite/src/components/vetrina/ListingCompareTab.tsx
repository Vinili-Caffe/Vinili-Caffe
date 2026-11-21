"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Check, Columns2, Plus, Search, Server, X } from "lucide-react";
import {
  kindLabel,
  listingFeatures,
  loadCompareListings,
  loadListings,
  loadSimilarListings,
  type BoardListing,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui";
import { SmartLink } from "@/components/SmartLink";
import { Stars, listingHref } from "./ListingCard";

const MAX_PEERS = 2;

type Metric =
  | { id: string; title: string; hint: string; kind: "number"; value: (l: BoardListing) => number | string }
  | { id: string; title: string; hint: string; kind: "bool"; value: (l: BoardListing) => boolean | null };

function metricsFor(kind: BoardListing["kind"]): Metric[] {
  const base: Metric[] = [
    {
      id: "votes",
      title: "Voti del mese",
      hint: "Attività recente: più voti di solito significano più utenti",
      kind: "number",
      value: (l) => l.votesMonth || 0,
    },
    {
      id: "rating",
      title: "Punteggio recensioni",
      hint: "Media delle recensioni degli utenti",
      kind: "number",
      value: (l) => (l.reviewsCount > 0 ? l.ratingAvg.toFixed(1) : "—"),
    },
    {
      id: "langs",
      title: "Lingue supportate",
      hint: "Quante lingue dichiara la scheda",
      kind: "number",
      value: (l) => (l.locales?.length || 0),
    },
    {
      id: "paidTier",
      title: "Funzioni a pagamento",
      hint: "Se il progetto è gratuito, a pagamento, o ha opzioni premium",
      kind: "number",
      value: (l) => {
        const f = listingFeatures(l);
        if (f.paidTier === "paid") return "A pagamento";
        if (f.paidTier === "free") return "Gratuito";
        if (f.paidFeaturesAvailable) return "Opzioni premium";
        return "Non specificato";
      },
    },
    {
      id: "paidAvail",
      title: "Extra a pagamento",
      hint: "Funzioni o perk sbloccabili con pagamenti opzionali",
      kind: "bool",
      value: (l) => {
        const f = listingFeatures(l);
        if (typeof f.paidFeaturesAvailable === "boolean") return f.paidFeaturesAvailable;
        return null;
      },
    },
    {
      id: "verify",
      title: "Verifica in ingresso",
      hint: "Richiede una verifica prima di usare il server o il bot",
      kind: "bool",
      value: (l) => {
        const f = listingFeatures(l);
        return typeof f.requireVerification === "boolean" ? f.requireVerification : null;
      },
    },
    {
      id: "partner",
      title: "Accetta partnership",
      hint: "Aperto a collaborazioni e partnership",
      kind: "bool",
      value: (l) => {
        const f = listingFeatures(l);
        return typeof f.acceptsPartnerships === "boolean" ? f.acceptsPartnerships : null;
      },
    },
  ];
  if (kind === "bot") {
    base.push(
      {
        id: "servers",
        title: "Server",
        hint: "Quanti server usano questo bot",
        kind: "number",
        value: (l) => (l.serverCount ? l.serverCount.toLocaleString("it-IT") : "—"),
      },
      {
        id: "web",
        title: "Interfaccia web",
        hint: "Ha un pannello o sito per configurarlo",
        kind: "bool",
        value: (l) => {
          const f = listingFeatures(l);
          return typeof f.webInterface === "boolean" ? f.webInterface : null;
        },
      },
      {
        id: "userApp",
        title: "Installabile come app utente",
        hint: "Si può aggiungere anche fuori dai server",
        kind: "bool",
        value: (l) => {
          const f = listingFeatures(l);
          return typeof f.userInstallable === "boolean" ? f.userInstallable : null;
        },
      },
    );
  } else {
    base.push(
      {
        id: "members",
        title: "Membri",
        hint: "Membri del server (ultimo aggiornamento)",
        kind: "number",
        value: (l) => (l.stats?.members ? l.stats.members.toLocaleString("it-IT") : "—"),
      },
      {
        id: "bumps",
        title: "Bump (7 giorni)",
        hint: "Quante volte è stato bumpato di recente",
        kind: "number",
        value: (l) => l.bumps7d || 0,
      },
    );
  }
  return base;
}

function syncWithParam(peerIds: string[]) {
  try {
    const u = new URL(location.href);
    if (peerIds.length) u.searchParams.set("with", peerIds.join(","));
    else u.searchParams.delete("with");
    history.replaceState(history.state, "", u.toString());
  } catch {
    /* ignore */
  }
}

function BoolCell({ v }: { v: boolean | null }) {
  if (v === null) return <span className="text-crema/35">—</span>;
  return v ? (
    <span className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/30">
      <Check className="size-4" strokeWidth={2.5} />
    </span>
  ) : (
    <span className="inline-flex size-7 items-center justify-center rounded-full bg-crema/5 text-crema/35 ring-1 ring-sand/15">
      <X className="size-3.5" />
    </span>
  );
}

function MiniHead({ listing: l, onRemove }: { listing: BoardListing; onRemove?: () => void }) {
  const KindIcon = l.kind === "bot" ? Bot : Server;
  return (
    <div className="relative flex min-w-[8.5rem] flex-col items-center gap-2 px-2 text-center">
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-0.5 -top-0.5 rounded-full bg-espresso p-1 text-crema/50 ring-1 ring-sand/20 hover:text-crema"
          aria-label="Rimuovi dal confronto"
        >
          <X className="size-3" />
        </button>
      ) : null}
      <SmartLink
        href={listingHref(l)}
        className="flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-crema/8 ring-1 ring-sand/20"
      >
        {l.iconUrl ? (
           
          <img src={l.iconUrl} alt="" className="size-full object-cover" />
        ) : (
          <KindIcon className="size-6 text-sand/60" />
        )}
      </SmartLink>
      <SmartLink href={listingHref(l)} className="line-clamp-2 text-sm font-semibold text-crema hover:text-ember">
        {l.name}
      </SmartLink>
    </div>
  );
}

function readWithFromUrl(excludeId: string) {
  try {
    return String(new URL(location.href).searchParams.get("with") || "")
      .split(/[,+\s]+/)
      .map((s) => s.trim())
      .filter((id) => id && id !== excludeId)
      .slice(0, MAX_PEERS);
  } catch {
    return [] as string[];
  }
}

/** Tab Confronta stile top.gg: matrice metriche + suggerimenti + ricerca. */
export function ListingCompareTab({
  listing,
  token,
  initialPeerIds = [],
}: {
  listing: BoardListing;
  token?: string | null;
  initialPeerIds?: string[];
}) {
  const seedIds = useMemo(() => {
    const fromProp = initialPeerIds.filter((id) => id && id !== listing.id).slice(0, MAX_PEERS);
    return fromProp.length ? fromProp : readWithFromUrl(listing.id);
  }, [listing.id, initialPeerIds.join(",")]);  

  const [peers, setPeers] = useState<BoardListing[]>([]);
  const [peerIds, setPeerIds] = useState<string[]>(seedIds);
  const [loading, setLoading] = useState(false);
  const [similar, setSimilar] = useState<BoardListing[]>([]);
  const [q, setQ] = useState("");
  const [searchHits, setSearchHits] = useState<BoardListing[]>([]);
  const [searching, setSearching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const columns = useMemo(() => [listing, ...peers], [listing, peers]);
  const rows = useMemo(() => metricsFor(listing.kind), [listing.kind]);
  const otherLabel = listing.kind === "bot" ? "bot" : "server";

  const setPeersFromIds = useCallback(
    (ids: string[]) => {
      const next = [...new Set(ids.filter((id) => id && id !== listing.id))].slice(0, MAX_PEERS);
      setPeerIds(next);
      syncWithParam(next);
    },
    [listing.id],
  );

  useEffect(() => {
    setPeerIds(seedIds);
    syncWithParam(seedIds);
  }, [listing.id, seedIds.join(",")]);  

  useEffect(() => {
    let alive = true;
    void loadSimilarListings(listing.id, token).then((r) => {
      if (!alive) return;
      setSimilar(r.ok ? (r.data.items || []).filter((x) => x.kind === listing.kind && x.id !== listing.id) : []);
    });
    return () => {
      alive = false;
    };
  }, [listing.id, listing.kind, token]);

  useEffect(() => {
    if (!peerIds.length) {
      setPeers([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void loadCompareListings([listing.id, ...peerIds], token).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok) {
        showToast(r.message || "Confronto non disponibile", true);
        setPeers([]);
        return;
      }
      const byId = new Map((r.data.listings || []).map((x) => [x.id, x]));
      setPeers(peerIds.map((id) => byId.get(id)).filter(Boolean) as BoardListing[]);
    });
    return () => {
      alive = false;
    };
  }, [listing.id, peerIds.join(","), token]);  

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSearchHits([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = window.setTimeout(() => {
      const kind = listing.kind === "bot" ? "bot" : "server";
      void loadListings({ kind, q: term, perPage: 8, sort: "score" }, token).then((pageData) => {
        if (!alive) return;
        setSearching(false);
        const exclude = new Set([listing.id, ...peerIds]);
        setSearchHits((pageData?.listings || []).filter((x) => !exclude.has(x.id)));
      });
    }, 280);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, listing.id, listing.kind, peerIds.join(","), token]);  

  function addPeer(id: string) {
    if (peerIds.includes(id) || id === listing.id) return showToast("Già nel confronto", true);
    if (peerIds.length >= MAX_PEERS) return showToast("Massimo 3 schede", true);
    setPeersFromIds([...peerIds, id]);
    setAddOpen(false);
    setQ("");
    setSearchHits([]);
    showToast("Scheda aggiunta al confronto");
  }

  function removePeer(id: string) {
    setPeersFromIds(peerIds.filter((x) => x !== id));
    showToast("Scheda tolta dal confronto");
  }

  return (
    <div className="space-y-10">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-caramel">
          <Columns2 className="size-3.5" /> Confronta
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-crema sm:text-4xl">
          Confronta {listing.name} con altri {otherLabel}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-crema/55">
          Metriche e funzioni affiancate, come su top.gg: i creatori aggiornano i dettagli dalla scheda.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[1.5rem] bg-roast/80 ring-1 ring-sand/12">
        <div className="min-w-[28rem]">
          {/* header colonne */}
          <div
            className="grid items-end gap-3 border-b border-sand/10 px-4 py-5 sm:px-6"
            style={{ gridTemplateColumns: `minmax(11rem,1.2fr) repeat(${columns.length}, minmax(7.5rem,1fr))${peerIds.length < MAX_PEERS ? " minmax(7rem,0.85fr)" : ""}` }}
          >
            <div className="pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-crema/35">Metriche</div>
            {columns.map((col, i) => (
              <MiniHead key={col.id} listing={col} onRemove={i > 0 ? () => removePeer(col.id) : undefined} />
            ))}
            {peerIds.length < MAX_PEERS ? (
              <button
                type="button"
                onClick={() => setAddOpen((v) => !v)}
                className="mx-auto flex min-w-[7rem] flex-col items-center gap-2 rounded-2xl bg-crema/5 px-3 py-4 text-center text-xs font-semibold text-ember ring-1 ring-ember/25 transition hover:bg-ember/10"
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-ember/15 ring-1 ring-ember/30">
                  <Plus className="size-6" />
                </span>
                Aggiungi {otherLabel}
              </button>
            ) : null}
          </div>

          {loading ? <div className="h-40 animate-pulse bg-crema/5" /> : null}

          {!loading
            ? rows.map((row) => (
                <div
                  key={row.id}
                  className="grid items-center gap-3 border-b border-sand/8 px-4 py-4 last:border-0 sm:px-6"
                  style={{ gridTemplateColumns: `minmax(11rem,1.2fr) repeat(${columns.length}, minmax(7.5rem,1fr))${peerIds.length < MAX_PEERS ? " minmax(7rem,0.85fr)" : ""}` }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-crema">{row.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-crema/40">{row.hint}</p>
                  </div>
                  {columns.map((col) => (
                    <div key={col.id} className="flex justify-center text-center text-base font-semibold tabular-nums text-crema">
                      {row.kind === "bool" ? <BoolCell v={row.value(col) as boolean | null} /> : <span>{row.value(col)}</span>}
                    </div>
                  ))}
                  {peerIds.length < MAX_PEERS ? <div /> : null}
                </div>
              ))
            : null}
        </div>
      </div>

      {addOpen || peerIds.length < MAX_PEERS ? (
        <div className="rounded-[1.5rem] bg-espresso/70 p-5 ring-1 ring-sand/12 sm:p-6">
          <p className="text-sm font-semibold text-crema">Cerca un altro {otherLabel}</p>
          <p className="mt-1 text-xs text-crema/45">Scrivi il nome o lo slug e aggiungilo al confronto (max {MAX_PEERS + 1} schede).</p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-crema/40" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setAddOpen(true);
              }}
              onFocus={() => setAddOpen(true)}
              placeholder={`Cerca ${otherLabel}…`}
              className="w-full rounded-2xl bg-roast py-3 pl-10 pr-4 text-sm text-crema outline-none ring-1 ring-sand/20 placeholder:text-crema/35 focus:ring-ember/40"
            />
          </div>
          {addOpen && (searching || searchHits.length > 0 || q.trim().length >= 2) ? (
            <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {searching ? <li className="px-2 py-3 text-sm text-crema/45">Cerco…</li> : null}
              {!searching && q.trim().length >= 2 && !searchHits.length ? (
                <li className="px-2 py-3 text-sm text-crema/45">Nessun risultato</li>
              ) : null}
              {searchHits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => addPeer(hit.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-crema/8"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-crema/8 ring-1 ring-sand/15">
                      {hit.iconUrl ? (
                         
                        <img src={hit.iconUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <Bot className="size-4 text-sand/50" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-crema">{hit.name}</span>
                      <span className="block truncate text-xs text-crema/45">{kindLabel(hit.kind)} · {hit.votesMonth || 0} voti/mese</span>
                    </span>
                    <span className="text-xs font-bold text-ember">Aggiungi</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {similar.length > 0 ? (
        <div>
          <h3 className="font-display text-2xl font-semibold text-crema">Come si posiziona</h3>
          <p className="mt-1 text-sm text-crema/50">Schede affini: confrontale affianco a questa.</p>
          <ul className="mt-5 space-y-3">
            {similar.slice(0, 6).map((s) => {
              const already = peerIds.includes(s.id);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-4 rounded-2xl bg-roast/70 p-4 ring-1 ring-sand/12"
                >
                  <SmartLink href={listingHref(s)} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-crema/8 ring-1 ring-sand/15">
                      {s.iconUrl ? (
                         
                        <img src={s.iconUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <Server className="size-5 text-sand/50" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-crema">{s.name}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-crema/45">
                        {s.reviewsCount > 0 ? (
                          <>
                            <Stars value={s.ratingAvg} className="text-[0.7rem]" /> {s.ratingAvg.toFixed(1)}
                          </>
                        ) : (
                          kindLabel(s.kind)
                        )}
                        <span>· {s.votesMonth || 0} voti/mese</span>
                      </span>
                      {s.tagline ? <span className="mt-1 line-clamp-1 text-xs text-crema/40">{s.tagline}</span> : null}
                    </span>
                  </SmartLink>
                  <button
                    type="button"
                    disabled={already || peerIds.length >= MAX_PEERS}
                    onClick={() => addPeer(s.id)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-bold transition",
                      already
                        ? "bg-crema/8 text-crema/40"
                        : "bg-gradient-to-r from-caramel to-ember text-ink hover:-translate-y-0.5",
                    )}
                  >
                    {already ? "Nel confronto" : "Confronta"}
                  </button>
                </li>
              );
            })}
            <li className="rounded-2xl bg-espresso/60 p-4 ring-1 ring-sand/12">
              <p className="font-semibold text-crema">Un altro {otherLabel}</p>
              <p className="mt-1 text-xs text-crema/45">Usa la ricerca qui sopra, oppure esplora la vetrina.</p>
              <SmartLink
                href={page(`/vetrina/${listing.kind === "bot" ? "bot" : "server"}/`)}
                className="mt-3 inline-flex text-sm font-semibold text-ember hover:underline"
              >
                Apri l’elenco
              </SmartLink>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

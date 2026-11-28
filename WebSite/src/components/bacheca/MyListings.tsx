"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowRightLeft, Bell, CircleCheck, CircleDashed, Clock, FolderHeart, Link2, LogIn, Pause, Pencil, Plus, RefreshCw, Server, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  deleteMyListing,
  loadClaimableServers,
  loadIncomingTransfers,
  loadMine,
  refreshMyListing,
  regenerateListingInvite,
  respondListingTransfer,
  statusLabel,
  type BoardListing,
  type ClaimableGuild,
  type IncomingTransfer,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "../SmartLink";
import { confirmDialog, showToast } from "@/components/ui";
import { ShowMoreButton } from "@/components/ui/ShowMore";
import { ListingCard, ListingCardSkeleton } from "@/components/vetrina/ListingCard";
import { FollowedListings } from "@/components/vetrina/FollowedListings";

const LIST_INITIAL = 24;
const LIST_STEP = 24;

const STATUS_STYLE: Record<string, { icon: LucideIcon; cls: string; hint: string }> = {
  draft: { icon: CircleDashed, cls: "bg-crema/8 text-crema/70 ring-sand/20", hint: "Completa la scheda e mandala in revisione." },
  pending: { icon: Clock, cls: "bg-caramel/15 text-ember ring-caramel/35", hint: "Lo staff la sta controllando." },
  approved: { icon: CircleCheck, cls: "bg-[#5f9a6a]/20 text-[#a7d8b0] ring-[#5f9a6a]/40", hint: "È in vetrina: ricordati di fare il bump ogni tanto." },
  rejected: { icon: XCircle, cls: "bg-[#a83a2c]/20 text-[#f0a493] ring-[#a83a2c]/40", hint: "Correggi e rimandala in revisione." },
  suspended: { icon: Pause, cls: "bg-[#a83a2c]/15 text-[#f0a493] ring-[#a83a2c]/35", hint: "Sospesa dallo staff." },
};

function MiniAction({ icon: Icon, label, busy, disabled, onClick }: { icon: LucideIcon; label: string; busy?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-3 py-1 text-xs font-semibold text-crema/85 ring-1 ring-sand/20 transition hover:bg-crema/15 disabled:opacity-50"
    >
      <Icon className={cn("size-3.5", busy && "animate-spin")} /> {label}
    </button>
  );
}

/** Schede che qualcuno vuole passarti: accetta o rifiuta. */
function IncomingTransfers({ token, onAccepted }: { token: string; onAccepted: () => void }) {
  const [items, setItems] = useState<IncomingTransfer[]>([]);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let alive = true;
    void loadIncomingTransfers(token).then((r) => alive && r.ok && setItems(r.data.transfers || []));
    return () => {
      alive = false;
    };
  }, [token]);
  if (!items.length) return null;
  const answer = async (t: IncomingTransfer, accept: boolean) => {
    if (!accept && !(await confirmDialog({ message: `Rifiutare «${t.name}»?` }))) return;
    setBusy(t.listingId);
    const r = await respondListingTransfer(token, t.listingId, accept);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || (accept ? "Scheda accettata" : "Richiesta rifiutata"));
    setItems((prev) => prev.filter((x) => x.listingId !== t.listingId));
    if (accept) onAccepted();
  };
  return (
    <div className="mb-8 space-y-3">
      {items.map((t) => (
        <div key={t.listingId} className="flex flex-wrap items-center gap-4 rounded-2xl bg-caramel/10 p-4 ring-1 ring-caramel/30">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-mocha">
            {t.iconUrl ? (
               
              <img src={t.iconUrl} alt="" className="size-full object-cover" />
            ) : (
              <ArrowRightLeft className="size-5 text-crema/60" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-crema">
              {t.fromName || "Un utente"} vuole passarti «{t.name}»
            </p>
            <p className="text-xs text-crema/55">Per accettare devi poter gestire il server su Discord.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy === t.listingId} onClick={() => void answer(t, false)} className="rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-50">
              Rifiuta
            </button>
            <button type="button" disabled={busy === t.listingId} onClick={() => void answer(t, true)} className="rounded-full bg-caramel px-4 py-2 text-sm font-bold text-ink disabled:opacity-50">
              Accetta
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function claimableGuild(g: ClaimableGuild) {
  if (g.claimable === true) return true;
  if (g.claimable === false) return false;
  if (g.alreadyListed) return false;
  if (typeof g.botPresent === "boolean") return g.botPresent;
  return true;
}

/** Server Discord dove puoi aprire subito una scheda. */
function ClaimableBanner({ token }: { token: string }) {
  const [guilds, setGuilds] = useState<ClaimableGuild[]>([]);
  useEffect(() => {
    let alive = true;
    void loadClaimableServers(token).then((r) => {
      if (!alive || !r.ok) return;
      setGuilds((r.data.guilds || []).filter(claimableGuild));
    });
    return () => {
      alive = false;
    };
  }, [token]);
  if (!guilds.length) return null;
  const shown = guilds.slice(0, 4);
  const extra = guilds.length - shown.length;
  return (
    <div className="mb-10 rounded-3xl bg-roast p-5 ring-1 ring-caramel/30 sm:p-6">
      <p className="font-display text-2xl font-semibold text-crema">
        Hai {guilds.length} {guilds.length === 1 ? "server" : "server"} da mettere in vetrina
      </p>
      <p className="mt-1 text-sm text-crema/55">Il bot è già nel server: basta inviare la scheda.</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {shown.map((g) => (
          <li key={g.id} className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-3 py-1.5 text-sm font-semibold text-crema ring-1 ring-sand/15">
            {g.iconUrl ? (
               
              <img src={g.iconUrl} alt="" className="size-6 rounded-full object-cover" />
            ) : (
              <Server className="size-4 text-crema/50" />
            )}
            <span className="max-w-[10rem] truncate">{g.name}</span>
          </li>
        ))}
        {extra > 0 ? <li className="self-center text-xs text-crema/45">+{extra} altri</li> : null}
      </ul>
      <SmartLink href={page("/vetrina/invia/")} className="mt-4 inline-flex items-center gap-2 rounded-full bg-caramel px-5 py-2.5 text-sm font-bold text-ink">
        Metti in vetrina <ArrowRight className="size-4" />
      </SmartLink>
    </div>
  );
}

/** Le tue schede: bozze, in revisione, pubblicate. */
export function MyListings() {
  const { ready, token, login } = useAuth();
  const [list, setList] = useState<BoardListing[] | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  const [visible, setVisible] = useState(LIST_INITIAL);

  useEffect(() => {
    setVisible(LIST_INITIAL);
  }, [list?.length]);

  const refresh = useCallback(() => {
    if (!ready || !token) return;
    setErr("");
    void loadMine(token).then((r) => {
      if (!r.ok) {
        setErr(r.message);
        setList([]);
        return;
      }
      setList(r.data.listings || []);
    });
  }, [ready, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Sostituisce una scheda aggiornata senza ricaricare l'elenco. */
  const replace = (next?: BoardListing) => {
    if (next?.id) setList((prev) => (prev ? prev.map((l) => (l.id === next.id ? next : l)) : prev));
  };

  if (ready && !token) {
    return (
      <section className="mx-auto max-w-xl px-6 pb-28 text-center">
        <FolderHeart className="mx-auto size-12 text-sand/40" />
        <p className="mt-4 font-display text-4xl">Le tue schede</p>
        <p className="mt-2 text-crema/60">Accedi con Discord per vedere bozze, revisioni e schede pubblicate.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-caramel px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </section>
    );
  }

  const counts = (list || []).reduce<Record<string, number>>((acc, l) => ((acc[l.status] = (acc[l.status] || 0) + 1), acc), {});

  return (
    <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {list ? (
          Object.entries(counts).map(([s, n]) => {
            const st = STATUS_STYLE[s] || STATUS_STYLE.draft;
            const Icon = st.icon;
            return (
              <span key={s} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1", st.cls)}>
                <Icon className="size-4" /> {n} {statusLabel(s, n).toLowerCase()}
              </span>
            );
          })
        ) : (
          <span className="h-7 w-48 animate-pulse rounded-full bg-crema/[0.07]" aria-label="Caricamento" />
        )}
        <SmartLink href={page("/vetrina/invia/")} className="ml-auto inline-flex items-center gap-2 rounded-full bg-caramel px-4 py-2 text-sm font-bold text-ink">
          <Plus className="size-4" /> Nuova scheda
        </SmartLink>
      </div>

      {err && <p className="mb-4 text-sm text-ember">{err}</p>}

      {token ? <IncomingTransfers token={token} onAccepted={refresh} /> : null}

      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="size-5 text-caramel" />
          <h2 className="font-display text-2xl font-semibold text-crema">Schede che segui</h2>
        </div>
        <FollowedListings />
      </div>

      {token ? <ClaimableBanner token={token} /> : null}

      {!list && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <ListingCardSkeleton key={i} i={i} />
          ))}
        </div>
      )}

      {list && list.length === 0 && (
        <div className="rounded-3xl border border-dashed border-sand/25 p-10 text-center">
          <p className="font-display text-3xl text-crema/85">Nessuna scheda, per ora</p>
          <p className="mt-2 text-crema/55">Il tuo server o il tuo bot meritano uno spazio sugli scaffali.</p>
          <SmartLink href={page("/vetrina/invia/")} className="mt-6 inline-flex items-center gap-2 rounded-full bg-crema px-5 py-2.5 font-bold text-ink">
            <Plus className="size-4" /> Metti in vetrina
          </SmartLink>
        </div>
      )}

      {list && list.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(list.length > LIST_INITIAL ? list.slice(0, visible) : list).map((item, i) => {
              const st = STATUS_STYLE[item.status] || STATUS_STYLE.draft;
              const Icon = st.icon;
              const reason = item.moderation?.rejectReason;
              return (
                <div key={item.id} className="flex flex-col gap-2">
                  <ListingCard listing={item} i={i} />
                  <div className={cn("rounded-2xl px-4 py-3 text-sm ring-1", st.cls)}>
                    <div className="flex items-center gap-2 font-semibold">
                      <Icon className="size-4" /> {statusLabel(item.status)}
                      {item.status !== "suspended" && (
                        <SmartLink
                          href={page(`/vetrina/modifica/?id=${encodeURIComponent(item.id)}`)}
                          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold opacity-80 hover:opacity-100"
                        >
                          <Pencil className="size-3.5" /> Gestisci
                        </SmartLink>
                      )}
                      {(item.status === "draft" || item.status === "rejected") && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          className="inline-flex items-center gap-1 text-xs font-semibold opacity-80 hover:opacity-100 disabled:opacity-40"
                          onClick={async () => {
                            if (!token || !(await confirmDialog({ message: "Eliminare questa scheda? Non si può annullare.", danger: true }))) return;
                            setBusyId(item.id);
                            const r = await deleteMyListing(token, item.id);
                            setBusyId("");
                            if (!r.ok) {
                              setErr(r.message);
                              showToast(r.message, true);
                              return;
                            }
                            showToast("Scheda eliminata.");
                            refresh();
                          }}
                        >
                          <Trash2 className="size-3.5" /> Elimina
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs opacity-80">{item.status === "rejected" && reason ? `Motivo: ${reason}` : st.hint}</p>
                    {item.kind === "server" && item.status !== "suspended" && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-current/15 pt-2.5">
                        <MiniAction
                          icon={RefreshCw}
                          label="Aggiorna da Discord"
                          busy={busyId === `${item.id}:refresh`}
                          disabled={Boolean(busyId)}
                          onClick={async () => {
                            if (!token) return;
                            setBusyId(`${item.id}:refresh`);
                            const r = await refreshMyListing(token, item.id);
                            setBusyId("");
                            if (!r.ok) return showToast(r.message, true);
                            showToast(r.data.message || "Dati Discord aggiornati");
                            replace(r.data.listing);
                          }}
                        />
                        <MiniAction
                          icon={Link2}
                          label="Nuovo invito"
                          busy={busyId === `${item.id}:invite`}
                          disabled={Boolean(busyId)}
                          onClick={async () => {
                            if (!token) return;
                            if (!(await confirmDialog({ message: "Creare un nuovo invito permanente per questa scheda? Quello attuale verrà sostituito." }))) return;
                            setBusyId(`${item.id}:invite`);
                            const r = await regenerateListingInvite(token, item.id);
                            setBusyId("");
                            if (!r.ok) return showToast(r.message, true);
                            showToast("Nuovo invito salvato nella scheda");
                            if (r.data.listing) replace(r.data.listing);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ShowMoreButton variant="plain" remaining={list.length > LIST_INITIAL ? Math.max(0, list.length - visible) : 0} onClick={() => setVisible((n) => n + LIST_STEP)} />
        </>
      )}
    </section>
  );
}

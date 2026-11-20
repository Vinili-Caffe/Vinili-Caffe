"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleDashed, Clock, FolderHeart, LogIn, Pause, Plus, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { deleteMyListing, loadMine, statusLabel, type BoardListing } from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "../SmartLink";
import { confirmDialog } from "@/components/ui";
import { ShowMoreButton } from "@/components/ui/ShowMore";
import { ListingCard, ListingCardSkeleton } from "@/components/vetrina/ListingCard";

const LIST_INITIAL = 24;
const LIST_STEP = 24;

const STATUS_STYLE: Record<string, { icon: LucideIcon; cls: string; hint: string }> = {
  draft: { icon: CircleDashed, cls: "bg-crema/8 text-crema/70 ring-sand/20", hint: "Completa la scheda e mandala in revisione." },
  pending: { icon: Clock, cls: "bg-caramel/15 text-ember ring-caramel/35", hint: "Lo staff la sta controllando." },
  approved: { icon: CircleCheck, cls: "bg-[#5f9a6a]/20 text-[#a7d8b0] ring-[#5f9a6a]/40", hint: "È in vetrina: ricordati di riposizionarla." },
  rejected: { icon: XCircle, cls: "bg-[#a83a2c]/20 text-[#f0a493] ring-[#a83a2c]/40", hint: "Correggi e rimandala in revisione." },
  suspended: { icon: Pause, cls: "bg-[#a83a2c]/15 text-[#f0a493] ring-[#a83a2c]/35", hint: "Sospesa dallo staff." },
};

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

  if (ready && !token) {
    return (
      <section className="mx-auto max-w-xl px-6 pb-28 text-center">
        <FolderHeart className="mx-auto size-12 text-sand/40" />
        <p className="mt-4 font-display text-4xl">Le tue schede</p>
        <p className="mt-2 text-crema/60">Accedi con Discord per vedere bozze, revisioni e schede pubblicate.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
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
                <Icon className="size-4" /> {n} {statusLabel(s).toLowerCase()}
              </span>
            );
          })
        ) : (
          <span className="h-7 w-48 animate-pulse rounded-full bg-crema/[0.07]" aria-label="Caricamento" />
        )}
        <SmartLink href={page("/vetrina/invia/")} className="ml-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-bold text-ink">
          <Plus className="size-4" /> Nuova scheda
        </SmartLink>
      </div>

      {err && <p className="mb-4 text-sm text-ember">{err}</p>}

      {!list && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                      {(item.status === "draft" || item.status === "rejected") && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold opacity-80 hover:opacity-100 disabled:opacity-40"
                          onClick={async () => {
                            if (!token || !(await confirmDialog({ message: "Eliminare questa scheda? Non si può annullare.", danger: true }))) return;
                            setBusyId(item.id);
                            const r = await deleteMyListing(token, item.id);
                            setBusyId("");
                            if (!r.ok) setErr(r.message);
                            else refresh();
                          }}
                        >
                          <Trash2 className="size-3.5" /> Elimina
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs opacity-80">{item.status === "rejected" && reason ? `Motivo: ${reason}` : st.hint}</p>
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

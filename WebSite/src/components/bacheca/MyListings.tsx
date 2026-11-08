"use client";

import { useCallback, useEffect, useState } from "react";
import { LogIn, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { deleteMyListing, kindLabel, loadMine, statusLabel, type BoardListing } from "@/lib/boards";
import { page } from "@/lib/site";
import { SmartLink } from "../SmartLink";
import { confirmDialog } from "@/components/ui";
import { ShowMoreButton } from "@/components/ui/ShowMore";
import { VinylCard, VinylCardSkeleton } from "./VinylCard";

const LIST_INITIAL = 24;
const LIST_STEP = 24;

/** I tuoi dischi depositati: bozze, in revisione, pubblicati. */
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
    loadMine(token).then((r) => {
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
      <section className="mx-auto max-w-xl px-6 pb-24 text-center">
        <p className="font-display text-3xl">Le tue schede</p>
        <p className="mt-2 text-crema/60">Accedi per vedere bozze e pubblicazioni.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-crema/55">{list ? `${list.length} schede` : "Caricamento…"}</p>
        <SmartLink href={page("/vetrina/invia/")} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink">
          <Plus className="size-4" /> Nuova
        </SmartLink>
      </div>

      {err && <p className="mb-4 text-sm text-ember">{err}</p>}

      {!list && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <VinylCardSkeleton key={i} i={i} />
          ))}
        </div>
      )}

      {list && list.length === 0 && (
        <p className="text-center text-crema/50">Nessuna scheda ancora. Inviane una dalla vetrina.</p>
      )}

      {list && list.length > 0 && (() => {
        const shown = list.length > LIST_INITIAL ? list.slice(0, visible) : list;
        const remaining = list.length > LIST_INITIAL ? Math.max(0, list.length - visible) : 0;
        return (
        <>
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((item, i) => (
            <div key={item.id} className="relative">
              <VinylCard
                listing={item}
                i={i}
                onOpen={() => {
                  if (item.slug) window.location.href = page(`/vetrina/scheda/?slug=${encodeURIComponent(item.slug)}`);
                }}
              />
              <div className="mt-2 flex items-center justify-between gap-2 px-1 text-xs text-crema/45">
                <span>
                  {kindLabel(item.kind)} · {statusLabel(item.status)}
                </span>
                {(item.status === "draft" || item.status === "rejected") && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    className="inline-flex items-center gap-1 text-ember/80 hover:text-ember disabled:opacity-50"
                    onClick={async () => {
                      if (!token || !(await confirmDialog({ message: "Eliminare questa scheda?", danger: true }))) return;
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
            </div>
          ))}
        </div>
        <ShowMoreButton
          variant="plain"
          remaining={remaining}
          onClick={() => setVisible((n) => n + LIST_STEP)}
        />
        </>
        );
      })()}
    </section>
  );
}

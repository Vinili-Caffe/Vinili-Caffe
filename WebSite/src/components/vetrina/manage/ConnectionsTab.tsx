"use client";

import { useEffect, useState } from "react";
import { Cable, Check, LifeBuoy, Server, Unlink } from "lucide-react";
import { loadSupportCandidates, setSupportServer, type BoardListing, type SupportCandidate } from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/ui";
import { SmartLink } from "@/components/SmartLink";
import { Notice, RowsSkeleton } from "@/components/dashboard/guild/bits";

/** Server di supporto del bot: una scheda server della vetrina che il proprietario gestisce. */
export function ConnectionsTab({ listing, token }: { listing: BoardListing; token: string }) {
  const [list, setList] = useState<SupportCandidate[] | null>(null);
  const [current, setCurrent] = useState(listing.supportListingId || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    void loadSupportCandidates(token, listing.id).then((r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.message);
      setList(r.data.servers || []);
    });
    return () => {
      alive = false;
    };
  }, [token, listing.id]);

  const pick = async (id: string | null) => {
    setBusy(id || "none");
    const r = await setSupportServer(token, listing.id, id);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    setCurrent(id || "");
    showToast(r.data.message || "Salvato");
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-sand/10 pb-6">
        <h2 className="font-display text-4xl font-semibold">Connessioni</h2>
        <p className="mt-1 max-w-2xl text-crema/55">Collega il server di supporto del bot: compare nella scheda, con il link alla sua pagina in vetrina.</p>
      </div>

      <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
        <h3 className="flex items-center gap-2 font-display text-2xl font-semibold">
          <LifeBuoy className="size-5 text-caramel" /> Server di supporto
        </h3>
        <p className="mt-1 text-sm text-crema/60">Puoi scegliere solo server già approvati in vetrina che gestisci su Discord.</p>

        {err ? (
          <div className="mt-4">
            <Notice error>{err}</Notice>
          </div>
        ) : !list ? (
          <div className="mt-4">
            <RowsSkeleton rows={3} />
          </div>
        ) : list.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-espresso/45 p-5 text-sm text-crema/60 ring-1 ring-sand/10">
            Nessun server tuo in vetrina.{" "}
            <SmartLink href={page("/vetrina/invia/")} className="font-semibold text-ember hover:underline">
              Metti in vetrina il server di supporto
            </SmartLink>{" "}
            e, una volta approvato, collegalo qui.
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {list.map((s) => {
              const on = current === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void pick(on ? null : s.id)}
                    className={cn("flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors disabled:opacity-60", on ? "bg-caramel/12 ring-caramel/50" : "bg-espresso/45 ring-sand/12 hover:ring-sand/30")}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-mocha">
                      {s.iconUrl ? (
                         
                        <img src={s.iconUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <Server className="size-5 text-crema/60" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-crema">{s.name}</span>
                      <span className="text-xs text-crema/50">{on ? "Collegato come supporto" : "Collega"}</span>
                    </span>
                    {on ? <Check className="size-5 shrink-0 text-ember" /> : <Cable className="size-4 shrink-0 text-crema/35" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {current ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void pick(null)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-50"
          >
            <Unlink className="size-4" /> Scollega
          </button>
        ) : null}
      </section>
    </div>
  );
}

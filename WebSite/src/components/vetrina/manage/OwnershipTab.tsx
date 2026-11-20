"use client";

import { useState } from "react";
import { ArrowRightLeft, Clock, Search, Trash2, UserRound, X } from "lucide-react";
import {
  cancelListingTransfer,
  deleteMyListing,
  lookupTransferUser,
  requestListingTransfer,
  type BoardListing,
  type ListingTransfer,
  type TransferUser,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { confirmDialog, promptDialog, showToast } from "@/components/ui";

/** Passa la scheda a un altro utente (deve accettare) o eliminala per sempre. */
export function OwnershipTab({
  listing,
  token,
  transfer,
  onTransfer,
}: {
  listing: BoardListing;
  token: string;
  transfer: ListingTransfer | null;
  onTransfer: (t: ListingTransfer | null) => void;
}) {
  const [userId, setUserId] = useState("");
  const [found, setFound] = useState<TransferUser | null>(null);
  const [busy, setBusy] = useState<"" | "lookup" | "send" | "cancel" | "delete">("");
  const [err, setErr] = useState("");

  const lookup = async () => {
    const id = userId.trim();
    if (!/^\d{16,22}$/.test(id)) return setErr("Incolla l'ID Discord dell'utente (solo numeri).");
    setErr("");
    setBusy("lookup");
    const r = await lookupTransferUser(token, id);
    setBusy("");
    if (!r.ok) return setErr(r.message);
    setFound(r.data.user);
  };

  const send = async () => {
    if (!found) return;
    if (!(await confirmDialog({ message: `Proporre a ${found.name} di prendere «${listing.name}»? La scheda resta tua finché non accetta.` }))) return;
    setBusy("send");
    const r = await requestListingTransfer(token, listing.id, found.id);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast(r.data.message || "Richiesta inviata");
    onTransfer(r.data.transfer);
    setFound(null);
    setUserId("");
  };

  const cancel = async () => {
    setBusy("cancel");
    const r = await cancelListingTransfer(token, listing.id);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast("Richiesta annullata");
    onTransfer(null);
  };

  const remove = async () => {
    const typed = await promptDialog({
      title: "Eliminare la scheda?",
      inputLabel: `Scrivi il nome della scheda per confermare: ${listing.name}`,
      placeholder: listing.name,
    });
    if (typed == null) return;
    if (typed.trim().toLowerCase() !== listing.name.trim().toLowerCase()) return showToast("Il nome non corrisponde: niente è stato eliminato.", true);
    setBusy("delete");
    const r = await deleteMyListing(token, listing.id);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    showToast("Scheda eliminata");
    window.location.href = page("/vetrina/le-mie/");
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-sand/10 pb-6">
        <h2 className="font-display text-4xl font-semibold">Proprietà</h2>
        <p className="mt-1 text-crema/55">Passa la scheda a un altro gestore del server, oppure eliminala.</p>
      </div>

      <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
        <h3 className="flex items-center gap-2 font-display text-2xl font-semibold">
          <ArrowRightLeft className="size-5 text-caramel" /> Trasferisci
        </h3>
        <p className="mt-1 text-sm text-crema/60">
          L&apos;altro utente riceve una notifica e ha 7 giorni per accettare da &quot;Le mie schede&quot;. Per accettare deve poter gestire il server su Discord.
        </p>

        {transfer ? (
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-caramel/10 p-4 ring-1 ring-caramel/30">
            {transfer.toAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={transfer.toAvatarUrl} alt="" className="size-11 rounded-full object-cover" />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-full bg-crema/10">
                <UserRound className="size-5 text-crema/60" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-crema">In attesa di {transfer.toName || "risposta"}</p>
              {transfer.expiresAt ? (
                <p className="flex items-center gap-1.5 text-xs text-crema/55">
                  <Clock className="size-3.5" /> scade il {new Date(transfer.expiresAt).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
                </p>
              ) : null}
            </div>
            <button type="button" disabled={busy === "cancel"} onClick={() => void cancel()} className="inline-flex items-center gap-1.5 rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-50">
              <X className="size-4" /> Annulla
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex max-w-xl gap-2">
              <input
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value.replace(/[^\d]/g, ""));
                  setFound(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && void lookup()}
                inputMode="numeric"
                placeholder="ID Discord del nuovo proprietario"
                aria-label="ID Discord del nuovo proprietario"
                className="h-11 min-w-0 flex-1 rounded-xl bg-espresso/60 px-4 text-sm text-crema ring-1 ring-sand/15 outline-none placeholder:text-crema/30 focus:ring-caramel/50"
              />
              <button type="button" disabled={busy === "lookup" || !userId} onClick={() => void lookup()} className="inline-flex items-center gap-1.5 rounded-xl bg-crema/10 px-4 text-sm font-semibold ring-1 ring-sand/25 hover:bg-crema/15 disabled:opacity-50">
                <Search className="size-4" /> Cerca
              </button>
            </div>
            {err ? <p className="text-sm text-ember">{err}</p> : null}
            {found ? (
              <div className="flex max-w-xl flex-wrap items-center gap-4 rounded-2xl bg-espresso/60 p-4 ring-1 ring-sand/15">
                {found.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={found.avatarUrl} alt="" className="size-11 rounded-full object-cover" />
                ) : (
                  <span className="flex size-11 items-center justify-center rounded-full bg-crema/10">
                    <UserRound className="size-5 text-crema/60" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-crema">{found.name}</p>
                  {found.username ? <p className="truncate text-xs text-crema/50">@{found.username}</p> : null}
                </div>
                <button type="button" disabled={busy === "send"} onClick={() => void send()} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-bold text-ink disabled:opacity-50">
                  <ArrowRightLeft className="size-4" /> Proponi
                </button>
              </div>
            ) : null}
            <p className="text-xs text-crema/40">L&apos;ID si copia da Discord: tasto destro sull&apos;utente → Copia ID utente (serve la modalità sviluppatore).</p>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-[#a83a2c]/10 p-6 ring-1 ring-[#a83a2c]/35 sm:p-7">
        <h3 className="flex items-center gap-2 font-display text-2xl font-semibold text-[#f0a493]">
          <Trash2 className="size-5" /> Elimina la scheda
        </h3>
        <p className="mt-1 text-sm text-crema/60">Spariscono la scheda, i voti, le recensioni e le statistiche. Non si può annullare.</p>
        <button type="button" disabled={busy === "delete"} onClick={() => void remove()} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#a83a2c] px-5 py-2.5 text-sm font-bold text-crema hover:bg-[#b84535] disabled:opacity-50">
          <Trash2 className="size-4" /> Elimina per sempre
        </button>
      </section>
    </div>
  );
}

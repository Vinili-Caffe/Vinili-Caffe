"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Bot, Server, ThumbsUp, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  deleteWatch,
  followListing,
  loadWatch,
  type BoardFollow,
} from "@/lib/boards";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { SmartLink } from "@/components/SmartLink";
import { showToast } from "@/components/ui";
import { Toggle } from "@/components/dashboard/guild/bits";

/** Schede seguite: notifiche voto / bump e rimozione. */
export function FollowedListings() {
  const { ready, token, login } = useAuth();
  const [follows, setFollows] = useState<BoardFollow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const reload = async () => {
    if (!token) {
      setFollows([]);
      setLoading(false);
      return;
    }
    const r = await loadWatch(token);
    if (r.ok) setFollows(r.data.follows || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void reload();
     
  }, [ready, token]);

  if (!ready) return null;
  if (!token) {
    return (
      <div className="rounded-3xl bg-roast/70 p-6 text-center ring-1 ring-sand/12">
        <p className="text-crema/70">Accedi per vedere le schede che segui.</p>
        <button type="button" onClick={login} className="mt-4 rounded-full bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white">
          Accedi con Discord
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10" />;
  }

  if (!follows.length) {
    return (
      <div className="rounded-3xl bg-roast/70 p-6 text-center ring-1 ring-sand/12">
        <BellOff className="mx-auto size-8 text-crema/35" />
        <p className="mt-3 font-display text-2xl text-crema/85">Nessuna scheda seguita</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-crema/50">
          Dalla scheda tocca la campanella: ti avvisiamo quando puoi rivotare o c’è un bump.
        </p>
      </div>
    );
  }

  const patch = async (f: BoardFollow, patchOpts: { notifyVote?: boolean; notifyBump?: boolean }) => {
    if (!token) return;
    setBusy(f.id);
    const r = await followListing(token, f.listingId, {
      notifyVote: patchOpts.notifyVote ?? f.notifyVote,
      notifyBump: patchOpts.notifyBump ?? f.notifyBump,
    });
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    setFollows((prev) =>
      prev.map((x) =>
        x.id === f.id
          ? {
              ...x,
              notifyVote: patchOpts.notifyVote ?? x.notifyVote,
              notifyBump: patchOpts.notifyBump ?? x.notifyBump,
            }
          : x,
      ),
    );
  };

  const remove = async (f: BoardFollow) => {
    if (!token) return;
    setBusy(f.id);
    const r = await deleteWatch(token, f.id);
    setBusy("");
    if (!r.ok) return showToast(r.message, true);
    setFollows((prev) => prev.filter((x) => x.id !== f.id));
    showToast("Non la segui più");
  };

  return (
    <div className="space-y-3">
      {follows.map((f) => {
        const KindIcon = f.kind === "bot" ? Bot : Server;
        const href = f.slug
          ? page(`/vetrina/scheda/?slug=${encodeURIComponent(f.slug)}`)
          : page(`/vetrina/scheda/?id=${encodeURIComponent(f.listingId)}`);
        return (
          <div
            key={f.id}
            className={cn(
              "flex flex-col gap-3 rounded-2xl bg-roast/80 p-4 ring-1 ring-sand/12 sm:flex-row sm:items-center",
              busy === f.id && "opacity-70",
            )}
          >
            <SmartLink href={href} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-mocha ring-1 ring-sand/15">
                {f.iconUrl ? (
                   
                  <img src={f.iconUrl} alt="" className="size-full object-cover" />
                ) : (
                  <KindIcon className="size-5 text-crema/55" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-crema">{f.name}</span>
                <span className="text-xs text-crema/45">
                  {f.kind === "bot" ? "Bot" : "Server"}
                  {f.status && f.status !== "approved" ? ` · ${f.status}` : ""}
                </span>
              </span>
            </SmartLink>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <label className="inline-flex items-center gap-2 text-xs text-crema/65">
                <ThumbsUp className="size-3.5 text-caramel" />
                Voto
                <Toggle
                  size="sm"
                  checked={f.notifyVote}
                  onChange={(v) => void patch(f, { notifyVote: v })}
                  label="Notifica voto"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-crema/65">
                <Bell className="size-3.5 text-caramel" />
                Bump
                <Toggle
                  size="sm"
                  checked={f.notifyBump}
                  onChange={(v) => void patch(f, { notifyBump: v })}
                  label="Notifica bump"
                />
              </label>
              <button
                type="button"
                aria-label="Smetti di seguire"
                disabled={busy === f.id}
                onClick={() => void remove(f)}
                className="rounded-full p-2 text-crema/40 hover:bg-crema/8 hover:text-ember"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

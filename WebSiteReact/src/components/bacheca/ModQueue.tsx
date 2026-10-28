"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LogIn, Shield, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { kindLabel, modDecide, modListPending, statusLabel, type BoardListing } from "@/lib/boards";
import { promptDialog } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Coda del cameriere: approva / rifiuta le schede in revisione. */
export function ModQueue() {
  const { ready, token, login } = useAuth();
  const [list, setList] = useState<BoardListing[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(() => {
    if (!ready || !token) return;
    setErr("");
    modListPending(token, "pending").then((r) => {
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
      <section className="mx-auto max-w-md px-6 pb-24 text-center">
        <Shield className="mx-auto size-10 text-caramel" />
        <p className="mt-4 font-display text-3xl">Moderazione bacheca</p>
        <p className="mt-2 text-crema/60">Solo staff. Accedi con Discord.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-semibold text-ink">
          <LogIn className="size-4" /> Accedi
        </button>
      </section>
    );
  }

  async function decide(id: string, decision: "approve" | "reject" | "suspend") {
    if (!token) return;
    let reason = "";
    if (decision !== "approve") {
      reason =
        (await promptDialog({
          title: "Motivo",
          inputLabel: "Motivo (visibile al proprietario)",
          multiline: true,
        })) || "";
      if (decision === "reject" && reason.trim().length < 3) return;
    }
    setBusy(id + decision);
    const r = await modDecide(token, id, decision, reason.trim());
    setBusy("");
    if (!r.ok) setErr(r.message);
    else {
      setNote(r.data.message || `Scheda ${decision}.`);
      refresh();
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-6 pb-24">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <Shield className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-caramel">Coda</p>
          <h2 className="font-display text-2xl font-semibold">In revisione</h2>
        </div>
      </div>

      {err && <p className="mb-4 text-sm text-ember">{err}</p>}
      {note && <p className="mb-4 text-sm text-emerald-300">{note}</p>}

      {!list && <div className="h-40 animate-pulse rounded-3xl bg-roast/50" />}

      {list && list.length === 0 && <p className="text-crema/50">Nessuna scheda in coda.</p>}

      <ul className="space-y-4">
        {list?.map((item) => (
          <li key={item.id} className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-5 ring-1 ring-sand/12">
            <div className="flex flex-wrap items-start gap-4">
              {item.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.iconUrl} alt="" className="size-14 rounded-2xl object-cover ring-1 ring-sand/20" />
              ) : (
                <span className="flex size-14 items-center justify-center rounded-2xl bg-mocha text-sand/50 ring-1 ring-sand/15">—</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.2em] text-crema/40">
                  {kindLabel(item.kind)} · {statusLabel(item.status)}
                </p>
                <p className="font-display text-2xl font-semibold">{item.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-crema/55">{item.tagline || item.description}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => decide(item.id, "approve")}
                className={cn("inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30 disabled:opacity-50")}
              >
                <Check className="size-4" /> Approva
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => decide(item.id, "reject")}
                className="inline-flex items-center gap-1.5 rounded-full bg-ember/15 px-4 py-2 text-sm font-semibold text-ember ring-1 ring-ember/30 disabled:opacity-50"
              >
                <X className="size-4" /> Rifiuta
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => decide(item.id, "suspend")}
                className="inline-flex items-center gap-1.5 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/70 ring-1 ring-sand/20 disabled:opacity-50"
              >
                Sospendi
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

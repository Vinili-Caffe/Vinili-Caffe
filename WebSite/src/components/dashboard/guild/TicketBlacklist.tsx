"use client";

import { EmojiText } from "@/components/discord/EmojiText";
import { confirmDialog } from "@/components/ui";
import { useEffect, useState } from "react";
import {
  BLACKLIST_MAX_REASON,
  addTicketBlacklist,
  deleteTicketBlacklist,
  loadTicketBlacklist,
  searchTicketMembers,
  type MemberHit,
  type TicketBlacklistBundle,
} from "@/lib/dashboard-guild";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { Field, FormGroup, Notice, StatusBadge, dangerBtn, fieldClass, labelClass, primaryMini } from "./bits";

export function TicketBlacklist({
  guildId,
  token,
  onToast,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [bundle, setBundle] = useState<TicketBlacklistBundle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"user" | "role">("user");
  const [roleId, setRoleId] = useState("");
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [panelId, setPanelId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const res = await loadTicketBlacklist(token, guildId);
      if (cancel) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.message || "Impossibile caricare la blacklist.");
        return;
      }
      setError("");
      setBundle(res.data);
    })();
    return () => {
      cancel = true;
    };
  }, [token, guildId]);

  useEffect(() => {
    if (type !== "user") return;
    const q = query.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const res = await searchTicketMembers(token, guildId, q);
      if (res.ok) setHits(res.data);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, type, token, guildId]);

  if (loading) return <p className="text-sm text-crema/60">Caricamento blacklist…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  const maxReason = bundle.quotas.maxReason || BLACKLIST_MAX_REASON;
  const full = bundle.entries.length >= bundle.quotas.maxEntries;

  const add = async () => {
    const targetId = type === "role" ? roleId : userId;
    if (!/^\d{16,22}$/.test(targetId)) {
      onToast(type === "role" ? "Scegli un ruolo." : "Cerca e scegli una persona dall'elenco.", true);
      return;
    }
    setBusy(true);
    const res = await addTicketBlacklist(token, guildId, {
      type,
      targetId,
      panelId: panelId || null,
      reason: reason.trim() ? reason.trim().slice(0, maxReason) : null,
    });
    setBusy(false);
    if (!res.ok) {
      onToast(res.message || "Aggiunta non riuscita.", true);
      return;
    }
    setBundle(res.data);
    setReason("");
    setQuery("");
    setUserId("");
    setRoleId("");
    setHits([]);
    onToast(res.data.message || "Aggiunto alla blacklist.");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <FormGroup title="Blocca qualcuno" description="Chi è in blacklist non può aprire ticket: da tutti i pannelli o da uno solo.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          {/* scelta tra due opzioni dello stesso modulo: qui un controllo segmentato è quello giusto */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Cosa bloccare">
            {(["user", "role"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                  type === t ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema",
                )}
              >
                {t === "user" ? "Una persona" : "Un ruolo"}
              </button>
            ))}
          </div>

          {type === "role" ? (
            <Field label="Ruolo">
              <Select
                value={roleId}
                onChange={setRoleId}
                className={fieldClass}
                options={[{ value: "", label: "Scegli un ruolo…" }, ...bundle.roles.map((r) => ({ value: r.id, label: `@${r.name}` }))]}
              />
            </Field>
          ) : (
            <div>
              <span className={labelClass}>Persona</span>
              <div className="relative">
                <input
                  name="ticket-search"
                  aria-label="Cerca una persona"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setUserId("");
                  }}
                  placeholder="Cerca per nome o ID…"
                  className={cn(fieldClass, userId && "ring-caramel/40")}
                />
                {hits.length ? (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg bg-mocha p-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)] ring-1 ring-sand/20">
                    {hits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-crema/85 hover:bg-crema/[0.06]"
                          onClick={() => {
                            setUserId(hit.id);
                            setQuery(hit.label);
                            setHits([]);
                          }}
                        >
                          <span className="truncate">{hit.label}</span>
                          <span className="shrink-0 font-mono text-[0.65rem] text-crema/60">{hit.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {userId ? <span className="mt-1 block text-xs text-ember">✓ Selezionato</span> : null}
            </div>
          )}

          <Field label="Da quali pannelli">
            <Select
              value={panelId}
              onChange={setPanelId}
              className={fieldClass}
              options={[{ value: "", label: "Tutti i pannelli" }, ...bundle.panels.map((p) => ({ value: p.id, label: p.title }))]}
            />
          </Field>
          <Field label="Motivo" hint="Facoltativo, lo vede solo lo staff">
            <input name="reason" value={reason} maxLength={maxReason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
          </Field>
          <button type="submit" disabled={busy || full} className={cn(primaryMini, "w-full py-2")}>
            {full ? `Blacklist piena (${bundle.quotas.maxEntries})` : "Aggiungi alla blacklist"}
          </button>
        </form>
      </FormGroup>

      <section className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-crema">In blacklist</h3>
          <span className="text-xs tabular-nums text-crema/60">
            {bundle.entries.length}/{bundle.quotas.maxEntries}
          </span>
        </div>
        {bundle.entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">
            Nessuno è in blacklist: tutti possono aprire ticket.
          </p>
        ) : (
          <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
            {bundle.entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-crema/[0.02]">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    entry.type === "role" ? "bg-caramel/15 text-ember" : "bg-crema/[0.08] text-crema/80",
                  )}
                  aria-hidden
                >
                  {entry.type === "role" ? "@" : (entry.label.trim().charAt(0) || "?").toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-crema">
                    <span className="truncate">{entry.label}</span>
                    <StatusBadge tone={entry.type === "role" ? "accent" : "muted"}>{entry.type === "role" ? "ruolo" : "persona"}</StatusBadge>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-crema/60">
                    {entry.panelTitle ? <>Solo «<EmojiText text={entry.panelTitle} />»</> : "Tutti i pannelli"}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={busy}
                  onClick={async () => {
                    if (!(await confirmDialog({ message: "Togliere questa voce dalla blacklist? Potrà di nuovo aprire ticket.", danger: true }))) return;
                    setBusy(true);
                    const res = await deleteTicketBlacklist(token, guildId, entry.id);
                    setBusy(false);
                    if (!res.ok) {
                      onToast(res.message || "Rimozione non riuscita.", true);
                      return;
                    }
                    setBundle(res.data);
                    onToast("Rimossa dalla blacklist.");
                  }}
                >
                  Togli
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

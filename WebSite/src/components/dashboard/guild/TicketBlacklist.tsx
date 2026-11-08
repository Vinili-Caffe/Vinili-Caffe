"use client";

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
import { Field, Notice, dangerBtn, fieldClass, primaryMini } from "./bits";

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

  if (loading) return <p className="text-sm text-crema/45">Caricamento blacklist…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  const maxReason = bundle.quotas.maxReason || BLACKLIST_MAX_REASON;

  return (
    <div className="space-y-4">
      <p className="text-xs text-crema/40">
        <span className="lining-nums">
          {bundle.entries.length}/{bundle.quotas.maxEntries}
        </span>{" "}
        entry
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const targetId = type === "role" ? roleId : userId;
          if (!/^\d{16,22}$/.test(targetId)) {
            onToast("Seleziona un utente o un ruolo valido.", true);
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
          setHits([]);
          onToast(res.data.message || "Aggiunto alla blacklist.");
        }}
      >
        <Field label="Tipo">
          <Select
            value={type}
            onChange={(v) => setType(v === "role" ? "role" : "user")}
            className={fieldClass}
            options={[
              { value: "user", label: "Utente" },
              { value: "role", label: "Ruolo" },
            ]}
          />
        </Field>
        <Field label="Pannello">
          <Select
            value={panelId}
            onChange={setPanelId}
            className={fieldClass}
            options={[
              { value: "", label: "Tutti i pannelli" },
              ...bundle.panels.map((p) => ({ value: p.id, label: p.title })),
            ]}
          />
        </Field>
        {type === "role" ? (
          <Field label="Ruolo">
            <Select
              value={roleId}
              onChange={setRoleId}
              className={fieldClass}
              options={[
                { value: "", label: "Seleziona" },
                ...bundle.roles.map((r) => ({ value: r.id, label: `@${r.name}` })),
              ]}
            />
          </Field>
        ) : (
          <Field label="Utente">
            <input name="ticket-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setUserId("");
              }}
              placeholder="Username o ID"
              className={fieldClass}
            />
          </Field>
        )}
        <Field label="Motivo">
          <input name="reason"
            value={reason}
            maxLength={maxReason}
            onChange={(e) => setReason(e.target.value)}
            className={fieldClass}
          />
        </Field>
        {type === "user" && hits.length ? (
          <ul className="max-h-48 overflow-y-auto rounded-xl bg-espresso/50 ring-1 ring-sand/10 sm:col-span-2">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-crema/5"
                  onClick={() => {
                    setUserId(hit.id);
                    setQuery(hit.label);
                    setHits([]);
                  }}
                >
                  <span className={userId === hit.id ? "text-ember" : "text-crema/80"}>{hit.label}</span>
                  <span className="font-mono text-[0.65rem] text-crema/35">{hit.id}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className={primaryMini}>
            Aggiungi
          </button>
        </div>
      </form>

      <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/50 ring-1 ring-sand/10">
        {bundle.entries.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-crema/40">Nessuna entry</li>
        ) : (
          bundle.entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-crema/[0.02]">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-crema">{entry.label}</p>
                <p className="truncate text-xs text-crema/40">
                  {entry.type === "role" ? "Ruolo" : "Utente"}
                  {entry.panelTitle ? ` · ${entry.panelTitle}` : " · tutti i pannelli"}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </p>
              </div>
              <button
                type="button"
                className={dangerBtn}
                disabled={busy}
                onClick={async () => {
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
                Rimuovi
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

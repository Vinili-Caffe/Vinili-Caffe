"use client";

import { useEffect, useState } from "react";
import {
  TEAM_PERM_KEYS,
  createTicketTeam,
  deleteTicketTeam,
  loadTicketTeams,
  searchTicketMembers,
  updateTicketTeam,
  type MemberHit,
  type TicketTeam,
  type TicketTeamsBundle,
} from "@/lib/dashboard-guild";
import { Select } from "@/components/ui/Select";
import { Field, MultiCheck, Notice, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "./bits";

const PERM_LABELS: Record<string, string> = {
  addReactions: "Add Reactions",
  sendMessages: "Send Messages",
  sendTtsMessages: "Send TTS Messages",
  embedLinks: "Embed Links",
  attachFiles: "Attach Files",
  mentionEveryone: "Mention Everyone",
  useExternalEmojis: "Use External Emojis",
  useApplicationCommands: "Use Application Commands",
  useExternalStickers: "Use External Stickers",
  sendVoiceMessages: "Send Voice Messages",
};

export function TicketTeams({
  guildId,
  token,
  onToast,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [bundle, setBundle] = useState<TicketTeamsBundle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [members, setMembers] = useState<TicketTeam["memberIds"]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [createName, setCreateName] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [busy, setBusy] = useState(false);

  const applyBundle = (next: TicketTeamsBundle, prefer?: string) => {
    setBundle(next);
    setSelected((cur) => {
      const id = prefer || cur;
      if (id && next.teams.some((t) => t.id === id)) return id;
      return next.teams[0]?.id || "";
    });
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const res = await loadTicketTeams(token, guildId);
      if (cancel) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.message || "Impossibile caricare i team.");
        return;
      }
      setError("");
      applyBundle(res.data);
    })();
    return () => {
      cancel = true;
    };
  }, [token, guildId]);

  const team = bundle?.teams.find((t) => t.id === selected) || null;

  useEffect(() => {
    if (!team) return;
    setName(team.name);
    setMembers(team.memberIds.map((m) => ({ ...m })));
    const map: Record<string, string> = {};
    for (const m of team.members) map[`${m.type}:${m.id}`] = m.label;
    setLabels(map);
    setPerms(team.perms ? { ...team.perms } : { ...(bundle?.defaultPerms || {}) });
  }, [team, bundle?.defaultPerms]);

  useEffect(() => {
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
  }, [query, token, guildId]);

  const save = async (patch: { name?: string; members?: TicketTeam["memberIds"]; perms?: Record<string, boolean> }) => {
    if (!team) return;
    setBusy(true);
    const res = await updateTicketTeam(token, guildId, team.id, patch);
    setBusy(false);
    if (!res.ok) {
      onToast(res.message || "Salvataggio team non riuscito.", true);
      return;
    }
    applyBundle(res.data, team.id);
  };

  if (loading) return <p className="text-sm text-crema/45">Caricamento team…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  const roleOptions = bundle.roles.map((r) => ({ id: r.id, label: `@${r.name}` }));
  const selectedRoles = members.filter((m) => m.type === "role").map((m) => m.id);
  const keys = bundle.permKeys.length ? bundle.permKeys : [...TEAM_PERM_KEYS];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Team">
          <Select
            value={selected}
            onChange={setSelected}
            placeholder="Seleziona un team"
            className={fieldClass}
            options={bundle.teams.map((t) => ({
              value: t.id,
              label: t.isDefault ? `${t.name} (Default)` : t.name,
            }))}
          />
        </Field>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const nextName = createName.trim().slice(0, 80);
            if (!nextName) {
              onToast("Nome team non valido.", true);
              return;
            }
            if (bundle.teams.length >= bundle.quotas.maxTeams) {
              onToast(`Quota team raggiunta (max ${bundle.quotas.maxTeams}).`, true);
              return;
            }
            setBusy(true);
            const res = await createTicketTeam(token, guildId, nextName);
            setBusy(false);
            if (!res.ok) {
              onToast(res.message || "Creazione team non riuscita.", true);
              return;
            }
            setCreateName("");
            const created = res.data.teams.find((t) => t.name === nextName && !t.isDefault);
            applyBundle(res.data, created?.id);
            onToast("Team creato.");
          }}
        >
          <Field label="Nuovo team">
            <input name="create-team-name" value={createName} maxLength={80} onChange={(e) => setCreateName(e.target.value)} className={fieldClass} />
          </Field>
          <button type="submit" disabled={busy} className={primaryMini}>
            Crea
          </button>
        </form>
      </div>
      <p className="text-xs text-crema/40">
        <span className="lining-nums">
          {bundle.teams.length}/{bundle.quotas.maxTeams}
        </span>{" "}
        team · max {bundle.quotas.maxMembers} membri
      </p>

      {team ? (
        <div className="space-y-3">
          <Field label="Nome">
            <input name="team-name"
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const next = name.trim().slice(0, 80);
                if (next && next !== team.name) save({ name: next });
              }}
              className={fieldClass}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-crema/70">Ruoli</p>
            <MultiCheck
              options={roleOptions}
              selected={selectedRoles}
              onChange={(ids) => {
                if (ids.length + members.filter((m) => m.type === "user").length > bundle.quotas.maxMembers) return;
                const users = members.filter((m) => m.type === "user");
                const next = [...ids.map((id) => ({ type: "role" as const, id })), ...users];
                setMembers(next);
                save({ members: next });
              }}
            />
          </div>

          <Field label="Cerca membro">
            <input name="ticket-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Username o ID"
              className={fieldClass}
            />
          </Field>
          {hits.length ? (
            <ul className="max-h-48 overflow-y-auto rounded-xl bg-espresso/50 ring-1 ring-sand/10">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-crema/80 hover:bg-crema/5"
                    onClick={() => {
                      if (members.some((m) => m.type === "user" && m.id === hit.id)) return;
                      if (members.length >= bundle.quotas.maxMembers) {
                        onToast(`Quota membri raggiunta (max ${bundle.quotas.maxMembers}).`, true);
                        return;
                      }
                      const next = [...members, { type: "user" as const, id: hit.id }];
                      setLabels((cur) => ({ ...cur, [`user:${hit.id}`]: hit.label }));
                      setMembers(next);
                      setQuery("");
                      setHits([]);
                      save({ members: next });
                    }}
                  >
                    <span>{hit.label}</span>
                    <span className="font-mono text-[0.65rem] text-crema/35">{hit.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/50 ring-1 ring-sand/10">
            {members.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-crema/40">Nessun membro</li>
            ) : (
              members.map((m) => (
                <li key={`${m.type}:${m.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="truncate text-crema/80">{labels[`${m.type}:${m.id}`] || m.id}</span>
                  <button
                    type="button"
                    className={dangerBtn}
                    onClick={() => {
                      const next = members.filter((x) => !(x.type === m.type && x.id === m.id));
                      setMembers(next);
                      save({ members: next });
                    }}
                  >
                    Rimuovi
                  </button>
                </li>
              ))
            )}
          </ul>

          {team.isDefault ? (
            <p className="text-xs text-crema/40">Il team Default non può essere eliminato.</p>
          ) : (
            <div className="space-y-3 rounded-xl bg-espresso/50 p-4 ring-1 ring-sand/10">
              {keys.map((key) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-crema/80">{PERM_LABELS[key] || key}</span>
                  <Toggle
                    checked={key === "mentionEveryone" ? perms[key] === true : perms[key] !== false}
                    label={PERM_LABELS[key] || key}
                    disabled={busy}
                    onChange={(next) => {
                      const merged = { ...perms, [key]: next };
                      setPerms(merged);
                      save({ perms: merged });
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {!team.isDefault ? (
            <button
              type="button"
              className={dangerBtn}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await deleteTicketTeam(token, guildId, team.id);
                setBusy(false);
                if (!res.ok) {
                  onToast(res.message || "Eliminazione team non riuscita.", true);
                  return;
                }
                applyBundle(res.data);
                onToast("Team eliminato.");
              }}
            >
              Elimina team
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

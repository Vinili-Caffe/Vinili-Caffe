"use client";

import { confirmDialog } from "@/components/ui";
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
import { cn } from "@/lib/cn";
import { EditorHeader, FormGroup, MultiCheck, Notice, SettingRow, StatusBadge, Toggle, dangerBtn, fieldClass, labelClass, primaryMini } from "./bits";

const PERM_LABELS: Record<string, string> = {
  addReactions: "Aggiungere reazioni",
  sendMessages: "Scrivere messaggi",
  sendTtsMessages: "Messaggi da leggere ad alta voce (TTS)",
  embedLinks: "Anteprime dei link",
  attachFiles: "Allegare file",
  mentionEveryone: "Menzionare @everyone e @here",
  useExternalEmojis: "Emoji di altri server",
  useApplicationCommands: "Usare i comandi dei bot",
  useExternalStickers: "Sticker di altri server",
  sendVoiceMessages: "Messaggi vocali",
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

  if (loading) return <p className="text-sm text-crema/60">Caricamento team…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  const roleOptions = bundle.roles.map((r) => ({ id: r.id, label: `@${r.name}` }));
  const selectedRoles = members.filter((m) => m.type === "role").map((m) => m.id);
  const users = members.filter((m) => m.type === "user");
  const keys = bundle.permKeys.length ? bundle.permKeys : [...TEAM_PERM_KEYS];
  const maxMembers = bundle.quotas.maxMembers;

  const createTeam = async () => {
    const nextName = createName.trim().slice(0, 80);
    if (!nextName) {
      onToast("Scrivi il nome del nuovo team.", true);
      return;
    }
    if (bundle.teams.length >= bundle.quotas.maxTeams) {
      onToast(`Hai già ${bundle.quotas.maxTeams} team, il massimo.`, true);
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
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-crema">Team</h3>
          <span className="text-xs tabular-nums text-crema/60">
            {bundle.teams.length}/{bundle.quotas.maxTeams}
          </span>
        </div>
        <ul className="space-y-1" role="listbox" aria-label="Team">
          {bundle.teams.map((t) => {
            const on = t.id === selected;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    on ? "bg-caramel/12 font-semibold text-crema ring-1 ring-caramel/25" : "text-crema/75 hover:bg-crema/[0.04] hover:text-crema",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {t.isDefault ? <StatusBadge>predefinito</StatusBadge> : null}
                  <span className="shrink-0 text-xs tabular-nums text-crema/60">{t.memberIds.length}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void createTeam();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Nome del nuovo team</span>
            <input
              name="create-team-name"
              value={createName}
              maxLength={80}
              placeholder="Nuovo team…"
              onChange={(e) => setCreateName(e.target.value)}
              className={cn(fieldClass, "mt-0 py-2")}
            />
          </label>
          <button type="submit" disabled={busy || !createName.trim()} className={primaryMini}>
            Crea
          </button>
        </form>
      </aside>

      <div className="min-w-0">
        {team ? (
          <div className="space-y-4">
            <EditorHeader
              inColumn
              backLabel="Team"
              onBack={() => setSelected("")}
              title={team.name}
              subtitle={`${members.length}/${maxMembers} membri · le modifiche si salvano da sole`}
              actions={
                !team.isDefault ? (
                  <button
                    type="button"
                    className={dangerBtn}
                    disabled={busy}
                    onClick={async () => {
                      if (!(await confirmDialog({ message: `Eliminare il team «${team.name}»? I pannelli che lo usano passano al team predefinito.`, danger: true }))) return;
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
                ) : (
                  <StatusBadge>non eliminabile</StatusBadge>
                )
              }
            />

            <FormGroup title="Nome">
              <input
                name="team-name"
                aria-label="Nome del team"
                value={name}
                maxLength={80}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  const next = name.trim().slice(0, 80);
                  if (next && next !== team.name) save({ name: next });
                }}
                className={cn(fieldClass, "mt-0")}
              />
            </FormGroup>

            <FormGroup title="Chi fa parte del team" description="Ruoli interi oppure singole persone: vedono e gestiscono i ticket dei pannelli che usano questo team.">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className={labelClass}>Ruoli</p>
                  <MultiCheck
                    options={roleOptions}
                    selected={selectedRoles}
                    onChange={(ids) => {
                      if (ids.length + users.length > maxMembers) {
                        onToast(`Massimo ${maxMembers} membri per team.`, true);
                        return;
                      }
                      const next = [...ids.map((id) => ({ type: "role" as const, id })), ...users];
                      setMembers(next);
                      save({ members: next });
                    }}
                  />
                </div>
                <div>
                  <p className={labelClass}>Persone</p>
                  <label className="relative mt-1.5 block">
                    <span className="sr-only">Cerca una persona</span>
                    <input
                      name="ticket-search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cerca per nome o ID…"
                      className={cn(fieldClass, "mt-0")}
                    />
                    {hits.length ? (
                      <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg bg-mocha p-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)] ring-1 ring-sand/20">
                        {hits.map((hit) => (
                          <li key={hit.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-crema/85 hover:bg-crema/[0.06]"
                              onClick={() => {
                                if (members.some((m) => m.type === "user" && m.id === hit.id)) return;
                                if (members.length >= maxMembers) {
                                  onToast(`Massimo ${maxMembers} membri per team.`, true);
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
                              <span className="truncate">{hit.label}</span>
                              <span className="shrink-0 font-mono text-[0.65rem] text-crema/60">{hit.id}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </label>
                  {users.length === 0 ? (
                    <p className="mt-2 text-xs text-crema/60">Nessuna persona aggiunta singolarmente.</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {users.map((m) => (
                        <li
                          key={`user:${m.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-crema/[0.07] py-1 pl-3 pr-1 text-sm text-crema ring-1 ring-sand/15"
                        >
                          <span className="max-w-[12rem] truncate">{labels[`user:${m.id}`] || m.id}</span>
                          <button
                            type="button"
                            aria-label={`Togli ${labels[`user:${m.id}`] || m.id} dal team`}
                            className="flex size-5 items-center justify-center rounded-full text-crema/60 transition hover:bg-[#a83a2c]/25 hover:text-[#f0a493]"
                            onClick={() => {
                              const next = members.filter((x) => !(x.type === "user" && x.id === m.id));
                              setMembers(next);
                              save({ members: next });
                            }}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </FormGroup>

            {team.isDefault ? null : (
              <FormGroup title="Cosa può fare nel ticket" description="Permessi del team nel canale del ticket.">
                <div className="divide-y divide-sand/[0.07]">
                  {keys.map((key) => (
                    <SettingRow key={key} title={PERM_LABELS[key] || key}>
                      <Toggle
                        size="sm"
                        checked={key === "mentionEveryone" ? perms[key] === true : perms[key] !== false}
                        label={PERM_LABELS[key] || key}
                        disabled={busy}
                        onChange={(next) => {
                          const merged = { ...perms, [key]: next };
                          setPerms(merged);
                          save({ perms: merged });
                        }}
                      />
                    </SettingRow>
                  ))}
                </div>
              </FormGroup>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-crema">Scegli un team a sinistra</p>
            <p className="mt-1 text-xs text-crema/60">I team decidono chi vede e gestisce i ticket di ogni pannello.</p>
          </div>
        )}
      </div>
    </div>
  );
}

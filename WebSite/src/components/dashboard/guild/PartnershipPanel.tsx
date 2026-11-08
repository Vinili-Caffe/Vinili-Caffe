"use client";

import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";
import {
  addPartnershipBlacklist,
  adjustPartnershipManagerPoints,
  deletePartnership,
  deletePartnershipBlacklistEntry,
  listPartnershipHistory,
  loadPartnership,
  loadPartnershipBlacklist,
  loadPartnershipManagers,
  loadPartnershipMigration,
  patchPartnership,
  startPartnershipMigration,
  undoPartnershipMigration,
  type ContentFilters,
  type PartnershipBlacklistEntry,
  type PartnershipBundle,
  type PartnershipConfig,
  type PartnershipHistory,
  type PartnershipManager,
  type PartnershipMigration,
} from "@/lib/dashboard-guild";
import { confirmDialog, Disclosure } from "@/components/ui";
import { Select, MultiSelect } from "@/components/ui/Select";
import { pollInterval } from "@/lib/device-fx";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { Field, Notice, Subnav, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "./bits";

type Tab = "setup" | "filtri" | "blacklist" | "manager" | "storia" | "migrazione";

const TABS: { id: Tab; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "filtri", label: "Filtri" },
  { id: "blacklist", label: "Blacklist" },
  { id: "manager", label: "Manager" },
  { id: "storia", label: "Cronologia" },
  { id: "migrazione", label: "Migrazione" },
];

const FILTERS: { key: keyof ContentFilters; title: string; hint: string }[] = [
  { key: "stripMentions", title: "Rimuovi menzioni", hint: "Cancella menzioni a utenti, ruoli e canali" },
  { key: "stripMassMentions", title: "Rimuovi @everyone / @here", hint: "Elimina @everyone e @here dalla descrizione pubblicata" },
  { key: "stripNonInviteLinks", title: "Rimuovi link esterni", hint: "Toglie URL che non sono invite Discord" },
  { key: "stripCustomEmojis", title: "Rimuovi emoji custom", hint: "Cancella emoji del server" },
  { key: "stripInvisibleChars", title: "Rimuovi caratteri invisibili", hint: "Toglie zero-width e altri caratteri nascosti" },
  { key: "stripSpoilers", title: "Rimuovi spoilers", hint: "Toglie la formattazione ||spoiler||" },
  { key: "stripExtraInvites", title: "Un solo invite", hint: "Se ci sono più link Discord, tiene solo il primo" },
];

function ChannelSelect({
  label,
  value,
  channels,
  onChange,
}: {
  label: string;
  value: string | null;
  channels: { id: string; name: string }[];
  onChange: (id: string | null) => void;
}) {
  return (
    <Field label={label}>
      <Select
        value={value || ""}
        onChange={(v) => onChange(v || null)}
        className={fieldClass}
        options={[
          { value: "", label: "— Nessuno —" },
          ...channels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
        ]}
      />
    </Field>
  );
}

export function PartnershipPanel({
  guildId,
  token,
  onToast,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("setup");
  const [bundle, setBundle] = useState<PartnershipBundle | null>(null);
  const [draft, setDraft] = useState<PartnershipConfig | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blacklist, setBlacklist] = useState<PartnershipBlacklistEntry[] | null>(null);
  const [blTarget, setBlTarget] = useState("");
  const [blNote, setBlNote] = useState("");
  const [managers, setManagers] = useState<PartnershipManager[]>([]);
  const [canPoints, setCanPoints] = useState(false);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<PartnershipHistory | null>(null);
  const [days, setDays] = useState("30");
  const [migration, setMigration] = useState<PartnershipMigration | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const res = await loadPartnership(token, guildId);
      if (cancel) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setError("");
      setBundle(res.data);
      setDraft(res.data.config);
    })();
    return () => {
      cancel = true;
    };
  }, [token, guildId]);

  useEffect(() => {
    if (tab !== "blacklist" || blacklist) return;
    loadPartnershipBlacklist(token, guildId).then((res) => {
      if (res.ok) setBlacklist(res.data);
      else onToast(res.message, true);
    });
  }, [tab, blacklist, token, guildId, onToast]);

  useEffect(() => {
    if (tab !== "manager") return;
    loadPartnershipManagers(token, guildId).then((res) => {
      if (!res.ok) {
        onToast(res.message, true);
        return;
      }
      setManagers(res.data.managers);
      setCanPoints(res.data.canManagePoints);
    });
  }, [tab, token, guildId, onToast]);

  useEffect(() => {
    if (tab !== "storia") return;
    const query = days === "all" ? {} : { days: Number(days) || 30, page: 1 };
    listPartnershipHistory(token, guildId, query).then((res) => {
      if (res.ok) setHistory(res.data);
      else onToast(res.message, true);
    });
  }, [tab, days, token, guildId, onToast]);

  useEffect(() => {
    if (tab !== "migrazione") return;
    let cancel = false;
    const pull = async () => {
      const res = await loadPartnershipMigration(token, guildId);
      if (cancel || !res.ok) return;
      setMigration(res.data);
    };
    pull();
    // fallback lento: WS partnership_changed forza pull
    const timer = window.setInterval(pull, pollInterval(60_000));
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [tab, token, guildId]);

  useLiveRefresh(
    async () => {
      if (tab !== "migrazione") return;
      const res = await loadPartnershipMigration(token, guildId);
      if (res.ok) setMigration(res.data);
    },
    { intervalMs: 90_000, enabled: tab === "migrazione", boot: false, topics: ["partnership"] },
  );

  if (loading) return <p className="text-sm text-crema/60">Caricamento partnership…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle || !draft) return null;

  const channels = bundle.pickers.textChannels;
  const roles = bundle.pickers.roles;
  const categories = bundle.pickers.categories;
  const set = (patch: Partial<PartnershipConfig>) => setDraft({ ...draft, ...patch });

  const saveSetup = async () => {
    const customRole = draft.pings.customRoleId;
    const customMembers = draft.pings.customRoleMembers;
    if ((customRole && customMembers == null) || (!customRole && customMembers != null)) {
      onToast("Ruolo custom e soglia membri devono essere impostati insieme.", true);
      return;
    }
    const descMode = draft.partnerDesc.mode;
    const partnerDesc =
      !descMode || descMode === "clear" || descMode === "none"
        ? { mode: "clear" }
        : descMode === "channel"
          ? { mode: "channel", channelId: draft.partnerDesc.channelId }
          : { mode: "static", staticText: draft.partnerDesc.staticText };
    setBusy(true);
    const res = await patchPartnership(token, guildId, {
      partnershipsChannelId: draft.partnershipsChannelId,
      logsChannelId: draft.logsChannelId,
      pmCommandsChannelId: draft.pmCommandsChannelId,
      pmCommandsCategoryIds: draft.pmCommandsCategoryIds,
      partnerManagerRoleId: draft.partnerManagerRoleId,
      managerBadgeRoleId: draft.managerBadgeRoleId,
      skipManager: draft.skipManager,
      manualPartnershipEnabled: draft.manualPartnershipEnabled,
      managerLeaveAction: draft.managerLeaveAction,
      sameServerCooldownInput: draft.sameServerCooldownInput,
      pings: {
        hereMembers: draft.pings.hereMembers,
        everyoneMembers: draft.pings.everyoneMembers,
        customRoleId: draft.pings.customRoleId,
        customRoleMembers: draft.pings.customRoleMembers,
        hereDelayInput: draft.pings.hereDelayInput,
        everyoneDelayInput: draft.pings.everyoneDelayInput,
        customRoleDelayInput: draft.pings.customRoleDelayInput,
      },
      partnerDesc,
    });
    setBusy(false);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    setBundle(res.data);
    setDraft(res.data.config);
    onToast("Configurazione partnership salvata.");
  };

  return (
    <div className="space-y-4">
      {/* stato del modulo partnership */}
      <div
        className={cn(
          "-mx-4 -mt-4 flex flex-wrap items-center gap-3 border-b px-4 py-3.5 sm:-mx-5 sm:px-5",
          draft.setupCompleted ? "border-[#5f9a6a]/20 bg-[#5f9a6a]/[0.06]" : "border-caramel/20 bg-caramel/[0.06]",
        )}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1",
            draft.setupCompleted
              ? "bg-[#5f9a6a]/15 text-[#9fd0a8] ring-[#5f9a6a]/30 light:text-[#2f6b3f]"
              : "bg-caramel/15 text-ember ring-caramel/30",
          )}
        >
          <span className={cn("size-1.5 rounded-full", draft.setupCompleted ? "bg-[#7fc48c]" : "bg-ember")} aria-hidden />
          {draft.setupCompleted ? "Setup completo" : "Setup da completare"}
        </span>
        {bundle.premiumActive ? (
          <span className="rounded-md bg-caramel/15 px-2 py-1 text-xs font-semibold text-ember ring-1 ring-caramel/30">Premium</span>
        ) : null}
        {draft.inviteUrl ? (
          <a
            href={draft.inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-crema/70 ring-1 ring-sand/15 transition hover:text-crema"
          >
            Invito del server ↗
          </a>
        ) : null}
      </div>
      <Subnav tabs={TABS} value={tab} onChange={setTab} label="Partnership" />

      {tab === "setup" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <ChannelSelect label="Canale partnership" value={draft.partnershipsChannelId} channels={channels} onChange={(id) => set({ partnershipsChannelId: id })} />
            <ChannelSelect label="Canale log" value={draft.logsChannelId} channels={channels} onChange={(id) => set({ logsChannelId: id })} />
            <ChannelSelect label="Canale comandi PM" value={draft.pmCommandsChannelId} channels={channels} onChange={(id) => set({ pmCommandsChannelId: id })} />
            <Field label="Ruolo manager">
              <Select
                value={draft.partnerManagerRoleId || ""}
                onChange={(v) => set({ partnerManagerRoleId: v || null })}
                className={fieldClass}
                options={[
                  { value: "", label: "— Nessuno —" },
                  ...roles.map((r) => ({ value: r.id, label: `@${r.name}` })),
                ]}
              />
            </Field>
            <Field label="Badge manager">
              <Select
                value={draft.managerBadgeRoleId || ""}
                onChange={(v) => set({ managerBadgeRoleId: v || null })}
                className={fieldClass}
                options={[
                  { value: "", label: "— Nessuno —" },
                  ...roles.map((r) => ({ value: r.id, label: `@${r.name}` })),
                ]}
              />
            </Field>
            <Field label="Manager fuori dal server">
              <Select
                value={draft.managerLeaveAction || ""}
                onChange={(v) => set({ managerLeaveAction: v === "warn" || v === "delete" ? v : null })}
                className={fieldClass}
                options={[
                  { value: "", label: "Nessuna" },
                  { value: "warn", label: "Avvisa" },
                  { value: "delete", label: "Elimina (5m)" },
                ]}
              />
            </Field>
            <Field label="Rate limit stesso server">
              <input name="same-server-cooldown"
                value={draft.sameServerCooldownInput}
                placeholder="12h"
                onChange={(e) => set({ sameServerCooldownInput: e.target.value })}
                className={fieldClass}
              />
            </Field>
          </div>
          <Field label="Categorie comandi PM">
            <MultiSelect
              value={draft.pmCommandsCategoryIds}
              onChange={(ids) => set({ pmCommandsCategoryIds: ids })}
              className={fieldClass}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-crema/75">
              <span>Salta conferma manager</span>
              <Toggle checked={draft.skipManager} label="Salta conferma manager" onChange={(v) => set({ skipManager: v })} />
            </div>
            <div className="flex items-center gap-2 text-sm text-crema/75">
              <span>Partnership manuale</span>
              <Toggle
                checked={draft.manualPartnershipEnabled}
                label="Partnership manuale"
                onChange={(v) => set({ manualPartnershipEnabled: v })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ping @here da N membri">
              <input name="ping-here-members"
                type="number"
                min={0}
                value={draft.pings.hereMembers ?? ""}
                onChange={(e) =>
                  set({
                    pings: { ...draft.pings, hereMembers: e.target.value === "" ? null : Number(e.target.value) },
                  })
                }
                className={fieldClass}
              />
            </Field>
            <Field label="Delay @here">
              <input name="ping-here-delay"
                value={draft.pings.hereDelayInput}
                placeholder="5m"
                onChange={(e) => set({ pings: { ...draft.pings, hereDelayInput: e.target.value } })}
                className={fieldClass}
              />
            </Field>
            <Field label="Ping @everyone da N membri">
              <input name="ping-everyone-members"
                type="number"
                min={0}
                value={draft.pings.everyoneMembers ?? ""}
                onChange={(e) =>
                  set({
                    pings: {
                      ...draft.pings,
                      everyoneMembers: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
                className={fieldClass}
              />
            </Field>
            <Field label="Delay @everyone">
              <input name="ping-everyone-delay"
                value={draft.pings.everyoneDelayInput}
                placeholder="5m"
                onChange={(e) => set({ pings: { ...draft.pings, everyoneDelayInput: e.target.value } })}
                className={fieldClass}
              />
            </Field>
            <Field label="Ruolo ping custom">
              <Select
                value={draft.pings.customRoleId || ""}
                onChange={(v) => set({ pings: { ...draft.pings, customRoleId: v || null } })}
                className={fieldClass}
                options={[
                  { value: "", label: "— Nessuno —" },
                  ...roles.map((r) => ({ value: r.id, label: `@${r.name}` })),
                ]}
              />
            </Field>
            <Field label="Soglia ruolo custom">
              <input name="ping-custom-members"
                type="number"
                min={0}
                value={draft.pings.customRoleMembers ?? ""}
                onChange={(e) =>
                  set({
                    pings: {
                      ...draft.pings,
                      customRoleMembers: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
                className={fieldClass}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Descrizione partner">
              <Select
                value={draft.partnerDesc.mode || ""}
                onChange={(v) => set({ partnerDesc: { ...draft.partnerDesc, mode: v || null } })}
                className={fieldClass}
                options={[
                  { value: "", label: "Nessuna" },
                  { value: "channel", label: "Da canale" },
                  { value: "static", label: "Testo fisso" },
                ]}
              />
            </Field>
            {draft.partnerDesc.mode === "channel" ? (
              <ChannelSelect
                label="Canale descrizione"
                value={draft.partnerDesc.channelId}
                channels={channels}
                onChange={(id) => set({ partnerDesc: { ...draft.partnerDesc, channelId: id } })}
              />
            ) : null}
          </div>
          {draft.partnerDesc.mode === "static" ? (
            <Field label="Testo descrizione">
              <textarea name="partner-description"
                value={draft.partnerDesc.staticText || ""}
                maxLength={4000}
                rows={4}
                onChange={(e) => set({ partnerDesc: { ...draft.partnerDesc, staticText: e.target.value } })}
                className={fieldClass}
              />
            </Field>
          ) : null}

          <Disclosure title="Messaggio di ringraziamento">
            <p className="text-xs text-crema/60">Richiede Vinili Premium se è attivo.</p>
            <div className="mt-3 space-y-2">
              <Toggle
                checked={draft.thankYouEmbed.enabled}
                label="Ringraziamento attivo"
                onChange={(v) => set({ thankYouEmbed: { ...draft.thankYouEmbed, enabled: v } })}
              />
              <Field label="Titolo">
                <input name="thank-you-title"
                  value={draft.thankYouEmbed.title || ""}
                  onChange={(e) => set({ thankYouEmbed: { ...draft.thankYouEmbed, title: e.target.value || null } })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Descrizione">
                <textarea name="thank-you-description"
                  value={draft.thankYouEmbed.description || ""}
                  rows={3}
                  onChange={(e) =>
                    set({ thankYouEmbed: { ...draft.thankYouEmbed, description: e.target.value || null } })
                  }
                  className={fieldClass}
                />
              </Field>
              <button
                type="button"
                className={miniBtn}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await patchPartnership(token, guildId, { thankYouEmbed: draft.thankYouEmbed });
                  setBusy(false);
                  if (!res.ok) {
                    onToast(res.message, true);
                    return;
                  }
                  setBundle(res.data);
                  setDraft(res.data.config);
                  onToast("Configurazione partnership salvata.");
                }}
              >
                Salva ringraziamento
              </button>
            </div>
          </Disclosure>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={primaryMini} onClick={saveSetup}>
              Salva
            </button>
            <button
              type="button"
              disabled={busy}
              className={dangerBtn}
              onClick={async () => {
                if (!(await confirmDialog({ message: "Azzerare la configurazione partnership?", danger: true }))) return;
                setBusy(true);
                const res = await deletePartnership(token, guildId);
                setBusy(false);
                if (!res.ok) {
                  onToast(res.message, true);
                  return;
                }
                onToast(res.data.message);
                const fresh = await loadPartnership(token, guildId);
                if (fresh.ok) {
                  setBundle(fresh.data);
                  setDraft(fresh.data.config);
                }
              }}
            >
              Azzera setup
            </button>
          </div>
        </div>
      ) : null}

      {tab === "filtri" ? (
        <div className="space-y-2">
          <p className="text-xs text-crema/60">
            Regole di pulizia sulla descrizione partnership. L&apos;invito Discord non viene rimosso.
          </p>
          {FILTERS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 py-1.5">
              <div>
                <p className="text-sm text-crema">{row.title}</p>
                <p className="text-xs text-crema/60">{row.hint}</p>
              </div>
              <Toggle
                checked={draft.contentFilters[row.key]}
                label={row.title}
                onChange={(v) => set({ contentFilters: { ...draft.contentFilters, [row.key]: v } })}
              />
            </div>
          ))}
          <button
            type="button"
            className={primaryMini}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await patchPartnership(token, guildId, { contentFilters: draft.contentFilters });
              setBusy(false);
              if (!res.ok) {
                onToast(res.message, true);
                return;
              }
              setBundle(res.data);
              setDraft(res.data.config);
              onToast("Configurazione partnership salvata.");
            }}
          >
            Salva filtri
          </button>
        </div>
      ) : null}

      {tab === "blacklist" ? (
        <div className="space-y-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const target = blTarget.trim();
              if (!target) {
                onToast("Inserisci un ID server Discord valido oppure un invite.", true);
                return;
              }
              setBusy(true);
              const res = await addPartnershipBlacklist(token, guildId, target, blNote.trim().slice(0, 500));
              setBusy(false);
              if (!res.ok) {
                onToast(res.message, true);
                return;
              }
              setBlacklist(res.data);
              setBlTarget("");
              setBlNote("");
            }}
          >
            <Field label="Server o invite">
              <input name="blacklist-target" value={blTarget} onChange={(e) => setBlTarget(e.target.value)} className={fieldClass} />
            </Field>
            <Field label="Nota">
              <input name="blacklist-note" value={blNote} maxLength={500} onChange={(e) => setBlNote(e.target.value)} className={fieldClass} />
            </Field>
            <button type="submit" disabled={busy} className={primaryMini}>
              Aggiungi
            </button>
          </form>
          <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/50 ring-1 ring-sand/10">
            {!blacklist?.length ? (
              <li className="px-4 py-8 text-center text-sm text-crema/60">Nessun server in blacklist</li>
            ) : (
              blacklist.map((row) => (
                <li key={row.guildId} className="flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-crema/[0.02]">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-crema">{row.guildName || row.guildId}</p>
                    <p className="truncate text-xs text-crema/60">
                      {row.invite || row.guildId}
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={dangerBtn}
                    onClick={async () => {
                      if (!(await confirmDialog({ message: "Togliere questo server dalla blacklist partnership?", danger: true }))) return;
                      const res = await deletePartnershipBlacklistEntry(token, guildId, row.guildId);
                      if (!res.ok) {
                        onToast(res.message, true);
                        return;
                      }
                      setBlacklist(res.data);
                    }}
                  >
                    Rimuovi
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {tab === "manager" ? (
        <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/50 ring-1 ring-sand/10">
          {managers.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-crema/60">Nessun partner manager</li>
          ) : (
            managers.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-crema/[0.02]">
                <div>
                  <p className="text-sm text-crema">{m.displayName}</p>
                  <p className="text-xs text-crema/60">
                    <span className="lining-nums">{m.points}</span> punti · giorno {m.daily} · settimana {m.weekly}
                  </p>
                </div>
                {canPoints ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const amount = Number.parseInt(points[m.userId] || "", 10);
                      const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-act");
                      if (action !== "add" && action !== "remove") return;
                      if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
                        onToast("Inserisci un numero valido tra 1 e 10000.", true);
                        return;
                      }
                      const res = await adjustPartnershipManagerPoints(token, guildId, m.userId, action, amount);
                      if (!res.ok) {
                        onToast(res.message, true);
                        return;
                      }
                      onToast(res.data.message);
                      const fresh = await loadPartnershipManagers(token, guildId);
                      if (fresh.ok) setManagers(fresh.data.managers);
                    }}
                  >
                    <input name="manager-points"
                      value={points[m.userId] || ""}
                      onChange={(e) => setPoints((cur) => ({ ...cur, [m.userId]: e.target.value }))}
                      inputMode="numeric"
                      className="w-16 rounded-lg bg-espresso/70 px-2 py-1 text-sm text-crema ring-1 ring-sand/15"
                    />
                    <button type="submit" data-act="add" className={miniBtn}>
                      +
                    </button>
                    <button type="submit" data-act="remove" className={miniBtn}>
                      −
                    </button>
                  </form>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {tab === "storia" ? (
        <div className="space-y-3">
          <Field label="Periodo">
            <Select
              value={days}
              onChange={setDays}
              className={fieldClass}
              options={[
                { value: "7", label: "7 giorni" },
                { value: "30", label: "30 giorni" },
                { value: "all", label: "Tutto" },
              ]}
            />
          </Field>
          {history ? (
            <p className="text-xs text-crema/60">
              <span className="lining-nums">{history.totalPartnerships}</span> partnership ·{" "}
              <span className="lining-nums">{history.uniqueServers}</span> server
            </p>
          ) : null}
          <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/50 ring-1 ring-sand/10">
            {!history?.entries.length ? (
              <li className="px-4 py-8 text-center text-sm text-crema/60">Nessuna partnership nel periodo</li>
            ) : (
              history.entries.map((row, i) => (
                <li key={`${row.guildId || row.invite || i}`} className="px-4 py-3">
                  <p className="text-sm text-crema">{row.guildName || row.invite || "Server"}</p>
                  <p className="text-xs text-crema/60">
                    <span className="lining-nums">{row.count}</span>
                    {row.lastAt ? ` · ${row.lastAt.slice(0, 10)}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {tab === "migrazione" ? (
        <div className="space-y-3">
          <p className="text-sm text-crema/70">
            Stato: {migration?.job ? migration.job.status : "nessuna"}
            {migration?.job?.queuePosition ? ` · coda ${migration.job.queuePosition}` : ""}
            {migration?.job?.imported ? ` · importate ${migration.job.imported}` : ""}
          </p>
          {migration?.job?.error ? <Notice error>{migration.job.error}</Notice> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryMini}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await startPartnershipMigration(token, guildId, { mode: "configured" });
                setBusy(false);
                if (!res.ok) {
                  onToast(res.message, true);
                  return;
                }
                onToast(res.data.message);
                const fresh = await loadPartnershipMigration(token, guildId);
                if (fresh.ok) setMigration(fresh.data);
              }}
            >
              Avvia con la configurazione attuale
            </button>
            {migration?.job?.canUndo ? (
              <button
                type="button"
                className={dangerBtn}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await undoPartnershipMigration(token, guildId);
                  setBusy(false);
                  if (!res.ok) {
                    onToast(res.message, true);
                    return;
                  }
                  onToast(res.data.message);
                  const fresh = await loadPartnershipMigration(token, guildId);
                  if (fresh.ok) setMigration(fresh.data);
                }}
              >
                Annulla ultima migrazione
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

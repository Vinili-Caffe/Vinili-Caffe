"use client";

import { NumberField } from "@/components/ui/NumberField";
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
import { Pagination } from "@/components/ui/Pagination";
import { MessagePreview } from "./MessagePreview";
import { Select, MultiSelect } from "@/components/ui/Select";
import { pollInterval } from "@/lib/device-fx";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { Field, FormGroup, Notice, PremiumBadge, PremiumLock, SettingRow, StatusBadge, Subnav, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini, FormSkeleton } from "./bits";

type Tab = "setup" | "filtri" | "blacklist" | "manager" | "storia" | "migrazione";

const TABS: { id: Tab; label: string }[] = [
  { id: "setup", label: "Impostazioni" },
  { id: "filtri", label: "Filtri" },
  { id: "blacklist", label: "Blacklist" },
  { id: "manager", label: "Manager" },
  { id: "storia", label: "Cronologia" },
  { id: "migrazione", label: "Importazione" },
];

const FILTERS: { key: keyof ContentFilters; title: string; hint: string }[] = [
  { key: "stripMentions", title: "Rimuovi menzioni", hint: "Cancella menzioni a utenti, ruoli e canali" },
  { key: "stripMassMentions", title: "Rimuovi @everyone / @here", hint: "Elimina @everyone e @here dalla descrizione pubblicata" },
  { key: "stripNonInviteLinks", title: "Rimuovi link esterni", hint: "Toglie URL che non sono invite Discord" },
  { key: "stripCustomEmojis", title: "Rimuovi emoji custom", hint: "Cancella emoji del server" },
  { key: "stripInvisibleChars", title: "Rimuovi caratteri invisibili", hint: "Toglie zero-width e altri caratteri nascosti" },
  { key: "stripSpoilers", title: "Rimuovi spoiler", hint: "Toglie la formattazione ||spoiler||" },
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
  /* null = non ancora caricati (skeleton), [] = davvero nessun manager */
  const [managers, setManagers] = useState<PartnershipManager[] | null>(null);
  const [canPoints, setCanPoints] = useState(false);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<PartnershipHistory | null>(null);
  const [days, setDays] = useState("30");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
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
    let cancel = false;
    const query = days === "all" ? { page: historyPage, pageSize: 20 } : { days: Number(days) || 30, page: historyPage, pageSize: 20 };
    listPartnershipHistory(token, guildId, query).then((res) => {
      if (cancel) return;
      setHistoryLoading(false);
      if (res.ok) setHistory(res.data);
      else onToast(res.message, true);
    });
    return () => {
      cancel = true;
    };
  }, [tab, days, historyPage, token, guildId, onToast]);

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

  if (loading) return <FormSkeleton />;
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

  const saveFilters = async () => {
    setBusy(true);
    const res = await patchPartnership(token, guildId, { contentFilters: draft.contentFilters });
    setBusy(false);
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    setBundle(res.data);
    setDraft(res.data.config);
    onToast("Filtri salvati.");
  };

  const roleOptions = (none: string) => [{ value: "", label: none }, ...roles.map((r) => ({ value: r.id, label: `@${r.name}` }))];

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
          {draft.setupCompleted ? "Setup completo" : "Setup da completare: servono canale partnership e ruolo manager"}
        </span>
        {bundle.premiumActive ? <StatusBadge tone="accent">Premium</StatusBadge> : null}
        {draft.inviteUrl ? (
          <a
            href={draft.inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-crema/75 ring-1 ring-sand/15 transition hover:text-crema"
          >
            Invito del server ↗
          </a>
        ) : null}
      </div>
      <Subnav tabs={TABS} value={tab} onChange={setTab} label="Partnership" />

      {tab === "setup" ? (
        <div className="space-y-4">
          <SaveBar text="Le modifiche del setup si applicano quando salvi.">
            <button
              type="button"
              disabled={busy}
              className={dangerBtn}
              onClick={async () => {
                if (!(await confirmDialog({ message: "Azzerare tutta la configurazione partnership? Canali, ruoli e regole tornano vuoti.", danger: true }))) return;
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
            <button type="button" disabled={busy} className={primaryMini} onClick={saveSetup}>
              Salva setup
            </button>
          </SaveBar>

          <div className="grid gap-4 xl:grid-cols-2">
            <FormGroup title="Canali e ruoli" description="Dove escono le partnership e chi le gestisce.">
              <div className="grid gap-4 sm:grid-cols-2">
                <ChannelSelect label="Canale partnership" value={draft.partnershipsChannelId} channels={channels} onChange={(id) => set({ partnershipsChannelId: id })} />
                <ChannelSelect label="Canale log" value={draft.logsChannelId} channels={channels} onChange={(id) => set({ logsChannelId: id })} />
                <Field label="Ruolo dei partner manager">
                  <Select value={draft.partnerManagerRoleId || ""} onChange={(v) => set({ partnerManagerRoleId: v || null })} className={fieldClass} options={roleOptions("— Nessuno —")} />
                </Field>
                <Field label="Ruolo badge" hint="Dato in più ai manager, facoltativo">
                  <Select value={draft.managerBadgeRoleId || ""} onChange={(v) => set({ managerBadgeRoleId: v || null })} className={fieldClass} options={roleOptions("— Nessuno —")} />
                </Field>
              </div>
            </FormGroup>

            <FormGroup title="Comandi dei manager" description="Dove i partner manager possono usare i comandi partnership.">
              <div className="grid gap-4">
                <ChannelSelect label="Canale comandi" value={draft.pmCommandsChannelId} channels={channels} onChange={(id) => set({ pmCommandsChannelId: id })} />
                <Field label="Anche nelle categorie">
                  <MultiSelect
                    value={draft.pmCommandsCategoryIds}
                    onChange={(ids) => set({ pmCommandsCategoryIds: ids })}
                    className={fieldClass}
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </Field>
              </div>
            </FormGroup>

            <FormGroup title="Regole" description="Come si comporta il bot con le richieste di partnership.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Attesa per lo stesso server" hint="Es. 12h, 3d">
                  <input
                    name="same-server-cooldown"
                    value={draft.sameServerCooldownInput}
                    placeholder="12h"
                    onChange={(e) => set({ sameServerCooldownInput: e.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Se il manager esce dal server">
                  <Select
                    value={draft.managerLeaveAction || ""}
                    onChange={(v) => set({ managerLeaveAction: v === "warn" || v === "delete" ? v : null })}
                    className={fieldClass}
                    options={[
                      { value: "", label: "Non fare niente" },
                      { value: "warn", label: "Avvisa nel log" },
                      { value: "delete", label: "Elimina la partnership (dopo 5 min)" },
                    ]}
                  />
                </Field>
              </div>
              <div className="mt-3 divide-y divide-sand/[0.07]">
                <SettingRow title="Salta la conferma del manager" description="La partnership esce subito, senza approvazione.">
                  <Toggle size="sm" checked={draft.skipManager} label="Salta la conferma del manager" onChange={(v) => set({ skipManager: v })} />
                </SettingRow>
                <SettingRow title="Partnership manuale" description="I manager possono pubblicarle anche a mano.">
                  <Toggle size="sm" checked={draft.manualPartnershipEnabled} label="Partnership manuale" onChange={(v) => set({ manualPartnershipEnabled: v })} />
                </SettingRow>
              </div>
            </FormGroup>

            <FormGroup title="Descrizione del vostro server" description="Il testo che il bot manda al server partner.">
              <div className="grid gap-4">
                <Field label="Da dove prenderla">
                  <Select
                    value={draft.partnerDesc.mode || ""}
                    onChange={(v) => set({ partnerDesc: { ...draft.partnerDesc, mode: v || null } })}
                    className={fieldClass}
                    options={[
                      { value: "", label: "Nessuna descrizione" },
                      { value: "channel", label: "Dall'ultimo messaggio di un canale" },
                      { value: "static", label: "Testo scritto qui" },
                    ]}
                  />
                </Field>
                {draft.partnerDesc.mode === "channel" ? (
                  <ChannelSelect
                    label="Canale della descrizione"
                    value={draft.partnerDesc.channelId}
                    channels={channels}
                    onChange={(id) => set({ partnerDesc: { ...draft.partnerDesc, channelId: id } })}
                  />
                ) : null}
                {draft.partnerDesc.mode === "static" ? (
                  <Field label="Testo">
                    <textarea
                      name="partner-description"
                      value={draft.partnerDesc.staticText || ""}
                      maxLength={4000}
                      rows={5}
                      onChange={(e) => set({ partnerDesc: { ...draft.partnerDesc, staticText: e.target.value } })}
                      className={fieldClass}
                    />
                    <MessagePreview text={draft.partnerDesc.staticText} roles={roles} channels={channels} />
                  </Field>
                ) : null}
              </div>
            </FormGroup>
          </div>

          <FormGroup title="Ping automatici" description="Quando il server partner ha abbastanza membri, il bot menziona chi deve vedere la partnership.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-crema/60">
                    <th className="pb-2 font-semibold">Menzione</th>
                    <th className="pb-2 font-semibold">Dai membri</th>
                    <th className="pb-2 font-semibold">Dopo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand/[0.07]">
                  <tr>
                    <td className="py-2 pr-3 font-medium text-crema">@here</td>
                    <td className="py-2 pr-3">
                      <NumberField
                        name="ping-here-members"
                        aria-label="@here dai membri"
                        size="sm"
                        min={0}
                        nullable
                        value={draft.pings.hereMembers ?? null}
                        placeholder="mai"
                        onChange={(n) => set({ pings: { ...draft.pings, hereMembers: n } })}
                        className="mt-0"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        name="ping-here-delay"
                        aria-label="@here dopo"
                        value={draft.pings.hereDelayInput}
                        placeholder="5m"
                        onChange={(e) => set({ pings: { ...draft.pings, hereDelayInput: e.target.value } })}
                        className={cn(fieldClass, "mt-0 py-2")}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-crema">@everyone</td>
                    <td className="py-2 pr-3">
                      <NumberField
                        name="ping-everyone-members"
                        aria-label="@everyone dai membri"
                        size="sm"
                        min={0}
                        nullable
                        value={draft.pings.everyoneMembers ?? null}
                        placeholder="mai"
                        onChange={(n) => set({ pings: { ...draft.pings, everyoneMembers: n } })}
                        className="mt-0"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        name="ping-everyone-delay"
                        aria-label="@everyone dopo"
                        value={draft.pings.everyoneDelayInput}
                        placeholder="5m"
                        onChange={(e) => set({ pings: { ...draft.pings, everyoneDelayInput: e.target.value } })}
                        className={cn(fieldClass, "mt-0 py-2")}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">
                      <Select
                        value={draft.pings.customRoleId || ""}
                        onChange={(v) => set({ pings: { ...draft.pings, customRoleId: v || null } })}
                        className={cn(fieldClass, "mt-0 py-2")}
                        options={roleOptions("Un ruolo…")}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <NumberField
                        name="ping-custom-members"
                        aria-label="Ruolo dai membri"
                        size="sm"
                        min={0}
                        nullable
                        value={draft.pings.customRoleMembers ?? null}
                        placeholder="mai"
                        onChange={(n) => set({ pings: { ...draft.pings, customRoleMembers: n } })}
                        className="mt-0"
                      />
                    </td>
                    <td className="py-2 text-xs text-crema/60">subito</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-crema/60">Vuoto = quella menzione non viene mai fatta. Ruolo e soglia del ruolo vanno impostati insieme.</p>
          </FormGroup>

          <Disclosure
            title={
              <span className="inline-flex items-center gap-2">
                Messaggio di ringraziamento <PremiumBadge active={bundle.premiumActive} />
              </span>
            }
          >
            <p className="text-xs text-crema/60">Il bot lo manda al server partner dopo la pubblicazione.</p>
            {!bundle.premiumActive ? <PremiumLock className="mt-3" feature="Il messaggio di ringraziamento" note="Puoi scriverlo adesso: parte solo quando il server ha Premium." /> : null}
            <div className="mt-3 space-y-4">
              <div className="divide-y divide-sand/[0.07]">
                <SettingRow title="Ringraziamento attivo">
                  <Toggle
                    size="sm"
                    checked={draft.thankYouEmbed.enabled}
                    disabled={!bundle.premiumActive && !draft.thankYouEmbed.enabled}
                    label="Ringraziamento attivo"
                    onChange={(v) => set({ thankYouEmbed: { ...draft.thankYouEmbed, enabled: v } })}
                  />
                </SettingRow>
              </div>
              <Field label="Titolo">
                <input
                  name="thank-you-title"
                  value={draft.thankYouEmbed.title || ""}
                  onChange={(e) => set({ thankYouEmbed: { ...draft.thankYouEmbed, title: e.target.value || null } })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Testo">
                <textarea
                  name="thank-you-description"
                  value={draft.thankYouEmbed.description || ""}
                  rows={3}
                  onChange={(e) => set({ thankYouEmbed: { ...draft.thankYouEmbed, description: e.target.value || null } })}
                  className={fieldClass}
                />
              </Field>
              <MessagePreview
                title={draft.thankYouEmbed.title}
                text={draft.thankYouEmbed.description}
                roles={roles}
                channels={channels}
                samples={{ guild: "Server Partner", points: "12", user: "@manager", manager: "@manager" }}
              />
              <button
                type="button"
                className={primaryMini}
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
                  onToast("Ringraziamento salvato.");
                }}
              >
                Salva ringraziamento
              </button>
            </div>
          </Disclosure>
        </div>
      ) : null}

      {tab === "filtri" ? (
        <div className="space-y-4">
          <SaveBar text="Pulizia automatica della descrizione dei server partner. L'invito Discord resta sempre.">
            <button type="button" className={primaryMini} disabled={busy} onClick={saveFilters}>
              Salva filtri
            </button>
          </SaveBar>
          <FormGroup title="Cosa togliere dalla descrizione" description={`${FILTERS.filter((f) => draft.contentFilters[f.key]).length} filtri attivi su ${FILTERS.length}`}>
            <div className="divide-y divide-sand/[0.07]">
              {FILTERS.map((row) => (
                <SettingRow key={row.key} title={row.title} description={row.hint}>
                  <Toggle
                    size="sm"
                    checked={draft.contentFilters[row.key]}
                    label={row.title}
                    onChange={(v) => set({ contentFilters: { ...draft.contentFilters, [row.key]: v } })}
                  />
                </SettingRow>
              ))}
            </div>
          </FormGroup>
        </div>
      ) : null}

      {tab === "blacklist" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <FormGroup title="Blocca un server" description="Il bot rifiuta le partnership dei server in blacklist.">
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const target = blTarget.trim();
                if (!target) {
                  onToast("Scrivi l'ID del server o un suo invito.", true);
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
                onToast("Server aggiunto alla blacklist.");
              }}
            >
              <Field label="Server" hint="ID del server oppure link d'invito">
                <input name="blacklist-target" value={blTarget} onChange={(e) => setBlTarget(e.target.value)} placeholder="discord.gg/… o 1234…" className={fieldClass} />
              </Field>
              <Field label="Nota" hint="Facoltativa, la vede solo lo staff">
                <input name="blacklist-note" value={blNote} maxLength={500} onChange={(e) => setBlNote(e.target.value)} className={fieldClass} />
              </Field>
              <button type="submit" disabled={busy} className={cn(primaryMini, "w-full py-2")}>
                Aggiungi alla blacklist
              </button>
            </form>
          </FormGroup>
          <section className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-crema">Server bloccati</h3>
              <span className="text-xs tabular-nums text-crema/60">{blacklist?.length ?? 0}</span>
            </div>
            {!blacklist?.length ? (
              <p className="rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">Nessun server in blacklist.</p>
            ) : (
              <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
                {blacklist.map((row) => (
                  <li key={row.guildId} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-crema/[0.02]">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-crema/[0.08] text-sm font-bold text-crema/80" aria-hidden>
                      {(String(row.guildName || "?").trim().charAt(0) || "?").toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-crema">{row.guildName || "Server sconosciuto"}</p>
                      <p className="truncate text-xs text-crema/60">
                        <span className="font-mono">{row.invite || row.guildId}</span>
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
                      Togli
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "manager" ? (
        managers === null ? (
          <ul className="grid gap-2.5 md:grid-cols-2" aria-busy>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                <span className="size-9 shrink-0 animate-pulse rounded-lg bg-crema/[0.06]" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-3.5 w-2/5 animate-pulse rounded bg-crema/[0.08]" />
                  <span className="block h-3 w-3/5 animate-pulse rounded bg-crema/[0.05]" />
                </span>
                <span className="h-6 w-10 animate-pulse rounded bg-crema/[0.06]" />
              </li>
            ))}
          </ul>
        ) : managers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">
            Nessun partner manager: chi ha il ruolo dei manager compare qui con i suoi punti.
          </p>
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {[...managers]
              .sort((a, b) => b.points - a.points)
              .map((m, i) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 rounded-xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
                      i === 0 ? "bg-caramel/20 text-ember" : "bg-crema/[0.06] text-crema/70",
                    )}
                    aria-label={`Posizione ${i + 1}`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-crema">{m.displayName}</p>
                    <p className="text-xs text-crema/60">
                      oggi <span className="tabular-nums text-crema/80">{m.daily}</span> · settimana{" "}
                      <span className="tabular-nums text-crema/80">{m.weekly}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-semibold leading-none tabular-nums text-crema">{m.points}</p>
                    <p className="text-[0.65rem] text-crema/60">punti</p>
                  </div>
                  {canPoints ? (
                    <form
                      className="flex w-full items-center gap-1.5 border-t border-sand/[0.08] pt-2.5"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const amount = Number.parseInt(points[m.userId] || "", 10);
                        const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-act");
                        if (action !== "add" && action !== "remove") return;
                        if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
                          onToast("Scrivi un numero da 1 a 10000.", true);
                          return;
                        }
                        const res = await adjustPartnershipManagerPoints(token, guildId, m.userId, action, amount);
                        if (!res.ok) {
                          onToast(res.message, true);
                          return;
                        }
                        onToast(res.data.message);
                        setPoints((cur) => ({ ...cur, [m.userId]: "" }));
                        const fresh = await loadPartnershipManagers(token, guildId);
                        if (fresh.ok) setManagers(fresh.data.managers);
                      }}
                    >
                      <span className="text-xs text-crema/60">Correggi punti</span>
                      <input
                        name="manager-points"
                        aria-label={`Punti da aggiungere o togliere a ${m.displayName}`}
                        value={points[m.userId] || ""}
                        onChange={(e) => setPoints((cur) => ({ ...cur, [m.userId]: e.target.value }))}
                        inputMode="numeric"
                        placeholder="0"
                        className="ml-auto w-20 rounded-lg bg-espresso/70 px-2 py-1.5 text-center text-sm tabular-nums text-crema ring-1 ring-sand/15"
                      />
                      <button type="submit" data-act="add" className={miniBtn} aria-label="Aggiungi punti">
                        + Aggiungi
                      </button>
                      <button type="submit" data-act="remove" className={miniBtn} aria-label="Togli punti">
                        − Togli
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
          </ul>
        )
      ) : null}

      {tab === "storia" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-grid grid-cols-3 gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Periodo">
              {[
                { v: "7", l: "7 giorni" },
                { v: "30", l: "30 giorni" },
                { v: "all", l: "Sempre" },
              ].map((p) => (
                <button
                  key={p.v}
                  type="button"
                  role="radio"
                  aria-checked={days === p.v}
                  onClick={() => {
                    if (p.v === days) return;
                    setHistoryLoading(true);
                    setHistoryPage(1);
                    setDays(p.v);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                    days === p.v ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema",
                  )}
                >
                  {p.l}
                </button>
              ))}
            </div>
            {history ? (
              <p className="text-sm text-crema/70">
                <span className="font-semibold tabular-nums text-crema">{history.totalPartnerships}</span> partnership con{" "}
                <span className="font-semibold tabular-nums text-crema">{history.uniqueServers}</span> server
              </p>
            ) : null}
          </div>
          {!history || (historyLoading && !history.entries.length) ? (
            <ul className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10" aria-busy>
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="size-9 shrink-0 animate-pulse rounded-xl bg-crema/[0.06]" />
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="block h-3.5 w-1/3 animate-pulse rounded bg-crema/[0.08]" />
                    <span className="block h-3 w-1/4 animate-pulse rounded bg-crema/[0.05]" />
                  </span>
                </li>
              ))}
            </ul>
          ) : !history.entries.length ? (
            <p className="rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">Nessuna partnership in questo periodo.</p>
          ) : (
            <>
            <ul className={cn("divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10 transition-opacity", historyLoading && "opacity-50")}>
              {history.entries.map((row, i) => (
                <li key={`${row.guildId || row.invite || i}`} className="flex items-center gap-3 px-4 py-3">
                  {row.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.iconUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-xl object-cover ring-1 ring-sand/15" />
                  ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-crema/[0.08] text-sm font-bold text-crema/80" aria-hidden>
                      {(String(row.guildName || row.invite || "?").trim().charAt(0) || "?").toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-crema">{row.guildName || row.invite || "Server"}</p>
                    {row.lastAt ? <p className="text-xs text-crema/60">ultima il {new Date(row.lastAt).toLocaleDateString("it-IT")}</p> : null}
                  </div>
                  <span className="rounded-md bg-crema/[0.07] px-2 py-1 text-xs font-semibold tabular-nums text-crema/85">
                    {row.count} {row.count === 1 ? "volta" : "volte"}
                  </span>
                </li>
              ))}
            </ul>
            {history.totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs tabular-nums text-crema/60">
                  Pagina {history.page} di {history.totalPages}
                </span>
                <Pagination
                  page={history.page}
                  totalPages={history.totalPages}
                  onChange={(n) => {
                    setHistoryLoading(true);
                    setHistoryPage(n);
                  }}
                />
              </div>
            ) : null}
            </>
          )}
        </div>
      ) : null}

      {tab === "migrazione" ? (
        <FormGroup
          title="Importa le partnership vecchie"
          description="Legge il canale partnership e registra le partnership già pubblicate, con i punti dei manager."
        >
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-espresso/50 p-3 ring-1 ring-sand/10">
            <StatusBadge tone={migration?.job?.status === "done" || migration?.job?.status === "completed" ? "ok" : migration?.job?.error ? "warn" : migration?.job ? "accent" : "muted"}>
              {migration?.job ? MIGRATION_STATUS[migration.job.status] || migration.job.status : "mai avviata"}
            </StatusBadge>
            {migration?.job?.queuePosition ? <span className="text-sm text-crema/70">in coda: posizione {migration.job.queuePosition}</span> : null}
            {migration?.job?.imported ? (
              <span className="text-sm text-crema/70">
                <span className="font-semibold tabular-nums text-crema">{migration.job.imported}</span> importate
              </span>
            ) : null}
          </div>
          {migration?.job?.error ? (
            <div className="mt-3">
              <Notice error>{migration.job.error}</Notice>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
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
              Avvia importazione
            </button>
            {migration?.job?.canUndo ? (
              <button
                type="button"
                className={dangerBtn}
                disabled={busy}
                onClick={async () => {
                  if (!(await confirmDialog({ message: "Annullare l'ultima importazione? Le partnership importate e i loro punti vengono tolti.", danger: true }))) return;
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
                Annulla ultima importazione
              </button>
            ) : null}
          </div>
        </FormGroup>
      ) : null}
    </div>
  );
}

const MIGRATION_STATUS: Record<string, string> = {
  queued: "in coda",
  running: "in corso",
  done: "completata",
  completed: "completata",
  pending: "in attesa",
  failed: "non riuscita",
  undone: "annullata",
};

/** Barra in alto con le azioni della sezione (sempre in vista mentre scorri). */
function SaveBar({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-xl bg-roast/95 px-4 py-3 ring-1 ring-sand/10 backdrop-blur-md">
      <p className="min-w-0 flex-1 text-xs text-crema/70">{text}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

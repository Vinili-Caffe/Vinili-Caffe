"use client";

import { useEffect, useState } from "react";
import {
  SUPPORT_DAYS,
  TICKET_TYPES,
  createTicketMulti,
  createTicketPanel,
  deleteTicketMulti,
  deleteTicketPanel,
  loadTicketForms,
  loadTicketPanels,
  publishTicketMulti,
  publishTicketPanel,
  syncTicketPanels,
  updateTicketMulti,
  updateTicketPanel,
  type AccessRule,
  type SupportHours,
  type TicketForm,
  type TicketMulti,
  type TicketPanelsBundle,
  type TicketPerms,
  type TicketSingle,
  type WelcomeEmbed,
} from "@/lib/dashboard-guild";
import { Checkbox, Disclosure } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { DiscordPanelPreview } from "./DiscordPanelPreview";
import { Field, MultiCheck, Notice, Toggle, dangerBtn, fieldClass, miniBtn, primaryMini } from "./bits";

const TYPE_LABEL: Record<string, string> = {
  supporto: "Supporto",
  partnership: "Partnership",
  high: "High Staff",
  perks: "Perks",
};

const BUTTON_STYLES = [
  { id: "Primary", label: "Blue" },
  { id: "Secondary", label: "Grey" },
  { id: "Success", label: "Green" },
  { id: "Danger", label: "Red" },
];

const DAY_LABEL: Record<string, string> = {
  sunday: "domenica",
  monday: "lunedì",
  tuesday: "martedì",
  wednesday: "mercoledì",
  thursday: "giovedì",
  friday: "venerdì",
  saturday: "sabato",
};

const MENTION_EXTRAS = [
  { id: "opener", label: "Ticket Opener" },
  { id: "everyone", label: "@everyone" },
  { id: "here", label: "@here" },
];

const PERM_KEYS: (keyof Omit<TicketPerms, "replace">)[] = [
  "addReactions",
  "sendTtsMessages",
  "embedLinks",
  "attachFiles",
  "useExternalEmojis",
  "useExternalStickers",
  "sendVoiceMessages",
];

function emptyWelcome(): WelcomeEmbed {
  return {
    color: "#6f4e37",
    title: "",
    titleUrl: null,
    description: "",
    authorName: null,
    authorIconUrl: null,
    authorUrl: null,
    largeImageUrl: null,
    smallImageUrl: null,
    footerText: null,
    footerIconUrl: null,
    footerTimestamp: false,
    fields: [],
  };
}

function emptyHours(): SupportHours {
  const days: SupportHours["days"] = {};
  for (const day of SUPPORT_DAYS) days[day] = { enabled: false, allDay: true, start: "09:00", end: "17:00" };
  return { timezone: "Europe/Rome", days };
}

function blankSingle(channelId: string | null): TicketSingle {
  return {
    id: "",
    title: "Apri un ticket",
    content: "",
    color: "#6f4e37",
    channelId,
    channelName: null,
    disabled: false,
    buttonStyle: "Primary",
    buttonText: "Apri un ticket",
    buttonEmoji: null,
    ticketType: "supporto",
    ticketTypeLabel: "",
    formId: null,
    messageId: null,
    largeImageUrl: null,
    smallImageUrl: null,
    mentionOnOpen: [],
    supportTeamIds: [],
    transcriptChannelId: null,
    deleteMentionsOnOpen: false,
    openCooldownSeconds: 0,
    categoryId: null,
    maxOpenTicketsPerUser: null,
    hideCloseButton: null,
    hideCloseReasonButton: null,
    hideClaimButton: null,
    welcome: emptyWelcome(),
    ticketPerms: null,
    accessRules: [{ roleId: "everyone", allow: true }],
    supportHours: emptyHours(),
    supportHoursLabel: "24/7",
  };
}

function blankMulti(channelId: string | null): TicketMulti {
  return {
    id: "",
    title: "",
    titleUrl: null,
    description: "",
    color: "#6f4e37",
    channelId,
    channelName: null,
    panelIds: [],
    panels: [],
    useDropdown: true,
    dropdownPlaceholder: "Seleziona un argomento...",
    optionOverrides: {},
    messageId: null,
    fields: [],
    authorName: null,
    footerText: null,
    footerTimestamp: false,
    largeImageUrl: null,
    smallImageUrl: null,
  };
}

function singleBody(panel: TicketSingle, editing: boolean): Record<string, unknown> {
  return {
    ticketType: panel.ticketType || "supporto",
    channelId: panel.channelId,
    title: panel.title,
    color: panel.color,
    content: panel.content,
    buttonText: panel.buttonText,
    buttonStyle: panel.buttonStyle,
    buttonEmoji: panel.buttonEmoji,
    largeImageUrl: panel.largeImageUrl,
    smallImageUrl: panel.smallImageUrl,
    disabled: panel.disabled,
    mentionOnOpen: panel.mentionOnOpen,
    supportTeamIds: panel.supportTeamIds,
    transcriptChannelId: panel.transcriptChannelId,
    deleteMentionsOnOpen: panel.deleteMentionsOnOpen,
    threadMode: false,
    threadNotificationChannelId: null,
    openCooldownSeconds: Number(panel.openCooldownSeconds) || 0,
    categoryId: panel.categoryId,
    maxOpenTicketsPerUser: panel.maxOpenTicketsPerUser,
    hideCloseButton: panel.hideCloseButton,
    hideCloseReasonButton: panel.hideCloseReasonButton,
    hideClaimButton: panel.hideClaimButton,
    formId: panel.formId,
    welcome: panel.welcome,
    ticketPerms: panel.ticketPerms,
    accessRules: panel.accessRules,
    supportHours: panel.supportHours,
    publish: false,
    syncExisting: editing,
  };
}

function triValue(value: boolean | null) {
  if (value === true) return "1";
  if (value === false) return "0";
  return "";
}

function fromTri(value: string): boolean | null {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function triOptions(defaultHidden: boolean) {
  return [
    { value: "", label: defaultHidden ? "Nascondi" : "Mostra" },
    { value: "0", label: "Mostra" },
    { value: "1", label: "Nascondi" },
  ];
}

export function TicketPanels({
  guildId,
  token,
  isMainGuild,
  hideClose,
  hideCloseReason,
  hideClaim,
  maxOpen,
  onToast,
}: {
  guildId: string;
  token: string;
  isMainGuild: boolean;
  hideClose: boolean;
  hideCloseReason: boolean;
  hideClaim: boolean;
  maxOpen: number;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [bundle, setBundle] = useState<TicketPanelsBundle | null>(null);
  const [forms, setForms] = useState<TicketForm[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [single, setSingle] = useState<TicketSingle | null>(null);
  const [multi, setMulti] = useState<TicketMulti | null>(null);

  const reload = async () => {
    const [panels, formRes] = await Promise.all([loadTicketPanels(token, guildId), loadTicketForms(token, guildId)]);
    if (!panels.ok) {
      setError(panels.message || "Impossibile caricare i pannelli.");
      return;
    }
    setError("");
    setBundle(panels.data);
    if (formRes.ok) setForms(formRes.data.forms);
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancel) setLoading(false);
    })();
    return () => {
      cancel = true;
    };
    // reload identity changes each render; the ids are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, guildId]);

  const after = async (res: { ok: true; data: { message: string; warning: string | null } } | { ok: false; message: string }, okText: string) => {
    if (!res.ok) {
      onToast(res.message, true);
      return;
    }
    if (res.data.warning) onToast(res.data.warning, true);
    else onToast(res.data.message || okText);
    setSingle(null);
    setMulti(null);
    await reload();
  };

  if (loading) return <p className="text-sm text-crema/45">Caricamento pannelli…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  const channels = bundle.pickers.textChannels;
  const roles = bundle.pickers.roles;
  const defaultChannel = bundle.settings.panelChannelId;

  if (single) {
    const editing = Boolean(single.id);
    const set = (patch: Partial<TicketSingle>) => setSingle({ ...single, ...patch });
    const mentionOptions = [
      ...MENTION_EXTRAS,
      ...roles.map((r) => ({ id: r.id, label: `@${r.name}` })),
    ];
    return (
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const body = singleBody(single, editing);
          const res = editing
            ? await updateTicketPanel(token, guildId, single.id, body)
            : await createTicketPanel(token, guildId, body);
          setBusy(false);
          await after(res, editing ? "Pannello aggiornato." : "Pannello creato.");
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={miniBtn} onClick={() => setSingle(null)}>
            Elenco
          </button>
          <p className="text-sm font-semibold text-crema">{editing ? "Modifica pannello" : "Crea pannello"}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <Select
              value={single.ticketType}
              onChange={(v) => set({ ticketType: v })}
              className={fieldClass}
              options={TICKET_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] || t }))}
            />
          </Field>
          <Field label="Canale">
            <Select
              value={single.channelId || ""}
              onChange={(v) => set({ channelId: v || null })}
              className={fieldClass}
              options={[
                { value: "", label: "— Nessuno —" },
                ...channels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
              ]}
            />
          </Field>
          <Field label="Titolo">
            <input name="title" value={single.title} maxLength={256} onChange={(e) => set({ title: e.target.value })} className={fieldClass} />
          </Field>
          <Field label="Colore">
            <input name="color" value={single.color} onChange={(e) => set({ color: e.target.value })} className={fieldClass} />
          </Field>
          <Field label="Testo bottone">
            <input name="button-text"
              value={single.buttonText}
              maxLength={80}
              onChange={(e) => set({ buttonText: e.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="Colore bottone">
            <Select
              value={single.buttonStyle}
              onChange={(v) => set({ buttonStyle: v })}
              className={fieldClass}
              options={BUTTON_STYLES.map((s) => ({ value: s.id, label: s.label }))}
            />
          </Field>
          <Field label="Emoji bottone">
            <input name="button-emoji"
              value={single.buttonEmoji || ""}
              onChange={(e) => set({ buttonEmoji: e.target.value || null })}
              placeholder="😀 oppure <:nome:id>"
              className={fieldClass}
            />
          </Field>
          <Field label="Form">
            <Select
              value={single.formId || ""}
              onChange={(v) => set({ formId: v || null })}
              className={fieldClass}
              options={[{ value: "", label: "Nessuno" }, ...forms.map((f) => ({ value: f.id, label: f.title }))]}
            />
          </Field>
        </div>
        <Field label="Contenuto">
          <textarea name="content"
            value={single.content}
            maxLength={4096}
            rows={4}
            onChange={(e) => set({ content: e.target.value })}
            className={fieldClass}
          />
        </Field>
        <DiscordPanelPreview
          title={single.title}
          description={single.content}
          color={single.color}
          buttonText={single.buttonText}
          buttonStyle={single.buttonStyle}
          buttonEmoji={single.buttonEmoji}
        />
        <label className="flex items-center gap-2 text-sm text-crema/75">
          <Checkbox checked={single.disabled} className="size-3.5" onChange={(v) => set({ disabled: v })} />
          Disabilita pannello
        </label>
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">Menzioni all&apos;apertura</p>
          <MultiCheck options={mentionOptions} selected={single.mentionOnOpen} onChange={(ids) => set({ mentionOnOpen: ids })} />
        </div>
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">Team di supporto</p>
          <MultiCheck
            options={bundle.teams.map((t) => ({ id: t.id, label: t.isDefault ? `${t.name} (Default)` : t.name }))}
            selected={single.supportTeamIds}
            onChange={(ids) => set({ supportTeamIds: ids })}
            empty="Nessun team"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoria ticket">
            <Select
              value={single.categoryId || ""}
              onChange={(v) => set({ categoryId: v || null })}
              className={fieldClass}
              options={[
                { value: "", label: "Eredita" },
                ...bundle.pickers.categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Field>
          <Field label="Canale transcript">
            <Select
              value={single.transcriptChannelId || ""}
              onChange={(v) => set({ transcriptChannelId: v || null })}
              className={fieldClass}
              options={[
                { value: "", label: "Eredita" },
                ...channels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
              ]}
            />
          </Field>
          <Field label="Max aperti per utente">
            <Select
              value={single.maxOpenTicketsPerUser == null ? "" : String(single.maxOpenTicketsPerUser)}
              onChange={(v) => set({ maxOpenTicketsPerUser: v === "" ? null : Number(v) })}
              className={fieldClass}
              options={[
                { value: "", label: String(maxOpen) },
                ...Array.from({ length: 25 }, (_, i) => {
                  const n = i + 1;
                  return { value: String(n), label: String(n) };
                }),
              ]}
            />
          </Field>
          <Field label="Cooldown apertura (secondi)">
            <input name="open-cooldown-seconds"
              type="number"
              min={0}
              max={86400}
              value={single.openCooldownSeconds}
              onChange={(e) => set({ openCooldownSeconds: Number(e.target.value) || 0 })}
              className={fieldClass}
            />
          </Field>
          <Field label="Chiudi">
            <Select
              value={triValue(single.hideCloseButton)}
              onChange={(v) => set({ hideCloseButton: fromTri(v) })}
              className={fieldClass}
              options={triOptions(hideClose)}
            />
          </Field>
          <Field label="Nascondi Chiudi con motivo">
            <Select
              value={triValue(single.hideCloseReasonButton)}
              onChange={(v) => set({ hideCloseReasonButton: fromTri(v) })}
              className={fieldClass}
              options={triOptions(hideCloseReason)}
            />
          </Field>
          <Field label="Claim">
            <Select
              value={triValue(single.hideClaimButton)}
              onChange={(v) => set({ hideClaimButton: fromTri(v) })}
              className={fieldClass}
              options={triOptions(hideClaim)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-crema/75">
          <Checkbox
            checked={single.deleteMentionsOnOpen}
            className="size-3.5"
            onChange={(v) => set({ deleteMentionsOnOpen: v })}
          />
          Cancella le menzioni all&apos;apertura
        </label>

        <Disclosure title="Benvenuto">
          <div className="grid gap-3">
            <Field label="Titolo">
              <input name="welcome-title"
                value={single.welcome.title}
                maxLength={256}
                onChange={(e) => set({ welcome: { ...single.welcome, title: e.target.value } })}
                className={fieldClass}
              />
            </Field>
            <Field label="Descrizione">
              <textarea name="welcome-description"
                value={single.welcome.description}
                maxLength={4096}
                rows={4}
                onChange={(e) => set({ welcome: { ...single.welcome, description: e.target.value } })}
                className={fieldClass}
              />
            </Field>
          </div>
        </Disclosure>

        <Disclosure title={`Orari · ${single.supportHoursLabel || "24/7"}`}>
          <div className="space-y-2">
            <Field label="Fuso">
              <input name="support-hours-timezone"
                value={single.supportHours.timezone}
                onChange={(e) => set({ supportHours: { ...single.supportHours, timezone: e.target.value || "Europe/Rome" } })}
                className={fieldClass}
              />
            </Field>
            {SUPPORT_DAYS.map((day) => {
              const row = single.supportHours.days[day];
              const patchDay = (patch: Partial<SupportHours["days"][string]>) =>
                set({
                  supportHours: {
                    ...single.supportHours,
                    days: { ...single.supportHours.days, [day]: { ...row, ...patch } },
                  },
                });
              return (
                <div key={day} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-4">
                  <span className="text-sm capitalize text-crema/75">{DAY_LABEL[day]}</span>
                  <label className="flex items-center gap-1.5 text-xs text-crema/60">
                    <Checkbox checked={row?.enabled === true} onChange={(v) => patchDay({ enabled: v })} />
                    Attivo
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-crema/60">
                    <Checkbox checked={row?.allDay !== false} onChange={(v) => patchDay({ allDay: v })} />
                    Tutto il giorno
                  </label>
                  <div className="flex gap-1">
                    <input
                      name={`hours-start-${day}`}
                      aria-label={`${DAY_LABEL[day]} inizio`}
                      value={row?.start || "09:00"}
                      onChange={(e) => patchDay({ start: e.target.value })}
                      className="w-16 rounded-lg bg-espresso/70 px-1.5 py-1 text-xs text-crema ring-1 ring-sand/20"
                    />
                    <input
                      name={`hours-end-${day}`}
                      aria-label={`${DAY_LABEL[day]} fine`}
                      value={row?.end || "17:00"}
                      onChange={(e) => patchDay({ end: e.target.value })}
                      className="w-16 rounded-lg bg-espresso/70 px-1.5 py-1 text-xs text-crema ring-1 ring-sand/20"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Disclosure>

        <Disclosure title="Chi può aprire">
          <ul className="space-y-2">
            {single.accessRules.map((rule, index) => (
              <li key={`${rule.roleId}-${index}`} className="flex flex-wrap items-center gap-2">
                <Select
                  value={rule.roleId}
                  onChange={(roleId) => {
                    const accessRules = single.accessRules.slice();
                    accessRules[index] = { ...rule, roleId };
                    set({ accessRules });
                  }}
                  className={fieldClass}
                  options={[
                    { value: "everyone", label: "@everyone" },
                    ...roles.map((r) => ({ value: r.id, label: `@${r.name}` })),
                  ]}
                />
                <label className="flex items-center gap-1.5 text-xs text-crema/70">
                  <Checkbox
                    checked={rule.allow}
                    onChange={(v) => {
                      const accessRules: AccessRule[] = single.accessRules.slice();
                      accessRules[index] = { ...rule, allow: v };
                      set({ accessRules });
                    }}
                  />
                  Consenti
                </label>
                <button
                  type="button"
                  className={dangerBtn}
                  onClick={() => set({ accessRules: single.accessRules.filter((_, i) => i !== index) })}
                >
                  Rimuovi
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${miniBtn} mt-2`}
            onClick={() => set({ accessRules: [...single.accessRules, { roleId: "everyone", allow: true }] })}
          >
            Aggiungi regola
          </button>
        </Disclosure>

        <Disclosure title="Permessi opener">
          <div className="space-y-2">
            <Toggle
              checked={Boolean(single.ticketPerms)}
              label="Permessi personalizzati"
              onChange={(on) =>
                set({
                  ticketPerms: on
                    ? {
                        replace: true,
                        addReactions: false,
                        sendTtsMessages: false,
                        embedLinks: false,
                        attachFiles: false,
                        useExternalEmojis: false,
                        useExternalStickers: false,
                        sendVoiceMessages: false,
                      }
                    : null,
                })
              }
            />
            {single.ticketPerms
              ? PERM_KEYS.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-crema/75">{key}</span>
                    <Toggle
                      checked={single.ticketPerms?.[key] === true}
                      label={key}
                      onChange={(next) =>
                        set({ ticketPerms: { ...(single.ticketPerms as TicketPerms), [key]: next, replace: true } })
                      }
                    />
                  </div>
                ))
              : null}
          </div>
        </Disclosure>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primaryMini}>
            {editing ? "Salva" : "Crea"}
          </button>
          {editing ? (
            <>
              <button
                type="button"
                disabled={busy}
                className={miniBtn}
                onClick={async () => {
                  setBusy(true);
                  const res = await publishTicketPanel(token, guildId, single.id, false);
                  setBusy(false);
                  await after(res, "Pubblicato.");
                }}
              >
                Pubblica
              </button>
              <button
                type="button"
                disabled={busy}
                className={dangerBtn}
                onClick={async () => {
                  setBusy(true);
                  const res = await deleteTicketPanel(token, guildId, single.id);
                  setBusy(false);
                  await after(res, "Pannello eliminato.");
                }}
              >
                Elimina
              </button>
            </>
          ) : null}
        </div>
      </form>
    );
  }

  if (multi) {
    const editing = Boolean(multi.id);
    const set = (patch: Partial<TicketMulti>) => setMulti({ ...multi, ...patch });
    return (
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (multi.panelIds.length < 2) {
            onToast("Seleziona almeno 2 pannelli.", true);
            return;
          }
          setBusy(true);
          const body = {
            channelId: multi.channelId,
            panelIds: multi.panelIds,
            useDropdown: multi.useDropdown,
            dropdownPlaceholder: multi.dropdownPlaceholder,
            title: multi.title,
            titleUrl: multi.titleUrl,
            color: multi.color,
            description: multi.description,
            authorName: multi.authorName,
            footerText: multi.footerText,
            footerTimestamp: multi.footerTimestamp,
            largeImageUrl: multi.largeImageUrl,
            smallImageUrl: multi.smallImageUrl,
            fields: multi.fields,
            optionOverrides: multi.optionOverrides,
            publish: false,
            syncExisting: editing,
          };
          const res = editing
            ? await updateTicketMulti(token, guildId, multi.id, body)
            : await createTicketMulti(token, guildId, body);
          setBusy(false);
          await after(res, editing ? "Multi-panel aggiornato." : "Multi-panel creato.");
        }}
      >
        <button type="button" className={miniBtn} onClick={() => setMulti(null)}>
          Elenco
        </button>
        <p className="text-sm font-semibold text-crema">{editing ? "Modifica multi-panel" : "Crea multi-panel"}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Canale">
            <Select
              value={multi.channelId || ""}
              onChange={(v) => set({ channelId: v || null })}
              className={fieldClass}
              options={[
                { value: "", label: "— Nessuno —" },
                ...channels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
              ]}
            />
          </Field>
          <Field label="Titolo">
            <input name="multi-title" value={multi.title} maxLength={256} onChange={(e) => set({ title: e.target.value })} className={fieldClass} />
          </Field>
          <Field label="Colore">
            <input name="multi-color" value={multi.color} onChange={(e) => set({ color: e.target.value })} className={fieldClass} />
          </Field>
          <Field label="Placeholder menu">
            <input name="dropdown-placeholder"
              value={multi.dropdownPlaceholder}
              maxLength={150}
              onChange={(e) => set({ dropdownPlaceholder: e.target.value })}
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="Descrizione">
          <textarea name="description"
            value={multi.description}
            maxLength={4096}
            rows={3}
            onChange={(e) => set({ description: e.target.value })}
            className={fieldClass}
          />
        </Field>
        <DiscordPanelPreview
          title={multi.title}
          description={multi.description}
          color={multi.color}
          buttonText={multi.dropdownPlaceholder}
          mode={multi.useDropdown ? "dropdown" : "button"}
          fields={multi.fields}
          footer={multi.footerText}
          options={multi.panelIds
            .map((id) => bundle.singles.find((p) => p.id === id))
            .filter(Boolean)
            .map((p) => ({
              label: p!.title || p!.buttonText || p!.id,
              description: p!.content || undefined,
            }))}
        />
        <label className="flex items-center gap-2 text-sm text-crema/75">
          <Checkbox checked={multi.useDropdown} className="size-3.5" onChange={(v) => set({ useDropdown: v })} />
          Menu a tendina
        </label>
        <div>
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45">Pannelli</p>
          <MultiCheck
            options={bundle.singles.map((p) => ({ id: p.id, label: p.title || p.id }))}
            selected={multi.panelIds}
            onChange={(ids) => set({ panelIds: ids })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primaryMini}>
            {editing ? "Salva" : "Crea"}
          </button>
          {editing ? (
            <>
              <button
                type="button"
                className={miniBtn}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await publishTicketMulti(token, guildId, multi.id, false);
                  setBusy(false);
                  await after(res, "Pubblicato.");
                }}
              >
                Pubblica
              </button>
              <button
                type="button"
                className={dangerBtn}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await deleteTicketMulti(token, guildId, multi.id);
                  setBusy(false);
                  await after(res, "Multi-panel eliminato.");
                }}
              >
                Elimina
              </button>
            </>
          ) : null}
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-crema/45">
          Pannelli{" "}
          <span className="lining-nums">
            {bundle.quota.singlesUsed}/{bundle.quota.singlesMax}
          </span>
          {" · "}multi{" "}
          <span className="lining-nums">
            {bundle.quota.multisUsed}/{bundle.quota.multisMax}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryMini} onClick={() => setSingle(blankSingle(defaultChannel))}>
            Nuovo pannello
          </button>
          <button type="button" className={miniBtn} onClick={() => setMulti(blankMulti(defaultChannel))}>
            Nuovo multi-panel
          </button>
          {isMainGuild ? (
            <button
              type="button"
              className={miniBtn}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await syncTicketPanels(token, guildId);
                setBusy(false);
                if (!res.ok) {
                  onToast(res.message, true);
                  return;
                }
                onToast(res.data.message || "Sincronizzato.");
                await reload();
              }}
            >
              Sincronizza legacy
            </button>
          ) : null}
        </div>
      </div>

      <ul className="divide-y divide-sand/10 rounded-xl bg-espresso/40 ring-1 ring-sand/12">
        {bundle.singles.length === 0 ? (
          <li className="px-3 py-4 text-sm text-crema/40">Nessun pannello</li>
        ) : (
          bundle.singles.map((panel) => (
            <li key={panel.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSingle(panel)}>
                <p className="truncate text-sm font-medium text-crema">{panel.title || panel.id}</p>
                <p className="truncate text-xs text-crema/40">
                  {panel.ticketTypeLabel || TYPE_LABEL[panel.ticketType] || panel.ticketType}
                  {panel.channelName ? ` · ${panel.channelName}` : ""}
                  {panel.disabled ? " · disabilitato" : ""}
                  {panel.messageId ? " · pubblicato" : ""}
                </p>
              </button>
              <button type="button" className={miniBtn} onClick={() => setSingle(panel)}>
                Modifica
              </button>
            </li>
          ))
        )}
      </ul>

      <ul className="divide-y divide-sand/10 rounded-xl bg-espresso/40 ring-1 ring-sand/12">
        {bundle.multis.length === 0 ? (
          <li className="px-3 py-4 text-sm text-crema/40">Nessun multi-panel</li>
        ) : (
          bundle.multis.map((panel) => (
            <li key={panel.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setMulti(panel)}>
                <p className="truncate text-sm font-medium text-crema">{panel.title || "Multi-panel"}</p>
                <p className="truncate text-xs text-crema/40">
                  {panel.panelIds.length} pannelli
                  {panel.channelName ? ` · ${panel.channelName}` : ""}
                </p>
              </button>
              <button type="button" className={miniBtn} onClick={() => setMulti(panel)}>
                Modifica
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

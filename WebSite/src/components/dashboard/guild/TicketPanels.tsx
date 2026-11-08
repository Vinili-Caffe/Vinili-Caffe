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
import { Checkbox, Disclosure, confirmDialog } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { DiscordPanelPreview } from "./DiscordPanelPreview";
import { EditorHeader, Field, FormGroup, MultiCheck, Notice, SettingRow, StatusBadge, Toggle, dangerBtn, fieldClass, labelClass, miniBtn, primaryMini } from "./bits";

const TYPE_LABEL: Record<string, string> = {
  supporto: "Supporto",
  partnership: "Partnership",
  high: "High Staff",
  perks: "Perks",
};

const BUTTON_STYLES = [
  { id: "Primary", label: "Blu" },
  { id: "Secondary", label: "Grigio" },
  { id: "Success", label: "Verde" },
  { id: "Danger", label: "Rosso" },
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
  { id: "opener", label: "Chi apre il ticket" },
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

/* nomi leggibili dei permessi Discord del canale ticket (non le chiavi tecniche) */
const PERM_LABEL: Record<string, string> = {
  addReactions: "Aggiungere reazioni",
  sendTtsMessages: "Messaggi da leggere ad alta voce (TTS)",
  embedLinks: "Anteprime dei link",
  attachFiles: "Allegare file",
  useExternalEmojis: "Emoji di altri server",
  useExternalStickers: "Sticker di altri server",
  sendVoiceMessages: "Messaggi vocali",
};

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
    { value: "", label: `Come generali (${defaultHidden ? "nascosto" : "visibile"})` },
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

  if (loading) return <p className="text-sm text-crema/60">Caricamento pannelli…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  const channels = bundle.pickers.textChannels;
  const roles = bundle.pickers.roles;
  const defaultChannel = bundle.settings.panelChannelId;

  const confirmDelete = (what: string) =>
    confirmDialog({
      message: `Eliminare ${what}? Il messaggio pubblicato su Discord viene tolto e non si può annullare.`,
      danger: true,
    });

  const channelOptions = (none: string) => [
    { value: "", label: none },
    ...channels.map((ch) => ({ value: ch.id, label: `#${ch.name}` })),
  ];

  if (single) {
    const editing = Boolean(single.id);
    const set = (patch: Partial<TicketSingle>) => setSingle({ ...single, ...patch });
    const mentionOptions = [
      ...MENTION_EXTRAS,
      ...roles.map((r) => ({ id: r.id, label: `@${r.name}` })),
    ];
    const save = async () => {
      setBusy(true);
      const body = singleBody(single, editing);
      const res = editing
        ? await updateTicketPanel(token, guildId, single.id, body)
        : await createTicketPanel(token, guildId, body);
      setBusy(false);
      await after(res, editing ? "Pannello aggiornato." : "Pannello creato.");
    };
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <EditorHeader
          backLabel="Pannelli"
          onBack={() => setSingle(null)}
          title={editing ? single.title || "Pannello senza titolo" : "Nuovo pannello"}
          subtitle={
            editing
              ? [TYPE_LABEL[single.ticketType] || single.ticketType, single.messageId ? "pubblicato" : "non pubblicato"].join(" · ")
              : "Compila e salva: lo pubblichi quando vuoi"
          }
          actions={
            <>
              {editing ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className={dangerBtn}
                    onClick={async () => {
                      if (!(await confirmDelete("questo pannello"))) return;
                      setBusy(true);
                      const res = await deleteTicketPanel(token, guildId, single.id);
                      setBusy(false);
                      await after(res, "Pannello eliminato.");
                    }}
                  >
                    Elimina
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={miniBtn}
                    onClick={async () => {
                      setBusy(true);
                      const res = await publishTicketPanel(token, guildId, single.id, false);
                      setBusy(false);
                      await after(res, "Pubblicato su Discord.");
                    }}
                  >
                    Pubblica su Discord
                  </button>
                </>
              ) : null}
              <button type="submit" disabled={busy} className={primaryMini}>
                {editing ? "Salva modifiche" : "Crea pannello"}
              </button>
            </>
          }
        />

        {/* editor a sinistra, anteprima del messaggio Discord dal vivo a destra */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <FormGroup title="Messaggio del pannello" description="Quello che la gente vede nel canale prima di aprire il ticket.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Titolo">
                  <input name="title" value={single.title} maxLength={256} onChange={(e) => set({ title: e.target.value })} className={fieldClass} />
                </Field>
                <Field label="Colore della barra" hint="Esadecimale, es. #D99A5B">
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="size-9 shrink-0 rounded-lg ring-1 ring-sand/20" style={{ background: single.color || "#5865f2" }} aria-hidden />
                    <input name="color" value={single.color} onChange={(e) => set({ color: e.target.value })} className={`${fieldClass} mt-0 font-mono`} />
                  </div>
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Testo">
                  <textarea name="content" value={single.content} maxLength={4096} rows={4} onChange={(e) => set({ content: e.target.value })} className={fieldClass} />
                </Field>
              </div>
            </FormGroup>

            <FormGroup title="Pulsante" description="Il pulsante che apre il ticket.">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Testo">
                  <input name="button-text" value={single.buttonText} maxLength={80} onChange={(e) => set({ buttonText: e.target.value })} className={fieldClass} />
                </Field>
                <Field label="Colore">
                  <Select
                    value={single.buttonStyle}
                    onChange={(v) => set({ buttonStyle: v })}
                    className={fieldClass}
                    options={BUTTON_STYLES.map((s) => ({ value: s.id, label: s.label }))}
                  />
                </Field>
                <Field label="Emoji" hint="😀 oppure <:nome:id>">
                  <input name="button-emoji" value={single.buttonEmoji || ""} onChange={(e) => set({ buttonEmoji: e.target.value || null })} className={fieldClass} />
                </Field>
              </div>
            </FormGroup>

            <FormGroup title="Dove si apre" description="Tipo di ticket, canale del pannello e dove finiscono ticket e transcript.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo di ticket">
                  <Select
                    value={single.ticketType}
                    onChange={(v) => set({ ticketType: v })}
                    className={fieldClass}
                    options={TICKET_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] || t }))}
                  />
                </Field>
                <Field label="Canale del pannello">
                  <Select value={single.channelId || ""} onChange={(v) => set({ channelId: v || null })} className={fieldClass} options={channelOptions("— Nessuno —")} />
                </Field>
                <Field label="Categoria dei ticket" hint="Vuoto = quella delle impostazioni generali">
                  <Select
                    value={single.categoryId || ""}
                    onChange={(v) => set({ categoryId: v || null })}
                    className={fieldClass}
                    options={[{ value: "", label: "Come impostazioni generali" }, ...bundle.pickers.categories.map((c) => ({ value: c.id, label: c.name }))]}
                  />
                </Field>
                <Field label="Canale transcript">
                  <Select
                    value={single.transcriptChannelId || ""}
                    onChange={(v) => set({ transcriptChannelId: v || null })}
                    className={fieldClass}
                    options={channelOptions("Come impostazioni generali")}
                  />
                </Field>
                <Field label="Form da compilare" hint="Domande prima di aprire il ticket">
                  <Select
                    value={single.formId || ""}
                    onChange={(v) => set({ formId: v || null })}
                    className={fieldClass}
                    options={[{ value: "", label: "Nessun form" }, ...forms.map((f) => ({ value: f.id, label: f.title }))]}
                  />
                </Field>
              </div>
            </FormGroup>

            <FormGroup title="Limiti">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ticket aperti per utente">
                  <Select
                    value={single.maxOpenTicketsPerUser == null ? "" : String(single.maxOpenTicketsPerUser)}
                    onChange={(v) => set({ maxOpenTicketsPerUser: v === "" ? null : Number(v) })}
                    className={fieldClass}
                    options={[
                      { value: "", label: `Come impostazioni generali (${maxOpen})` },
                      ...Array.from({ length: 25 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
                    ]}
                  />
                </Field>
                <Field label="Attesa tra due aperture" hint="In secondi, 0 = nessuna attesa">
                  <input
                    name="open-cooldown-seconds"
                    type="number"
                    min={0}
                    max={86400}
                    value={single.openCooldownSeconds}
                    onChange={(e) => set({ openCooldownSeconds: Number(e.target.value) || 0 })}
                    className={fieldClass}
                  />
                </Field>
              </div>
              <div className="mt-3 divide-y divide-sand/[0.07]">
                <SettingRow title="Pannello disattivato" description="Il pulsante resta visibile ma non apre ticket.">
                  <Toggle size="sm" checked={single.disabled} label="Pannello disattivato" onChange={(v) => set({ disabled: v })} />
                </SettingRow>
              </div>
            </FormGroup>

            <FormGroup title="Pulsanti nel ticket" description="Per questo pannello puoi seguire le impostazioni generali o deciderlo qui.">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Chiudi">
                  <Select value={triValue(single.hideCloseButton)} onChange={(v) => set({ hideCloseButton: fromTri(v) })} className={fieldClass} options={triOptions(hideClose)} />
                </Field>
                <Field label="Chiudi con motivo">
                  <Select
                    value={triValue(single.hideCloseReasonButton)}
                    onChange={(v) => set({ hideCloseReasonButton: fromTri(v) })}
                    className={fieldClass}
                    options={triOptions(hideCloseReason)}
                  />
                </Field>
                <Field label="Prendi in carico">
                  <Select value={triValue(single.hideClaimButton)} onChange={(v) => set({ hideClaimButton: fromTri(v) })} className={fieldClass} options={triOptions(hideClaim)} />
                </Field>
              </div>
            </FormGroup>

            <FormGroup title="Chi viene avvisato" description="Menzioni quando il ticket si apre e team che lo gestiscono.">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className={labelClass}>Menzioni all&apos;apertura</p>
                  <MultiCheck options={mentionOptions} selected={single.mentionOnOpen} onChange={(ids) => set({ mentionOnOpen: ids })} />
                </div>
                <div>
                  <p className={labelClass}>Team di supporto</p>
                  <MultiCheck
                    options={bundle.teams.map((t) => ({ id: t.id, label: t.isDefault ? `${t.name} (predefinito)` : t.name }))}
                    selected={single.supportTeamIds}
                    onChange={(ids) => set({ supportTeamIds: ids })}
                    empty="Nessun team"
                  />
                </div>
              </div>
              <div className="mt-3 divide-y divide-sand/[0.07]">
                <SettingRow title="Cancella le menzioni" description="Dopo l'apertura il messaggio con le menzioni viene tolto.">
                  <Toggle size="sm" checked={single.deleteMentionsOnOpen} label="Cancella le menzioni all'apertura" onChange={(v) => set({ deleteMentionsOnOpen: v })} />
                </SettingRow>
              </div>
            </FormGroup>

            <Disclosure title="Messaggio di benvenuto nel ticket">
              <div className="grid gap-4">
                <Field label="Titolo">
                  <input
                    name="welcome-title"
                    value={single.welcome.title}
                    maxLength={256}
                    onChange={(e) => set({ welcome: { ...single.welcome, title: e.target.value } })}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Testo">
                  <textarea
                    name="welcome-description"
                    value={single.welcome.description}
                    maxLength={4096}
                    rows={4}
                    onChange={(e) => set({ welcome: { ...single.welcome, description: e.target.value } })}
                    className={fieldClass}
                  />
                </Field>
              </div>
            </Disclosure>

            <Disclosure title={`Orari di supporto · ${single.supportHoursLabel || "sempre aperto"}`}>
              <div className="space-y-3">
                <Field label="Fuso orario">
                  <input
                    name="support-hours-timezone"
                    value={single.supportHours.timezone}
                    onChange={(e) => set({ supportHours: { ...single.supportHours, timezone: e.target.value || "Europe/Rome" } })}
                    className={fieldClass}
                  />
                </Field>
                <div className="divide-y divide-sand/[0.07] overflow-hidden rounded-lg ring-1 ring-sand/10">
                  {SUPPORT_DAYS.map((day) => {
                    const row = single.supportHours.days[day];
                    const patchDay = (patch: Partial<SupportHours["days"][string]>) =>
                      set({
                        supportHours: {
                          ...single.supportHours,
                          days: { ...single.supportHours.days, [day]: { ...row, ...patch } },
                        },
                      });
                    const on = row?.enabled === true;
                    const allDay = row?.allDay !== false;
                    return (
                      <div key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                        <span className={`w-24 text-sm font-medium capitalize ${on ? "text-crema" : "text-crema/60"}`}>{DAY_LABEL[day]}</span>
                        <Toggle size="sm" checked={on} label={`${DAY_LABEL[day]}: supporto attivo`} onChange={(v) => patchDay({ enabled: v })} />
                        <label className="flex items-center gap-1.5 text-xs text-crema/75">
                          <Checkbox checked={allDay} disabled={!on} onChange={(v) => patchDay({ allDay: v })} />
                          Tutto il giorno
                        </label>
                        {on && !allDay ? (
                          <div className="ml-auto flex items-center gap-1.5 text-xs text-crema/60">
                            <input
                              name={`hours-start-${day}`}
                              aria-label={`${DAY_LABEL[day]} inizio`}
                              value={row?.start || "09:00"}
                              onChange={(e) => patchDay({ start: e.target.value })}
                              className="w-16 rounded-md bg-espresso/70 px-2 py-1 text-center font-mono text-xs text-crema ring-1 ring-sand/15"
                            />
                            –
                            <input
                              name={`hours-end-${day}`}
                              aria-label={`${DAY_LABEL[day]} fine`}
                              value={row?.end || "17:00"}
                              onChange={(e) => patchDay({ end: e.target.value })}
                              className="w-16 rounded-md bg-espresso/70 px-2 py-1 text-center font-mono text-xs text-crema ring-1 ring-sand/15"
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Disclosure>

            <Disclosure title={`Chi può aprire · ${single.accessRules.length ? `${single.accessRules.length} regole` : "tutti"}`}>
              {single.accessRules.length === 0 ? (
                <p className="text-sm text-crema/60">Nessuna regola: chiunque veda il pannello può aprire un ticket.</p>
              ) : (
                <ul className="space-y-2">
                  {single.accessRules.map((rule, index) => (
                    <li key={`${rule.roleId}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-espresso/40 p-2 ring-1 ring-sand/10">
                      <div className="min-w-[12rem] flex-1">
                        <Select
                          value={rule.roleId}
                          onChange={(roleId) => {
                            const accessRules = single.accessRules.slice();
                            accessRules[index] = { ...rule, roleId };
                            set({ accessRules });
                          }}
                          className={`${fieldClass} mt-0`}
                          options={[{ value: "everyone", label: "@everyone" }, ...roles.map((r) => ({ value: r.id, label: `@${r.name}` }))]}
                        />
                      </div>
                      <Select
                        value={rule.allow ? "allow" : "deny"}
                        onChange={(v) => {
                          const accessRules: AccessRule[] = single.accessRules.slice();
                          accessRules[index] = { ...rule, allow: v === "allow" };
                          set({ accessRules });
                        }}
                        className={`${fieldClass} mt-0 w-36`}
                        options={[
                          { value: "allow", label: "Può aprire" },
                          { value: "deny", label: "Non può aprire" },
                        ]}
                      />
                      <button
                        type="button"
                        className={dangerBtn}
                        aria-label="Rimuovi regola"
                        onClick={() => set({ accessRules: single.accessRules.filter((_, i) => i !== index) })}
                      >
                        Rimuovi
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className={`${miniBtn} mt-3`}
                onClick={() => set({ accessRules: [...single.accessRules, { roleId: "everyone", allow: true }] })}
              >
                + Aggiungi regola
              </button>
            </Disclosure>

            <Disclosure title="Permessi di chi apre il ticket">
              <div className="divide-y divide-sand/[0.07]">
                <SettingRow title="Permessi personalizzati" description="Spento = permessi normali del server nel canale del ticket.">
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
                </SettingRow>
                {single.ticketPerms
                  ? PERM_KEYS.map((key) => (
                      <SettingRow key={key} title={PERM_LABEL[key] || key}>
                        <Toggle
                          size="sm"
                          checked={single.ticketPerms?.[key] === true}
                          label={PERM_LABEL[key] || key}
                          onChange={(next) => set({ ticketPerms: { ...(single.ticketPerms as TicketPerms), [key]: next, replace: true } })}
                        />
                      </SettingRow>
                    ))
                  : null}
              </div>
            </Disclosure>
          </div>

          {/* firma della dashboard: il messaggio come apparirà su Discord, sempre in vista mentre scrivi */}
          <aside className="xl:sticky xl:top-32 xl:self-start">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-crema/70">
              <span className="size-1.5 rounded-full bg-[#7fc48c]" aria-hidden /> Anteprima su Discord
            </p>
            <DiscordPanelPreview
              title={single.title}
              description={single.content}
              color={single.color}
              buttonText={single.buttonText}
              buttonStyle={single.buttonStyle}
              buttonEmoji={single.buttonEmoji}
            />
          </aside>
        </div>
      </form>
    );
  }

  if (multi) {
    const editing = Boolean(multi.id);
    const set = (patch: Partial<TicketMulti>) => setMulti({ ...multi, ...patch });
    const save = async () => {
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
      const res = editing ? await updateTicketMulti(token, guildId, multi.id, body) : await createTicketMulti(token, guildId, body);
      setBusy(false);
      await after(res, editing ? "Multi-panel aggiornato." : "Multi-panel creato.");
    };
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <EditorHeader
          backLabel="Pannelli"
          onBack={() => setMulti(null)}
          title={editing ? multi.title || "Multi-panel" : "Nuovo multi-panel"}
          subtitle={`${multi.panelIds.length} pannelli in un solo messaggio`}
          actions={
            <>
              {editing ? (
                <>
                  <button
                    type="button"
                    className={dangerBtn}
                    disabled={busy}
                    onClick={async () => {
                      if (!(await confirmDelete("questo multi-panel"))) return;
                      setBusy(true);
                      const res = await deleteTicketMulti(token, guildId, multi.id);
                      setBusy(false);
                      await after(res, "Multi-panel eliminato.");
                    }}
                  >
                    Elimina
                  </button>
                  <button
                    type="button"
                    className={miniBtn}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const res = await publishTicketMulti(token, guildId, multi.id, false);
                      setBusy(false);
                      await after(res, "Pubblicato su Discord.");
                    }}
                  >
                    Pubblica su Discord
                  </button>
                </>
              ) : null}
              <button type="submit" disabled={busy} className={primaryMini}>
                {editing ? "Salva modifiche" : "Crea multi-panel"}
              </button>
            </>
          }
        />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <FormGroup title="Messaggio" description="Un solo messaggio che raccoglie più pannelli.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Canale">
                  <Select value={multi.channelId || ""} onChange={(v) => set({ channelId: v || null })} className={fieldClass} options={channelOptions("— Nessuno —")} />
                </Field>
                <Field label="Titolo">
                  <input name="multi-title" value={multi.title} maxLength={256} onChange={(e) => set({ title: e.target.value })} className={fieldClass} />
                </Field>
                <Field label="Colore della barra" hint="Esadecimale, es. #D99A5B">
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="size-9 shrink-0 rounded-lg ring-1 ring-sand/20" style={{ background: multi.color || "#5865f2" }} aria-hidden />
                    <input name="multi-color" value={multi.color} onChange={(e) => set({ color: e.target.value })} className={`${fieldClass} mt-0 font-mono`} />
                  </div>
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Testo">
                  <textarea name="description" value={multi.description} maxLength={4096} rows={3} onChange={(e) => set({ description: e.target.value })} className={fieldClass} />
                </Field>
              </div>
            </FormGroup>
            <FormGroup title="Scelta del ticket" description="Come si sceglie il tipo di ticket da aprire.">
              <div className="divide-y divide-sand/[0.07]">
                <SettingRow title="Menu a tendina" description="Spento = un pulsante per ogni pannello.">
                  <Toggle size="sm" checked={multi.useDropdown} label="Menu a tendina" onChange={(v) => set({ useDropdown: v })} />
                </SettingRow>
              </div>
              {multi.useDropdown ? (
                <div className="mt-3">
                  <Field label="Testo del menu">
                    <input
                      name="dropdown-placeholder"
                      value={multi.dropdownPlaceholder}
                      maxLength={150}
                      onChange={(e) => set({ dropdownPlaceholder: e.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                </div>
              ) : null}
              <div className="mt-4">
                <p className={labelClass}>Pannelli inclusi · almeno 2</p>
                <MultiCheck options={bundle.singles.map((p) => ({ id: p.id, label: p.title || p.id }))} selected={multi.panelIds} onChange={(ids) => set({ panelIds: ids })} />
              </div>
            </FormGroup>
          </div>
          <aside className="xl:sticky xl:top-32 xl:self-start">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-crema/70">
              <span className="size-1.5 rounded-full bg-[#7fc48c]" aria-hidden /> Anteprima su Discord
            </p>
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
          </aside>
        </div>
      </form>
    );
  }

  const usedSingles = bundle.quota.singlesUsed;
  const usedMultis = bundle.quota.multisUsed;
  return (
    <div className="space-y-5">
      {/* barra azioni: posti usati e creazione */}
      <div className="flex flex-wrap items-center gap-3">
        <Quota label="Pannelli" used={usedSingles} max={bundle.quota.singlesMax} />
        <Quota label="Multi-panel" used={usedMultis} max={bundle.quota.multisMax} />
        <div className="ml-auto flex flex-wrap gap-2">
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
              Sincronizza pannelli vecchi
            </button>
          ) : null}
          <button type="button" className={miniBtn} onClick={() => setMulti(blankMulti(defaultChannel))}>
            + Multi-panel
          </button>
          <button type="button" className={primaryMini} onClick={() => setSingle(blankSingle(defaultChannel))}>
            + Nuovo pannello
          </button>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-crema">Pannelli</h3>
        {bundle.singles.length === 0 ? (
          <EmptyRow text="Nessun pannello ancora: creane uno per far aprire ticket dal canale." />
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {bundle.singles.map((panel) => (
              <li key={panel.id}>
                <button
                  type="button"
                  onClick={() => setSingle(panel)}
                  className="group flex w-full items-center gap-3 rounded-xl bg-espresso/45 p-3 text-left ring-1 ring-sand/10 transition hover:bg-espresso/70 hover:ring-sand/25"
                >
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: panel.color || "#5865f2" }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-crema">{panel.title || "Pannello senza titolo"}</span>
                    <span className="mt-0.5 block truncate text-xs text-crema/60">
                      {panel.ticketTypeLabel || TYPE_LABEL[panel.ticketType] || panel.ticketType}
                      {panel.channelName ? ` · #${String(panel.channelName).replace(/^#/, "")}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {panel.disabled ? (
                      <StatusBadge tone="warn">disattivato</StatusBadge>
                    ) : panel.messageId ? (
                      <StatusBadge tone="ok">pubblicato</StatusBadge>
                    ) : (
                      <StatusBadge>bozza</StatusBadge>
                    )}
                    <span className="text-xs font-semibold text-crema/60 transition group-hover:text-ember">Modifica →</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-crema">Multi-panel</h3>
        {bundle.multis.length === 0 ? (
          <EmptyRow text="Nessun multi-panel: servono quando vuoi più tipi di ticket in un solo messaggio." />
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {bundle.multis.map((panel) => (
              <li key={panel.id}>
                <button
                  type="button"
                  onClick={() => setMulti(panel)}
                  className="group flex w-full items-center gap-3 rounded-xl bg-espresso/45 p-3 text-left ring-1 ring-sand/10 transition hover:bg-espresso/70 hover:ring-sand/25"
                >
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: panel.color || "#5865f2" }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-crema">{panel.title || "Multi-panel"}</span>
                    <span className="mt-0.5 block truncate text-xs text-crema/60">
                      {panel.panelIds.length} pannelli{panel.channelName ? ` · #${String(panel.channelName).replace(/^#/, "")}` : ""}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-crema/60 transition group-hover:text-ember">Modifica →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Quota({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const full = max > 0 && used >= max;
  return (
    <div className="min-w-[9rem]">
      <p className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold text-crema/80">{label}</span>
        <span className={`tabular-nums ${full ? "text-[#f0a493] light:text-[#a83a2c]" : "text-crema/60"}`}>
          {used}/{max}
          {full ? " · pieno" : ""}
        </span>
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-crema/10" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`h-full rounded-full ${full ? "bg-[#e0735f]" : "bg-gradient-to-r from-caramel to-ember"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-sand/20 px-4 py-6 text-center text-sm text-crema/60">{text}</p>;
}

"use client";

import { useMemo, useState } from "react";
import {
  Hash,
  Image as ImageIcon,
  Lock,
  MessageSquareQuote,
  MessageSquareReply,
  Mic,
  MousePointerClick,
  Repeat2,
  RotateCcw,
  Shuffle,
  Skull,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { DiscordContent } from "@/components/discord/DiscordContent";
import { Select, MultiSelect } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import {
  BOARD_FEATURES,
  DEFAULT_BOARD_PRESENTATION,
  patchGuildSettings,
  type BoardFeatures,
  type BoardKindPresentation,
  type BoardsMode,
  type BoardsPresentation,
  type GuildSettings,
  type SettingsPickers,
} from "@/lib/dashboard-guild";
import type { BachecaModuleTabId } from "../guildSections";
import { EditorWithPreview } from "./community/shared";
import { QuoteStyleEditor } from "./QuoteStyleEditor";
import {
  ExpandableTextarea,
  Field,
  FormGroup,
  Notice,
  PremiumBadge,
  Pills,
  SettingRow,
  Toggle,
  TrackUnsaved,
  fieldClass,
  miniBtn,
} from "./bits";

type BoardKindId = "quote" | "repost" | "clip" | "skull";
type ChannelKey = "quoteChannelId" | "repostChannelId" | "clipChannelId" | "skullChannelId";

const KIND_META: Record<
  BoardKindId,
  {
    title: string;
    hint: string;
    icon: LucideIcon;
    accent: string;
    channelKey: ChannelKey;
    placeholders: { token: string; hint: string }[];
  }
> = {
  quote: {
    title: "Quote",
    hint: "Citazioni dei messaggi con +quote, pubblicate come immagine.",
    icon: MessageSquareQuote,
    accent: "#e8a964",
    channelKey: "quoteChannelId",
    placeholders: [
      { token: "{prefix}", hint: "prefisso comandi" },
      { token: "{count}", hint: "numero post" },
      { token: "{author}", hint: "autore del messaggio quotato" },
      { token: "{creator}", hint: "chi ha creato la quote" },
      { token: "{channel}", hint: "canale di pubblicazione" },
    ],
  },
  repost: {
    title: "Repost",
    hint: "Messaggi salvati con +repost o col pulsante, più la roulette dei vecchi repost.",
    icon: Repeat2,
    accent: "#8fb8de",
    channelKey: "repostChannelId",
    placeholders: [
      { token: "{prefix}", hint: "prefisso comandi" },
      { token: "{count}", hint: "numero post" },
      { token: "{reposter}", hint: "chi ha fatto il repost" },
      { token: "{author}", hint: "autore originale" },
      { token: "{body}", hint: "testo formattato" },
      { token: "{source}", hint: "link al messaggio" },
      { token: "{phrase}", hint: "frase casuale di conferma" },
      { token: "{link}", hint: "link al repost salvato" },
    ],
  },
  clip: {
    title: "Clip",
    hint: "Clip vocali registrate con +clip, con la trascrizione se vuoi.",
    icon: Mic,
    accent: "#b49be0",
    channelKey: "clipChannelId",
    placeholders: [
      { token: "{prefix}", hint: "prefisso comandi" },
      { token: "{count}", hint: "numero post" },
      { token: "{reposter}", hint: "chi ha pubblicato la clip" },
      { token: "{author}", hint: "autore originale" },
      { token: "{body}", hint: "trascrizione / testo" },
      { token: "{source}", hint: "link al messaggio" },
      { token: "{phrase}", hint: "frase casuale di conferma" },
      { token: "{link}", hint: "link alla clip salvata" },
      { token: "{channel}", hint: "nome canale vocale" },
      { token: "{duration}", hint: "secondi della clip" },
    ],
  },
  skull: {
    title: "Skullboard",
    hint: "I messaggi che ricevono abbastanza 💀 finiscono in bacheca.",
    icon: Skull,
    accent: "#d9d4cc",
    channelKey: "skullChannelId",
    placeholders: [
      { token: "{channel}", hint: "canale skullboard" },
      { token: "{date}", hint: "data del messaggio" },
      { token: "{author}", hint: "autore del messaggio" },
      { token: "{source}", hint: "link al messaggio" },
    ],
  },
};

const KINDS: BoardKindId[] = ["quote", "repost", "clip", "skull"];

/* ───────────────────────── anteprime stile Discord ───────────────────────── */

function fillPreview(template: string, vars: Record<string, string>) {
  let out = template || "";
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function sampleVars(kind: BoardKindId, prefix: string): Record<string, string> {
  return {
    prefix,
    count: kind === "quote" ? "128" : "42",
    author: "@Mario",
    creator: "@Luigi",
    reposter: "@Luigi",
    body: "» *Esempio di messaggio in bacheca…*",
    source: "https://discord.com/channels/0/0/0",
    text: "Esempio di messaggio in bacheca…",
    channel: "#bacheca",
    date: "14/11/2026, 11:30:00",
    phrase: "ha salvato un momento iconico!",
    link: "» [Clicca qui per vedere il repost](https://discord.com/channels/0/0/0)",
    duration: "15",
  };
}

/** Messaggio del bot con embed, come lo vedono i membri su Discord. */
function DiscordEmbed({
  accent,
  title,
  description,
  footer,
  fields,
  buttons,
  image,
}: {
  accent: string;
  title?: string;
  description?: string;
  footer?: string;
  fields?: { name: string; value: string }[];
  buttons?: { label: string; danger?: boolean }[];
  image?: boolean;
}) {
  const empty = !title && !description && !footer && !fields?.length;
  return (
    <div translate="no" className="rounded-2xl bg-[#313338] p-3.5 ring-1 ring-sand/10">
      <div className="flex gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-caramel to-ember text-xs font-bold text-ink" aria-hidden>
          V
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-medium leading-5 text-[#f2f3f5]">
            Vinili
            <span className="rounded-[3px] bg-[#5865f2] px-1 text-[10px] font-semibold leading-4 text-white">APP</span>
            <span className="text-[11px] font-normal text-[#949ba4]">oggi alle 11:30</span>
          </p>
          {empty ? (
            <p className="mt-1.5 text-sm italic text-[#949ba4]">Messaggio vuoto</p>
          ) : (
            <div className="mt-1.5 flex max-w-[440px] overflow-hidden rounded-[4px] bg-[#2b2d31]">
              <span className="w-1 shrink-0" style={{ background: accent }} aria-hidden />
              <div className="min-w-0 flex-1 px-3 pb-3 pt-2">
                {title ? <DiscordContent text={title} className="text-[15px] font-semibold leading-5 text-[#f2f3f5]" /> : null}
                {description ? <DiscordContent text={description} className="mt-1.5 text-[13px] leading-[18px] text-[#dbdee1]" /> : null}
                {fields?.length ? (
                  <div className="mt-2 space-y-1.5">
                    {fields.map((f) => (
                      <div key={f.name} className="text-[13px] leading-[18px]">
                        <p className="font-semibold text-[#f2f3f5]">{f.name}</p>
                        <p className="text-[#dbdee1]">{f.value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {image ? (
                  <div className="mt-2.5 flex aspect-[16/7] items-center justify-center rounded-md bg-gradient-to-br from-[#3a3c42] to-[#26282c] text-[#6d717a]">
                    <ImageIcon className="size-6" aria-hidden />
                  </div>
                ) : null}
                {footer ? <p className="mt-2 text-[11px] text-[#949ba4]">{footer}</p> : null}
              </div>
            </div>
          )}
          {buttons?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {buttons.map((b) => (
                <span
                  key={b.label}
                  className={cn("inline-flex h-8 items-center rounded-[8px] px-3.5 text-[13px] font-medium text-white", b.danger ? "bg-[#da373c]" : "bg-[#4e5058]")}
                >
                  {b.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── campi ───────────────────────── */

function PlaceholderChips({
  tokens,
  disabled,
  onInsert,
}: {
  tokens: { token: string; hint: string }[];
  disabled?: boolean;
  onInsert: (token: string) => void;
}) {
  return (
    <div className="rounded-xl bg-espresso/40 px-3 py-2.5 ring-1 ring-sand/[0.08]">
      <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/45">Segnaposto · tocca per aggiungere</p>
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((p) => (
          <button
            key={p.token}
            type="button"
            disabled={disabled}
            title={p.hint}
            onClick={() => onInsert(p.token)}
            className="group inline-flex items-center gap-1.5 rounded-lg bg-crema/[0.05] px-2 py-1 text-[11px] ring-1 ring-sand/10 transition hover:bg-caramel/15 hover:ring-caramel/30 disabled:opacity-40"
          >
            <span className="font-mono text-ember">{p.token}</span>
            <span className="text-crema/45 group-hover:text-crema/70">{p.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── editor di una funzione ───────────────────────── */

type Section = "post" | "reply" | "roulette" | "buttons" | "style";

function KindEditor({
  kind,
  value,
  roles,
  prefix,
  disabled,
  onChange,
  styleSlot,
}: {
  kind: BoardKindId;
  value: BoardKindPresentation;
  roles: { id: string; name: string }[];
  prefix: string;
  disabled?: boolean;
  onChange: (next: BoardKindPresentation) => void;
  /** solo Quote: editor dello stile dell'immagine */
  styleSlot?: React.ReactNode;
}) {
  const meta = KIND_META[kind];
  const [section, setSection] = useState<Section>("post");
  const [ackVariant, setAckVariant] = useState<"ackDescription" | "ackDescriptionSite" | "ackDescriptionChannel">("ackDescription");
  const sample = sampleVars(kind, prefix);
  const set = <K extends keyof BoardKindPresentation>(key: K, next: BoardKindPresentation[K]) => onChange({ ...value, [key]: next });
  const append = (key: "embedDescription" | "ackDescription" | "ackDescriptionSite" | "ackDescriptionChannel" | "rouletteDescription", token: string) => {
    const cur = value[key] || "";
    set(key, `${cur}${!cur || cur.endsWith("\n") ? "" : " "}${token}`);
  };

  const text = (key: keyof BoardKindPresentation, label: string, max = 256) => (
    <Field label={label}>
      <input
        type="text"
        value={String(value[key] ?? "")}
        disabled={disabled}
        maxLength={max}
        onChange={(e) => set(key, e.target.value as never)}
        className={cn(fieldClass, "mt-1.5")}
      />
    </Field>
  );
  const area = (key: keyof BoardKindPresentation, label: string, rows = 4) => (
    <Field label={label}>
      <ExpandableTextarea
        value={String(value[key] ?? "")}
        disabled={disabled}
        maxLength={4000}
        rows={rows}
        onChange={(e) => set(key, e.target.value as never)}
        className={cn(fieldClass, "mt-1.5")}
      />
    </Field>
  );

  const sections: { id: Section; label: string; icon: LucideIcon }[] = [
    { id: "post", label: kind === "skull" ? "Post in skullboard" : "Post in bacheca", icon: meta.icon },
    { id: "reply", label: kind === "skull" ? "Conferma" : "Risposta al comando", icon: MessageSquareReply },
    ...(kind === "repost" ? [{ id: "roulette" as const, label: "Roulette", icon: Shuffle }] : []),
    { id: "buttons", label: "Pulsanti e permessi", icon: MousePointerClick },
    ...(styleSlot ? [{ id: "style" as const, label: "Stile immagine", icon: Sparkles }] : []),
  ];

  /* ── anteprime ── */
  const postPreview = (
    <DiscordEmbed
      accent={meta.accent}
      title={kind === "skull" ? undefined : fillPreview(value.embedTitle, sample)}
      description={fillPreview(value.embedDescription, sample)}
      footer={fillPreview(value.embedFooter, sample)}
      image={kind === "quote"}
      fields={
        kind === "quote"
          ? [
              { name: value.fieldAuthor || "Messaggio di:", value: sample.author },
              { name: value.fieldCreator || "Creato da:", value: sample.creator },
            ]
          : kind === "skull"
            ? [
                { name: value.fieldAuthor || "Autore", value: sample.author },
                { name: value.fieldChannel || "Canale", value: sample.channel },
                { name: value.fieldMessage || "Messaggio", value: "[Cliccami]" },
              ]
            : undefined
      }
      buttons={
        kind === "skull"
          ? [{ label: value.buttonRemove || "Rimuovi", danger: true }]
          : [...(value.buttonRepost ? [{ label: value.buttonRepost }] : []), { label: value.buttonRemove || "Rimuovi", danger: true }]
      }
    />
  );
  const twoAcks = kind === "quote" || kind === "skull";
  const replyPreview = twoAcks ? (
    <DiscordEmbed
      accent={meta.accent}
      description={fillPreview(value[ackVariant] || value.ackDescription, sample)}
      fields={kind === "quote" && value.ackFieldName ? [{ name: value.ackFieldName, value: sample.count }] : undefined}
    />
  ) : (
    <DiscordEmbed accent={meta.accent} description={fillPreview(value.ackDescription, sample)} footer={fillPreview(value.ackFooter, sample)} />
  );
  const roulettePreview = (
    <DiscordEmbed
      accent={meta.accent}
      title={fillPreview(value.rouletteTitle, sample)}
      description={fillPreview(value.rouletteDescription, sample)}
      footer={fillPreview(value.rouletteFooter, sample)}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Pills value={section} onChange={setSection} ariaLabel={`Messaggi ${meta.title}`} options={sections} />
        {section !== "style" ? (
          <button
            type="button"
            disabled={disabled}
            className={cn(miniBtn, "ml-auto")}
            onClick={() => onChange({ ...DEFAULT_BOARD_PRESENTATION[kind], deleteRoleIds: value.deleteRoleIds })}
            title="Rimette i testi originali di questa funzione (i ruoli restano)"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Testi predefiniti
          </button>
        ) : null}
      </div>

      {section === "post" ? (
        <EditorWithPreview
          editor={
            <FormGroup
              title={kind === "skull" ? "Il post in skullboard" : "Il post in bacheca"}
              description="Il messaggio che il bot pubblica nel canale della bacheca."
            >
              <div className="space-y-3">
                {kind !== "skull" ? text("embedTitle", "Titolo") : null}
                {area("embedDescription", "Testo", 6)}
                <PlaceholderChips tokens={meta.placeholders} disabled={disabled} onInsert={(t) => append("embedDescription", t)} />
                {text("embedFooter", "Piè di pagina", 2048)}
                {kind === "quote" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {text("fieldAuthor", "Riga autore")}
                    {text("fieldCreator", "Riga creatore")}
                  </div>
                ) : null}
                {kind === "skull" ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {text("fieldAuthor", "Riga autore")}
                    {text("fieldChannel", "Riga canale")}
                    {text("fieldMessage", "Riga messaggio")}
                  </div>
                ) : null}
              </div>
            </FormGroup>
          }
          preview={postPreview}
        />
      ) : null}

      {section === "reply" ? (
        <EditorWithPreview
          editor={
            <FormGroup
              title={kind === "skull" ? "Messaggio di conferma" : "Risposta al comando"}
              description={
                kind === "skull" ? "Cosa scrive il bot quando un messaggio finisce in skullboard." : `Cosa risponde il bot quando qualcuno usa ${prefix}${kind}.`
              }
            >
              <div className="space-y-3">
                {twoAcks ? (
                  <>
                    <Pills
                      value={ackVariant}
                      onChange={setAckVariant}
                      ariaLabel={`Conferma ${meta.title}`}
                      options={[
                        { id: "ackDescription", label: "Stesso canale" },
                        { id: "ackDescriptionChannel", label: "Canale dedicato" },
                        { id: "ackDescriptionSite", label: "Bacheca del sito" },
                      ]}
                    />
                    <p className="text-xs text-crema/55">
                      {ackVariant === "ackDescription"
                        ? "Quando il post resta nel canale dove hai usato il comando."
                        : ackVariant === "ackDescriptionChannel"
                          ? "Quando il post va nel canale della bacheca."
                          : "Quando il post va sulla Bacheca del sito."}
                    </p>
                    {area(ackVariant, "Testo", 4)}
                    <PlaceholderChips tokens={meta.placeholders} disabled={disabled} onInsert={(t) => append(ackVariant, t)} />
                    {kind === "quote" ? text("ackFieldName", "Riga col totale delle quote") : null}
                  </>
                ) : (
                  <>
                    {area("ackDescription", "Testo", 4)}
                    <PlaceholderChips
                      tokens={meta.placeholders.filter((p) => ["{reposter}", "{phrase}", "{link}", "{prefix}", "{channel}", "{duration}"].includes(p.token))}
                      disabled={disabled}
                      onInsert={(t) => append("ackDescription", t)}
                    />
                    {text("ackFooter", "Piè di pagina", 2048)}
                  </>
                )}
              </div>
            </FormGroup>
          }
          preview={replyPreview}
        />
      ) : null}

      {section === "roulette" && kind === "repost" ? (
        <EditorWithPreview
          editor={
            <FormGroup title="Roulette dei repost" description="Ogni tanto il bot ripesca un vecchio repost a caso e lo ripubblica.">
              <div className="space-y-3">
                {text("rouletteTitle", "Titolo")}
                {area("rouletteDescription", "Testo", 4)}
                <PlaceholderChips
                  tokens={[
                    { token: "{body}", hint: "testo formattato" },
                    { token: "{source}", hint: "link originale" },
                    { token: "{text}", hint: "testo grezzo" },
                  ]}
                  disabled={disabled}
                  onInsert={(t) => append("rouletteDescription", t)}
                />
                {text("rouletteFooter", "Piè di pagina", 2048)}
              </div>
            </FormGroup>
          }
          preview={roulettePreview}
        />
      ) : null}

      {section === "buttons" ? (
        <EditorWithPreview
          editor={
            <div className="space-y-4">
              <FormGroup title="Pulsanti sotto il post" description="Il testo dei pulsanti (massimo 80 caratteri).">
                <div className="grid gap-3 sm:grid-cols-2">
                  {kind !== "skull" ? text("buttonRepost", "Pulsante repost", 80) : null}
                  {text("buttonRemove", "Pulsante rimuovi", 80)}
                </div>
              </FormGroup>
              <FormGroup
                title="Chi può cancellare"
                description="L'autore può sempre togliere i propri post, e chi amministra il server o gestisce i messaggi può togliere tutto. Qui aggiungi altri ruoli che possono togliere anche i post degli altri."
              >
                <MultiSelect
                  value={value.deleteRoleIds}
                  disabled={disabled}
                  onChange={(ids) => set("deleteRoleIds", ids.slice(0, 25))}
                  className={fieldClass}
                  options={roles.map((r) => ({ value: r.id, label: `@${r.name}` }))}
                  placeholder="Nessun ruolo in più"
                />
              </FormGroup>
            </div>
          }
          preview={postPreview}
        />
      ) : null}

      {section === "style" ? styleSlot : null}
    </div>
  );
}

/* ───────────────────────── pannello ───────────────────────── */

export function BoardsPanel({
  guildId,
  token,
  settings,
  pickers,
  error,
  canCustomizeQuoteStyle,
  tab,
  onUpdated,
  onToast,
}: {
  guildId: string;
  token: string;
  settings: GuildSettings | null;
  pickers: SettingsPickers;
  error: string | null;
  canCustomizeQuoteStyle: boolean;
  tab: BachecaModuleTabId;
  onUpdated: (next: GuildSettings, pickers?: SettingsPickers) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [features, setFeatures] = useState<BoardFeatures>(settings?.boards.features ?? { quote: true, repost: true, clip: true, skull: true });
  const [boardsMode, setBoardsMode] = useState<BoardsMode>(settings?.boards.mode ?? "shared");
  const [sharedChannelId, setSharedChannelId] = useState(settings?.boards.sharedChannelId ?? "");
  const [quoteChannelId, setQuoteChannelId] = useState(settings?.boards.quoteChannelId ?? "");
  const [repostChannelId, setRepostChannelId] = useState(settings?.boards.repostChannelId ?? "");
  const [clipChannelId, setClipChannelId] = useState(settings?.boards.clipChannelId ?? "");
  const [skullChannelId, setSkullChannelId] = useState(settings?.boards.skullChannelId ?? "");
  const [clipTranscription, setClipTranscription] = useState(settings?.boards.clipTranscription !== false);
  const [presentation, setPresentation] = useState<BoardsPresentation>(settings?.boards.presentation ?? DEFAULT_BOARD_PRESENTATION);
  const [saving, setSaving] = useState(false);
  const [presDirty, setPresDirty] = useState(false);
  const boardsEnabled = settings?.boards.enabled === true;

  /* impostazioni arrivate dal server (salvataggio o ricarica): si riallinea lo stato del pannello */
  const [syncedFrom, setSyncedFrom] = useState(settings);
  if (settings && settings !== syncedFrom) {
    setSyncedFrom(settings);
    setFeatures(settings.boards.features);
    setBoardsMode(settings.boards.mode === "split" ? "split" : "shared");
    setSharedChannelId(settings.boards.sharedChannelId ?? "");
    setQuoteChannelId(settings.boards.quoteChannelId ?? "");
    setRepostChannelId(settings.boards.repostChannelId ?? "");
    setClipChannelId(settings.boards.clipChannelId ?? "");
    setSkullChannelId(settings.boards.skullChannelId ?? "");
    setClipTranscription(settings.boards.clipTranscription !== false);
    setPresentation(settings.boards.presentation ?? DEFAULT_BOARD_PRESENTATION);
    setPresDirty(false);
  }

  const channelState = { sharedChannelId, quoteChannelId, repostChannelId, clipChannelId, skullChannelId } as const;
  const setChannelState = {
    sharedChannelId: setSharedChannelId,
    quoteChannelId: setQuoteChannelId,
    repostChannelId: setRepostChannelId,
    clipChannelId: setClipChannelId,
    skullChannelId: setSkullChannelId,
  } as const;

  const channelOptions = useMemo(
    () => [{ value: "", label: "— Nessuno —" }, ...pickers.textChannels.map((ch) => ({ value: ch.id, label: `#${ch.name}` }))],
    [pickers.textChannels],
  );
  const channelName = (id: string) => pickers.textChannels.find((c) => c.id === id)?.name;

  const save = async (body: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    const res = await patchGuildSettings(token, guildId, body);
    setSaving(false);
    if (!res.ok) {
      onToast(res.message, true);
      return false;
    }
    onUpdated(res.data.settings, res.data.pickers);
    onToast(okMsg);
    return true;
  };

  if (error && !settings) {
    return <p className="rounded-xl bg-caramel/10 px-3 py-2.5 text-sm text-crema/75 ring-1 ring-caramel/25">{error}</p>;
  }
  if (!settings) return null;

  const channelsLocked = settings.updatesLocked;
  const off = saving || !boardsEnabled;
  const prefix = settings.prefix || "+";

  const saveBoardChannel = async (key: keyof typeof channelState, next: string, label: string) => {
    const prev = channelState[key];
    setChannelState[key](next);
    if (channelsLocked) return;
    const ok = await save({ boards: { [key]: next || null } }, `${label} salvato.`);
    if (!ok) setChannelState[key](prev);
  };

  const toggleFeature = async (id: BoardKindId, next: boolean) => {
    const nextFeats = { ...features, [id]: next };
    setFeatures(nextFeats);
    const ok = await save({ boards: { enabled: boardsEnabled, features: nextFeats } }, `${KIND_META[id].title} ${next ? "attive" : "spente"}.`);
    if (!ok) setFeatures(settings.boards.features);
  };

  const changeMode = async (mode: BoardsMode) => {
    if (mode === boardsMode) return;
    const prev = boardsMode;
    setBoardsMode(mode);
    if (channelsLocked) return;
    const patch: Record<string, unknown> = { mode };
    /* passando a "uno per funzione" i canali vuoti partono dal canale unico */
    if (mode === "split" && sharedChannelId) {
      for (const key of ["quoteChannelId", "repostChannelId", "clipChannelId", "skullChannelId"] as const) {
        if (channelState[key]) continue;
        setChannelState[key](sharedChannelId);
        patch[key] = sharedChannelId;
      }
    }
    const ok = await save({ boards: patch }, "Modalità bacheca salvata.");
    if (!ok) {
      setBoardsMode(prev);
      setQuoteChannelId(settings.boards.quoteChannelId ?? "");
      setRepostChannelId(settings.boards.repostChannelId ?? "");
      setClipChannelId(settings.boards.clipChannelId ?? "");
      setSkullChannelId(settings.boards.skullChannelId ?? "");
    }
  };

  const savePresentation = async () => {
    const ok = await save({ boards: { presentation } }, "Messaggi e pulsanti salvati.");
    if (ok) setPresDirty(false);
  };

  /* ── Impostazioni: dove si pubblica + le quattro funzioni ── */
  if (tab === "impostazioni") {
    return (
      <div className={cn("space-y-4 transition-opacity", !boardsEnabled && "opacity-50")}>
        {!boardsEnabled ? <Notice>Il modulo Bacheca è spento: accendilo da Moduli per usare queste impostazioni.</Notice> : null}

        <section className="rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 sm:p-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-caramel/20 to-ember/5 text-ember ring-1 ring-caramel/20">
              <Hash className="size-[1.1rem]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-crema">
                Dove si pubblica {channelsLocked ? <Lock className="size-3.5 text-crema/55" aria-label="Bloccato" /> : null}
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-crema/60">
                {channelsLocked ? "Sul server Vinili i contenuti vanno sulla Bacheca del sito." : "Un canale per tutto, oppure un canale diverso per ogni funzione."}
              </p>
            </div>
            <div className={cn(channelsLocked || off ? "pointer-events-none opacity-60" : "")}>
              <Pills
                value={boardsMode}
                onChange={(m) => void changeMode(m)}
                ariaLabel="Modalità canali"
                options={[
                  { id: "shared", label: "Un canale unico" },
                  { id: "split", label: "Uno per funzione" },
                ]}
              />
            </div>
          </div>
          {boardsMode === "shared" ? (
            <div className="mt-4 max-w-md">
              <Field label="Canale della bacheca">
                <Select
                  value={sharedChannelId}
                  disabled={off || channelsLocked}
                  onChange={(next) => void saveBoardChannel("sharedChannelId", next, "Canale bacheca")}
                  className={cn(fieldClass, "mt-1.5")}
                  options={channelOptions}
                />
              </Field>
            </div>
          ) : null}
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          {KINDS.map((id) => {
            const meta = KIND_META[id];
            const Icon = meta.icon;
            const on = features[id] !== false;
            const feat = BOARD_FEATURES.find((f) => f.id === id);
            const chId = boardsMode === "shared" ? sharedChannelId : channelState[meta.channelKey];
            return (
              <section
                key={id}
                className={cn(
                  "relative overflow-hidden rounded-3xl bg-roast/70 p-4 ring-1 transition sm:p-5",
                  on ? "ring-sand/15" : "ring-sand/[0.07]",
                )}
              >
                <div
                  className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full blur-3xl transition-opacity"
                  style={{ background: meta.accent, opacity: on ? 0.14 : 0.04 }}
                  aria-hidden
                />
                <div className="relative flex items-start gap-3">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition"
                    style={{ color: on ? meta.accent : undefined, background: on ? `${meta.accent}1f` : undefined, borderColor: "transparent" }}
                  >
                    <Icon className={cn("size-5", !on && "text-crema/35")} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-semibold", on ? "text-crema" : "text-crema/55")}>{meta.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-crema/55">{feat?.hint || meta.hint}</p>
                  </div>
                  <Toggle size="sm" checked={on} disabled={off} label={`Attiva ${meta.title}`} onChange={(next) => void toggleFeature(id, next)} />
                </div>

                <div className={cn("relative mt-4 border-t border-sand/[0.08] pt-3.5", !on && "opacity-50")}>
                  {boardsMode === "split" && !channelsLocked ? (
                    <Field label="Canale">
                      <Select
                        value={channelState[meta.channelKey]}
                        disabled={off || !on}
                        onChange={(next) => void saveBoardChannel(meta.channelKey, next, `Canale ${meta.title}`)}
                        className={cn(fieldClass, "mt-1.5")}
                        options={channelOptions}
                      />
                    </Field>
                  ) : (
                    <p className="flex items-center gap-2 text-xs text-crema/55">
                      <Hash className="size-3.5" aria-hidden />
                      {channelsLocked ? "Bacheca del sito" : chId && channelName(chId) ? `#${channelName(chId)}` : "Nessun canale scelto"}
                    </p>
                  )}
                  {id === "clip" ? (
                    <div className="mt-3">
                      <SettingRow title="Trascrizione" description="Scrive il testo della clip in automatico.">
                        <Toggle
                          size="sm"
                          checked={clipTranscription}
                          disabled={off || !on}
                          label="Trascrizione delle clip"
                          onChange={async (next) => {
                            setClipTranscription(next);
                            const ok = await save({ boards: { clipTranscription: next } }, next ? "Trascrizione clip attiva." : "Trascrizione clip spenta.");
                            if (!ok) setClipTranscription(settings.boards.clipTranscription !== false);
                          }}
                        />
                      </SettingRow>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        <p className="text-center text-xs text-crema/45">Testi, pulsanti e permessi di ogni funzione si cambiano nelle schede Quote, Repost, Clip e Skullboard.</p>
      </div>
    );
  }

  /* ── Quote / Repost / Clip / Skullboard ── */
  const kind = tab as BoardKindId;
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const featureOn = features[kind] !== false;
  const kindPres = presentation[kind] ?? DEFAULT_BOARD_PRESENTATION[kind];

  return (
    <div className="space-y-4">
      <TrackUnsaved
        dirty={presDirty}
        onSave={() => void savePresentation()}
        onReset={() => {
          setPresentation(settings.boards.presentation ?? DEFAULT_BOARD_PRESENTATION);
          setPresDirty(false);
        }}
      />

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-mocha via-roast to-espresso p-5 ring-1 ring-sand/15">
        <div className="pointer-events-none absolute -right-14 -top-16 size-56 rounded-full blur-3xl" style={{ background: meta.accent, opacity: featureOn ? 0.2 : 0.06 }} aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-sand/15" style={{ color: meta.accent, background: `${meta.accent}1a` }}>
            <Icon className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-semibold text-crema">{meta.title}</h2>
            <p className="mt-0.5 text-sm text-crema/60">{meta.hint}</p>
          </div>
          {kind === "quote" ? <PremiumBadge active={canCustomizeQuoteStyle} /> : null}
          <Toggle checked={featureOn} disabled={off} label={`Attiva ${meta.title}`} onChange={(next) => void toggleFeature(kind, next)} />
        </div>
      </section>

      {!featureOn ? (
        <div className="rounded-3xl border border-dashed border-sand/15 px-6 py-10 text-center">
          <Icon className="mx-auto size-8 text-crema/25" aria-hidden />
          <p className="mt-3 text-sm text-crema/60">{meta.title} è spento. Riaccendilo qui sopra per pubblicare e personalizzare i messaggi.</p>
        </div>
      ) : (
        <div className={cn(off && "pointer-events-none opacity-50")}>
          <KindEditor
            key={kind}
            kind={kind}
            value={kindPres}
            roles={pickers.roles}
            prefix={prefix}
            disabled={off}
            onChange={(next) => {
              setPresentation((prev) => ({ ...prev, [kind]: next }));
              setPresDirty(true);
            }}
            styleSlot={
              kind === "quote" ? (
                <QuoteStyleEditor
                  guildId={guildId}
                  token={token}
                  value={settings.boards.quoteStyle}
                  disabled={off}
                  locked={!canCustomizeQuoteStyle}
                  saving={saving}
                  onSave={async (next) => {
                    if (!canCustomizeQuoteStyle) {
                      onToast("Lo stile delle quote è riservato a Premium e ai server protetti.", true);
                      return false;
                    }
                    return save({ boards: { quoteStyle: next } }, "Stile quote salvato.");
                  }}
                />
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

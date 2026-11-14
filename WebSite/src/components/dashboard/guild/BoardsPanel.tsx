"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Hash,
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
import { Select, MultiSelect } from "@/components/ui/Select";
import { emptyDraft, type MsgDraft, type PickerEmoji } from "@/lib/dashboard-community";
import { cn } from "@/lib/cn";
import {
  BOARD_FEATURES,
  DEFAULT_BOARD_PRESENTATION,
  patchGuildSettings,
  previewGuildQuoteStyle,
  previewGuildSkull,
  type BoardDraftSlot,
  type BoardFeatures,
  type BoardKindPresentation,
  type BoardsMode,
  type BoardsPresentation,
  type GuildSettings,
  type SettingsPickers,
} from "@/lib/dashboard-guild";
import type { BachecaModuleTabId } from "../guildSections";
import { DiscordMessagePreview, DraftEditor, EditorWithPreview, useCommunity, type PreviewRow } from "./community/shared";
import { QuoteStyleEditor } from "./QuoteStyleEditor";
import {
  Field,
  FormGroup,
  Notice,
  PremiumBadge,
  Pills,
  SettingRow,
  StatusBadge,
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
      { token: "{username}", hint: "nome di chi ha fatto la clip" },
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

/* ───────────────────────── messaggi: predefiniti, esempio, anteprima ───────────────────────── */

/** colori degli embed come li manda il bot */
const KIND_COLOR: Record<BoardKindId, string> = { quote: "#826bc2", repost: "#826bc2", clip: "#826bc2", skull: "#6f4e37" };

function sampleVars(kind: BoardKindId, prefix: string, image: string): Record<string, string> {
  return {
    prefix,
    count: kind === "quote" ? "128" : "42",
    author: "@Mario",
    creator: "@Luigi",
    reposter: "@Luigi",
    body: "» *Esempio di messaggio in bacheca…*",
    source: "https://discord.com/channels/0/0/0",
    text: "Esempio di messaggio in bacheca…",
    channel: kind === "clip" ? "Chiacchiere" : "#bacheca",
    date: "14/11/2026, 11:30",
    phrase: "ha salvato un momento iconico!",
    link: "» [Clicca qui per vedere il repost](https://discord.com/channels/0/0/0)",
    url: "https://discord.com/channels/0/0/0",
    duration: "15",
    username: "Luigi",
    image,
  };
}

/** Il messaggio che il bot manda oggi, scritto come messaggio personalizzabile (punto di partenza dell'editor). */
function defaultDraft(kind: BoardKindId, slot: BoardDraftSlot, v: BoardKindPresentation): MsgDraft {
  const base = emptyDraft();
  const embed = { ...base.embed, enabled: true, color: KIND_COLOR[kind] };
  if (slot === "post") {
    if (kind === "clip") {
      return {
        ...base,
        embed: {
          ...embed,
          authorName: "{username}",
          title: v.embedTitle,
          description: v.embedDescription,
          fields: [{ name: v.fieldAuthor || "Clip di", value: "{reposter}", inline: true }],
          footerText: v.embedFooter,
          timestamp: true,
        },
      };
    }
    const fields =
      kind === "quote"
        ? [
            { name: v.fieldAuthor || "Messaggio di:", value: "{author}", inline: false },
            { name: v.fieldCreator || "Creato da:", value: "{creator}", inline: false },
          ]
        : kind === "skull"
          ? [
              { name: v.fieldAuthor || "Autore", value: "{author}", inline: true },
              { name: v.fieldChannel || "Canale", value: "{channel}", inline: true },
              { name: v.fieldMessage || "Messaggio", value: "[Cliccami]({source})", inline: true },
            ]
          : [];
    return {
      ...base,
      embed: {
        ...embed,
        title: kind === "skull" ? "" : v.embedTitle,
        description: v.embedDescription,
        footerText: v.embedFooter,
        imageUrl: kind === "quote" ? "" : "{image}",
        fields,
        timestamp: kind === "skull",
      },
    };
  }
  if (slot === "reply") {
    return {
      ...base,
      embed: {
        ...embed,
        description: v.ackDescription,
        footerText: kind === "repost" || kind === "clip" ? v.ackFooter : "",
        fields: kind === "quote" && v.ackFieldName ? [{ name: v.ackFieldName, value: "{count}", inline: false }] : [],
        timestamp: kind === "clip",
      },
    };
  }
  return { ...base, embed: { ...embed, title: v.rouletteTitle, description: v.rouletteDescription, footerText: v.rouletteFooter, imageUrl: "{image}" } };
}

/** pulsanti che il bot aggiunge da solo sotto il messaggio */
function botRows(kind: BoardKindId, slot: BoardDraftSlot, v: BoardKindPresentation): PreviewRow[] {
  const repost = { label: v.buttonRepost || "Reposta", emoji: "<a:reddiamond:1443652837346377841>", style: 2 as const };
  const remove = { label: v.buttonRemove || "Rimuovi", emoji: "🗑️", style: 4 as const };
  if (slot === "post") return kind === "skull" ? [] : [{ kind: "buttons", items: [repost, remove] }];
  if (slot === "roulette") return [{ kind: "buttons", items: [repost] }];
  if (kind === "skull") return [{ kind: "buttons", items: [{ label: "Vai al Post", emoji: "💀", style: 5 }] }];
  if (kind === "clip") return [];
  return [{ kind: "buttons", items: [repost] }];
}

const SLOT_TEXT: Record<BoardKindId, Record<BoardDraftSlot, string>> = {
  quote: {
    post: "Il messaggio che il bot pubblica nel canale delle quote. L'immagine della quote è allegata: mettila dove vuoi con {image}.",
    reply: "La risposta al comando. Vale sia quando la quote resta nel canale, sia quando va nel canale dedicato o sul sito: {channel} è il canale dove è finita.",
    roulette: "",
  },
  repost: {
    post: "Il messaggio che il bot pubblica nella bacheca. {image} è l'immagine del messaggio salvato, se ce l'ha.",
    reply: "La risposta a chi usa il comando o il pulsante Reposta.",
    roulette: "Ogni tanto il bot ripesca un vecchio repost a caso e lo ripubblica.",
  },
  clip: {
    post: "Il messaggio con la clip vocale (il file audio è allegato).",
    reply: "La risposta a chi usa il comando.",
    roulette: "",
  },
  skull: {
    post: "Il messaggio nella skullboard. {image} è l'immagine del messaggio originale.",
    reply: "La conferma nel canale dove è arrivato il 💀. Vale anche per la Bacheca del sito: {channel} è il canale della skullboard.",
    roulette: "",
  },
};

/* ───────────────────────── editor di una funzione ───────────────────────── */

type Section = BoardDraftSlot | "buttons" | "style";

function KindEditor({
  kind,
  value,
  roles,
  channels,
  emojis,
  bot,
  sampleImage,
  prefix,
  disabled,
  onChange,
  styleSlot,
}: {
  kind: BoardKindId;
  value: BoardKindPresentation;
  roles: { id: string; name: string }[];
  channels: { id: string; name: string }[];
  emojis: PickerEmoji[];
  bot: { name: string; avatarUrl: string } | null;
  /** immagine d'esempio: la quote vera del server (Quote) o un messaggio della skullboard (Skullboard) */
  sampleImage: string;
  prefix: string;
  disabled?: boolean;
  onChange: (next: BoardKindPresentation) => void;
  /** solo Quote: editor dello stile dell'immagine */
  styleSlot?: React.ReactNode;
}) {
  const meta = KIND_META[kind];
  const [section, setSection] = useState<Section>("post");
  const set = <K extends keyof BoardKindPresentation>(key: K, next: BoardKindPresentation[K]) => onChange({ ...value, [key]: next });
  const text = (key: "buttonRepost" | "buttonRemove", label: string) => (
    <Field label={label}>
      <input type="text" value={value[key]} disabled={disabled} maxLength={80} onChange={(e) => set(key, e.target.value)} className={cn(fieldClass, "mt-1.5")} />
    </Field>
  );

  const slots: BoardDraftSlot[] = kind === "repost" ? ["post", "reply", "roulette"] : ["post", "reply"];
  const slotLabel: Record<BoardDraftSlot, string> = { post: kind === "skull" ? "Post in skullboard" : "Post in bacheca", reply: kind === "skull" ? "Conferma" : "Risposta al comando", roulette: "Roulette" };
  const slotIcon: Record<BoardDraftSlot, LucideIcon> = { post: meta.icon, reply: MessageSquareReply, roulette: Shuffle };
  const sections: { id: Section; label: string; icon: LucideIcon; dot?: string }[] = [
    ...slots.map((s) => ({ id: s as Section, label: slotLabel[s], icon: slotIcon[s], dot: value.drafts?.[s] ? meta.accent : undefined })),
    { id: "buttons", label: "Pulsanti e permessi", icon: MousePointerClick },
    ...(styleSlot ? [{ id: "style" as const, label: "Stile immagine", icon: Sparkles }] : []),
  ];

  const vars = sampleVars(kind, prefix, sampleImage);
  /* per l anteprima bastano id e nome */
  const previewRoles = roles.map((r) => ({ ...r, color: null, position: 0 }));
  const placeholders = [
    ...meta.placeholders,
    ...(kind === "clip" ? [] : [{ token: "{image}", hint: kind === "quote" ? "immagine della quote" : "immagine del messaggio" }]),
    { token: "{url}", hint: "link al post (risposte)" },
  ];

  const slotEditor = (slot: BoardDraftSlot) => {
    const saved = value.drafts?.[slot] ?? null;
    const draft = saved ?? defaultDraft(kind, slot, value);
    const usesImage = JSON.stringify(draft).includes("{image}");
    /* la quote (o la foto della skull) arriva come allegato: sopra l'embed, se non la metti tu dentro */
    const attachment = (kind === "quote" || (kind === "skull" && slot === "post")) && slot !== "roulette" && !usesImage ? sampleImage : "";
    return (
      <EditorWithPreview
        editor={
          <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-espresso/45 p-4 ring-1 ring-sand/10">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-crema">
                  {slotLabel[slot]}
                  {saved ? <StatusBadge tone="accent">Personalizzato</StatusBadge> : <StatusBadge>Predefinito</StatusBadge>}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-crema/60">{SLOT_TEXT[kind][slot]}</p>
              </div>
              {saved ? (
                <button type="button" disabled={disabled} className={miniBtn} onClick={() => set("drafts", { ...value.drafts, [slot]: null })}>
                  <RotateCcw className="size-3.5" aria-hidden /> Torna al predefinito
                </button>
              ) : null}
            </div>
            <DraftEditor
              key={`${kind}-${slot}`}
              value={draft}
              onChange={(d) => set("drafts", { ...value.drafts, [slot]: d })}
              emojis={emojis}
              placeholders={placeholders}
            />
            <p className="text-xs text-crema/50">
              {slot === "reply" && kind === "clip"
                ? "Sotto il messaggio puoi aggiungere i tuoi pulsanti link."
                : "I pulsanti del bot (Reposta, Rimuovi…) si aggiungono da soli sotto il messaggio: il loro testo si cambia in Pulsanti e permessi."}
            </p>
          </div>
        }
        preview={<DiscordMessagePreview noTest bot={bot} draft={draft} vars={vars} roles={previewRoles} channels={channels} rows={botRows(kind, slot, value)} attachmentUrl={attachment || null} />}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Pills value={section} onChange={setSection} ariaLabel={`Messaggi ${meta.title}`} options={sections} />
        {section !== "style" ? (
          <button
            type="button"
            disabled={disabled}
            className={cn(miniBtn, "ml-auto")}
            onClick={() => onChange({ ...DEFAULT_BOARD_PRESENTATION[kind], deleteRoleIds: value.deleteRoleIds, drafts: { post: null, reply: null, roulette: null } })}
            title="Rimette tutti i messaggi originali di questa funzione (i ruoli restano)"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Tutto predefinito
          </button>
        ) : null}
      </div>

      {section === "post" || section === "reply" || section === "roulette" ? slotEditor(section) : null}

      {section === "buttons" ? (
        <EditorWithPreview
          editor={
            <div className="space-y-4">
              <FormGroup title="Pulsanti del bot" description="Il testo dei pulsanti che il bot mette sotto i post (massimo 80 caratteri).">
                <div className="grid gap-3 sm:grid-cols-2">
                  {kind !== "skull" ? text("buttonRepost", "Pulsante repost") : null}
                  {text("buttonRemove", "Pulsante rimuovi")}
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
          preview={
            <DiscordMessagePreview
              noTest
              bot={bot}
              draft={value.drafts?.post ?? defaultDraft(kind, "post", value)}
              vars={vars}
              roles={previewRoles}
              channels={channels}
              rows={botRows(kind, "post", value)}
              attachmentUrl={kind === "quote" && !JSON.stringify(value.drafts?.post ?? "").includes("{image}") ? sampleImage || null : null}
            />
          }
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
  /* nome e avatar del bot, emoji del server: come nelle altre schede */
  const community = useCommunity(guildId, token);
  /* immagini d'esempio per le anteprime: la quote vera con lo stile del server e un messaggio della skullboard */
  const [sampleImage, setSampleImage] = useState("");
  const [skullImage, setSkullImage] = useState("");
  useEffect(() => {
    let url = "";
    let alive = true;
    void previewGuildSkull(token, guildId).then((u) => {
      if (!u) return;
      if (!alive) return URL.revokeObjectURL(u);
      url = u;
      setSkullImage(u);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, guildId]);
  const quoteStyle = settings?.boards.quoteStyle;
  useEffect(() => {
    if (!quoteStyle) return;
    let url = "";
    let alive = true;
    void previewGuildQuoteStyle(token, guildId, quoteStyle).then((u) => {
      if (!u) return;
      if (!alive) return URL.revokeObjectURL(u);
      url = u;
      setSampleImage(u);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, guildId, quoteStyle]);

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
            channels={pickers.textChannels}
            emojis={community.data?.pickers.emojis ?? []}
            bot={community.data?.bot ?? null}
            sampleImage={kind === "skull" ? skullImage : sampleImage}
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

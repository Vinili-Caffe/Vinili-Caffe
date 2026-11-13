"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Plus, Search, Settings2, Trash2, UserRound, X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { searchTicketMembers, type MemberHit } from "@/lib/dashboard-guild-ops";
import {
  communityApi,
  emptyDraft,
  type LiveAccount,
  type LiveAlertsConfig,
  type LivePlatform,
  type LivePlatformConfig,
  type MsgDraft,
} from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, TrackUnsaved, dangerBtn, fieldClass, miniBtn } from "../bits";
import { InstagramIcon, KickIcon, TikTokIcon, TwitchIcon, YoutubeIcon } from "../LivePlatformIcons";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, roleOptions, useCommunity } from "./shared";

/* ───────────── piattaforme ───────────── */

type PlatformMeta = {
  title: string;
  color: string;
  Icon: typeof TwitchIcon;
  /** prefisso mostrato davanti al nome dell'account (es. twitch.tv/) */
  prefix: string;
  handleLabel: string;
  handlePlaceholder: string;
  /** "video" per YouTube, "post" per TikTok e Instagram, null = solo dirette */
  postWord: "video" | "post" | null;
  blurb: string;
};

const PLATFORM: Record<LivePlatform, PlatformMeta> = {
  twitch: {
    title: "Twitch",
    color: "#9146ff",
    Icon: TwitchIcon,
    prefix: "twitch.tv/",
    handleLabel: "Canale Twitch",
    handlePlaceholder: "nomecanale",
    postWord: null,
    blurb: "Quando un canale va in live, il bot lo annuncia nel canale scelto, pinga il ruolo e, se vuoi, rinomina il palco.",
  },
  youtube: {
    title: "YouTube",
    color: "#ff3b30",
    Icon: YoutubeIcon,
    prefix: "youtube.com/@",
    handleLabel: "Canale YouTube",
    handlePlaceholder: "handle oppure ID UC…",
    postWord: "video",
    blurb: "Avvisi quando un canale va in diretta o carica un video nuovo.",
  },
  kick: {
    title: "Kick",
    color: "#53fc18",
    Icon: KickIcon,
    prefix: "kick.com/",
    handleLabel: "Canale Kick",
    handlePlaceholder: "nomecanale",
    postWord: null,
    blurb: "Quando un canale Kick va in live, il bot lo annuncia nel canale scelto.",
  },
  tiktok: {
    title: "TikTok",
    color: "#25f4ee",
    Icon: TikTokIcon,
    prefix: "tiktok.com/@",
    handleLabel: "Account TikTok",
    handlePlaceholder: "nomeutente",
    postWord: "post",
    blurb: "Avvisi quando un account va in diretta o pubblica un video nuovo.",
  },
  instagram: {
    title: "Instagram",
    color: "#e1306c",
    Icon: InstagramIcon,
    prefix: "instagram.com/",
    handleLabel: "Account Instagram",
    handlePlaceholder: "nomeutente",
    postWord: "post",
    blurb: "Avvisi quando un account pubblica un post nuovo o va in diretta.",
  },
};

const PLACEHOLDERS_LIVE = [
  { token: "{mention}", hint: "menzione su Discord (o il nome)" },
  { token: "{name}", hint: "nome dell'account" },
  { token: "{title}", hint: "titolo della diretta" },
  { token: "{game}", hint: "categoria o gioco" },
  { token: "{viewers}", hint: "spettatori" },
  { token: "{url}", hint: "link alla diretta" },
  { token: "{ping}", hint: "ruolo da pingare" },
  { token: "{platform}", hint: "nome della piattaforma" },
  { token: "{thumb}", hint: "anteprima (per l'immagine)" },
];

const PLACEHOLDERS_POSTS = [
  { token: "{mention}", hint: "menzione su Discord (o il nome)" },
  { token: "{name}", hint: "nome dell'account" },
  { token: "{title}", hint: "titolo o descrizione" },
  { token: "{url}", hint: "link al video o post" },
  { token: "{ping}", hint: "ruolo da pingare" },
  { token: "{platform}", hint: "nome della piattaforma" },
  { token: "{thumb}", hint: "anteprima (per l'immagine)" },
];

/* "Controlla ogni" e "Pausa tra due avvisi": scelte leggibili invece dei secondi a mano */
const POLL_OPTIONS = [
  [60, "Ogni minuto"],
  [120, "Ogni 2 minuti"],
  [180, "Ogni 3 minuti"],
  [300, "Ogni 5 minuti"],
  [600, "Ogni 10 minuti"],
] as const;
const COOLDOWN_OPTIONS = [
  [300, "5 minuti"],
  [900, "15 minuti"],
  [1800, "30 minuti"],
  [2700, "45 minuti"],
  [3600, "1 ora"],
  [7200, "2 ore"],
  [21600, "6 ore"],
] as const;

function secondsLabel(sec: number) {
  return sec % 3600 === 0 ? `${sec / 3600} ${sec === 3600 ? "ora" : "ore"}` : sec % 60 === 0 ? `${sec / 60} minuti` : `${sec} secondi`;
}

function optionsWith(list: readonly (readonly [number, string])[], value: number, fmt: (n: number) => string) {
  const opts = list.map(([v, label]) => ({ value: String(v), label }));
  return opts.some((o) => o.value === String(value)) ? opts : [...opts, { value: String(value), label: fmt(value) }];
}

/* ───────────── messaggi predefiniti ───────────── */

function liveDraftOf(pcfg: LivePlatformConfig, p: LivePlatform): MsgDraft {
  if (pcfg.draft) return pcfg.draft;
  return emptyDraft({
    content: pcfg.messageTemplate || "{ping}",
    mentionUsers: true,
    mentionRoles: true,
    embed: {
      ...emptyDraft().embed,
      enabled: true,
      title: "{name} è in live su {platform}",
      description: "{title}",
      color: PLATFORM[p].color,
      imageUrl: "{thumb}",
      fields: p === "twitch" || p === "kick" ? [
        { name: "Categoria", value: "{game}", inline: true },
        { name: "Spettatori", value: "{viewers}", inline: true },
      ] : [],
    },
  });
}

function postsDraftOf(pcfg: LivePlatformConfig, p: LivePlatform): MsgDraft {
  if (pcfg.postsDraft) return pcfg.postsDraft;
  const word = PLATFORM[p].postWord || "post";
  return emptyDraft({
    content: "{ping}",
    mentionUsers: true,
    mentionRoles: true,
    embed: {
      ...emptyDraft().embed,
      enabled: true,
      title: `Nuovo ${word} di {name}`,
      description: "**{title}**\n[Guardalo su {platform}]({url})",
      color: PLATFORM[p].color,
      imageUrl: "{thumb}",
    },
  });
}

/* il pannello lavora sempre con i due messaggi presenti, così l'anteprima e "modifiche non salvate" sono coerenti */
function withDrafts(cfg: LiveAlertsConfig): LiveAlertsConfig {
  const platforms = Object.fromEntries(
    (Object.keys(cfg.platforms) as LivePlatform[]).map((p) => {
      const row = cfg.platforms[p];
      const draft = liveDraftOf(row, p);
      return [p, PLATFORM[p].postWord ? { ...row, draft, postsDraft: postsDraftOf(row, p) } : { ...row, draft, postsDraft: undefined }];
    }),
  ) as LiveAlertsConfig["platforms"];
  return { ...cfg, platforms };
}

function emptyAccount(): LiveAccount {
  return {
    id: "",
    displayName: "",
    discordUserId: null,
    streamVoiceChannelId: null,
    voiceNameOn: null,
    voiceNameOff: null,
    voiceStatusOn: null,
    deleteAnnouncementOnOffline: false,
  };
}

/* ───────────── pannello ───────────── */

export function LiveVideoPanel({
  guildId,
  token,
  onToast,
  tab,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  tab: LivePlatform;
}) {
  const { data } = useCommunity(guildId, token);
  const [cfg, setCfg] = useState<LiveAlertsConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [imported, setImported] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [maxAccounts, setMaxAccounts] = useState(25);
  /* account aperto (indice), messaggio mostrato, avanzate */
  const [openAcc, setOpenAcc] = useState<number | null>(null);
  const [msgTab, setMsgTab] = useState<"live" | "posts">("live");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let alive = true;
    void communityApi.getLive(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      const next = withDrafts(r.data.config);
      setCfg(next);
      setSaved(JSON.stringify(next));
      setImported(Boolean(r.data.imported));
      if (r.data.maxAccounts) setMaxAccounts(r.data.maxAccounts);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  const platform = tab;
  const meta = PLATFORM[platform];
  const pcfg = cfg?.platforms[platform];
  const hasPosts = Boolean(meta.postWord);

  const sampleVars = useMemo(() => {
    const acc = pcfg?.accounts.find((a) => a.id) || null;
    const name = acc?.displayName || acc?.id || (platform === "youtube" ? "Il tuo canale" : "nomecanale");
    const base = {
      mention: acc?.discordUserId ? `<@${acc.discordUserId}>` : name,
      name,
      ping: pcfg?.pingRoleId ? `<@&${pcfg.pingRoleId}>` : "",
      platform: meta.title,
      thumb: "https://static-cdn.jtvnw.net/ttv-static/404_preview-1280x720.jpg",
      server: data?.guild?.name || "Server",
    };
    const handle = acc?.id || "nomecanale";
    const liveUrl =
      platform === "twitch"
        ? `https://www.twitch.tv/${handle}`
        : platform === "kick"
          ? `https://kick.com/${handle}`
          : platform === "youtube"
            ? `https://www.youtube.com/@${handle}/live`
            : platform === "tiktok"
              ? `https://www.tiktok.com/@${handle}/live`
              : `https://www.instagram.com/${handle}/live/`;
    return {
      live: { ...base, title: "Partita in compagnia, venite!", game: "Just Chatting", viewers: "1.234", url: liveUrl, type: "è in diretta", kind: "live" },
      posts: {
        ...base,
        title: meta.postWord === "video" ? "Il mio nuovo video" : "Il mio nuovo post",
        game: "",
        viewers: "",
        url: platform === "youtube" ? "https://www.youtube.com/watch?v=esempio" : platform === "tiktok" ? `https://www.tiktok.com/@${handle}/video/1` : "https://www.instagram.com/p/esempio/",
        type: `ha pubblicato un nuovo ${meta.postWord || "post"}`,
        kind: "post",
      },
    };
  }, [pcfg, platform, meta, data?.guild?.name]);

  if (loadError && !cfg) return <Notice error>{loadError}</Notice>;
  if (!cfg || !data || !pcfg) return <RowsSkeleton rows={8} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const channels = data.pickers.textChannels;
  const roles = roleOptions(data.pickers.roles, guildId);
  const draft = liveDraftOf(pcfg, platform);
  const postsDraft = hasPosts ? postsDraftOf(pcfg, platform) : null;
  const shownMsg = hasPosts && msgTab === "posts" && postsDraft ? "posts" : "live";
  const namedAccounts = pcfg.accounts.filter((a) => a.id.trim());
  const missing = pcfg.enabled ? [!pcfg.channelId ? "il canale" : null, !namedAccounts.length ? "almeno un account" : null].filter(Boolean) : [];

  const setPlatform = (patch: Partial<LivePlatformConfig>) => setCfg({ ...cfg, platforms: { ...cfg.platforms, [platform]: { ...pcfg, ...patch } } });
  const setAccount = (index: number, patch: Partial<LiveAccount>) => setPlatform({ accounts: pcfg.accounts.map((a, i) => (i === index ? { ...a, ...patch } : a)) });

  const save = async () => {
    const r = await communityApi.saveLive(token, guildId, cfg);
    if (!r.ok) return onToast(r.message, true);
    const next = withDrafts(r.data.config);
    setCfg(next);
    setSaved(JSON.stringify(next));
    setImported(false);
    onToast("Avvisi social salvati.");
  };
  const reset = () => {
    try {
      setCfg(JSON.parse(saved));
    } catch {}
  };

  const status = pcfg.enabled
    ? `Attivo · ${namedAccounts.length} ${namedAccounts.length === 1 ? "account" : "account"}${pcfg.channelId ? ` · #${channels.find((c) => c.id === pcfg.channelId)?.name || "canale"}` : ""}`
    : "Spento";

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />
      {imported ? <Notice>Ho importato gli avvisi Twitch che il bot usa adesso sul server principale. Controlla e salva per gestirli da qui.</Notice> : null}

      <p className="text-sm text-crema/60">{meta.blurb}</p>

      {/* testata della piattaforma: logo, stato, interruttore, dove arrivano gli avvisi */}
      <section
        className="relative overflow-hidden rounded-2xl bg-espresso/45 ring-1 ring-sand/10"
        style={{ backgroundImage: `radial-gradient(120% 140% at 0% 0%, ${meta.color}1f, transparent 55%)` }}
      >
        <div className="flex items-center gap-3 p-4 sm:p-5">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1"
            style={{ backgroundColor: `${meta.color}24`, color: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}40` }}
          >
            <meta.Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold text-crema">{meta.title}</p>
            <p className={cn("truncate text-xs", pcfg.enabled ? "text-crema/65" : "text-crema/45")}>{status}</p>
          </div>
          <Toggle checked={pcfg.enabled} onChange={(enabled) => setPlatform({ enabled })} label={`Avvisi ${meta.title}`} />
        </div>

        <div className="grid gap-3 border-t border-sand/10 p-4 sm:grid-cols-2 sm:p-5">
          <ChannelField label="Canale degli avvisi" value={pcfg.channelId} channels={channels} onChange={(channelId) => setPlatform({ channelId })} />
          <Field label="Ruolo da pingare" hint="Finisce al posto di {ping} nel messaggio.">
            <Select
              value={pcfg.pingRoleId || ""}
              onChange={(v) => setPlatform({ pingRoleId: v || null })}
              className={fieldClass}
              options={[{ value: "", label: "Nessun ping" }, ...roles]}
            />
          </Field>
        </div>

        {hasPosts ? (
          <div className="divide-y divide-sand/[0.07] border-t border-sand/10 px-4 sm:px-5">
            <SettingRow title="Dirette" description="Avvisa quando l'account va in live.">
              <Toggle size="sm" checked={pcfg.notifyLive !== false} onChange={(notifyLive) => setPlatform({ notifyLive })} label="Avvisa le dirette" />
            </SettingRow>
            <SettingRow
              title={meta.postWord === "video" ? "Video nuovi" : "Post nuovi"}
              description={`Avvisa quando esce un ${meta.postWord} nuovo. Al primo controllo il bot si segna l'ultimo e non annuncia niente.`}
            >
              <Toggle size="sm" checked={pcfg.notifyPosts !== false} onChange={(notifyPosts) => setPlatform({ notifyPosts })} label={`Avvisa i ${meta.postWord} nuovi`} />
            </SettingRow>
          </div>
        ) : null}
      </section>

      {missing.length ? <Notice error>Per salvare con {meta.title} acceso manca {missing.join(" e ")}.</Notice> : null}

      {/* account seguiti */}
      <FormGroup
        title="Account seguiti"
        description={`${namedAccounts.length} su ${maxAccounts}. Il bot controlla questi account e manda l'avviso quando serve.`}
        action={
          pcfg.accounts.length < maxAccounts ? (
            <button
              type="button"
              className={miniBtn}
              onClick={() => {
                setPlatform({ accounts: [...pcfg.accounts, emptyAccount()] });
                setOpenAcc(pcfg.accounts.length);
              }}
            >
              <Plus className="size-3.5" aria-hidden /> Aggiungi
            </button>
          ) : null
        }
      >
        {!pcfg.accounts.length ? (
          <button
            type="button"
            onClick={() => {
              setPlatform({ accounts: [emptyAccount()] });
              setOpenAcc(0);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-sand/20 px-4 py-8 text-center transition hover:border-sand/35 hover:bg-crema/[0.02]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>
              <meta.Icon className="size-5" />
            </span>
            <span className="text-sm font-semibold text-crema">Aggiungi il primo account</span>
            <span className="text-xs text-crema/50">Basta il nome come appare nel link: {meta.prefix}…</span>
          </button>
        ) : (
          <div className="space-y-2">
            {pcfg.accounts.map((acc, i) => (
              <AccountCard
                key={i}
                platform={platform}
                acc={acc}
                open={openAcc === i}
                onToggle={() => setOpenAcc(openAcc === i ? null : i)}
                onChange={(patch) => setAccount(i, patch)}
                onRemove={() => {
                  setPlatform({ accounts: pcfg.accounts.filter((_, j) => j !== i) });
                  setOpenAcc(null);
                }}
                guildId={guildId}
                token={token}
                generalStage={pcfg.streamVoiceChannelId}
              />
            ))}
          </div>
        )}
      </FormGroup>

      {/* messaggio */}
      <FormGroup
        title="Messaggio dell'avviso"
        description="Testo, embed e pulsanti. I segnaposto si riempiono con i dati della diretta o del post."
        action={
          hasPosts ? (
            <div className="inline-grid grid-flow-col gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="tablist" aria-label="Quale messaggio">
              {(
                [
                  ["live", "Diretta"],
                  ["posts", meta.postWord === "video" ? "Video nuovo" : "Post nuovo"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={shownMsg === k}
                  onClick={() => setMsgTab(k)}
                  className={cn("rounded-md px-3 py-1 text-xs font-semibold transition-colors", shownMsg === k ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema")}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null
        }
      >
        <EditorWithPreview
          editor={
            <DraftEditor
              key={`${platform}-${shownMsg}`}
              value={shownMsg === "posts" && postsDraft ? postsDraft : draft}
              onChange={(next) => (shownMsg === "posts" ? setPlatform({ postsDraft: next }) : setPlatform({ draft: next, messageTemplate: next.content }))}
              emojis={data.pickers.emojis}
              placeholders={shownMsg === "posts" ? PLACEHOLDERS_POSTS : PLACEHOLDERS_LIVE}
              maxButtons={data.limits?.buttons ?? 5}
            />
          }
          preview={
            <DiscordMessagePreview
              bot={data.bot}
              draft={shownMsg === "posts" && postsDraft ? postsDraft : draft}
              vars={shownMsg === "posts" ? sampleVars.posts : sampleVars.live}
              roles={data.pickers.roles}
              channels={channels}
              testChannelId={pcfg.channelId}
            />
          }
        />
      </FormGroup>

      {/* avanzate: frequenza dei controlli, pausa tra due avvisi, palco Twitch */}
      <section className="rounded-2xl bg-espresso/45 ring-1 ring-sand/10">
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced} className="flex w-full items-center gap-3 p-4 text-left sm:px-5">
          <Settings2 className="size-4 shrink-0 text-crema/55" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-crema">Avanzate</span>
            <span className="block truncate text-xs text-crema/50">
              Controllo {POLL_OPTIONS.find(([v]) => v === pcfg.pollIntervalSec)?.[1].toLowerCase() || `ogni ${secondsLabel(pcfg.pollIntervalSec)}`} · pausa {secondsLabel(pcfg.reannounceCooldownSec)}
            </span>
          </span>
          <ChevronDown className={cn("size-4 text-crema/50 transition", showAdvanced && "rotate-180")} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {showAdvanced ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="grid gap-3 border-t border-sand/10 p-4 sm:grid-cols-2 sm:px-5">
                <Field label="Controlla gli account" hint="Più spesso = avvisi più rapidi.">
                  <Select
                    value={String(pcfg.pollIntervalSec)}
                    onChange={(v) => setPlatform({ pollIntervalSec: Number(v) || 120 })}
                    className={fieldClass}
                    options={optionsWith(POLL_OPTIONS, pcfg.pollIntervalSec, (n) => `Ogni ${secondsLabel(n)}`)}
                  />
                </Field>
                <Field label="Pausa tra due avvisi" hint="Se la stessa live cade e riparte, non la riannuncia prima di questo tempo.">
                  <Select
                    value={String(pcfg.reannounceCooldownSec)}
                    onChange={(v) => setPlatform({ reannounceCooldownSec: Number(v) || 2700 })}
                    className={fieldClass}
                    options={optionsWith(COOLDOWN_OPTIONS, pcfg.reannounceCooldownSec, secondsLabel)}
                  />
                </Field>
                {platform === "twitch" ? (
                  <Field label="Palco da rinominare (ID)" hint="Palco o canale vocale che cambia nome quando un account è in live. Ogni account può averne uno suo.">
                    <input
                      className={fieldClass}
                      inputMode="numeric"
                      value={pcfg.streamVoiceChannelId || ""}
                      onChange={(e) => setPlatform({ streamVoiceChannelId: e.target.value.replace(/\D/g, "") || null })}
                      placeholder="Nessuno"
                    />
                  </Field>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  );
}

/* ───────────── un account ───────────── */

function AccountCard({
  platform,
  acc,
  open,
  onToggle,
  onChange,
  onRemove,
  guildId,
  token,
  generalStage,
}: {
  platform: LivePlatform;
  acc: LiveAccount;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<LiveAccount>) => void;
  onRemove: () => void;
  guildId: string;
  token: string;
  generalStage: string | null;
}) {
  const meta = PLATFORM[platform];
  const handle = acc.id.trim();
  const title = acc.displayName.trim() || handle || "Nuovo account";
  const chips = [
    acc.discordUserId ? "menzionato su Discord" : null,
    platform === "twitch" && acc.deleteAnnouncementOnOffline ? "avviso tolto a fine live" : null,
    platform === "twitch" && (acc.streamVoiceChannelId || generalStage) ? "rinomina il palco" : null,
  ].filter(Boolean) as string[];

  return (
    <div className={cn("rounded-2xl bg-espresso/40 ring-1 transition-colors", open ? "ring-sand/20" : "ring-sand/10")}>
      <div className="flex items-center gap-2 p-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold uppercase"
            style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
            aria-hidden
          >
            {(title.match(/[\p{L}\p{N}]/u) || ["?"])[0]}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-semibold", handle ? "text-crema" : "text-crema/55")} translate="no">
              {title}
            </span>
            <span className="block truncate text-xs text-crema/50" translate="no">
              {handle ? `${meta.prefix}${handle}` : "Scrivi il nome dell'account"}
              {chips.length ? ` · ${chips.join(" · ")}` : ""}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-crema/50 transition", open && "rotate-180")} aria-hidden />
        </button>
        <button type="button" className={cn(dangerBtn, "px-2")} onClick={onRemove} aria-label={`Togli ${title}`}>
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-sand/10 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={meta.handleLabel}>
                  <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl bg-espresso/70 ring-1 ring-sand/15 focus-within:ring-2 focus-within:ring-caramel/45">
                    <span className="flex items-center border-r border-sand/10 px-3 text-sm text-crema/45" translate="no">
                      {meta.prefix}
                    </span>
                    <input
                      className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-crema outline-none placeholder:text-crema/45"
                      value={acc.id}
                      placeholder={meta.handlePlaceholder}
                      spellCheck={false}
                      autoCapitalize="off"
                      onChange={(e) => onChange({ id: e.target.value.trim().replace(/^@/, "").replace(/^https?:\/\/\S+?\/(@)?/, "") })}
                      aria-label={meta.handleLabel}
                    />
                  </div>
                </Field>
                <Field label="Nome nell'avviso" hint="Vuoto = il nome dell'account.">
                  <input className={fieldClass} value={acc.displayName} placeholder={handle || "Nome"} onChange={(e) => onChange({ displayName: e.target.value })} />
                </Field>
              </div>
              <MemberField guildId={guildId} token={token} value={acc.discordUserId} onChange={(discordUserId) => onChange({ discordUserId })} />

              {platform === "twitch" ? (
                <div className="space-y-3 rounded-xl bg-crema/[0.025] p-3 ring-1 ring-sand/[0.08]">
                  <SettingRow title="Togli l'avviso a fine live" description="Quando la diretta finisce, il messaggio sparisce dal canale.">
                    <Toggle size="sm" checked={acc.deleteAnnouncementOnOffline} onChange={(deleteAnnouncementOnOffline) => onChange({ deleteAnnouncementOnOffline })} label="Togli l'avviso a fine live" />
                  </SettingRow>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Palco di questo account (ID)" hint={generalStage ? "Vuoto = quello delle Avanzate." : "Vuoto = nessun palco."}>
                      <input
                        className={fieldClass}
                        inputMode="numeric"
                        value={acc.streamVoiceChannelId || ""}
                        onChange={(e) => onChange({ streamVoiceChannelId: e.target.value.replace(/\D/g, "") || null })}
                      />
                    </Field>
                    <Field label="Nome del palco in live">
                      <input className={fieldClass} value={acc.voiceNameOn || ""} placeholder="🔴 In live" onChange={(e) => onChange({ voiceNameOn: e.target.value || null })} />
                    </Field>
                    <Field label="Nome del palco offline">
                      <input className={fieldClass} value={acc.voiceNameOff || ""} placeholder="Palco" onChange={(e) => onChange({ voiceNameOff: e.target.value || null })} />
                    </Field>
                  </div>
                  <Field label="Argomento del palco in live">
                    <input
                      className={fieldClass}
                      value={acc.voiceStatusOn || ""}
                      onChange={(e) => onChange({ voiceStatusOn: e.target.value || null })}
                      placeholder={`Sono in live su https://www.twitch.tv/${handle || "…"}`}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ───────────── utente Discord da menzionare ───────────── */

function MemberField({ guildId, token, value, onChange }: { guildId: string; token: string; value: string | null; onChange: (id: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<MemberHit | null>(null);

  /* nome dell'utente già salvato (si cerca per ID) */
  useEffect(() => {
    if (!value || picked?.id === value) return;
    let alive = true;
    void searchTicketMembers(token, guildId, value).then((r) => {
      if (alive && r.ok) setPicked(r.data.find((m) => m.id === value) || null);
    });
    return () => {
      alive = false;
    };
  }, [value, picked?.id, token, guildId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) return;
    const timer = window.setTimeout(async () => {
      const r = await searchTicketMembers(token, guildId, q);
      if (r.ok) setHits(r.data);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, token, guildId]);

  const shown = query.trim().length >= 2 || /^\d{16,22}$/.test(query.trim()) ? hits : [];

  return (
    <Field label="Chi è su Discord" hint="Facoltativo: lo menziona nell'avviso al posto di {mention}.">
      {value ? (
        <div className="mt-1.5 flex h-11 items-center gap-2 rounded-xl bg-espresso/70 px-3 text-sm text-crema ring-1 ring-sand/15">
          <UserRound className="size-4 shrink-0 text-crema/50" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-semibold" translate="no">
            {picked?.id === value ? picked.label : `Utente ${value}`}
          </span>
          <button
            type="button"
            aria-label="Togli l'utente"
            className="rounded p-1 text-crema/55 hover:bg-crema/10 hover:text-crema"
            onClick={() => {
              onChange(null);
              setPicked(null);
            }}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-crema/45" aria-hidden />
          <input
            value={query}
            placeholder="Cerca un membro del server"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            className={cn(fieldClass, "mt-0 pl-8")}
          />
          {open && shown.length ? (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-xl bg-mocha p-1 shadow-xl ring-1 ring-sand/15">
              {shown.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-crema hover:bg-crema/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(m.id);
                      setPicked(m);
                      setQuery("");
                      setHits([]);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate font-semibold" translate="no">
                      {m.label}
                    </span>
                    {m.label !== m.username ? (
                      <span className="truncate text-xs text-crema/50" translate="no">
                        @{m.username}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Field>
  );
}

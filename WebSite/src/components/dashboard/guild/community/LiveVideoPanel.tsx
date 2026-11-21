"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Plus, Settings2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { searchTicketMembers } from "@/lib/dashboard-guild-ops";
import {
  communityApi,
  emptyDraft,
  type LiveAccount,
  type LiveAlertsConfig,
  type LivePlatform,
  type LivePlatformConfig,
  type MsgDraft,
} from "@/lib/dashboard-community";
import { Field, FormGroup, Notice, RowsSkeleton, SettingRow, Toggle, TrackUnsaved, fieldClass, miniBtn } from "../bits";
import { InstagramIcon, KickIcon, TikTokIcon, TwitchIcon, YoutubeIcon } from "../LivePlatformIcons";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, roleOptions, useCommunity } from "./shared";

const LiveAccountCard = dynamic(() => import("./LiveAccountCard").then((m) => m.LiveAccountCard), {
  loading: () => <div className="h-14 animate-pulse rounded-2xl bg-espresso/40 ring-1 ring-sand/10" />,
  ssr: false,
});

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
    blurb: "Quando un canale va in diretta, il bot lo annuncia nel canale scelto, menziona il ruolo e, se vuoi, rinomina il palco.",
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
  /* messaggio + avanzate dopo la testata/account: meno lavoro al primo paint */
  const [tailReady, setTailReady] = useState(false);

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

  useEffect(() => {
    setTailReady(false);
    const t = window.setTimeout(() => setTailReady(true), 0);
    return () => window.clearTimeout(t);
  }, [tab]);

  const platform = tab;
  const meta = PLATFORM[platform];
  const pcfg = cfg?.platforms[platform];
  const hasPosts = Boolean(meta.postWord);
  const sampleAcc = pcfg?.accounts.find((a) => a.id) || null;
  const sampleUserId = sampleAcc?.discordUserId || null;

  /* nome su Discord dell'utente collegato: senza, l'anteprima mostrerebbe "@utente" */
  const [sampleUser, setSampleUser] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!sampleUserId || sampleUser?.id === sampleUserId) return;
    let alive = true;
    void searchTicketMembers(token, guildId, sampleUserId).then((r) => {
      const hit = r.ok ? r.data.find((m) => m.id === sampleUserId) : null;
      if (alive && hit) setSampleUser({ id: hit.id, name: hit.label || hit.username });
    });
    return () => {
      alive = false;
    };
  }, [sampleUserId, sampleUser?.id, token, guildId]);

  const sampleVars = useMemo(() => {
    const acc = sampleAcc;
    const name = acc?.displayName || acc?.id || (platform === "youtube" ? "Il tuo canale" : "nomecanale");
    const base = {
      mention: acc?.discordUserId ? `<@${acc.discordUserId}>` : name,
      name,
      ping: pcfg?.pingRoleId ? `<@&${pcfg.pingRoleId}>` : "",
      platform: meta.title,
      thumb: "https://static-cdn.jtvnw.net/ttv-static/404_preview-1280x720.jpg",
      server: data?.guild?.name || "Server",
      /* l'anteprima riconosce questa menzione e mostra il nome giusto */
      ...(acc?.discordUserId
        ? { "user.id": acc.discordUserId, username: sampleUser?.id === acc.discordUserId ? sampleUser.name : acc.displayName || acc.id }
        : {}),
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
  }, [sampleAcc, pcfg?.pingRoleId, platform, meta, data?.guild?.name, sampleUser]);

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
          <div className="divide-y divide-sand/[0.07] border-t border-sand/10 px-4 py-4 sm:px-5">
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
              <LiveAccountCard
                key={i}
                platform={platform}
                meta={{
                  color: meta.color,
                  prefix: meta.prefix,
                  handleLabel: meta.handleLabel,
                  handlePlaceholder: meta.handlePlaceholder,
                }}
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

      {tailReady ? (
        <>
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
                          name="livevideopanel-input-538"
                          id="livevideopanel-input-538"
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
        </>
      ) : (
        <RowsSkeleton rows={5} />
      )}
    </div>
  );
}

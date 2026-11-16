"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Ban, ChevronDown, Sunrise, CalendarClock, Check, Clock3, Gamepad2, Gift, LineChart, Loader2, Megaphone, MessageSquare, Mic, Minus, Play, Plus, RefreshCw, RotateCcw, Search, Sparkles, Star, Target, Timer, Trash2, TrendingUp, Trophy, UserRound, X, type LucideIcon } from "lucide-react";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { NumberField } from "@/components/ui/NumberField";
import { MultiSelect, Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import {
  communityApi,
  emptyDraft,
  type LevelsActivityWinners,
  type LevelsConfig,
  type LevelsEvent,
  type LevelsExpBonus,
  type LevelsLevelCurve,
  type LevelsMinigameGameOptions,
  type LevelsMinigameScoring,
  type LevelsMinigameSpawn,
  type LevelsRoleMultiplier,
  type LevelsTreasureBucket,
  type LevelsTreasureEmojiPair,
  type LevelsRoleReward,
  type LevelsScheduledEvent,
  type LevelsUser,
  type LevelsUserAction,
  type PickerChannel,
  type PickerRole,
} from "@/lib/dashboard-community";
import { searchTicketMembers, type MemberHit } from "@/lib/dashboard-guild-ops";
import { buildMinigamePreviewCardDataUrl } from "@/lib/minigame-preview-card";
import { ExpandableTextarea, Field, Notice, Pills, RowsSkeleton, SettingRow, StatusBadge, Toggle, TrackUnsaved, dangerBtn, dashPrimaryBtn, fieldClass, labelClass, miniBtn } from "../bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, roleOptions, useCommunity, useSampleVars, type PreviewRow } from "./shared";

const LEVEL_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione di chi è salito di livello" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{level}", hint: "numero del livello raggiunto" },
  { token: "{avatar}", hint: "foto profilo" },
  { token: "{server}", hint: "nome del server" },
];

const PERKS_PLACEHOLDERS = [
  ...LEVEL_PLACEHOLDERS,
  { token: "{role}", hint: "menzione del ruolo premio" },
  { token: "{perklist}", hint: "i vantaggi di quel livello" },
  { token: "{perks}", hint: "canale dei vantaggi" },
];

const MILESTONE_PLACEHOLDERS = [
  ...LEVEL_PLACEHOLDERS,
  { token: "{role}", hint: "menzione del ruolo premio" },
  { token: "{roleid}", hint: "id del ruolo premio" },
  { token: "{perks}", hint: "canale dei vantaggi" },
];

const MINIGAME_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione del vincitore" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{avatar}", hint: "foto profilo" },
  { token: "{role}", hint: "ruolo premio minigiochi" },
  { token: "{exp}", hint: "soglia EXP del premio" },
  { token: "{next}", hint: "testo prossima ricompensa" },
  { token: "{server}", hint: "nome del server" },
];

const BONUS_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione di chi prende il bonus" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{amount}", hint: "EXP regalati" },
  { token: "{avatar}", hint: "foto profilo" },
  { token: "{server}", hint: "nome del server" },
];

const BONUS_FIRST_META = {
  title: "Primo messaggio del giorno",
  text: "EXP a chi scrive per primo ogni giorno.",
  channelsHint: "Dove conta il primo messaggio.",
};

const DEFAULT_LEVEL_CURVE: LevelsLevelCurve = {
  firstThreshold: 100,
  roundTo: 50,
  minStepAdd: 110,
  segments: [
    { upTo: 10, base: 120, from: 1, perLevel: 25 },
    { upTo: 30, base: 380, from: 10, perLevel: 55 },
    { upTo: 60, base: 1600, from: 30, perLevel: 120 },
    { upTo: 10000, base: 5200, from: 60, perLevel: 210 },
  ],
};

const DEFAULT_COMMAND_COOLDOWN = {
  defaultSeconds: 30,
  tiers: [
    { minLevel: 100, seconds: 0 },
    { minLevel: 50, seconds: 5 },
    { minLevel: 30, seconds: 15 },
  ],
  roles: {
    staff: 0,
    vipPlus: 5,
    vip: 15,
    doubleBooster: 5,
    booster: 15,
  },
  customRoles: [] as { roleId: string; seconds: number }[],
};

const DEFAULT_MINIGAME_DURATION_MS: Record<string, number> = {
  hangman: 240_000,
  findBot: 300_000,
  findBotVoice: 300_000,
};

/** Halloween / Star Wars: solo eventi, fuori dalla tab Minigiochi. */
const HIDDEN_MINIGAME_TYPES = new Set([
  "starWarsQuiz",
  "starWarsGuessPlanet",
  "halloweenQuiz",
  "halloweenFindGhost",
  "halloweenMissingEmoji",
  "halloweenCountBats",
  "halloweenTrickOrTreat",
  "podrace",
  "cacciatore",
  "scova",
  "ordine66",
  "attacca_base",
  "conquista",
  "pg",
  "reliquie",
  "convoglio",
  "ewok",
  "olocron",
]);

const DEFAULT_MINIGAME_ROWS: { type: string; rewardExp: number }[] = [
  { type: "guessNumber", rewardExp: 100 },
  { type: "guessWord", rewardExp: 150 },
  { type: "guessFlag", rewardExp: 150 },
  { type: "guessPlayer", rewardExp: 150 },
  { type: "guessSong", rewardExp: 150 },
  { type: "guessCapital", rewardExp: 150 },
  { type: "guessReverseCapital", rewardExp: 150 },
  { type: "guessRegionCapital", rewardExp: 150 },
  { type: "fastType", rewardExp: 200 },
  { type: "guessTeam", rewardExp: 150 },
  { type: "guessSinger", rewardExp: 150 },
  { type: "guessAlbum", rewardExp: 150 },
  { type: "hangman", rewardExp: 200 },
  { type: "italianGK", rewardExp: 150 },
  { type: "drivingQuiz", rewardExp: 150 },
  { type: "mathExpression", rewardExp: 200 },
  { type: "findBot", rewardExp: 200 },
  { type: "findBotVoice", rewardExp: 200 },
  { type: "memoryEmoji", rewardExp: 250 },
  { type: "guessYear", rewardExp: 150 },
  { type: "completeVerse", rewardExp: 150 },
  { type: "guessEmoji", rewardExp: 150 },
  { type: "quoteFilm", rewardExp: 150 },
  { type: "completeProverb", rewardExp: 120 },
  { type: "synonymAntonym", rewardExp: 150 },
  { type: "guessCity", rewardExp: 150 },
  { type: "treasureHunt", rewardExp: 150 },
];

function defaultMinigameRow(type: string, rewardExp: number): NonNullable<LevelsMinigameScoring["rewardExpByType"]>[number] {
  return {
    type,
    rewardExp,
    enabled: true,
    durationMs: DEFAULT_MINIGAME_DURATION_MS[type] || 180_000,
  };
}

const DEFAULT_MINIGAME_SCORING: LevelsMinigameScoring = {
  fastGuess: { windowMs: 30_000, multiplier: 1.5 },
  streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 },
  rewardExpByType: DEFAULT_MINIGAME_ROWS.map((r) => defaultMinigameRow(r.type, r.rewardExp)),
  startDraft: null,
  winDraft: null,
};

const DEFAULT_MINIGAME_SPAWN: LevelsMinigameSpawn = {
  enabled: true,
  channelId: null,
  roleId: null,
  intervalMs: 900_000,
  noParticipationIntervalMs: 900_000,
  activityWindowMs: 1_800_000,
  minMessages: 25,
  failsafeMs: 5_400_000,
  timeWindow: { start: { hour: 7, minute: 0 }, end: { hour: 1, minute: 0 } },
  spawnFreshActivity: { enabled: true, windowMs: 300_000, minMessages: 5 },
  activityThreshold: {
    enabled: true,
    hardMin: 15,
    hardMax: 100,
    nightHourStart: 24,
    nightHourEnd: 7,
    nightFactor: 0.72,
    peakHourStart: 18,
    peakHourEnd: 22,
    peakFactor: 1.08,
    defaultTimeFactor: 1,
    memberReference: 200,
    memberFactorMin: 0.58,
    memberFactorMax: 1.18,
    memberExponent: 0.18,
    spamAvgMessagesPerUser: 4,
    spamPenaltyPerExcess: 0.065,
    spamPenaltyCap: 0.42,
    minUniqueDivisor: 16,
    uniqueBypassMultiple: 1.35,
  },
};

const DEFAULT_MINIGAME_GAME_OPTIONS: LevelsMinigameGameOptions = {
  guessNumber: { min: 1, max: 100 },
  hangman: { maxMisses: 10 },
  memoryEmoji: { displayMs: 5_000 },
  drivingQuiz: { userAnswerCooldownMs: 5_000 },
  guessPlayer: { onlyFamous: true },
  guessSong: { onlyFamous: true },
  guessAlbum: { onlyFamousArtists: true },
  findBotVoice: { excludedChannelIds: [] },
  treasureHunt: {
    emojiPairs: [
      { decoy: "⚓", winner: "💎" },
      { decoy: "🪄", winner: "💎" },
      { decoy: "✨", winner: "🏆" },
    ],
    buckets: [
      { weight: 1, minMessages: 20, maxMessages: 30, minDurationMs: 60_000, maxDurationMs: 120_000, rewardExp: 100 },
      { weight: 1, minMessages: 30, maxMessages: 50, minDurationMs: 90_000, maxDurationMs: 180_000, rewardExp: 150 },
      { weight: 1, minMessages: 40, maxMessages: 70, minDurationMs: 120_000, maxDurationMs: 240_000, rewardExp: 200 },
    ],
  },
};

const MINIGAME_HOUR_OPTS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: String(h).padStart(2, "0"),
}));
const MINIGAME_MINUTE_OPTS = [0, 15, 30, 45].map((m) => ({
  value: String(m),
  label: String(m).padStart(2, "0"),
}));

function mergeMinigameSpawn(saved?: LevelsMinigameSpawn | null): LevelsMinigameSpawn {
  const s = saved && typeof saved === "object" ? saved : ({} as LevelsMinigameSpawn);
  const tw = s.timeWindow && typeof s.timeWindow === "object" ? s.timeWindow : DEFAULT_MINIGAME_SPAWN.timeWindow;
  const fresh = s.spawnFreshActivity && typeof s.spawnFreshActivity === "object" ? s.spawnFreshActivity : DEFAULT_MINIGAME_SPAWN.spawnFreshActivity;
  const at = s.activityThreshold && typeof s.activityThreshold === "object" ? s.activityThreshold : DEFAULT_MINIGAME_SPAWN.activityThreshold;
  return {
    ...DEFAULT_MINIGAME_SPAWN,
    ...s,
    channelId: s.channelId || null,
    roleId: s.roleId || null,
    timeWindow: {
      start: { ...DEFAULT_MINIGAME_SPAWN.timeWindow.start, ...(tw.start || {}) },
      end: { ...DEFAULT_MINIGAME_SPAWN.timeWindow.end, ...(tw.end || {}) },
    },
    spawnFreshActivity: { ...DEFAULT_MINIGAME_SPAWN.spawnFreshActivity, ...fresh },
    activityThreshold: { ...DEFAULT_MINIGAME_SPAWN.activityThreshold, ...at },
  };
}

function mergeMinigameGameOptions(saved?: LevelsMinigameGameOptions | null): LevelsMinigameGameOptions {
  const s = saved && typeof saved === "object" ? saved : ({} as LevelsMinigameGameOptions);
  const th = s.treasureHunt && typeof s.treasureHunt === "object" ? s.treasureHunt : DEFAULT_MINIGAME_GAME_OPTIONS.treasureHunt;
  return {
    ...DEFAULT_MINIGAME_GAME_OPTIONS,
    ...s,
    guessNumber: { ...DEFAULT_MINIGAME_GAME_OPTIONS.guessNumber, ...(s.guessNumber || {}) },
    hangman: { ...DEFAULT_MINIGAME_GAME_OPTIONS.hangman, ...(s.hangman || {}) },
    memoryEmoji: { ...DEFAULT_MINIGAME_GAME_OPTIONS.memoryEmoji, ...(s.memoryEmoji || {}) },
    drivingQuiz: { ...DEFAULT_MINIGAME_GAME_OPTIONS.drivingQuiz, ...(s.drivingQuiz || {}) },
    guessPlayer: { ...DEFAULT_MINIGAME_GAME_OPTIONS.guessPlayer, ...(s.guessPlayer || {}) },
    guessSong: { ...DEFAULT_MINIGAME_GAME_OPTIONS.guessSong, ...(s.guessSong || {}) },
    guessAlbum: { ...DEFAULT_MINIGAME_GAME_OPTIONS.guessAlbum, ...(s.guessAlbum || {}) },
    findBotVoice: {
      excludedChannelIds: Array.isArray(s.findBotVoice?.excludedChannelIds)
        ? s.findBotVoice!.excludedChannelIds
        : DEFAULT_MINIGAME_GAME_OPTIONS.findBotVoice.excludedChannelIds,
    },
    treasureHunt: {
      emojiPairs: Array.isArray(th.emojiPairs) && th.emojiPairs.length ? th.emojiPairs : DEFAULT_MINIGAME_GAME_OPTIONS.treasureHunt.emojiPairs,
      buckets: Array.isArray(th.buckets) && th.buckets.length ? th.buckets : DEFAULT_MINIGAME_GAME_OPTIONS.treasureHunt.buckets,
    },
  };
}

const MINIGAME_TYPE_LABELS: Record<string, string> = {
  guessNumber: "Indovina il numero",
  guessWord: "Indovina la parola",
  guessFlag: "Indovina la bandiera",
  guessPlayer: "Indovina il calciatore",
  guessSong: "Indovina la canzone",
  guessCapital: "Indovina la capitale",
  guessReverseCapital: "Capitale al contrario",
  guessRegionCapital: "Capoluogo di regione",
  fastType: "Gara di digitazione",
  guessTeam: "Indovina la squadra",
  guessSinger: "Indovina il cantante",
  guessAlbum: "Indovina l'album",
  hangman: "Impiccato",
  italianGK: "Quiz Cultura Generale",
  drivingQuiz: "Quiz Patente",
  mathExpression: "Espressioni matematiche",
  findBot: "Trova il bot",
  findBotVoice: "Trova il bot in vocale",
  memoryEmoji: "Memorizza le emoji",
  guessYear: "Indovina l'anno di uscita",
  completeVerse: "Completa la frase",
  guessEmoji: "Indovina l'emoji",
  quoteFilm: "Indovina la citazione",
  completeProverb: "Completa il proverbio",
  synonymAntonym: "Indovina il sinonimo o il contrario",
  guessCity: "Indovina la città",
  treasureHunt: "Trova la reaction nascosta",
};

function minigameTypeLabel(type: string) {
  return MINIGAME_TYPE_LABELS[type] || type;
}

/** Unisce i tipi salvati con i default (tipi nuovi restano visibili; Halloween/SW esclusi). */
function mergeMinigameRewardExpByType(saved?: LevelsMinigameScoring["rewardExpByType"] | null) {
  const defaults = DEFAULT_MINIGAME_SCORING.rewardExpByType.filter((d) => !HIDDEN_MINIGAME_TYPES.has(d.type));
  if (!saved?.length) return defaults.map((d) => ({ ...d }));
  const byType = new Map(saved.filter((r) => r?.type && !HIDDEN_MINIGAME_TYPES.has(r.type)).map((r) => [r.type, r]));
  const out = defaults.map((d) => {
    const s = byType.get(d.type);
    if (!s) return { ...d };
    return {
      ...d,
      ...s,
      type: d.type,
      rewardExp: Math.max(1, Math.floor(Number(s.rewardExp) || d.rewardExp)),
      enabled: s.enabled !== false,
      durationMs: Math.max(15_000, Math.min(1_800_000, Math.floor(Number(s.durationMs) || d.durationMs || 180_000))),
    };
  });
  for (const row of saved) {
    if (!row?.type || HIDDEN_MINIGAME_TYPES.has(row.type)) continue;
    if (!defaults.some((d) => d.type === row.type)) {
      out.push({
        ...defaultMinigameRow(row.type, Math.max(1, Math.floor(Number(row.rewardExp) || 100))),
        ...row,
        enabled: row.enabled !== false,
      });
    }
  }
  return out;
}

const MINIGAME_START_PLACEHOLDERS = [
  { token: "{minigame}", hint: "nome del minigioco" },
  { token: "{prompt}", hint: "riga di gioco del bot" },
  { token: "{exp}", hint: "EXP del round" },
  { token: "{minutesLabel}", hint: "durata del gioco" },
  { token: "{minutes}", hint: "minuti del gioco" },
  { token: "{duration}", hint: "durata del gioco in secondi" },
  { token: "{image}", hint: "immagine del round" },
  { token: "{server}", hint: "nome del server" },
];

type MinigamePreviewMeta = { prompt: string; /** foto/URL se il round usa un’immagine remota */ image?: string; /** righe sulla card canvas come sul bot */ cardLines?: string[] };

/** Prompt + immagine/card d’esempio per l’anteprima per-tipo (solo dashboard). */
const MINIGAME_PREVIEW: Record<string, MinigamePreviewMeta> = {
  guessNumber: { prompt: "Indovina un numero tra **1** e **100** per ottenere **{exp} exp**.", cardLines: ["Tra 1 e 100"] },
  guessWord: { prompt: "Indovina la parola da queste lettere: **A E L P P** per ottenere **{exp} exp**.", cardLines: ["A E L P P"] },
  guessFlag: {
    prompt: "Indovina la nazione da questa bandiera per ottenere **{exp} exp**.",
    image: "https://flagcdn.com/w320/it.png",
    cardLines: ["Quale nazione è?"],
  },
  guessPlayer: {
    prompt: "Indovina il calciatore più famoso per ottenere **{exp} exp**.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg/320px-Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg",
    cardLines: ["Chi è questo calciatore?"],
  },
  /* team/album: PNG/CDN stabili (no SVG Wikipedia: il bot non li carica in canvas) */
  guessSong: {
    prompt: "Indovina la canzone per ottenere **{exp} exp**.",
    cardLines: ["Ascolta l'anteprima"],
  },
  guessCapital: {
    prompt: "Indovina la capitale di **Italia** per ottenere **{exp} exp**.",
    image: "https://flagcdn.com/w320/it.png",
    cardLines: ["Italia"],
  },
  guessReverseCapital: {
    prompt: "**Roma** è la capitale di quale Stato? Indovina per **{exp} exp**.",
    cardLines: ["Roma"],
  },
  guessRegionCapital: {
    prompt: "Indovina il capoluogo della regione **Lazio** per ottenere **{exp} exp**.",
    cardLines: ["Lazio"],
  },
  fastType: {
    prompt: "Il primo che scrive questa frase ottiene **{exp} exp**.\n",
    cardLines: ["Scrivi questa frase"],
  },
  guessTeam: {
    prompt: "Indovina la squadra di calcio dal logo per ottenere **{exp} exp**.",
    image: "https://crests.football-data.org/108.png",
    cardLines: ["Quale squadra è?"],
  },
  guessSinger: {
    prompt: "Indovina il cantante dalla foto per ottenere **{exp} exp**.",
    cardLines: ["Cantante"],
  },
  guessAlbum: {
    prompt: "Indovina l'album dalla copertina per ottenere **{exp} exp**.",
    image: "https://i.scdn.co/image/ab67616d0000b273dc30583ba717007b00cceb25",
    cardLines: ["Album"],
  },
  hangman: { prompt: "Scrivi una lettera o prova la parola intera per ottenere **{exp} exp**.\nParola: **_ _ _ _ _**", cardLines: ["_ _ _ _ _"] },
  italianGK: { prompt: "**Domanda:** Qual è il fiume più lungo d'Italia? per ottenere **{exp} exp**.", cardLines: ["Qual è il fiume più lungo d'Italia?"] },
  drivingQuiz: {
    prompt: "**Affermazione:** In curva il veicolo tende a sbandare.\nRispondi con `vero` o `falso`.\nRicompensa: **{exp} exp**",
    cardLines: ["In curva il veicolo tende a sbandare.", "Rispondi: Vero o Falso"],
  },
  mathExpression: { prompt: "Risolvi: **12 + 8 × 2** per ottenere **{exp} exp**.", cardLines: ["12 + 8 × 2"] },
  findBot: { prompt: "Trova il messaggio del bot tra i canali del server e reagisci per ottenere **{exp} exp**.", cardLines: ["Trova il bot"] },
  findBotVoice: { prompt: "Il bot si è nascosto in una **vocale vuota**: entra per ottenere **{exp} exp**.", cardLines: ["Trova il bot in vocale"] },
  memoryEmoji: { prompt: "Memorizza la sequenza e riscrivila per ottenere **{exp} exp**.", cardLines: ["⭐ 🎵 🎮 🔥"] },
  guessYear: {
    prompt: "In che anno è uscito **Inception**? Scrivi l'anno per **{exp} exp**.",
    cardLines: ["Inception"],
  },
  completeVerse: {
    prompt: "Completa: **Nel mezzo del cammin di nostra vita…** per **{exp} exp**.",
    cardLines: ["Nel mezzo del cammin di nostra vita…"],
  },
  guessEmoji: { prompt: "Cosa rappresenta **🦁👑**? Scrivi film, serie o canzone per **{exp} exp**.", cardLines: ["🦁👑"] },
  quoteFilm: {
    prompt: '*"Che la forza sia con te"* — Da quale film o serie? **{exp} exp**.',
    cardLines: ['"Che la forza sia con te"'],
  },
  completeProverb: { prompt: "**Chi dorme…** Completa il proverbio per **{exp} exp**.", cardLines: ["Chi dorme…"] },
  synonymAntonym: { prompt: "Scrivi un sinonimo o il contrario di **bello** per **{exp} exp**.", cardLines: ["bello"] },
  guessCity: {
    prompt: "In quale città si trova **il Colosseo**? **{exp} exp**.",
    cardLines: ["Il Colosseo"],
  },
  treasureHunt: {
    prompt: "Sui prossimi messaggi metterò una reaction: trovala e cliccaci sopra per **{exp} exp**.",
    cardLines: ["Trova la reaction nascosta", "nei prossimi messaggi"],
  },
};

/**
 * Immagine anteprima: solo data URL del bot (card canvas). URL remoti spesso non si vedono
 * in dashboard → card client locale (sempre visibile). Hotlink ok solo flagcdn / football-data.
 */
function resolveMinigamePreviewImage(
  type: string,
  cardReady: boolean,
  real?: Record<string, string>,
  _notes?: Record<string, string>,
) {
  const meta = MINIGAME_PREVIEW[type];
  const realImg = String(real?.[type] || "");
  if (realImg.startsWith("data:image/")) return realImg;
  const hotlinkOk = (u: string) => /^https?:\/\/(flagcdn\.com|crests\.football-data\.org)\//i.test(u);
  if (hotlinkOk(realImg)) return realImg;
  if (meta?.image && hotlinkOk(meta.image)) return meta.image;
  if (!cardReady) return "";
  const title = minigameTypeLabel(type);
  const lines = meta?.cardLines?.length ? meta.cardLines : [title];
  return buildMinigamePreviewCardDataUrl(title, lines) || "";
}

/** Extra UI del round che non sta nel draft (es. bottone canzone). La reaction della caccia sta sui messaggi successivi, non sull’intro. */
function minigamePreviewRows(type: string): PreviewRow[] {
  if (type === "guessSong") {
    return [{ kind: "buttons", items: [{ label: "Ascolta anteprima", style: 2 }] }];
  }
  return [];
}

/** Anteprima: mette sempre l’immagine del round come fa il bot (embed: immagine; V2: galleria in fondo, prima dei pulsanti). */
function minigamePreviewDraft(draft: ReturnType<typeof emptyDraft>, imageUrl?: string | null) {
  if (!imageUrl || !draft) return draft;
  if (draft.v2?.enabled) {
    const blocks = draft.v2.blocks || [];
    /* già messa a mano con {image} o con la stessa foto */
    const has = blocks.some(
      (b) =>
        (b.type === "media" && b.urls.some((u) => u.includes("{image}") || u === imageUrl)) ||
        (b.type === "section" && b.accessory === "thumbnail" && (b.thumbnailUrl.includes("{image}") || b.thumbnailUrl === imageUrl)),
    );
    if (has) return draft;
    let at = blocks.length;
    while (at > 0 && blocks[at - 1]?.type === "buttons") at -= 1;
    const media = { type: "media" as const, urls: [imageUrl] };
    return { ...draft, v2: { ...draft.v2, blocks: [...blocks.slice(0, at), media, ...blocks.slice(at)] } };
  }
  if (!draft.embed) return draft;
  return {
    ...draft,
    embed: { ...draft.embed, enabled: true, imageUrl },
  };
}

function minigameRowPreviewVars(
  row: { type: string; rewardExp: number; durationMs?: number },
  base: Record<string, string>,
  image: string,
) {
  const meta = MINIGAME_PREVIEW[row.type] || { prompt: "Partecipa per ottenere **{exp} exp**." };
  const minutes = Math.max(1, Math.round((row.durationMs || 180000) / 60000));
  const exp = String(row.rewardExp || 150);
  const prompt = meta.prompt.replace(/\{exp\}/g, exp);
  return {
    ...base,
    minigame: minigameTypeLabel(row.type),
    prompt,
    exp,
    duration: String(Math.round((row.durationMs || 180000) / 1000)),
    minutes: String(minutes),
    minutesLabel: minutes === 1 ? "**1 minuto**" : `**${minutes} minuti**`,
    image,
  };
}

const MINIGAME_WIN_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione del vincitore" },
  { token: "{exp}", hint: "EXP guadagnati in questo round" },
  { token: "{total}", hint: "totale EXP minigiochi" },
  { token: "{streak}", hint: "serie di vittorie" },
  { token: "{server}", hint: "nome del server" },
];

type Tab = "exp" | "bonus" | "minigiochi" | "ruoli" | "utenti";

/* ───────────── pezzi grafici ───────────── */

/** Scheda con icona, titolo, testo e (a destra) un interruttore o altro. */
function Card({
  icon: Icon,
  title,
  text,
  aside,
  off,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  aside?: React.ReactNode;
  off?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("relative rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl ring-1 transition", off ? "bg-crema/[0.04] text-crema/35 ring-sand/10" : "bg-[#826bc2]/15 text-[#b9a6f0] ring-[#826bc2]/30")}>
          <Icon className="size-[1.1rem]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-semibold", off ? "text-crema/55" : "text-crema")}>{title}</h3>
          {text ? <p className="mt-0.5 text-xs leading-relaxed text-crema/55">{text}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-center">{aside}</div> : null}
      </div>
      <div className={cn("mt-4 transition-opacity", off && "pointer-events-none opacity-45")}>{children}</div>
    </section>
  );
}

/** Numero grande con la sua etichetta (EXP per messaggio, al minuto…). */
function BigNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="w-36">
          <NumberField className="!mt-0" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(v) => onChange(Number(v) || 0)} aria-label={label} />
        </div>
        {suffix ? <span className="self-center text-sm font-semibold text-crema/60">{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-2 text-xs text-crema/50">{hint}</p> : null}
    </div>
  );
}

const roleColor = (roles: PickerRole[], id: string) => {
  const c = roles.find((r) => r.id === id)?.color;
  return c && c !== "#000000" ? c : "#99aab5";
};

/* ───────────── pannello ───────────── */

export function LevelsPanel({
  guildId,
  token,
  onToast,
  tab = "exp",
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  /** scheda scelta nell'elenco laterale */
  tab?: Tab;
}) {
  const { data } = useCommunity(guildId, token);
  const baseVars = useSampleVars(data);
  const [cfg, setCfg] = useState<LevelsConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [imported, setImported] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<"level" | "milestone" | "perks">("level");
  /* livello scelto per scrivere i vantaggi (e per l'anteprima) */
  const [perksLevel, setPerksLevel] = useState<number | null>(null);
  const [gameEditType, setGameEditType] = useState<string | null>(null);
  const [gameDraftKind, setGameDraftKind] = useState<"start" | "win">("start");
  /** Card canvas generate solo a client (SSR non ha document). */
  const [previewCardsReady, setPreviewCardsReady] = useState(false);
  const [isMain, setIsMain] = useState(false);
  const [event, setEvent] = useState<LevelsEvent | null>(null);
  const [scheduled, setScheduled] = useState<LevelsScheduledEvent[]>([]);

  useEffect(() => {
    setPreviewCardsReady(true);
  }, []);

  /* immagini vere dei round, generate dal bot: quella dell'esempio condiviso e quella del gioco aperto */
  const [realGameImgs, setRealGameImgs] = useState<Record<string, string>>({});
  /* perché l'immagine vera non c'è (fonte giù, canvas mancante, bot non aggiornato…) */
  const [realGameNotes, setRealGameNotes] = useState<Record<string, string>>({});
  const askedGameImgs = useRef(new Set<string>());
  /* il bot prepara le immagini in pochi secondi: si richiede finché non arrivano */
  const [gameImgRetry, setGameImgRetry] = useState(0);
  const gameImgTries = useRef<Record<string, number>>({});
  useEffect(() => {
    if (tab !== "minigiochi" || !isMain) return;
    for (const type of ["guessNumber", gameEditType].filter(Boolean) as string[]) {
      if (askedGameImgs.current.has(type)) continue;
      askedGameImgs.current.add(type);
      void communityApi.getMinigamePreview(token, guildId, type).then((r) => {
        if (r.ok && r.data.image) setRealGameImgs((m) => ({ ...m, [type]: r.data.image }));
        const note = r.ok ? r.data.note || "" : r.message;
        setRealGameNotes((m) => ({ ...m, [type]: note }));
        const photoMissing = /senza foto|senza logo|senza copertina|preparando|non disponibile/i.test(note) || !(r.ok && r.data.image);
        if (photoMissing) {
          const tries = (gameImgTries.current[type] || 0) + 1;
          gameImgTries.current[type] = tries;
          if (tries < 8) {
            window.setTimeout(() => {
              askedGameImgs.current.delete(type);
              setGameImgRetry((n) => n + 1);
            }, 12_000);
          }
        }
      });
    }
  }, [tab, isMain, gameEditType, token, guildId, gameImgRetry]);

  useEffect(() => {
    let alive = true;
    void communityApi.getLevels(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setCfg(r.data.config);
      setSaved(JSON.stringify(r.data.config));
      setImported(r.data.imported === true);
      setIsMain(r.data.isMainGuild === true);
      setEvent(r.data.event || null);
      setScheduled(r.data.scheduled || []);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  /* {role}: premio livelli, oppure premio minigiochi nell'anteprima minigiochi */
  const sampleLevelRoleId = cfg?.roleRewards?.[0]?.roleId || data?.pickers.roles.find((r) => !r.managed && r.id !== guildId)?.id || "";
  const sampleMinigameRoleId = cfg?.minigameRewards?.[0]?.roleId || "";
  const sampleMinigameExp = cfg?.minigameRewards?.[0]?.exp || 500;
  const perksRewards = [...(cfg?.roleRewards || [])].sort((a, b) => a.level - b.level);
  const perksSel = perksRewards.find((r) => r.level === perksLevel) || perksRewards[0] || null;
  const perksSelLevel = String(perksSel?.level || 10);
  const perksSelText = perksSel?.perks?.trim() || "—";
  const perksChannelName = data?.pickers.textChannels.find((c) => c.id === cfg?.perksChannelId)?.name || "supporters";
  const sampleRoleId = announce === "perks" ? perksSel?.roleId || sampleLevelRoleId : sampleLevelRoleId;
  const sampleMinigameMention = sampleMinigameRoleId ? `<@&${sampleMinigameRoleId}>` : "@Rookie";
  /* niente useMemo: ci pensa il React Compiler */
  const vars = {
    ...baseVars,
    user: baseVars.user || "@Mario",
    username: baseVars.username || "Mario",
    level: "42",
    role: sampleRoleId ? `<@&${sampleRoleId}>` : "@Level 50",
    roleid: sampleRoleId || "100000000000000050",
    perks: "#supporters",
    exp: String(sampleMinigameExp),
    amount: "150",
    next: "Ti mancano **200** exp per la prossima ricompensa!",
    ...(announce === "perks"
      ? { level: perksSelLevel, perklist: perksSelText, perks: `#${perksChannelName}` }
      : {}),
  };
  const minigameVars = {
    ...baseVars,
    user: baseVars.user || "@Mario",
    username: baseVars.username || "Mario",
    role: sampleMinigameMention,
    roleid: sampleMinigameRoleId || "100000000000000500",
    exp: String(sampleMinigameExp),
    next: "Ti mancano **200** exp per la prossima ricompensa!",
  };

  if (loadError && !cfg) return <Notice error>{loadError}</Notice>;
  if (!cfg || !data) return <RowsSkeleton rows={8} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const channels = data.pickers.textChannels;
  const pickerRoles = data.pickers.roles;
  const roles = roleOptions(pickerRoles, guildId);
  const set = (patch: Partial<LevelsConfig>) => setCfg({ ...cfg, ...patch });

  const save = async () => {
    const r = await communityApi.saveLevels(token, guildId, cfg);
    if (!r.ok) return onToast(r.message, true);
    setCfg(r.data.config);
    setSaved(JSON.stringify(r.data.config));
    setImported(false);
    onToast("Livelli e EXP salvati.");
  };
  const reset = () => {
    try {
      setCfg(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  };

  const setReward = (i: number, patch: Partial<LevelsRoleReward>) => set({ roleRewards: cfg.roleRewards.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
  const setMult = (i: number, patch: Partial<LevelsRoleMultiplier>) =>
    set({ roleMultipliers: cfg.roleMultipliers.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });

  /* premi in ordine di livello, ricordando la posizione originale per modificarli */
  const rewards = cfg.roleRewards.map((row, i) => ({ row, i })).sort((a, b) => a.row.level - b.row.level);
  const nextRewardLevel = (cfg.roleRewards.reduce((m, r) => Math.max(m, r.level), 0) || 0) + 10;
  const mults = cfg.roleMultipliers.map((row, i) => ({ row, i }));
  const voicePerHour = Math.round(cfg.voiceExpPerMinute * 60 * cfg.globalMultiplier);
  const games = (cfg.minigameRewards || []).map((row, i) => ({ row, i })).sort((a, b) => a.row.exp - b.row.exp);
  const setGame = (i: number, patch: Partial<{ exp: number; roleId: string }>) =>
    set({ minigameRewards: (cfg.minigameRewards || []).map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
  const nextGameExp = Math.max(500, ...(cfg.minigameRewards || []).map((r) => r.exp * 2));

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />
      {imported ? (
        <Notice>Ho importato tassi, moltiplicatori, canali bloccati e ruoli premio che il bot usa già su questo server. Puoi cambiarli liberamente da qui.</Notice>
      ) : null}

      {tab === "exp" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              icon={MessageSquare}
              title="Chat"
              text="EXP per ogni messaggio che conta."
              off={!cfg.messageEnabled}
              aside={<Toggle checked={cfg.messageEnabled} onChange={(messageEnabled) => set({ messageEnabled })} label="EXP dai messaggi" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <BigNumber label="EXP per messaggio" value={cfg.messageExp} min={0} max={500} onChange={(messageExp) => set({ messageExp })} suffix="EXP" />
                <BigNumber
                  label="Pausa tra un premio e l'altro"
                  value={cfg.messageCooldownSec}
                  min={0}
                  max={3600}
                  onChange={(messageCooldownSec) => set({ messageCooldownSec })}
                  suffix="sec"
                  hint={cfg.messageCooldownSec > 0 ? "Contro lo spam di messaggi brevi." : "0 = ogni messaggio dà EXP."}
                />
              </div>
            </Card>
            <Card
              icon={Mic}
              title="Vocale"
              text="EXP per ogni minuto passato in un canale vocale."
              off={!cfg.voiceEnabled}
              aside={<Toggle checked={cfg.voiceEnabled} onChange={(voiceEnabled) => set({ voiceEnabled })} label="EXP dal vocale" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <BigNumber label="EXP al minuto" value={cfg.voiceExpPerMinute} min={0} max={500} onChange={(voiceExpPerMinute) => set({ voiceExpPerMinute })} suffix="EXP" />
                <div className="rounded-2xl bg-[#826bc2]/10 p-3.5 ring-1 ring-[#826bc2]/20">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Un&apos;ora in vocale</p>
                  <p className="mt-2 flex h-10 items-center font-display text-2xl font-semibold text-crema lining-nums">≈ {voicePerHour.toLocaleString("it-IT")} EXP</p>
                  <p className="mt-2 text-xs text-crema/50">col moltiplicatore globale, senza bonus dei ruoli</p>
                </div>
              </div>
            </Card>
          </div>

          <Card icon={Sparkles} title="Moltiplicatori" text="Il globale vale per tutti; chi ha un ruolo con bonus prende il più alto dei suoi ruoli in più, fino al tetto.">
            <div className="grid gap-3 sm:grid-cols-2">
              <BigNumber
                label="Moltiplicatore globale"
                value={cfg.globalMultiplier}
                min={0.1}
                max={50}
                step={0.1}
                onChange={(v) => set({ globalMultiplier: Math.max(0.1, v || 1) })}
                suffix="×"
                hint="Gli eventi temporanei si aggiungono sopra."
              />
              <BigNumber
                label="Tetto massimo"
                value={cfg.maxCombinedMultiplier}
                min={1}
                max={50}
                step={0.1}
                onChange={(v) => set({ maxCombinedMultiplier: Math.max(1, v || 8) })}
                suffix="×"
                hint="Globale + bonus ruolo non vanno oltre."
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className={labelClass}>Bonus per ruolo</p>
                <StatusBadge>{cfg.roleMultipliers.length} ruoli</StatusBadge>
              </div>
              {mults.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {mults.map(({ row, i }) => (
                    <li key={i} className="flex items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <Select value={row.roleId} onChange={(roleId) => setMult(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo" />
                      </div>
                      <div className="w-36 shrink-0">
                        <NumberField className="!mt-0" value={row.multiplier} min={0.1} max={20} step={0.05} onChange={(v) => setMult(i, { multiplier: Math.max(0.1, Number(v) || 1) })} aria-label="Moltiplicatore del ruolo" />
                      </div>
                      <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ roleMultipliers: cfg.roleMultipliers.filter((_, j) => j !== i) })} aria-label="Togli il bonus">
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun ruolo con bonus: tutti guadagnano col solo moltiplicatore globale.</p>
              )}
              <button
                type="button"
                className={cn(miniBtn, "mt-2")}
                disabled={!roles.length}
                onClick={() => set({ roleMultipliers: [...cfg.roleMultipliers, { roleId: roles.find((r) => !cfg.roleMultipliers.some((m) => m.roleId === r.value))?.value || roles[0]?.value || "", multiplier: 1.5 }] })}
              >
                <Plus className="size-3.5" aria-hidden /> Aggiungi bonus
              </button>
            </div>
          </Card>

          <EventCard
            guildId={guildId}
            token={token}
            channels={channels}
            event={event}
            scheduled={scheduled}
            onChange={(e, list) => {
              setEvent(e);
              setScheduled(list);
            }}
            onToast={onToast}
          />

          <Card
            icon={LineChart}
            title="Curva livelli"
            text="Quanti EXP servono per salire di livello. Le modifiche valgono per i progressi nuovi; gli EXP già accumulati restano quelli che sono."
          >
            {(() => {
              const curve: LevelsLevelCurve = { ...DEFAULT_LEVEL_CURVE, ...cfg.levelCurve, segments: cfg.levelCurve?.segments?.length ? cfg.levelCurve.segments : DEFAULT_LEVEL_CURVE.segments };
              const setCurve = (patch: Partial<LevelsLevelCurve>) => set({ levelCurve: { ...curve, ...patch } });
              const setSeg = (i: number, patch: Partial<(typeof curve.segments)[0]>) =>
                setCurve({ segments: curve.segments.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
              const segs = curve.segments.map((row, i) => ({ row, i }));
              return (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <BigNumber
                      label="Prima soglia"
                      value={curve.firstThreshold}
                      min={1}
                      max={1_000_000}
                      onChange={(firstThreshold) => setCurve({ firstThreshold: Math.max(1, Math.floor(firstThreshold || 1)) })}
                      suffix="EXP"
                      hint="EXP per passare al livello 1."
                    />
                    <BigNumber
                      label="Arrotondamento"
                      value={curve.roundTo}
                      min={1}
                      max={1000}
                      onChange={(roundTo) => setCurve({ roundTo: Math.max(1, Math.floor(roundTo || 1)) })}
                      hint="Passo di arrotondamento delle soglie."
                    />
                    <BigNumber
                      label="Incremento minimo"
                      value={curve.minStepAdd}
                      min={0}
                      max={1_000_000}
                      onChange={(minStepAdd) => setCurve({ minStepAdd: Math.max(0, Math.floor(minStepAdd || 0)) })}
                      suffix="EXP"
                      hint="Salto minimo tra un livello e l'altro."
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className={labelClass}>Segmenti</p>
                      <StatusBadge>{curve.segments.length} fasce</StatusBadge>
                    </div>
                    {segs.length ? (
                      <ul className="space-y-2">
                        {segs.map(({ row, i }) => (
                          <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Fino al lv</span>
                            <div className="w-36 shrink-0 sm:w-40">
                              <NumberField className="!mt-0" size="sm" value={row.upTo} min={1} max={100000} onChange={(v) => setSeg(i, { upTo: Math.max(1, Math.floor(Number(v) || 1)) })} aria-label="Livello massimo del segmento" />
                            </div>
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Base</span>
                            <div className="w-36 shrink-0 sm:w-40">
                              <NumberField className="!mt-0" size="sm" value={row.base} min={1} max={1_000_000} onChange={(v) => setSeg(i, { base: Math.max(1, Math.floor(Number(v) || 1)) })} aria-label="EXP base del segmento" />
                            </div>
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Da lv</span>
                            <div className="w-32 shrink-0 sm:w-36">
                              <NumberField className="!mt-0" size="sm" value={row.from} min={0} max={100000} onChange={(v) => setSeg(i, { from: Math.max(0, Math.floor(Number(v) || 0)) })} aria-label="Livello iniziale del segmento" />
                            </div>
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">+ / lv</span>
                            <div className="w-36 shrink-0 sm:w-40">
                              <NumberField className="!mt-0" size="sm" value={row.perLevel} min={0} max={1_000_000} onChange={(v) => setSeg(i, { perLevel: Math.max(0, Math.floor(Number(v) || 0)) })} aria-label="EXP aggiuntivi per livello" />
                            </div>
                            <button
                              type="button"
                              className={cn(miniBtn, "!px-2")}
                              disabled={curve.segments.length <= 1}
                              onClick={() => setCurve({ segments: curve.segments.filter((_, j) => j !== i) })}
                              aria-label="Togli segmento"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun segmento: serve almeno una fascia.</p>
                    )}
                    <button
                      type="button"
                      className={cn(miniBtn, "mt-2")}
                      onClick={() => {
                        const last = curve.segments[curve.segments.length - 1];
                        const upTo = (last?.upTo || 0) + 10;
                        setCurve({
                          segments: [
                            ...curve.segments,
                            { upTo, base: last?.base || 100, from: last?.upTo || 1, perLevel: last?.perLevel || 25 },
                          ],
                        });
                      }}
                    >
                      <Plus className="size-3.5" aria-hidden /> Aggiungi segmento
                    </button>
                  </div>
                </div>
              );
            })()}
          </Card>

          {isMain ? (
            <Card icon={Trophy} title="TOP attività" text="Canale degli annunci TOP, ruoli esclusi dal conteggio e ruoli assegnati ai vincitori. Il TOP minigiochi è nella scheda Minigiochi.">
              {(() => {
                const aw: LevelsActivityWinners = {
                  channelId: null,
                  excludedRoleIds: [],
                  weeklyTextRoleId: null,
                  weeklyVoiceRoleId: null,
                  weeklyMinigameRoleId: null,
                  monthlyMemberRoleId: null,
                  ...cfg.activityWinners,
                };
                const setAw = (patch: Partial<LevelsActivityWinners>) => set({ activityWinners: { ...aw, ...patch } });
                const roleSelect = (value: string | null, onChange: (v: string | null) => void, label: string) => (
                  <Select value={value || ""} onChange={(v) => onChange(v || null)} options={[{ value: "", label: "Nessuno" }, ...roles]} className={fieldClass} aria-label={label} />
                );
                return (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Canale annunci">
                      <Select
                        value={aw.channelId || ""}
                        onChange={(v) => setAw({ channelId: v || null })}
                        options={[{ value: "", label: "Predefinito" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
                        className={fieldClass}
                        aria-label="Canale TOP attività"
                      />
                    </Field>
                    <Field label="Ruoli esclusi" hint="Staff e simili non entrano nelle classifiche.">
                      <MultiSelect value={aw.excludedRoleIds} onChange={(excludedRoleIds) => setAw({ excludedRoleIds })} options={roles} className={fieldClass} placeholder="Nessuno" />
                    </Field>
                    <Field label="TOP chat settimanale">{roleSelect(aw.weeklyTextRoleId, (weeklyTextRoleId) => setAw({ weeklyTextRoleId }), "TOP chat settimanale")}</Field>
                    <Field label="TOP vocale settimanale">{roleSelect(aw.weeklyVoiceRoleId, (weeklyVoiceRoleId) => setAw({ weeklyVoiceRoleId }), "TOP vocale settimanale")}</Field>
                    <Field label="Membro del mese">{roleSelect(aw.monthlyMemberRoleId, (monthlyMemberRoleId) => setAw({ monthlyMemberRoleId }), "Membro del mese")}</Field>
                  </div>
                );
              })()}
            </Card>
          ) : null}

          <Card icon={Ban} title="Esclusioni" text="Dove e per chi l'EXP non conta.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Canali senza EXP" hint="Messaggi e vocale qui non danno EXP.">
                <MultiSelect value={cfg.lockedChannelIds} onChange={(lockedChannelIds) => set({ lockedChannelIds })} options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} className={fieldClass} placeholder="Nessuno" />
              </Field>
              <Field label="Ruoli senza EXP" hint="Chi ha uno di questi ruoli non guadagna EXP.">
                <MultiSelect value={cfg.ignoredRoleIds} onChange={(ignoredRoleIds) => set({ ignoredRoleIds })} options={roles} className={fieldClass} placeholder="Nessuno" />
              </Field>
            </div>
          </Card>

          <Card icon={Timer} title="Cooldown comandi" text="Secondi di attesa tra un comando e l’altro. Vale il minore tra livello e ruolo (Staff / VIP / Boost).">
            {(() => {
              const cd = {
                ...DEFAULT_COMMAND_COOLDOWN,
                ...(cfg.commandCooldown || {}),
                roles: { ...DEFAULT_COMMAND_COOLDOWN.roles, ...(cfg.commandCooldown?.roles || {}) },
                customRoles: [...(cfg.commandCooldown?.customRoles || DEFAULT_COMMAND_COOLDOWN.customRoles)],
              };
              const tiers = [...(cd.tiers || [])].sort((a, b) => b.minLevel - a.minLevel);
              const setCd = (patch: Partial<typeof cd>) => set({ commandCooldown: { ...cd, ...patch } });
              const setTier = (i: number, patch: Partial<(typeof tiers)[0]>) => {
                const next = tiers.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
                setCd({ tiers: next });
              };
              const setRole = (key: keyof typeof cd.roles, seconds: number) =>
                setCd({ roles: { ...cd.roles, [key]: Math.max(0, Math.floor(seconds || 0)) } });
              const roleRows: { key: keyof typeof cd.roles; label: string }[] = [
                { key: "staff", label: "Staff" },
                { key: "vipPlus", label: "VIP+" },
                { key: "vip", label: "VIP" },
                { key: "doubleBooster", label: "Double Boost" },
                { key: "booster", label: "Booster" },
              ];
              return (
                <div className="space-y-3">
                  <div className="max-w-xs">
                    <BigNumber label="Cooldown di base" value={cd.defaultSeconds} min={0} max={3600} onChange={(v) => setCd({ defaultSeconds: Math.max(0, Math.floor(v || 0)) })} suffix="sec" hint="Senza soglia di livello." />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {roleRows.map(({ key, label }) => (
                      <div key={key} className="rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">{label}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="w-28">
                            <NumberField className="!mt-0" value={cd.roles[key]} min={0} max={3600} onChange={(v) => setRole(key, Number(v) || 0)} aria-label={`Cooldown ${label}`} />
                          </div>
                          <span className="text-xs text-crema/50">sec</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <p className={cn(labelClass, "mb-2")}>Altri ruoli</p>
                    {cd.customRoles.length ? (
                      <ul className="space-y-2">
                        {cd.customRoles.map((row, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                            <div className="min-w-[10rem] flex-1">
                              <Select
                                value={row.roleId}
                                onChange={(roleId) =>
                                  setCd({
                                    customRoles: cd.customRoles.map((r, idx) => (idx === i ? { ...r, roleId } : r)),
                                  })
                                }
                                options={roles}
                                className={cn(fieldClass, "!mt-0")}
                                aria-label="Ruolo cooldown"
                              />
                            </div>
                            <div className="w-28">
                              <NumberField
                                className="!mt-0"
                                value={row.seconds}
                                min={0}
                                max={3600}
                                onChange={(v) =>
                                  setCd({
                                    customRoles: cd.customRoles.map((r, idx) => (idx === i ? { ...r, seconds: Math.max(0, Math.floor(Number(v) || 0)) } : r)),
                                  })
                                }
                                aria-label="Secondi cooldown ruolo"
                              />
                            </div>
                            <span className="text-xs text-crema/50">sec</span>
                            <button
                              type="button"
                              className={cn(miniBtn, "!px-2")}
                              onClick={() => setCd({ customRoles: cd.customRoles.filter((_, j) => j !== i) })}
                              aria-label="Togli ruolo"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-4 text-center text-sm text-crema/50">Nessun ruolo extra: oltre Staff/VIP/Boost.</p>
                    )}
                    <button
                      type="button"
                      className={cn(miniBtn, "mt-2")}
                      disabled={!roles.length}
                      onClick={() =>
                        setCd({
                          customRoles: [
                            ...cd.customRoles,
                            { roleId: roles.find((r) => !cd.customRoles.some((c) => c.roleId === r.value))?.value || roles[0]?.value || "", seconds: 15 },
                          ],
                        })
                      }
                    >
                      <Plus className="size-3.5" aria-hidden /> Aggiungi ruolo
                    </button>
                  </div>
                  {tiers.length ? (
                    <ul className="space-y-2">
                      {tiers.map((row, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Dal lv</span>
                          <div className="w-28">
                            <NumberField className="!mt-0" value={row.minLevel} min={1} max={10000} onChange={(v) => setTier(i, { minLevel: Math.max(1, Number(v) || 1) })} aria-label="Livello soglia cooldown" />
                          </div>
                          <ArrowRight className="size-3.5 text-crema/40" aria-hidden />
                          <div className="w-28">
                            <NumberField className="!mt-0" value={row.seconds} min={0} max={3600} onChange={(v) => setTier(i, { seconds: Math.max(0, Number(v) || 0) })} aria-label="Secondi cooldown" />
                          </div>
                          <span className="text-xs text-crema/50">sec</span>
                          <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => setCd({ tiers: tiers.filter((_, j) => j !== i) })} aria-label="Togli soglia">
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-4 text-center text-sm text-crema/50">Nessuna soglia: vale solo il cooldown di base.</p>
                  )}
                  <button
                    type="button"
                    className={cn(miniBtn)}
                    onClick={() =>
                      setCd({
                        tiers: [...tiers, { minLevel: (tiers.reduce((m, t) => Math.max(m, t.minLevel), 0) || 0) + 10, seconds: 5 }],
                      })
                    }
                  >
                    <Plus className="size-3.5" aria-hidden /> Aggiungi soglia
                  </button>
                </div>
              );
            })()}
          </Card>
        </div>
      ) : null}

      {tab === "bonus"
        ? (() => {
            const welcome = cfg.bonuses?.welcomeGreeting || { enabled: true, amount: 30, channelIds: [] as string[] };
            const first = cfg.bonuses?.firstMessageDaily || { enabled: true, amount: 150, channelIds: [] as string[] };
            const setBonus = (patch: Partial<LevelsExpBonus>) =>
              set({
                bonuses: {
                  firstMessageDaily: { ...first, ...patch },
                  welcomeGreeting: welcome,
                },
              });
            const draft = first.noticeDraft || emptyDraft();
            return (
              <div className="space-y-4">
                <Card
                  icon={Sunrise}
                  title={BONUS_FIRST_META.title}
                  text={BONUS_FIRST_META.text}
                  off={!first.enabled}
                  aside={<Toggle checked={first.enabled} onChange={(enabled) => setBonus({ enabled })} label={BONUS_FIRST_META.title} />}
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                    <BigNumber label="EXP regalati" value={first.amount} min={0} max={100000} onChange={(amount) => setBonus({ amount })} suffix="EXP" />
                    <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Canali</p>
                      <MultiSelect
                        value={first.channelIds}
                        onChange={(channelIds) => setBonus({ channelIds })}
                        options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))}
                        className={cn(fieldClass, "mt-2")}
                        placeholder="Predefinito"
                      />
                      <p className="mt-2 text-xs text-crema/50">{BONUS_FIRST_META.channelsHint}</p>
                    </div>
                  </div>
                </Card>

                <p className="text-xs text-crema/55">Il bot risponde al messaggio di chi prende il bonus. Il saluto ai nuovi membri è in Annunci automatici → Benvenuto.</p>

                <EditorWithPreview
                  editor={
                    <DraftEditor
                      key="bonus-first"
                      value={draft}
                      onChange={(noticeDraft) => setBonus({ noticeDraft })}
                      emojis={data.pickers.emojis}
                      placeholders={BONUS_PLACEHOLDERS}
                      maxButtons={data.limits.buttons}
                    />
                  }
                  preview={
                    <DiscordMessagePreview
                      testChannelId={first.channelIds[0] || undefined}
                      bot={data.bot}
                      draft={draft}
                      vars={{ ...vars, amount: String(first.amount), exp: String(first.amount) }}
                      roles={pickerRoles}
                      channels={channels}
                    />
                  }
                />
              </div>
            );
          })()
        : null}

      {tab === "ruoli" ? (
        <div className="space-y-4">
          <Card icon={Trophy} title="Ruoli premio" text="Arrivato al livello, il bot dà il ruolo. Chi lo supera senza averlo lo riceve lo stesso.">
            {rewards.length ? (
              <ol className="relative space-y-2 pl-5 before:absolute before:bottom-3 before:left-[0.55rem] before:top-3 before:w-px before:bg-gradient-to-b before:from-[#826bc2]/60 before:to-transparent">
                {rewards.map(({ row, i }) => (
                  <li key={i} className="relative flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                    <span className="absolute -left-[1.15rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[#826bc2] ring-4 ring-roast" aria-hidden />
                    <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Lv</span>
                    <div className="w-36 shrink-0">
                      <NumberField className="!mt-0" value={row.level} min={1} max={10000} onChange={(v) => setReward(i, { level: Math.max(1, Number(v) || 1) })} aria-label="Livello del premio" />
                    </div>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                    <div className="min-w-[10rem] flex-1">
                      <Select value={row.roleId} onChange={(roleId) => setReward(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo premio" />
                    </div>
                    <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ roleRewards: cfg.roleRewards.filter((_, j) => j !== i) })} aria-label="Togli il premio">
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun ruolo premio: si sale di livello e basta.</p>
            )}
            <button
              type="button"
              className={cn(miniBtn, "mt-3")}
              disabled={!roles.length}
              onClick={() => set({ roleRewards: [...cfg.roleRewards, { level: nextRewardLevel, roleId: roles[0]?.value || "" }] })}
            >
              <Plus className="size-3.5" aria-hidden /> Aggiungi premio (livello {nextRewardLevel})
            </button>
          </Card>

          <Card
            icon={Gift}
            title="Ruolo vantaggio"
            text="Un ruolo in più da un certo livello, per esempio i permessi per mandare foto."
            aside={cfg.perkRoleId ? <StatusBadge tone="accent">dal livello {cfg.perkMinLevel}</StatusBadge> : <StatusBadge>nessuno</StatusBadge>}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <Field label="Ruolo">
                <Select value={cfg.perkRoleId || ""} onChange={(v) => set({ perkRoleId: v || null })} options={[{ value: "", label: "Nessuno" }, ...roles]} className={fieldClass} />
              </Field>
              <Field label="Dal livello">
                <div className="mt-1.5">
                  <NumberField className="!mt-0" value={cfg.perkMinLevel} min={0} max={10000} disabled={!cfg.perkRoleId} onChange={(v) => set({ perkMinLevel: Math.max(0, Number(v) || 0) })} aria-label="Livello del ruolo vantaggio" />
                </div>
              </Field>
            </div>
          </Card>

          {isMain ? (
            <Card
              icon={Star}
              title="Recensione sul sito"
              text="Livelli regalati a chi lascia una recensione della community su viniliecaffe.it/recensioni (una volta sola). Non usa Disboard."
              aside={(cfg.reviewRewardLevels ?? 5) > 0 ? <StatusBadge tone="accent">+{cfg.reviewRewardLevels ?? 5} livelli</StatusBadge> : <StatusBadge>spento</StatusBadge>}
            >
              <div className="max-w-xs">
                <BigNumber
                  label="Livelli in regalo"
                  value={cfg.reviewRewardLevels ?? 5}
                  min={0}
                  max={100}
                  onChange={(v) => set({ reviewRewardLevels: Math.max(0, Math.floor(v || 0)) })}
                  suffix="livelli"
                  hint="0 = nessun premio."
                />
              </div>
            </Card>
          ) : null}

          <Card icon={Megaphone} title="Annunci di livello" text="Canale e messaggi quando qualcuno sale di livello o sblocca un ruolo premio. Vuoto = canale comandi del bot.">
            <ChannelField label="Canale" value={cfg.levelUpChannelId} channels={channels} onChange={(levelUpChannelId) => set({ levelUpChannelId })} />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Pills
                value={announce}
                onChange={setAnnounce}
                ariaLabel="Messaggio di level-up"
                options={[
                  { id: "level", label: "Nuovo livello", icon: TrendingUp },
                  { id: "milestone", label: "Ruolo premio sbloccato", icon: Trophy },
                  ...(isMain ? [{ id: "perks" as const, label: "Vantaggi sbloccati", icon: Gift }] : []),
                ]}
              />
              <p className="text-xs text-crema/55">
                {announce === "level"
                  ? "A ogni livello senza premio."
                  : announce === "perks"
                    ? "Un secondo messaggio, a parte, coi vantaggi del ruolo premio appena preso."
                    : cfg.roleRewards.length
                      ? "Quando il livello dà un ruolo premio: usa {role} e {perks}."
                      : "Senza ruoli premio non viene mai usato."}
              </p>
            </div>

            {announce === "perks" ? (
              <div className="mt-4 space-y-3 rounded-2xl bg-espresso/35 p-3 ring-1 ring-sand/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-crema">Messaggio vantaggi</p>
                  <Toggle checked={cfg.perksEnabled !== false} onChange={(perksEnabled) => set({ perksEnabled })} label="Messaggio vantaggi" />
                </div>
                <ChannelField
                  label="Canale"
                  value={cfg.perksChannelId || null}
                  channels={channels}
                  onChange={(perksChannelId) => set({ perksChannelId: perksChannelId || null })}
                />
                <p className="-mt-1 text-xs text-crema/50">Vuoto = #supporters.</p>

                <div>
                  <p className={labelClass}>Vantaggi per livello</p>
                  {perksRewards.length ? (
                    <>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {perksRewards.map((r) => {
                          const on = perksSel?.level === r.level;
                          const empty = !r.perks?.trim();
                          return (
                            <button
                              key={r.level}
                              type="button"
                              onClick={() => setPerksLevel(r.level)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                                on ? "bg-[#826bc2]/20 text-crema ring-[#826bc2]/50" : "bg-espresso/45 text-crema/70 ring-sand/10 hover:text-crema",
                              )}
                            >
                              <span className="size-2 rounded-full" style={{ background: roleColor(pickerRoles, r.roleId) }} aria-hidden />
                              Lv {r.level}
                              {empty ? <span className="text-crema/35">· vuoto</span> : null}
                            </button>
                          );
                        })}
                      </div>
                      {perksSel ? (
                        <div className="mt-3">
                          <textarea
                            value={perksSel.perks || ""}
                            onChange={(e) =>
                              set({ roleRewards: cfg.roleRewards.map((r) => (r.level === perksSel.level ? { ...r, perks: e.target.value.slice(0, 2000) } : r)) })
                            }
                            rows={6}
                            placeholder={"Un vantaggio per riga, es.\n:star: Permesso di cambiare nickname"}
                            className={cn(fieldClass, "!mt-0 min-h-36 resize-y py-2.5 font-mono text-[0.8rem] leading-relaxed")}
                            aria-label={`Vantaggi del livello ${perksSel.level}`}
                          />
                          <p className="mt-1.5 text-xs text-crema/50">
                            Finisce al posto di <code className="text-crema/70">{"{perklist}"}</code> quando si arriva al livello {perksSel.level}. Vuoto = &quot;—&quot;.
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-2 rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Aggiungi prima dei ruoli premio qui sopra.</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <EditorWithPreview
                editor={
                  <DraftEditor
                    key={announce}
                    value={announce === "level" ? cfg.levelUpDraft : announce === "perks" ? cfg.perksDraft || emptyDraft() : cfg.milestoneDraft}
                    onChange={(d) => set(announce === "level" ? { levelUpDraft: d } : announce === "perks" ? { perksDraft: d } : { milestoneDraft: d })}
                    emojis={data.pickers.emojis}
                    placeholders={announce === "level" ? LEVEL_PLACEHOLDERS : announce === "perks" ? PERKS_PLACEHOLDERS : MILESTONE_PLACEHOLDERS}
                    maxButtons={data.limits.buttons}
                  />
                }
                preview={
                  <DiscordMessagePreview
                    testChannelId={(announce === "perks" ? cfg.perksChannelId : cfg.levelUpChannelId) || undefined}
                    bot={data.bot}
                    draft={announce === "level" ? cfg.levelUpDraft : announce === "perks" ? cfg.perksDraft || emptyDraft() : cfg.milestoneDraft}
                    vars={vars}
                    roles={pickerRoles}
                    channels={channels}
                  />
                }
              />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "minigiochi" ? (
        isMain ? (
          <div className="space-y-4">
            <Card icon={Clock3} title="Programmazione" text="Ogni quanto escono i minigiochi, in quali ore, e quanta attività serve in chat. Orario di Roma; la fascia può passare la mezzanotte.">
              {(() => {
                const spawn = mergeMinigameSpawn(cfg.minigameSpawn);
                const setSpawn = (patch: Partial<LevelsMinigameSpawn>) =>
                  set({ minigameSpawn: { ...spawn, ...patch } });
                const setTw = ( wh: "start" | "end", patch: Partial<{ hour: number; minute: number }> ) =>
                  setSpawn({
                    timeWindow: {
                      ...spawn.timeWindow,
                      [wh]: { ...spawn.timeWindow[wh], ...patch },
                    },
                  });
                const setFresh = (patch: Partial<LevelsMinigameSpawn["spawnFreshActivity"]>) =>
                  setSpawn({ spawnFreshActivity: { ...spawn.spawnFreshActivity, ...patch } });
                const setAt = (patch: Partial<LevelsMinigameSpawn["activityThreshold"]>) =>
                  setSpawn({ activityThreshold: { ...spawn.activityThreshold, ...patch } });
                const intervalMin = Math.round(spawn.intervalMs / 60_000);
                const noPartMin = Math.round(spawn.noParticipationIntervalMs / 60_000);
                const activityMin = Math.round(spawn.activityWindowMs / 60_000);
                const failsafeMin = Math.round(spawn.failsafeMs / 60_000);
                const freshMin = Math.round(spawn.spawnFreshActivity.windowMs / 60_000);
                return (
                  <div className="space-y-4">
                    <SettingRow title="Minigiochi attivi" description="Se spento, in chat non parte nessun round automatico.">
                      <Toggle size="sm" checked={spawn.enabled !== false} onChange={(on) => setSpawn({ enabled: on })} label="Minigiochi attivi" />
                    </SettingRow>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ChannelField
                        label="Canale spawn"
                        value={spawn.channelId || null}
                        channels={channels}
                        onChange={(channelId) => setSpawn({ channelId })}
                        hint="Vuoto = canale chat principale del bot."
                      />
                      <Field label="Ruolo ping" hint="Vuoto = ruolo Minigiochi del bot.">
                        <Select
                          value={spawn.roleId || ""}
                          onChange={(v) => setSpawn({ roleId: v || null })}
                          options={[{ value: "", label: "Default bot" }, ...roles]}
                          className={fieldClass}
                          aria-label="Ruolo ping minigiochi"
                        />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <BigNumber
                        label="Intervallo"
                        value={intervalMin}
                        min={1}
                        max={360}
                        onChange={(v) => setSpawn({ intervalMs: Math.max(1, Math.floor(v || 1)) * 60_000 })}
                        suffix="min"
                        hint="Attesa minima tra un round e il successivo."
                      />
                      <BigNumber
                        label="Se nessuno gioca"
                        value={noPartMin}
                        min={1}
                        max={360}
                        onChange={(v) => setSpawn({ noParticipationIntervalMs: Math.max(1, Math.floor(v || 1)) * 60_000 })}
                        suffix="min"
                        hint="Pausa più lunga dopo un round senza risposte."
                      />
                      <BigNumber
                        label="Finestra attività"
                        value={activityMin}
                        min={1}
                        max={360}
                        onChange={(v) => setSpawn({ activityWindowMs: Math.max(1, Math.floor(v || 1)) * 60_000 })}
                        suffix="min"
                        hint="Quanto indietro si contano i messaggi in chat."
                      />
                      <BigNumber
                        label="Messaggi minimi"
                        value={spawn.minMessages}
                        min={1}
                        max={500}
                        onChange={(v) => setSpawn({ minMessages: Math.max(1, Math.floor(v || 1)) })}
                        hint="Ancora della soglia: sotto questo livello di chat non parte."
                      />
                    </div>

                    <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Fascia oraria</p>
                      <p className="mt-1 text-xs text-crema/50">Fuori da queste ore i round automatici non partono.</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-crema/75">
                        dalle
                        <div className="w-20">
                          <Select size="sm" value={String(spawn.timeWindow.start.hour)} onChange={(v) => setTw("start", { hour: Number(v) })} options={MINIGAME_HOUR_OPTS} aria-label="Ora inizio" />
                        </div>
                        :
                        <div className="w-20">
                          <Select size="sm" value={String(spawn.timeWindow.start.minute)} onChange={(v) => setTw("start", { minute: Number(v) })} options={MINIGAME_MINUTE_OPTS} aria-label="Minuti inizio" />
                        </div>
                        alle
                        <div className="w-20">
                          <Select size="sm" value={String(spawn.timeWindow.end.hour)} onChange={(v) => setTw("end", { hour: Number(v) })} options={MINIGAME_HOUR_OPTS} aria-label="Ora fine" />
                        </div>
                        :
                        <div className="w-20">
                          <Select size="sm" value={String(spawn.timeWindow.end.minute)} onChange={(v) => setTw("end", { minute: Number(v) })} options={MINIGAME_MINUTE_OPTS} aria-label="Minuti fine" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
                      <SettingRow title="Soglia adattiva" description="Alza o abbassa i messaggi richiesti in base a ora, spam e dimensione server.">
                        <Toggle size="sm" checked={spawn.activityThreshold.enabled !== false} onChange={(on) => setAt({ enabled: on })} label="Soglia adattiva" />
                      </SettingRow>
                      {spawn.activityThreshold.enabled !== false ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <BigNumber label="Min adattivo" value={spawn.activityThreshold.hardMin} min={1} max={200} onChange={(v) => setAt({ hardMin: Math.max(1, Math.floor(v || 1)) })} hint="Pavimento della soglia." />
                            <BigNumber label="Max adattivo" value={spawn.activityThreshold.hardMax} min={1} max={500} onChange={(v) => setAt({ hardMax: Math.max(1, Math.floor(v || 1)) })} hint="Tetto della soglia." />
                            <BigNumber label="Picco dalle" value={spawn.activityThreshold.peakHourStart} min={0} max={23} onChange={(v) => setAt({ peakHourStart: Math.max(0, Math.min(23, Math.floor(v || 0))) })} suffix="h" />
                            <BigNumber label="Picco alle" value={spawn.activityThreshold.peakHourEnd} min={0} max={23} onChange={(v) => setAt({ peakHourEnd: Math.max(0, Math.min(23, Math.floor(v || 0))) })} suffix="h" />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <BigNumber label="Fattore picco" value={Number(spawn.activityThreshold.peakFactor ?? 1.08)} min={0.2} max={3} step={0.01} onChange={(v) => setAt({ peakFactor: Math.max(0.2, Number(v) || 1) })} suffix="×" />
                            <BigNumber label="Notte dalle" value={spawn.activityThreshold.nightHourStart} min={0} max={24} onChange={(v) => setAt({ nightHourStart: Math.max(0, Math.min(24, Math.floor(v || 0))) })} suffix="h" hint="24 = solo fino a «notte alle»." />
                            <BigNumber label="Notte alle" value={spawn.activityThreshold.nightHourEnd} min={0} max={24} onChange={(v) => setAt({ nightHourEnd: Math.max(0, Math.min(24, Math.floor(v || 0))) })} suffix="h" />
                            <BigNumber label="Fattore notte" value={Number(spawn.activityThreshold.nightFactor ?? 0.72)} min={0.2} max={2} step={0.01} onChange={(v) => setAt({ nightFactor: Math.max(0.2, Number(v) || 0.72) })} suffix="×" />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <BigNumber label="Fattore base" value={Number(spawn.activityThreshold.defaultTimeFactor ?? 1)} min={0.2} max={3} step={0.01} onChange={(v) => setAt({ defaultTimeFactor: Math.max(0.2, Number(v) || 1) })} suffix="×" />
                            <BigNumber label="Membri ref." value={Number(spawn.activityThreshold.memberReference ?? 200)} min={30} max={5000} onChange={(v) => setAt({ memberReference: Math.max(30, Math.floor(v || 200)) })} hint="Scala soglia col numero membri." />
                            <BigNumber label="Fatt. membri min" value={Number(spawn.activityThreshold.memberFactorMin ?? 0.58)} min={0.2} max={2} step={0.01} onChange={(v) => setAt({ memberFactorMin: Math.max(0.2, Number(v) || 0.58) })} suffix="×" />
                            <BigNumber label="Fatt. membri max" value={Number(spawn.activityThreshold.memberFactorMax ?? 1.18)} min={0.2} max={3} step={0.01} onChange={(v) => setAt({ memberFactorMax: Math.max(0.2, Number(v) || 1.18) })} suffix="×" />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <BigNumber label="Esp. membri" value={Number(spawn.activityThreshold.memberExponent ?? 0.18)} min={0.05} max={1} step={0.01} onChange={(v) => setAt({ memberExponent: Math.max(0.05, Number(v) || 0.18) })} />
                            <BigNumber label="Spam media/user" value={Number(spawn.activityThreshold.spamAvgMessagesPerUser ?? 4)} min={1} max={50} step={0.5} onChange={(v) => setAt({ spamAvgMessagesPerUser: Math.max(1, Number(v) || 4) })} />
                            <BigNumber label="Penalità spam" value={Number(spawn.activityThreshold.spamPenaltyPerExcess ?? 0.065)} min={0} max={1} step={0.005} onChange={(v) => setAt({ spamPenaltyPerExcess: Math.max(0, Number(v) || 0) })} />
                            <BigNumber label="Tetto spam" value={Number(spawn.activityThreshold.spamPenaltyCap ?? 0.42)} min={0} max={2} step={0.01} onChange={(v) => setAt({ spamPenaltyCap: Math.max(0, Number(v) || 0) })} />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <BigNumber label="Divisore autori unici" value={Number(spawn.activityThreshold.minUniqueDivisor ?? 16)} min={2} max={50} onChange={(v) => setAt({ minUniqueDivisor: Math.max(2, Math.floor(v || 16)) })} hint="Più alto = meno autori unici richiesti." />
                            <BigNumber label="Bypass unici" value={Number(spawn.activityThreshold.uniqueBypassMultiple ?? 1.35)} min={1} max={5} step={0.05} onChange={(v) => setAt({ uniqueBypassMultiple: Math.max(1, Number(v) || 1.35) })} suffix="×" hint="Se i messaggi sono molti, ignora il gate autori." />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3 rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
                      <SettingRow title="Attività recente" description="Prima di far partire un round, richiede messaggi freschi nella chat (non solo nella finestra lunga).">
                        <Toggle size="sm" checked={spawn.spawnFreshActivity.enabled !== false} onChange={(on) => setFresh({ enabled: on })} label="Attività recente" />
                      </SettingRow>
                      {spawn.spawnFreshActivity.enabled !== false ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <BigNumber label="Ultimi minuti" value={freshMin} min={1} max={60} onChange={(v) => setFresh({ windowMs: Math.max(1, Math.floor(v || 1)) * 60_000 })} suffix="min" />
                          <BigNumber label="Messaggi freschi" value={spawn.spawnFreshActivity.minMessages} min={1} max={100} onChange={(v) => setFresh({ minMessages: Math.max(1, Math.floor(v || 1)) })} />
                        </div>
                      ) : null}
                    </div>

                    <BigNumber
                      label="Failsafe"
                      value={failsafeMin}
                      min={5}
                      max={1440}
                      onChange={(v) => setSpawn({ failsafeMs: Math.max(5, Math.floor(v || 5)) * 60_000 })}
                      suffix="min"
                      hint="Se per tanto non esce nulla ma c’è un po’ di chat, forza un round."
                    />
                  </div>
                );
              })()}
            </Card>

            <Card icon={Gamepad2} title="Bonus e tipi" text="Risposta veloce, serie, e per ogni gioco: on/off, durata, EXP e opzioni specifiche. I messaggi Inizio/Vittoria sono unici per tutti.">
              {(() => {
                const scoring: LevelsMinigameScoring = {
                  ...DEFAULT_MINIGAME_SCORING,
                  ...cfg.minigameScoring,
                  fastGuess: { ...DEFAULT_MINIGAME_SCORING.fastGuess, ...cfg.minigameScoring?.fastGuess },
                  streak: { ...DEFAULT_MINIGAME_SCORING.streak, ...cfg.minigameScoring?.streak },
                  rewardExpByType: mergeMinigameRewardExpByType(cfg.minigameScoring?.rewardExpByType),
                  startDraft: cfg.minigameScoring?.startDraft || null,
                  winDraft: cfg.minigameScoring?.winDraft || null,
                };
                const gameOpts = mergeMinigameGameOptions(cfg.minigameGameOptions);
                const setGameOpts = (patch: Partial<LevelsMinigameGameOptions>) =>
                  set({ minigameGameOptions: { ...gameOpts, ...patch } });
                const hiddenEventRows = (cfg.minigameScoring?.rewardExpByType || []).filter(
                  (r) => r?.type && HIDDEN_MINIGAME_TYPES.has(r.type),
                );
                const withHiddenEventRows = (rows: LevelsMinigameScoring["rewardExpByType"]) => [
                  ...(rows || []).filter((r) => r?.type && !HIDDEN_MINIGAME_TYPES.has(r.type)),
                  ...hiddenEventRows,
                ];
                const setScoring = (patch: Partial<LevelsMinigameScoring>) =>
                  set({
                    minigameScoring: {
                      ...scoring,
                      ...patch,
                      rewardExpByType: withHiddenEventRows(patch.rewardExpByType ?? scoring.rewardExpByType),
                    },
                  });
                const setRow = (type: string, patch: Partial<(typeof scoring.rewardExpByType)[0]>) =>
                  setScoring({
                    rewardExpByType: scoring.rewardExpByType.map((r) => (r.type === type ? { ...r, ...patch } : r)),
                  });
                const fastSec = Math.round(scoring.fastGuess.windowMs / 1000);
                const sharedDraft = gameDraftKind === "win" ? scoring.winDraft || emptyDraft() : scoring.startDraft || emptyDraft();
                const sharedSampleType = "guessNumber";
                const sharedSampleImg = resolveMinigamePreviewImage(sharedSampleType, previewCardsReady, realGameImgs, realGameNotes);
                const sharedDraftVars =
                  gameDraftKind === "win"
                    ? { ...minigameVars, exp: "200", total: "1500", streak: "3", user: minigameVars.user || "@Mario" }
                    : {
                        ...minigameVars,
                        minigame: minigameTypeLabel(sharedSampleType),
                        prompt: (MINIGAME_PREVIEW[sharedSampleType]?.prompt || "").replace(/\{exp\}/g, "150"),
                        exp: "150",
                        duration: "180",
                        minutes: "3",
                        minutesLabel: "**3 minuti**",
                        image: sharedSampleImg,
                      };
                const sharedPreviewDraft =
                  gameDraftKind === "win" ? sharedDraft : minigamePreviewDraft(sharedDraft, sharedSampleImg || null);
                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <BigNumber
                        label="Finestra risposta veloce"
                        value={fastSec}
                        min={1}
                        max={300}
                        onChange={(v) => setScoring({ fastGuess: { ...scoring.fastGuess, windowMs: Math.max(1, Math.floor(v || 1)) * 1000 } })}
                        suffix="sec"
                        hint="ENTRO questa finestra si applica il moltiplicatore."
                      />
                      <BigNumber
                        label="Moltiplicatore veloce"
                        value={scoring.fastGuess.multiplier}
                        min={1}
                        max={10}
                        step={0.05}
                        onChange={(v) => setScoring({ fastGuess: { ...scoring.fastGuess, multiplier: Math.max(1, Number(v) || 1) } })}
                        suffix="×"
                      />
                      <BigNumber
                        label="Bonus serie"
                        value={scoring.streak.bonusPercentPerWin}
                        min={0}
                        max={100}
                        onChange={(v) => setScoring({ streak: { ...scoring.streak, bonusPercentPerWin: Math.max(0, Math.floor(Number(v) || 0)) } })}
                        suffix="%"
                        hint="In più per ogni vittoria consecutiva."
                      />
                      <BigNumber
                        label="Tetto serie"
                        value={scoring.streak.maxBonusPercent}
                        min={0}
                        max={500}
                        onChange={(v) => setScoring({ streak: { ...scoring.streak, maxBonusPercent: Math.max(0, Math.floor(Number(v) || 0)) } })}
                        suffix="%"
                        hint="Massimo bonus cumulato dalla serie."
                      />
                    </div>

                    <div className="space-y-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                      <div className="flex flex-wrap items-center gap-3">
                        <Pills
                          value={gameDraftKind}
                          onChange={setGameDraftKind}
                          ariaLabel="Messaggio condiviso"
                          options={[
                            { id: "start" as const, label: "Inizio round", icon: Play },
                            { id: "win" as const, label: "Vittoria", icon: Trophy },
                          ]}
                        />
                        <p className="text-xs text-crema/50">
                          {gameDraftKind === "start"
                            ? "Un solo messaggio per tutti. {minigame}, {prompt}, {exp}, {minutesLabel}, {image}. L’immagine del round la mette il bot."
                            : "Un solo messaggio di vittoria per tutti i giochi."}
                        </p>
                      </div>
                      <EditorWithPreview
                        editor={
                          <DraftEditor
                            key={`shared-${gameDraftKind}`}
                            value={sharedDraft}
                            onChange={(d) => setScoring(gameDraftKind === "win" ? { winDraft: d } : { startDraft: d })}
                            emojis={data.pickers.emojis}
                            placeholders={gameDraftKind === "win" ? MINIGAME_WIN_PLACEHOLDERS : MINIGAME_START_PLACEHOLDERS}
                            maxButtons={data.limits.buttons}
                          />
                        }
                        preview={
                          <DiscordMessagePreview bot={data.bot} draft={sharedPreviewDraft} vars={sharedDraftVars} roles={pickerRoles} channels={channels} />
                        }
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className={labelClass}>Giochi</p>
                        <StatusBadge>
                          {scoring.rewardExpByType.filter((r) => r.enabled !== false).length}/{scoring.rewardExpByType.length} attivi
                        </StatusBadge>
                      </div>
                      <p className="mb-2 text-xs text-crema/50">Per tipo: attiva/spegni, durata, EXP, opzioni specifiche e anteprima.</p>
                      <ul className="space-y-2">
                        {scoring.rewardExpByType.map((row) => {
                          const open = gameEditType === row.type;
                          const on = row.enabled !== false;
                          const durSec = Math.max(15, Math.round((row.durationMs || 180000) / 1000));
                          const rowStart = scoring.startDraft || emptyDraft();
                          const rowWin = scoring.winDraft || emptyDraft();
                          const rowImg = resolveMinigamePreviewImage(row.type, previewCardsReady, realGameImgs, realGameNotes);
                          const rowStartVars = minigameRowPreviewVars(row, minigameVars, rowImg);
                          const rowWinVars = {
                            ...minigameVars,
                            exp: String(row.rewardExp || 150),
                            total: "1500",
                            streak: "3",
                            user: minigameVars.user || "@Mario",
                          };
                          const rowStartDraft = minigamePreviewDraft(rowStart, rowImg || null);
                          return (
                            <li key={row.type} className={cn("rounded-2xl ring-1 ring-sand/10", on ? "bg-espresso/45" : "bg-espresso/25 opacity-80")}>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 p-2.5 pl-3 text-left"
                                onClick={() => setGameEditType(open ? null : row.type)}
                                aria-expanded={open}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-crema">{minigameTypeLabel(row.type)}</p>
                                  <p className="truncate text-[0.65rem] text-crema/45">
                                    {on ? "attivo" : "spento"} · {durSec}s · {row.rewardExp} EXP
                                  </p>
                                </div>
                                <ChevronDown className={cn("size-4 shrink-0 text-crema/50 transition", open && "rotate-180")} aria-hidden />
                              </button>
                              {open ? (
                                <div className="space-y-3 border-t border-sand/10 p-3 pt-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <Toggle checked={on} onChange={(enabled) => setRow(row.type, { enabled })} label={`Attiva ${minigameTypeLabel(row.type)}`} />
                                    {!on ? <StatusBadge>fuori rotazione</StatusBadge> : null}
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <BigNumber
                                      label="Durata"
                                      value={durSec}
                                      min={15}
                                      max={1800}
                                      onChange={(v) => setRow(row.type, { durationMs: Math.max(15, Math.floor(v || 15)) * 1000 })}
                                      suffix="sec"
                                    />
                                    <BigNumber
                                      label="EXP vittoria"
                                      value={row.rewardExp}
                                      min={1}
                                      max={100000}
                                      step={10}
                                      onChange={(v) => setRow(row.type, { rewardExp: Math.max(1, Math.floor(Number(v) || 1)) })}
                                      suffix="EXP"
                                    />
                                  </div>
                                  {row.type === "guessNumber" ? (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <BigNumber label="Minimo" value={gameOpts.guessNumber.min} min={1} max={1_000_000} onChange={(v) => setGameOpts({ guessNumber: { ...gameOpts.guessNumber, min: Math.max(1, Math.floor(v || 1)) } })} />
                                      <BigNumber label="Massimo" value={gameOpts.guessNumber.max} min={gameOpts.guessNumber.min} max={1_000_000} onChange={(v) => setGameOpts({ guessNumber: { ...gameOpts.guessNumber, max: Math.max(gameOpts.guessNumber.min, Math.floor(v || 100)) } })} />
                                    </div>
                                  ) : null}
                                  {row.type === "hangman" ? (
                                    <BigNumber label="Errori massimi" value={gameOpts.hangman.maxMisses} min={3} max={20} onChange={(v) => setGameOpts({ hangman: { maxMisses: Math.max(3, Math.floor(v || 10)) } })} />
                                  ) : null}
                                  {row.type === "memoryEmoji" ? (
                                    <BigNumber label="Secondi sequenza" value={Math.round(gameOpts.memoryEmoji.displayMs / 1000)} min={2} max={60} onChange={(v) => setGameOpts({ memoryEmoji: { displayMs: Math.max(2, Math.floor(v || 5)) * 1000 } })} suffix="sec" hint="Quanto resta visibile la sequenza." />
                                  ) : null}
                                  {row.type === "drivingQuiz" ? (
                                    <BigNumber label="Cooldown risposta" value={Math.round(gameOpts.drivingQuiz.userAnswerCooldownMs / 1000)} min={0} max={60} onChange={(v) => setGameOpts({ drivingQuiz: { userAnswerCooldownMs: Math.max(0, Math.floor(v || 0)) * 1000 } })} suffix="sec" />
                                  ) : null}
                                  {row.type === "guessPlayer" ? (
                                    <SettingRow title="Solo famosi" description="Filtra i calciatori più conosciuti.">
                                      <Toggle size="sm" checked={gameOpts.guessPlayer.onlyFamous !== false} onChange={(on) => setGameOpts({ guessPlayer: { onlyFamous: on } })} label="Solo famosi" />
                                    </SettingRow>
                                  ) : null}
                                  {row.type === "guessSong" ? (
                                    <SettingRow title="Solo famosi" description="Preferisci brani popolari.">
                                      <Toggle size="sm" checked={gameOpts.guessSong.onlyFamous !== false} onChange={(on) => setGameOpts({ guessSong: { onlyFamous: on } })} label="Solo famosi" />
                                    </SettingRow>
                                  ) : null}
                                  {row.type === "guessAlbum" ? (
                                    <SettingRow title="Solo artisti famosi" description="Copertine di artisti già nel chart.">
                                      <Toggle size="sm" checked={gameOpts.guessAlbum.onlyFamousArtists !== false} onChange={(on) => setGameOpts({ guessAlbum: { onlyFamousArtists: on } })} label="Solo artisti famosi" />
                                    </SettingRow>
                                  ) : null}
                                  {row.type === "findBotVoice" ? (
                                    <Field label="Vocali escluse (ID)" hint="Una riga o virgola per ID. Si aggiungono a quelle di sistema del bot.">
                                      <ExpandableTextarea
                                        value={(gameOpts.findBotVoice.excludedChannelIds || []).join("\n")}
                                        rows={3}
                                        onChange={(e) =>
                                          setGameOpts({
                                            findBotVoice: {
                                              excludedChannelIds: String(e.target.value || "")
                                                .split(/[\s,;]+/)
                                                .map((x) => x.trim())
                                                .filter((id) => /^\d{15,22}$/.test(id)),
                                            },
                                          })
                                        }
                                        aria-label="ID vocali escluse"
                                        className={fieldClass}
                                      />
                                    </Field>
                                  ) : null}
                                  {row.type === "treasureHunt" ? (
                                    <div className="space-y-3">
                                      <div>
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <p className={labelClass}>Coppie emoji</p>
                                          <button
                                            type="button"
                                            className={miniBtn}
                                            onClick={() =>
                                              setGameOpts({
                                                treasureHunt: {
                                                  ...gameOpts.treasureHunt,
                                                  emojiPairs: [...gameOpts.treasureHunt.emojiPairs, { decoy: "🎯", winner: "💎" }],
                                                },
                                              })
                                            }
                                          >
                                            <Plus className="size-3.5" aria-hidden /> Aggiungi
                                          </button>
                                        </div>
                                        <ul className="space-y-2">
                                          {gameOpts.treasureHunt.emojiPairs.map((pair: LevelsTreasureEmojiPair, pi: number) => (
                                            <li key={pi} className="flex flex-wrap items-center gap-2 rounded-xl bg-roast/40 p-2 ring-1 ring-sand/10">
                                              <input
                                                value={pair.decoy}
                                                maxLength={8}
                                                onChange={(ev) => {
                                                  const emojiPairs = gameOpts.treasureHunt.emojiPairs.map((p, j) => (j === pi ? { ...p, decoy: ev.target.value } : p));
                                                  setGameOpts({ treasureHunt: { ...gameOpts.treasureHunt, emojiPairs } });
                                                }}
                                                className={cn(fieldClass, "!mt-0 w-20")}
                                                aria-label="Emoji falsa"
                                              />
                                              <span className="text-xs text-crema/45">→</span>
                                              <input
                                                value={pair.winner}
                                                maxLength={8}
                                                onChange={(ev) => {
                                                  const emojiPairs = gameOpts.treasureHunt.emojiPairs.map((p, j) => (j === pi ? { ...p, winner: ev.target.value } : p));
                                                  setGameOpts({ treasureHunt: { ...gameOpts.treasureHunt, emojiPairs } });
                                                }}
                                                className={cn(fieldClass, "!mt-0 w-20")}
                                                aria-label="Emoji vincente"
                                              />
                                              <button
                                                type="button"
                                                className={cn(miniBtn, "!px-2")}
                                                onClick={() =>
                                                  setGameOpts({
                                                    treasureHunt: {
                                                      ...gameOpts.treasureHunt,
                                                      emojiPairs: gameOpts.treasureHunt.emojiPairs.filter((_, j) => j !== pi),
                                                    },
                                                  })
                                                }
                                                aria-label="Togli coppia"
                                              >
                                                <Trash2 className="size-3.5" aria-hidden />
                                              </button>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                      <div>
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <p className={labelClass}>Bucket difficoltà</p>
                                          <button
                                            type="button"
                                            className={miniBtn}
                                            onClick={() =>
                                              setGameOpts({
                                                treasureHunt: {
                                                  ...gameOpts.treasureHunt,
                                                  buckets: [
                                                    ...gameOpts.treasureHunt.buckets,
                                                    { weight: 1, minMessages: 20, maxMessages: 40, minDurationMs: 60_000, maxDurationMs: 120_000, rewardExp: 150 },
                                                  ],
                                                },
                                              })
                                            }
                                          >
                                            <Plus className="size-3.5" aria-hidden /> Aggiungi
                                          </button>
                                        </div>
                                        <ul className="space-y-2">
                                          {gameOpts.treasureHunt.buckets.map((b: LevelsTreasureBucket, bi: number) => (
                                            <li key={bi} className="space-y-2 rounded-xl bg-roast/40 p-2.5 ring-1 ring-sand/10">
                                              <div className="grid gap-2 sm:grid-cols-3">
                                                <BigNumber label="Peso" value={b.weight} min={1} max={100} onChange={(v) => {
                                                  const buckets = gameOpts.treasureHunt.buckets.map((x, j) => (j === bi ? { ...x, weight: Math.max(1, Math.floor(v || 1)) } : x));
                                                  setGameOpts({ treasureHunt: { ...gameOpts.treasureHunt, buckets } });
                                                }} />
                                                <BigNumber label="Msg min" value={b.minMessages} min={1} max={500} onChange={(v) => {
                                                  const buckets = gameOpts.treasureHunt.buckets.map((x, j) => (j === bi ? { ...x, minMessages: Math.max(1, Math.floor(v || 1)) } : x));
                                                  setGameOpts({ treasureHunt: { ...gameOpts.treasureHunt, buckets } });
                                                }} />
                                                <BigNumber label="Msg max" value={b.maxMessages} min={b.minMessages} max={500} onChange={(v) => {
                                                  const buckets = gameOpts.treasureHunt.buckets.map((x, j) => (j === bi ? { ...x, maxMessages: Math.max(x.minMessages, Math.floor(v || 1)) } : x));
                                                  setGameOpts({ treasureHunt: { ...gameOpts.treasureHunt, buckets } });
                                                }} />
                                              </div>
                                              <div className="grid gap-2 sm:grid-cols-3">
                                                <BigNumber label="Durata min" value={Math.round(b.minDurationMs / 1000)} min={15} max={1800} onChange={(v) => {
                                                  const buckets = gameOpts.treasureHunt.buckets.map((x, j) => (j === bi ? { ...x, minDurationMs: Math.max(15, Math.floor(v || 15)) * 1000 } : x));
                                                  setGameOpts({ treasureHunt: { ...gameOpts.treasureHunt, buckets } });
                                                }} suffix="s" />
                                                <BigNumber label="Durata max" value={Math.round(b.maxDurationMs / 1000)} min={15} max={1800} onChange={(v) => {
                                                  const buckets = gameOpts.treasureHunt.buckets.map((x, j) => (j === bi ? { ...x, maxDurationMs: Math.max(Math.round(x.minDurationMs / 1000), Math.floor(v || 15)) * 1000 } : x));
                                                  setGameOpts({ treasureHunt: { ...gameOpts.treasureHunt, buckets } });
                                                }} suffix="s" />
                                                <BigNumber label="EXP" value={b.rewardExp} min={1} max={100000} step={10} onChange={(v) => {
                                                  const buckets = gameOpts.treasureHunt.buckets.map((x, j) => (j === bi ? { ...x, rewardExp: Math.max(1, Math.floor(v || 1)) } : x));
                                                  setGameOpts({ treasureHunt: { ...gameOpts.treasureHunt, buckets } });
                                                }} />
                                              </div>
                                              <button
                                                type="button"
                                                className={cn(miniBtn, "!px-2")}
                                                onClick={() =>
                                                  setGameOpts({
                                                    treasureHunt: {
                                                      ...gameOpts.treasureHunt,
                                                      buckets: gameOpts.treasureHunt.buckets.filter((_, j) => j !== bi),
                                                    },
                                                  })
                                                }
                                              >
                                                <Trash2 className="size-3.5" aria-hidden /> Togli bucket
                                              </button>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  ) : null}
                                  <div className="space-y-2">
                                    <p className={labelClass}>Anteprima inizio</p>
                                    {realGameNotes[row.type] && !realGameImgs[row.type] ? (
                                      <p className="text-xs text-[#e2836f]">{realGameNotes[row.type]}</p>
                                    ) : null}
                                    <DiscordMessagePreview
                                      noTest
                                      bot={data.bot}
                                      draft={rowStartDraft}
                                      vars={rowStartVars}
                                      rows={minigamePreviewRows(row.type)}
                                      roles={pickerRoles}
                                      channels={channels}
                                    />
                                    <p className={labelClass}>Anteprima vittoria</p>
                                    <DiscordMessagePreview
                                      noTest
                                      bot={data.bot}
                                      draft={rowWin}
                                      vars={rowWinVars}
                                      roles={pickerRoles}
                                      channels={channels}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </Card>

            <Card icon={Trophy} title="TOP minigiochi" text="Ruolo del vincitore della classifica settimanale EXP minigiochi.">
              {(() => {
                const aw: LevelsActivityWinners = {
                  channelId: null,
                  excludedRoleIds: [],
                  weeklyTextRoleId: null,
                  weeklyVoiceRoleId: null,
                  weeklyMinigameRoleId: null,
                  monthlyMemberRoleId: null,
                  ...cfg.activityWinners,
                };
                return (
                  <Field label="Ruolo TOP settimanale">
                    <Select
                      value={aw.weeklyMinigameRoleId || ""}
                      onChange={(v) => set({ activityWinners: { ...aw, weeklyMinigameRoleId: v || null } })}
                      options={[{ value: "", label: "Nessuno" }, ...roles]}
                      className={fieldClass}
                      aria-label="TOP minigiochi settimanale"
                    />
                  </Field>
                );
              })()}
            </Card>

            <Card icon={Gamepad2} title="Premi minigiochi" text="Ruoli per chi accumula EXP vincendo i minigiochi. Lista vuota = nessun ruolo.">
              {games.length ? (
                <ol className="relative space-y-2 pl-5 before:absolute before:bottom-3 before:left-[0.55rem] before:top-3 before:w-px before:bg-gradient-to-b before:from-[#826bc2]/60 before:to-transparent">
                  {games.map(({ row, i }) => (
                    <li key={i} className="relative flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                      <span className="absolute -left-[1.15rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[#826bc2] ring-4 ring-roast" aria-hidden />
                      <div className="w-40 shrink-0">
                        <NumberField className="!mt-0" value={row.exp} min={1} max={100000000} step={100} onChange={(v) => setGame(i, { exp: Math.max(1, Number(v) || 1) })} aria-label="EXP dei minigiochi" />
                      </div>
                      <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">EXP</span>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                      <div className="min-w-[10rem] flex-1">
                        <Select value={row.roleId} onChange={(roleId) => setGame(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo premio minigiochi" />
                      </div>
                      <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ minigameRewards: (cfg.minigameRewards || []).filter((_, j) => j !== i) })} aria-label="Togli il premio">
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun premio: i minigiochi danno solo EXP.</p>
              )}
              <button
                type="button"
                className={cn(miniBtn, "mt-3")}
                disabled={!roles.length}
                onClick={() => set({ minigameRewards: [...(cfg.minigameRewards || []), { exp: nextGameExp, roleId: roles[0]?.value || "" }] })}
              >
                <Plus className="size-3.5" aria-hidden /> Aggiungi premio ({nextGameExp.toLocaleString("it-IT")} EXP)
              </button>
            </Card>

            <Card icon={Megaphone} title="Annuncio premio" text="Dove e come annunciare il ruolo sbloccato coi minigiochi. Vuoto = #comandi e messaggio classico. Placeholder: {user} {role} {exp} {next}.">
              <ChannelField
                label="Canale premio"
                value={cfg.minigameRewardChannelId || null}
                channels={channels}
                onChange={(minigameRewardChannelId) => set({ minigameRewardChannelId: minigameRewardChannelId || null })}
              />
              <div className="mt-4">
                <EditorWithPreview
                  editor={
                    <DraftEditor
                      value={cfg.minigameRewardDraft || emptyDraft()}
                      onChange={(d) => set({ minigameRewardDraft: d })}
                      emojis={data.pickers.emojis}
                      placeholders={MINIGAME_PLACEHOLDERS}
                      maxButtons={data.limits.buttons}
                    />
                  }
                  preview={
                    <DiscordMessagePreview
                      testChannelId={cfg.minigameRewardChannelId || undefined}
                      bot={data.bot}
                      draft={cfg.minigameRewardDraft || emptyDraft()}
                      vars={minigameVars}
                      roles={pickerRoles}
                      channels={channels}
                    />
                  }
                />
              </div>
            </Card>
          </div>
        ) : (
          <Notice>I minigiochi EXP si configurano solo sul server principale.</Notice>
        )
      ) : null}

      {tab === "utenti" ? <UsersTab guildId={guildId} token={token} cfg={cfg} pickerRoles={pickerRoles} onToast={onToast} /> : null}
    </div>
  );
}

/* ───────────── evento EXP a tempo ───────────── */

function timeLeft(ms: number) {
  if (ms <= 0) return "finito";
  const m = Math.ceil(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d) return `${d}g ${h}h`;
  if (h) return `${h}h ${min}m`;
  return `${min}m`;
}

const EVENT_UNITS = [
  { value: "1", label: "minuti" },
  { value: "60", label: "ore" },
  { value: "1440", label: "giorni" },
];

/** "2 giorni e 3 ore", "45 minuti" */
function durationLabel(minutes: number) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  const parts = [d ? `${d} ${d === 1 ? "giorno" : "giorni"}` : "", h ? `${h} ${h === 1 ? "ora" : "ore"}` : "", m ? `${m} ${m === 1 ? "minuto" : "minuti"}` : ""].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0] || "0 minuti";
}

const whenLabel = (ms: number) => new Date(ms).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** valore per <input type="datetime-local"> (ora locale) */
function toLocalInput(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EventCard({
  guildId,
  token,
  channels,
  event,
  scheduled,
  onChange,
  onToast,
}: {
  guildId: string;
  token: string;
  channels: PickerChannel[];
  event: LevelsEvent | null;
  scheduled: LevelsScheduledEvent[];
  onChange: (e: LevelsEvent, scheduled: LevelsScheduledEvent[]) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [multiplier, setMultiplier] = useState(2);
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("1440");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [startAt, setStartAt] = useState("");
  const [announceEnabled, setAnnounceEnabled] = useState(false);
  const [announceChannelId, setAnnounceChannelId] = useState("");
  const [announceContent, setAnnounceContent] = useState("Evento EXP ×{mult} in corso!");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const endsAt = event?.expiresAt ? new Date(event.expiresAt).getTime() : 0;
  const active = Boolean(event?.active && endsAt > now);
  const minutes = Math.max(1, amount) * Number(unit);
  const startMs = startAt ? new Date(startAt).getTime() : NaN;
  const startOk = when === "now" || (Number.isFinite(startMs) && startMs > now);
  const durationOk = minutes >= 5 && minutes <= 60 * 24 * 30;

  const run = async (body: Parameters<typeof communityApi.setLevelsEvent>[2], okMsg: string) => {
    setBusy(true);
    const r = await communityApi.setLevelsEvent(token, guildId, body);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    onChange(r.data.event, r.data.scheduled || []);
    onToast(okMsg);
  };

  const submit = () => {
    if (when === "later") {
      void run(
        {
          multiplier,
          minutes,
          startAt: new Date(startMs).toISOString(),
          announceEnabled,
          announceChannelId: announceChannelId || null,
          announceContent,
        },
        `Evento ×${multiplier} programmato per ${whenLabel(startMs)}.`,
      );
    } else {
      void run({ multiplier, minutes }, `Evento ×${multiplier} avviato.`);
    }
  };

  const label = "text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50";

  return (
    <Card
      icon={Timer}
      title="Evento EXP"
      text="Un moltiplicatore in più per un periodo, sopra a tutto il resto. Puoi farlo partire ora o programmarlo; si spegne da solo."
      aside={active ? <StatusBadge tone="ok">attivo</StatusBadge> : scheduled.length ? <StatusBadge tone="accent">{scheduled.length} in programma</StatusBadge> : <StatusBadge>nessuno</StatusBadge>}
    >
      {active && event ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[#826bc2]/12 p-4 ring-1 ring-[#826bc2]/30">
          <p className="font-display text-4xl font-semibold text-crema lining-nums">×{event.multiplier}</p>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-crema">In corso · mancano {timeLeft(endsAt - now)}</p>
            <p className="text-xs text-crema/55">Finisce {whenLabel(endsAt)}</p>
          </div>
          <button type="button" className={dangerBtn} disabled={busy} onClick={() => void run({ stop: true }, "Evento EXP chiuso.")}>
            Chiudi ora
          </button>
        </div>
      ) : null}

      {scheduled.length ? (
        <div className={cn(active && "mt-3")}>
          <p className={cn(labelClass, "mb-2")}>In programma</p>
          <ul className="space-y-2">
            {scheduled.map((ev) => {
              const s = new Date(ev.startAt).getTime();
              return (
                <li key={ev.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                  <span className="flex h-10 min-w-14 items-center justify-center rounded-xl bg-[#826bc2]/15 px-2 font-display text-lg font-semibold text-[#cdbdf7] ring-1 ring-[#826bc2]/25 lining-nums">×{ev.multiplier}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-crema">
                      {whenLabel(s)} <span className="font-normal text-crema/50">· tra {timeLeft(s - now)}</span>
                    </p>
                    <p className="text-xs text-crema/55">
                      Dura {durationLabel(ev.durationMs / 60_000)} · finisce {whenLabel(s + ev.durationMs)}
                      {ev.announceEnabled ? " · annuncio all’inizio" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={miniBtn} disabled={busy} onClick={() => void run({ startNowId: ev.id }, `Evento ×${ev.multiplier} avviato adesso.`)}>
                      <Play className="size-3.5" aria-hidden /> Parti ora
                    </button>
                    <button type="button" className={miniBtn} disabled={busy} onClick={() => void run({ cancelId: ev.id }, "Evento programmato annullato.")}>
                      <X className="size-3.5" aria-hidden /> Annulla
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className={cn("grid gap-3 lg:grid-cols-[auto_auto_minmax(0,1fr)]", (active || scheduled.length > 0) && "mt-4")}>
        <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
          <p className={label}>Moltiplicatore</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-32">
              <NumberField className="!mt-0" value={multiplier} min={1.1} max={10} step={0.1} onChange={(v) => setMultiplier(Number(v) || 2)} aria-label="Moltiplicatore dell'evento" />
            </div>
            <span className="text-sm font-semibold text-crema/60">×</span>
          </div>
        </div>
        <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
          <p className={label}>Durata</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-32">
              <NumberField className="!mt-0" value={amount} min={1} max={unit === "1" ? 43200 : unit === "60" ? 720 : 30} onChange={(v) => setAmount(Math.max(1, Math.floor(Number(v) || 1)))} aria-label="Durata dell'evento" />
            </div>
            <div className="w-28">
              <Select value={unit} onChange={setUnit} options={EVENT_UNITS} className={cn(fieldClass, "!mt-0")} aria-label="Unità della durata" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
          <p className={label}>Quando</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pills
              value={when}
              onChange={(v) => {
                setWhen(v);
                if (v === "later" && !startAt) setStartAt(toLocalInput(Math.ceil((Date.now() + 3_600_000) / 3_600_000) * 3_600_000));
              }}
              ariaLabel="Quando parte l'evento"
              options={[
                { id: "now", label: "Subito" },
                { id: "later", label: "Programma", icon: CalendarClock },
              ]}
            />
            {when === "later" ? (
              <div className="w-60">
                <DateTimeField value={startAt} min={toLocalInput(now)} onChange={setStartAt} aria-label="Data e ora di inizio" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {when === "later" ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-espresso/45 p-4 ring-1 ring-sand/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Toggle checked={announceEnabled} onChange={setAnnounceEnabled} label="Annuncio all’inizio" />
            <p className="text-xs text-crema/55">Messaggio in chat quando parte l’evento programmato.</p>
          </div>
          <Field
            label="Testo annuncio"
            hint="All’ora di inizio, se attivo. Usa {mult} o {multiplier} per il moltiplicatore."
          >
            <ExpandableTextarea
              value={announceContent}
              rows={3}
              maxLength={2000}
              disabled={!announceEnabled}
              placeholder="Evento EXP ×{mult} in corso!"
              onChange={(e) => setAnnounceContent(e.target.value.slice(0, 2000))}
              className={cn(fieldClass, "!mt-0 min-h-24 resize-y py-2.5")}
              aria-label="Messaggio annuncio evento"
            />
          </Field>
          {announceEnabled ? (
            <Field label="Canale annuncio" hint="Vuoto = canale eventi predefinito del bot.">
              <Select
                value={announceChannelId}
                onChange={setAnnounceChannelId}
                options={[{ value: "", label: "Predefinito" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
                className={fieldClass}
                aria-label="Canale annuncio evento"
              />
            </Field>
          ) : null}
        </div>
      ) : null}
      {!durationOk ? <p className="mt-2 text-xs text-[#e2836f]">La durata va da 5 minuti a 30 giorni.</p> : null}
      {when === "later" && !startOk ? <p className="mt-2 text-xs text-[#e2836f]">Scegli una data futura.</p> : null}
      <button type="button" className={cn(dashPrimaryBtn, "mt-3")} disabled={busy || multiplier < 1.05 || !durationOk || !startOk} onClick={submit}>
        {when === "later" ? <CalendarClock className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {when === "later"
          ? `Programma ×${multiplier} per ${durationLabel(minutes)}${startOk && Number.isFinite(startMs) ? ` · ${whenLabel(startMs)}` : ""}`
          : `${active ? "Sostituisci l'evento" : "Avvia evento"} (×${multiplier} per ${durationLabel(minutes)})`}
      </button>
    </Card>
  );
}

/* ───────────── scheda Utenti ───────────── */

function MemberSearch({ guildId, token, onPick }: { guildId: string; token: string; onPick: (m: MemberHit) => void }) {
  const [query, setQuery] = useState("");
  /* risultati con la ricerca a cui appartengono: così si sa se sta ancora cercando */
  const [result, setResult] = useState<{ q: string; hits: MemberHit[]; err?: string }>({ q: "", hits: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) return;
    const timer = window.setTimeout(async () => {
      const res = await searchTicketMembers(token, guildId, q);
      setResult(res.ok ? { q, hits: res.data } : { q, hits: [], err: res.message });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, token, guildId]);

  const q = query.trim();
  const valid = q.length >= 2 || /^\d{16,22}$/.test(q);
  const searching = valid && result.q !== q;
  const shown = valid && result.q === q ? result.hits : [];
  const err = valid && result.q === q ? result.err : undefined;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-crema/45" aria-hidden />
      <input
        value={query}
        placeholder="Cerca un membro per nome o ID"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={cn(fieldClass, "!mt-0 h-11 py-0 pl-10")}
        aria-label="Cerca un membro"
      />
      {searching ? <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-crema/45" aria-hidden /> : null}
      {open && valid && !searching && err ? (
        <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl bg-mocha px-3 py-2.5 text-sm text-[#e2836f] shadow-xl ring-1 ring-sand/15">{err}</p>
      ) : null}
      {open && valid && !searching && !err && !shown.length ? (
        <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl bg-mocha px-3 py-2.5 text-sm text-crema/55 shadow-xl ring-1 ring-sand/15">Nessun membro trovato per “{q}”.</p>
      ) : null}
      {open && shown.length ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl bg-mocha p-1 shadow-xl ring-1 ring-sand/15">
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-crema hover:bg-crema/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(m);
                  setQuery("");
                  setResult({ q: "", hits: [] });
                  setOpen(false);
                }}
              >
                <span className="truncate font-semibold" translate="no">{m.label}</span>
                {m.label !== m.username ? <span className="truncate text-xs text-crema/50" translate="no">@{m.username}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const OPS = [
  { id: "add", label: "Aggiungi", hint: "in più a quelli che ha", icon: Plus },
  { id: "remove", label: "Togli", hint: "in meno da quelli che ha", icon: Minus },
  { id: "set", label: "Imposta", hint: "un valore preciso", icon: Target },
] as const;

function UsersTab({
  guildId,
  token,
  cfg,
  pickerRoles,
  onToast,
}: {
  guildId: string;
  token: string;
  cfg: LevelsConfig;
  pickerRoles: PickerRole[];
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [member, setMember] = useState<MemberHit | null>(null);
  const [user, setUser] = useState<LevelsUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [op, setOp] = useState<"add" | "remove" | "set">("add");
  const [mode, setMode] = useState<"level" | "exp">("level");
  const [value, setValue] = useState(1);
  const [confirmReset, setConfirmReset] = useState(false);

  const pick = async (m: MemberHit) => {
    setMember(m);
    setUser(null);
    setConfirmReset(false);
    setLoading(true);
    const r = await communityApi.getLevelsUser(token, guildId, m.id);
    setLoading(false);
    if (!r.ok) return onToast(r.message, true);
    setUser(r.data.user);
  };

  const clear = () => {
    setMember(null);
    setUser(null);
    setConfirmReset(false);
  };

  const act = async (action: LevelsUserAction["action"]) => {
    if (!member) return;
    setBusy(true);
    const r = await communityApi.mutateLevelsUser(token, guildId, { userId: member.id, action, mode, value });
    setBusy(false);
    setConfirmReset(false);
    if (!r.ok) return onToast(r.message, true);
    setUser(r.data.user);
    if (action === "syncroles") {
      return onToast(r.data.rolesSynced ? "Ruoli premio risincronizzati." : "Il bot non ha il server in memoria: i ruoli si aggiornano al prossimo messaggio.", !r.data.rolesSynced);
    }
    const b = r.data.before;
    const u = r.data.user;
    const roles = r.data.rolesSynced ? "" : " I ruoli si aggiornano al prossimo messaggio.";
    onToast(`${member.label}: livello ${b.level} → ${u.level}, ${b.totalExp.toLocaleString("it-IT")} → ${u.totalExp.toLocaleString("it-IT")} EXP.${roles}`);
  };

  /* anteprima: in livelli si sa il risultato esatto, in EXP si mostrano gli EXP */
  const preview = (() => {
    if (!user) return { label: "", from: "", to: "", changed: false };
    const cur = mode === "level" ? user.level : user.totalExp;
    const next = op === "set" ? value : op === "add" ? cur + value : Math.max(0, cur - value);
    const fmt = (n: number) => n.toLocaleString("it-IT");
    return { label: mode === "level" ? "Livello" : "EXP", from: fmt(cur), to: fmt(next), changed: next !== cur };
  })();

  const sortedRewards = [...cfg.roleRewards].sort((a, b) => a.level - b.level);
  const earned = user ? sortedRewards.filter((r) => r.level <= user.level) : [];
  const nextReward = user ? sortedRewards.find((r) => r.level > user.level) : undefined;
  const roleName = (id: string) => pickerRoles.find((r) => r.id === id)?.name || "ruolo eliminato";
  const span = user ? Math.max(1, user.nextLevelExp - user.levelStartExp) : 1;
  const pct = user ? Math.min(100, Math.max(0, ((user.totalExp - user.levelStartExp) / span) * 100)) : 0;

  return (
    <div className="space-y-4">
      <Card icon={UserRound} title="Utenti" text="Cerca un membro per vedere il suo livello e cambiarlo a mano. Ogni modifica finisce nello storico livelli.">
        {member ? (
          <div className="flex items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#826bc2]/20 font-display text-lg font-semibold text-[#cdbdf7]" aria-hidden>
              {(member.label || member.username || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-crema" translate="no">
                {member.label}
              </p>
              <p className="truncate text-xs text-crema/50" translate="no">
                @{member.username} · {member.id}
              </p>
            </div>
            <button type="button" className={cn(miniBtn, "!px-2")} onClick={clear} aria-label="Cambia membro">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <MemberSearch guildId={guildId} token={token} onPick={(m) => void pick(m)} />
        )}
      </Card>

      {member && loading ? <RowsSkeleton rows={3} /> : null}

      {member && user ? (
        <>
          <section className="rounded-3xl bg-gradient-to-br from-[#826bc2]/20 via-roast/80 to-roast/70 p-5 ring-1 ring-[#826bc2]/25">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Livello</p>
                <p className="font-display text-5xl font-semibold leading-none text-crema lining-nums">{user.level}</p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">EXP totali</p>
                <p className="text-xl font-semibold text-crema lining-nums">{user.totalExp.toLocaleString("it-IT")}</p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Questa settimana</p>
                <p className="text-xl font-semibold text-crema lining-nums">{user.weeklyExp.toLocaleString("it-IT")}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-espresso/70">
                <div className="h-full rounded-full bg-[#9c86db]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-crema/55 lining-nums">
                {Math.max(0, user.nextLevelExp - user.totalExp).toLocaleString("it-IT")} EXP al livello {user.level + 1}
                {nextReward ? ` · prossimo ruolo premio al livello ${nextReward.level} (${roleName(nextReward.roleId)})` : ""}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {earned.length ? (
                earned.map((r) => (
                  <span key={`${r.level}-${r.roleId}`} className="inline-flex items-center gap-1.5 rounded-full bg-espresso/60 px-2.5 py-1 text-xs font-semibold text-crema/85 ring-1 ring-sand/10">
                    <span className="size-2 rounded-full" style={{ background: roleColor(pickerRoles, r.roleId) }} aria-hidden />
                    {roleName(r.roleId)}
                    <span className="text-crema/40">Lv {r.level}</span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-crema/50">Nessun ruolo premio ancora.</span>
              )}
            </div>
          </section>

          <Card icon={TrendingUp} title="Modifica" text="Scegli cosa fare, quanto, e controlla l'anteprima prima di applicare.">
            {/* 1. cosa fare */}
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cosa fare">
              {OPS.map((o) => {
                const on = op === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setOp(o.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-1 transition",
                      on ? "bg-[#826bc2]/15 ring-[#826bc2]/45" : "bg-espresso/45 ring-sand/10 hover:bg-crema/[0.05]",
                    )}
                  >
                    <o.icon className={cn("size-4", on ? "text-[#cdbdf7]" : "text-crema/45")} aria-hidden />
                    <span className={cn("text-sm font-semibold", on ? "text-crema" : "text-crema/75")}>{o.label}</span>
                    <span className="hidden text-xs text-crema/45 sm:block">{o.hint}</span>
                  </button>
                );
              })}
            </div>

            {/* 2. quanto + anteprima + applica */}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
              <div className="w-36">
                <NumberField
                  className="!mt-0"
                  value={value}
                  min={0}
                  max={mode === "level" ? 10000 : 2000000000}
                  step={mode === "level" ? 1 : 100}
                  onChange={(v) => setValue(Math.max(0, Math.floor(Number(v) || 0)))}
                  aria-label="Quanto"
                />
              </div>
              <div className="flex h-10 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Unità">
                {(
                  [
                    ["level", "livelli"],
                    ["exp", "EXP"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    onClick={() => setMode(id)}
                    className={cn("rounded-md px-3 text-sm font-semibold transition", mode === id ? "bg-crema/10 text-crema" : "text-crema/50 hover:text-crema/80")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm lining-nums">
                <span className="text-crema/55">{preview.label}</span>
                <span className="font-semibold text-crema/70">{preview.from}</span>
                <ArrowRight className="size-3.5 shrink-0 text-crema/40" aria-hidden />
                <span className={cn("font-display text-lg font-semibold", preview.changed ? "text-[#cdbdf7]" : "text-crema/60")}>{preview.to}</span>
              </div>

              <button type="button" className={cn(dashPrimaryBtn, "h-10")} disabled={busy || !preview.changed || ((op === "add" || op === "remove") && value <= 0)} onClick={() => void act(op)}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Applica
              </button>
            </div>

            {/* 3. altro, in piccolo */}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs">
              <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-crema/55 transition hover:text-crema disabled:opacity-45" disabled={busy} onClick={() => void act("syncroles")}>
                <RefreshCw className="size-3.5" aria-hidden /> Risincronizza ruoli premio
              </button>
              {confirmReset ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-crema/55">Azzerare tutti gli EXP di {member.label}?</span>
                  <button type="button" className={dangerBtn} disabled={busy} onClick={() => void act("reset")}>
                    Sì, azzera
                  </button>
                  <button type="button" className="font-semibold text-crema/55 hover:text-crema" onClick={() => setConfirmReset(false)}>
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#e2836f]/80 transition hover:text-[#f0a493] disabled:opacity-45"
                  disabled={busy || user.totalExp === 0}
                  onClick={() => setConfirmReset(true)}
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Azzera EXP
                </button>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

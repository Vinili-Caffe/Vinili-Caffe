/**
 * Livelli / EXP della dashboard (modulo "livelli").
 * Per ora solo sul server principale (mainOnly): tassi, canali bloccati, moltiplicatori,
 * ruoli premio e messaggi di level-up personalizzabili. Il runtime Vinili Level legge da qui.
 */
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

type RoleMult = { roleId: string; multiplier: number };
/** perks: testo dei vantaggi sbloccati (va in {perklist} del messaggio vantaggi); assente = quelli di sempre */
type RoleReward = { level: number; roleId: string; perks?: string };
/** ruolo dato a chi fa tot EXP coi minigiochi (Rookie, Scout…) */
type MinigameReward = { exp: number; roleId: string };

/** noticeDraft: messaggio completo (testo, embed o V2) mandato in risposta; noticeTemplate resta per compatibilità */
type ExpBonus = {
  enabled: boolean;
  amount: number;
  channelIds: string[];
  noticeTemplate: string;
  noticeDraft: ReturnType<typeof T.normalizeDraft>;
  /** parole/frasi che fanno scattare il saluto EXP (vuoto = quelle di wordReactions.json) */
  words?: string[];
};
type CooldownTier = { minLevel: number; seconds: number };
type CooldownCustomRole = { roleId: string; seconds: number };
type MinigameRewardExp = {
  type: string;
  rewardExp: number;
  enabled: boolean;
  durationMs: number;
};
type MinigameScoring = {
  fastGuess: { windowMs: number; multiplier: number };
  streak: { bonusPercentPerWin: number; maxBonusPercent: number };
  rewardExpByType: MinigameRewardExp[];
  /** Messaggio inizio round unico per tutti i tipi ({minigame} {exp} {minutesLabel} {prompt}) */
  startDraft: ReturnType<typeof T.normalizeDraft> | null;
  /** Messaggio vittoria unico per tutti i tipi */
  winDraft: ReturnType<typeof T.normalizeDraft> | null;
};
type MinigameClock = { hour: number; minute: number };
/** Intervallo, fascia oraria e filtri attività della chat (overlay su config.json). */
type MinigameSpawn = {
  enabled: boolean;
  /** null = canale chat principale (IDs) */
  channelId: string | null;
  /** null = ruolo Minigames (IDs) per il ping */
  roleId: string | null;
  intervalMs: number;
  noParticipationIntervalMs: number;
  activityWindowMs: number;
  minMessages: number;
  failsafeMs: number;
  timeWindow: { start: MinigameClock; end: MinigameClock };
  spawnFreshActivity: { enabled: boolean; windowMs: number; minMessages: number };
  activityThreshold: {
    enabled: boolean;
    hardMin: number;
    hardMax: number;
    nightHourStart: number;
    nightHourEnd: number;
    nightFactor: number;
    peakHourStart: number;
    peakHourEnd: number;
    peakFactor: number;
    defaultTimeFactor: number;
    memberReference: number;
    memberFactorMin: number;
    memberFactorMax: number;
    memberExponent: number;
    spamAvgMessagesPerUser: number;
    spamPenaltyPerExcess: number;
    spamPenaltyCap: number;
    minUniqueDivisor: number;
    uniqueBypassMultiple: number;
  };
};
type TreasureEmojiPair = { decoy: string; winner: string };
type TreasureBucket = {
  weight: number;
  minMessages: number;
  maxMessages: number;
  minDurationMs: number;
  maxDurationMs: number;
  rewardExp: number;
};
/** Opzioni per-gioco oltre EXP/durata (overlay su config.json). */
type MinigameGameOptions = {
  guessNumber: { min: number; max: number };
  hangman: { maxMisses: number };
  memoryEmoji: { displayMs: number };
  drivingQuiz: { userAnswerCooldownMs: number };
  guessPlayer: { onlyFamous: boolean };
  guessSong: { onlyFamous: boolean };
  guessAlbum: { onlyFamousArtists: boolean };
  findBotVoice: { excludedChannelIds: string[] };
  treasureHunt: { emojiPairs: TreasureEmojiPair[]; buckets: TreasureBucket[] };
};

const DEFAULT_MINIGAME_DURATION_MS: Record<string, number> = {
  guessNumber: 180_000,
  guessWord: 180_000,
  guessFlag: 180_000,
  guessPlayer: 180_000,
  guessSong: 180_000,
  guessCapital: 180_000,
  guessReverseCapital: 180_000,
  guessRegionCapital: 180_000,
  fastType: 180_000,
  guessTeam: 180_000,
  guessSinger: 180_000,
  guessAlbum: 180_000,
  hangman: 240_000,
  italianGK: 180_000,
  drivingQuiz: 180_000,
  mathExpression: 180_000,
  findBot: 300_000,
  findBotVoice: 300_000,
  memoryEmoji: 180_000,
  guessYear: 180_000,
  completeVerse: 180_000,
  guessEmoji: 180_000,
  quoteFilm: 180_000,
  completeProverb: 180_000,
  synonymAntonym: 180_000,
  guessCity: 180_000,
  treasureHunt: 180_000,
  starWarsQuiz: 180_000,
  starWarsGuessPlanet: 180_000,
  halloweenQuiz: 180_000,
  halloweenFindGhost: 300_000,
  halloweenMissingEmoji: 180_000,
  halloweenCountBats: 180_000,
  halloweenTrickOrTreat: 900_000,
  podrace: 180_000,
  cacciatore: 180_000,
  scova: 180_000,
  ordine66: 180_000,
  attacca_base: 180_000,
  conquista: 180_000,
  pg: 180_000,
  reliquie: 180_000,
  convoglio: 180_000,
  ewok: 180_000,
  olocron: 180_000,
};

function defaultDurationForType(type: string) {
  return DEFAULT_MINIGAME_DURATION_MS[type] || 180_000;
}

function optionalMinigameDraft(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const d = T.normalizeDraft(raw);
  return T.draftIsEmpty(d) ? null : d;
}
type ActivityWinnersConfig = {
  channelId: string | null;
  excludedRoleIds: string[];
  weeklyTextRoleId: string | null;
  weeklyVoiceRoleId: string | null;
  weeklyMinigameRoleId: string | null;
  monthlyMemberRoleId: string | null;
};
type LevelCurveSegment = { upTo: number; base: number; from: number; perLevel: number };
type LevelCurve = {
  firstThreshold: number;
  roundTo: number;
  minStepAdd: number;
  segments: LevelCurveSegment[];
};

type LevelsConfig = {
  seedVersion: number;
  userSaved: boolean;
  messageEnabled: boolean;
  voiceEnabled: boolean;
  messageExp: number;
  voiceExpPerMinute: number;
  messageCooldownSec: number;
  globalMultiplier: number;
  lockedChannelIds: string[];
  ignoredRoleIds: string[];
  roleMultipliers: RoleMult[];
  levelUpChannelId: string | null;
  levelUpDraft: ReturnType<typeof T.normalizeDraft>;
  milestoneDraft: ReturnType<typeof T.normalizeDraft>;
  roleRewards: RoleReward[];
  /** messaggio "vantaggi sbloccati" quando si prende un ruolo premio (es. #supporters) */
  perksEnabled: boolean;
  /** canale del messaggio vantaggi (vuoto = #supporters del server principale) */
  perksChannelId: string | null;
  perksDraft: ReturnType<typeof T.normalizeDraft>;
  perkRoleId: string | null;
  perkMinLevel: number;
  maxCombinedMultiplier: number;
  /** premi dei minigiochi (EXP fatti coi minigiochi → ruolo) */
  minigameRewards: MinigameReward[];
  /** canale annuncio premio minigiochi (vuoto = #comandi) */
  minigameRewardChannelId: string | null;
  /** messaggio premio minigiochi (vuoto = embed classico) */
  minigameRewardDraft: ReturnType<typeof T.normalizeDraft>;
  /** livelli regalati per la recensione sul sito (solo main; 0 = niente premio) */
  reviewRewardLevels: number;
  /** cooldown comandi: soglie di livello + riduzioni Staff/VIP/Boost + ruoli custom */
  commandCooldown: {
    defaultSeconds: number;
    tiers: CooldownTier[];
    roles: {
      staff: number;
      vipPlus: number;
      vip: number;
      doubleBooster: number;
      booster: number;
    };
    customRoles: CooldownCustomRole[];
  };
  /** bilanciamento EXP minigiochi (fast/streak + override per tipo) */
  minigameScoring: MinigameScoring;
  /** quanto spesso / in quali ore / filtri attività chat */
  minigameSpawn: MinigameSpawn;
  /** dettagli per tipo (range numeri, treasure, findBot…) */
  minigameGameOptions: MinigameGameOptions;
  /** TOP settimanale/mensile: canale, esclusi, ruoli vincitori */
  activityWinners: ActivityWinnersConfig;
  /** curva EXP → livello (soglie e segmenti dello step) */
  levelCurve: LevelCurve;
  /** bonus community: primo messaggio del giorno + saluto di benvenuto */
  bonuses: {
    firstMessageDaily: ExpBonus;
    welcomeGreeting: ExpBonus;
  };
};

const SEED_VERSION = 6;
const MODULE_ID = "livelli";

const moduleOn = (gid?) =>
  (require("../core/moduleSwitches") as typeof import("../core/moduleSwitches")).isModuleOn(String(gid || ""), MODULE_ID);

const cache = new Map<string, { at: number; cfg: LevelsConfig }>();
const CACHE_TTL_MS = 15_000;

function clampNum(n: unknown, min: number, max: number, fb: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fb;
  return Math.min(max, Math.max(min, v));
}

function uniqIds(raw: unknown, max = 50): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(raw) ? raw : []) {
    const id = String(x || "").trim();
    if (!T.isId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeRoleMultipliers(raw: unknown): RoleMult[] {
  const out: RoleMult[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(raw) ? raw : [];
  for (const row of list) {
    const roleId = String((row as any)?.roleId || "").trim();
    if (!T.isId(roleId) || seen.has(roleId)) continue;
    const multiplier = clampNum((row as any)?.multiplier, 0.1, 20, 1);
    seen.add(roleId);
    out.push({ roleId, multiplier });
    if (out.length >= 80) break;
  }
  return out;
}

function normalizeRoleRewards(raw: unknown): RoleReward[] {
  const out: RoleReward[] = [];
  const seen = new Set<number>();
  for (const row of Array.isArray(raw) ? raw : []) {
    const level = Math.floor(Number((row as any)?.level));
    const roleId = String((row as any)?.roleId || "").trim();
    if (!Number.isFinite(level) || level < 1 || level > 10000 || !T.isId(roleId) || seen.has(level)) continue;
    seen.add(level);
    const perks = (row as any)?.perks;
    out.push(typeof perks === "string" ? { level, roleId, perks: perks.slice(0, 2000) } : { level, roleId });
    if (out.length >= 60) break;
  }
  return out.sort((a, b) => a.level - b.level);
}

/** Premi minigiochi di sempre (dal catalogo ruoli). */
function defaultMinigameRewards(): MinigameReward[] {
  try {
    const { EXP_REWARDS } = require("../../Vinili/Minigames/services/minigameEmbedShared") as any;
    return normalizeMinigameRewards(EXP_REWARDS);
  } catch {
    return [];
  }
}

function normalizeMinigameRewards(raw: unknown): MinigameReward[] {
  const out: MinigameReward[] = [];
  const seen = new Set<number>();
  for (const row of Array.isArray(raw) ? raw : []) {
    const exp = Math.floor(Number((row as any)?.exp));
    const roleId = String((row as any)?.roleId || "").trim();
    if (!Number.isFinite(exp) || exp < 1 || exp > 100_000_000 || !T.isId(roleId) || seen.has(exp)) continue;
    seen.add(exp);
    out.push({ exp, roleId });
    if (out.length >= 40) break;
  }
  return out.sort((a, b) => a.exp - b.exp);
}

function defaultLevelUpDraft() {
  const { E } = require("../../shared/emojis/emojiCatalog") as typeof import("../../shared/emojis/emojiCatalog");
  const e = (k: string) => String((E as any)?.[k] || "");
  return T.normalizeDraft({
    content: "{user} sei salito/a di livello!",
    mentionUsers: true,
    embed: {
      enabled: true,
      title: "{username} leveled up!",
      description: [
        `${e("VC_PandaClap")} **Complimenti {user}!**`,
        `${e("VC_LevelUp2")} Hai appena __raggiunto__ il **livello** \`{level}\``,
        `${e("VC_HelloKittyGift")} __Continua__ ad essere **attivo** in __chat__ e in __vocale__ per avanzare di _livello_!`,
      ].join("\n"),
      color: "#826bc2",
      imageUrl: "",
      thumbnailUrl: "{avatar}",
      footerText: "",
      timestamp: false,
      authorName: "{username}",
      authorIconUrl: "{avatar}",
      fields: [],
    },
  });
}

function defaultMilestoneDraft() {
  const { E } = require("../../shared/emojis/emojiCatalog") as typeof import("../../shared/emojis/emojiCatalog");
  const e = (k: string) => String((E as any)?.[k] || "");
  return T.normalizeDraft({
    content: "{user} sei salito/a di livello!",
    mentionUsers: true,
    embed: {
      enabled: true,
      title: "{username} leveled up!",
      description: [
        `${e("VC_PandaClap")} **Complimenti {user}!**`,
        `${e("VC_LevelUp2")} Hai appena __raggiunto__ il {role}`,
        `${e("VC_HelloKittyGift")} __Controlla__ {perks} per sapere i nuovi **vantaggi** che hai _sbloccato_!`,
      ].join("\n"),
      color: "#826bc2",
      imageUrl: "",
      thumbnailUrl: "{avatar}",
      footerText: "",
      timestamp: false,
      authorName: "{username}",
      authorIconUrl: "{avatar}",
      fields: [],
    },
  });
}

/** Messaggio vantaggi di sempre (#supporters): {perklist} = vantaggi del livello. */
function defaultPerksDraft() {
  const { E } = require("../../shared/emojis/emojiCatalog") as typeof import("../../shared/emojis/emojiCatalog");
  const e = (k: string) => String((E as any)?.[k] || "");
  return T.normalizeDraft({
    content: `${e("VC_LevelUp")} \`|\`  {user}`,
    mentionUsers: true,
    embed: {
      enabled: true,
      title: "",
      description: [
        `### ${e("ThankYou")} **__COMPLIMENTI {user}!__**`,
        "",
        `${e("exp")} **Hai raggiunto il livello \`{level}\`** e il ruolo {role}.`,
        "",
        `${e("VC_LevelUp")} **Hai sbloccato i seguenti vantaggi:**`,
        "",
        "{perklist}",
        "",
        `${e("flyingnitroboost")} **Grazie** per essere attivo/a su **{server}**!`,
        "",
        `${e("VC_Link")} Dettaglio completo: [viniliecaffe.it/perks](<https://viniliecaffe.it/perks/>)`,
      ].join("\n"),
      color: "#826bc2",
      imageUrl: "",
      thumbnailUrl: "{avatar}",
      footerText: "",
      timestamp: false,
      authorName: "{username}",
      authorIconUrl: "{avatar}",
      fields: [],
    },
  });
}

/** Vantaggi di sempre per un livello del server principale (testo, una riga per vantaggio). */
function defaultPerksText(level: number): string {
  try {
    const M = require("../../Vinili/Community/utils/levelMilestoneSupportersAnnounceEmbeds") as typeof import("../../Vinili/Community/utils/levelMilestoneSupportersAnnounceEmbeds");
    return M.buildPerkBlockLines(level).join("\n");
  } catch {
    return "";
  }
}

/** Ruoli premio coi vantaggi di sempre dove non sono mai stati scritti (solo server principale). */
function withDefaultPerks(rewards: RoleReward[]): RoleReward[] {
  return rewards.map((r) => (typeof r.perks === "string" ? r : { ...r, perks: defaultPerksText(r.level) }));
}

/** Messaggio bonus di sempre: emoji in apertura, EXP in grassetto, menzione in fondo. */
function defaultBonusDraft(kind: "firstMessageDaily" | "welcomeGreeting", template?: string) {
  const { E } = require("../../shared/emojis/emojiCatalog") as typeof import("../../shared/emojis/emojiCatalog");
  const e = (k: string) => String((E as any)?.[k] || "");
  const content = template
    ? template
    : kind === "firstMessageDaily"
      ? `${e("VC_ThankYou")} **Sei stato/a il primo a scrivere oggi in chat!**\n${e("VC_EXP")} **{amount} exp** guadagnati!\n{user}`
      : `${e("VC_ThankYou")} **Grazie per il benvenuto!**\n${e("VC_EXP")} **{amount} exp** guadagnati!\n{user}`;
  return T.normalizeDraft({ content, mentionUsers: true, embed: { enabled: false } });
}

function defaultMinigameScoring(): MinigameScoring {
  const rows: Array<{ type: string; rewardExp: number }> = [
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
  let startDraft: ReturnType<typeof T.normalizeDraft> | null = null;
  let winDraft: ReturnType<typeof T.normalizeDraft> | null = null;
  try {
    const D = require("../../Vinili/Minigames/services/minigameClassicDrafts") as typeof import("../../Vinili/Minigames/services/minigameClassicDrafts");
    startDraft = D.classicSharedStartDraft();
    winDraft = D.classicSharedWinDraft();
  } catch (_) {}
  return {
    fastGuess: { windowMs: 30_000, multiplier: 1.5 },
    streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 },
    rewardExpByType: rows.map((r) => ({
      type: r.type,
      rewardExp: r.rewardExp,
      enabled: true,
      durationMs: defaultDurationForType(r.type),
    })),
    startDraft,
    winDraft,
  };
}

/** Draft condivisi: se vuoti → classici; migra eventuali draft per-tipo legacy. */
function fillEmptyMinigameDrafts(scoring: MinigameScoring, raw?: any): MinigameScoring {
  let classicStart: ReturnType<typeof T.normalizeDraft> | null = null;
  let classicWin: ReturnType<typeof T.normalizeDraft> | null = null;
  try {
    const D = require("../../Vinili/Minigames/services/minigameClassicDrafts") as typeof import("../../Vinili/Minigames/services/minigameClassicDrafts");
    classicStart = D.classicSharedStartDraft();
    classicWin = D.classicSharedWinDraft();
  } catch (_) {}

  let startDraft = scoring.startDraft && !T.draftIsEmpty(scoring.startDraft) ? scoring.startDraft : null;
  let winDraft = scoring.winDraft && !T.draftIsEmpty(scoring.winDraft) ? scoring.winDraft : null;

  /* Legacy: draft salvati per tipo → promuovi il primo non vuoto (vittoria era già uguale). */
  const legacyRows = Array.isArray(raw?.rewardExpByType) ? raw.rewardExpByType : [];
  if (!startDraft || !winDraft) {
    for (const row of legacyRows) {
      if (!startDraft) {
        const d = optionalMinigameDraft(row?.startDraft);
        if (d) startDraft = d;
      }
      if (!winDraft) {
        const d = optionalMinigameDraft(row?.winDraft);
        if (d) winDraft = d;
      }
      if (startDraft && winDraft) break;
    }
  }

  return {
    ...scoring,
    startDraft: startDraft || classicStart,
    winDraft: winDraft || classicWin,
    rewardExpByType: scoring.rewardExpByType.map((row) => ({
      type: row.type,
      rewardExp: row.rewardExp,
      enabled: row.enabled,
      durationMs: row.durationMs,
    })),
  };
}

/** Valori EXP/durata/fast/streak dal config.json del bot principale. */
function importMinigameScoringFromBotConfig(): MinigameScoring {
  const d = defaultMinigameScoring();
  try {
    const cfg = require("../../Vinili/config.json") as { minigames?: Record<string, any> };
    const mg = cfg?.minigames;
    if (!mg || typeof mg !== "object") return d;
    const fg = mg.fastGuess && typeof mg.fastGuess === "object" ? mg.fastGuess : {};
    const st = mg.streak && typeof mg.streak === "object" ? mg.streak : {};
    const rewardExpByType = d.rewardExpByType.map((row) => {
      const raw = mg[row.type];
      if (raw === false) return { ...row, enabled: false };
      if (!raw || typeof raw !== "object") return row;
      const rewardExp = Math.floor(Number(raw.rewardExp));
      const durationMs = Math.floor(Number(raw.durationMs));
      return {
        ...row,
        enabled: true,
        rewardExp: Number.isFinite(rewardExp) && rewardExp >= 1 ? Math.min(100_000, rewardExp) : row.rewardExp,
        durationMs:
          Number.isFinite(durationMs) && durationMs >= 15_000
            ? Math.min(1_800_000, durationMs)
            : row.durationMs,
      };
    });
    return fillEmptyMinigameDrafts({
      fastGuess: {
        windowMs: Math.floor(clampNum(fg.windowMs, 1000, 300_000, d.fastGuess.windowMs)),
        multiplier: clampNum(fg.multiplier, 1, 10, d.fastGuess.multiplier),
      },
      streak: {
        bonusPercentPerWin: Math.floor(clampNum(st.bonusPercentPerWin, 0, 100, d.streak.bonusPercentPerWin)),
        maxBonusPercent: Math.floor(clampNum(st.maxBonusPercent, 0, 500, d.streak.maxBonusPercent)),
      },
      rewardExpByType,
      startDraft: d.startDraft,
      winDraft: d.winDraft,
    });
  } catch {
    return d;
  }
}

function clampHour(n: unknown, fb: number) {
  return Math.floor(clampNum(n, 0, 23, fb));
}
function clampMinute(n: unknown, fb: number) {
  return Math.floor(clampNum(n, 0, 59, fb));
}
function normalizeMinigameClock(raw: unknown, fb: MinigameClock): MinigameClock {
  const r = raw && typeof raw === "object" ? (raw as any) : {};
  return { hour: clampHour(r.hour, fb.hour), minute: clampMinute(r.minute, fb.minute) };
}

function defaultMinigameSpawn(): MinigameSpawn {
  return {
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
}

function normalizeMinigameSpawn(raw: unknown): MinigameSpawn {
  const d = defaultMinigameSpawn();
  const r = raw && typeof raw === "object" ? (raw as any) : {};
  const fresh = r.spawnFreshActivity && typeof r.spawnFreshActivity === "object" ? r.spawnFreshActivity : {};
  const at = r.activityThreshold && typeof r.activityThreshold === "object" ? r.activityThreshold : {};
  const tw = r.timeWindow && typeof r.timeWindow === "object" ? r.timeWindow : {};
  return {
    enabled: r.enabled !== false,
    channelId: T.isId(r.channelId) ? String(r.channelId) : null,
    roleId: T.isId(r.roleId) ? String(r.roleId) : null,
    intervalMs: Math.floor(clampNum(r.intervalMs, 60_000, 24 * 60 * 60_000, d.intervalMs)),
    noParticipationIntervalMs: Math.floor(
      clampNum(r.noParticipationIntervalMs, 60_000, 24 * 60 * 60_000, d.noParticipationIntervalMs),
    ),
    activityWindowMs: Math.floor(clampNum(r.activityWindowMs, 60_000, 6 * 60 * 60_000, d.activityWindowMs)),
    minMessages: Math.floor(clampNum(r.minMessages, 1, 500, d.minMessages)),
    failsafeMs: Math.floor(clampNum(r.failsafeMs, 5 * 60_000, 24 * 60 * 60_000, d.failsafeMs)),
    timeWindow: {
      start: normalizeMinigameClock(tw.start, d.timeWindow.start),
      end: normalizeMinigameClock(tw.end, d.timeWindow.end),
    },
    spawnFreshActivity: {
      enabled: fresh.enabled !== false,
      windowMs: Math.floor(clampNum(fresh.windowMs, 60_000, 60 * 60_000, d.spawnFreshActivity.windowMs)),
      minMessages: Math.floor(clampNum(fresh.minMessages, 1, 100, d.spawnFreshActivity.minMessages)),
    },
    activityThreshold: {
      enabled: at.enabled !== false,
      hardMin: Math.floor(clampNum(at.hardMin, 1, 200, d.activityThreshold.hardMin)),
      hardMax: Math.floor(clampNum(at.hardMax, 1, 500, d.activityThreshold.hardMax)),
      nightHourStart: Math.floor(clampNum(at.nightHourStart, 0, 24, d.activityThreshold.nightHourStart)),
      nightHourEnd: Math.floor(clampNum(at.nightHourEnd, 0, 24, d.activityThreshold.nightHourEnd)),
      nightFactor: clampNum(at.nightFactor, 0.2, 2, d.activityThreshold.nightFactor),
      peakHourStart: clampHour(at.peakHourStart, d.activityThreshold.peakHourStart),
      peakHourEnd: clampHour(at.peakHourEnd, d.activityThreshold.peakHourEnd),
      peakFactor: clampNum(at.peakFactor, 0.2, 3, d.activityThreshold.peakFactor),
      defaultTimeFactor: clampNum(at.defaultTimeFactor, 0.2, 3, d.activityThreshold.defaultTimeFactor),
      memberReference: Math.floor(clampNum(at.memberReference, 30, 5000, d.activityThreshold.memberReference)),
      memberFactorMin: clampNum(at.memberFactorMin, 0.2, 2, d.activityThreshold.memberFactorMin),
      memberFactorMax: clampNum(at.memberFactorMax, 0.2, 3, d.activityThreshold.memberFactorMax),
      memberExponent: clampNum(at.memberExponent, 0.05, 1, d.activityThreshold.memberExponent),
      spamAvgMessagesPerUser: clampNum(at.spamAvgMessagesPerUser, 1, 50, d.activityThreshold.spamAvgMessagesPerUser),
      spamPenaltyPerExcess: clampNum(at.spamPenaltyPerExcess, 0, 1, d.activityThreshold.spamPenaltyPerExcess),
      spamPenaltyCap: clampNum(at.spamPenaltyCap, 0, 2, d.activityThreshold.spamPenaltyCap),
      minUniqueDivisor: Math.floor(clampNum(at.minUniqueDivisor, 2, 50, d.activityThreshold.minUniqueDivisor)),
      uniqueBypassMultiple: clampNum(at.uniqueBypassMultiple, 1, 5, d.activityThreshold.uniqueBypassMultiple),
    },
  };
}

/** Intervallo/fascia/attività dal config.json del bot principale. */
function importMinigameSpawnFromBotConfig(): MinigameSpawn {
  const d = defaultMinigameSpawn();
  try {
    const cfg = require("../../Vinili/config.json") as { minigames?: Record<string, any> };
    const mg = cfg?.minigames;
    if (!mg || typeof mg !== "object") return d;
    return normalizeMinigameSpawn({
      enabled: mg.enabled,
      channelId: mg.channelId,
      roleId: mg.roleId,
      intervalMs: mg.intervalMs,
      noParticipationIntervalMs: mg.noParticipationIntervalMs,
      activityWindowMs: mg.activityWindowMs,
      minMessages: mg.minMessages,
      failsafeMs: mg.failsafeMs,
      timeWindow: mg.timeWindow,
      spawnFreshActivity: mg.spawnFreshActivity,
      activityThreshold: mg.activityThreshold,
    });
  } catch {
    return d;
  }
}

function defaultMinigameGameOptions(): MinigameGameOptions {
  return {
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
}

function normalizeTreasurePairs(raw: unknown, fb: TreasureEmojiPair[]): TreasureEmojiPair[] {
  const list = Array.isArray(raw) ? raw : fb;
  const out: TreasureEmojiPair[] = [];
  for (const row of list) {
    const decoy = String((row as any)?.decoy || "").trim().slice(0, 16);
    const winner = String((row as any)?.winner || "").trim().slice(0, 16);
    if (!decoy || !winner) continue;
    out.push({ decoy, winner });
    if (out.length >= 12) break;
  }
  return out.length ? out : fb.map((p) => ({ ...p }));
}

function normalizeTreasureBuckets(raw: unknown, fb: TreasureBucket[]): TreasureBucket[] {
  const list = Array.isArray(raw) ? raw : fb;
  const out: TreasureBucket[] = [];
  for (const row of list) {
    const r = row && typeof row === "object" ? (row as any) : {};
    const minMessages = Math.floor(clampNum(r.minMessages, 1, 500, 20));
    const maxMessages = Math.floor(clampNum(r.maxMessages, minMessages, 500, Math.max(minMessages, 30)));
    const minDurationMs = Math.floor(clampNum(r.minDurationMs, 15_000, 1_800_000, 60_000));
    const maxDurationMs = Math.floor(clampNum(r.maxDurationMs, minDurationMs, 1_800_000, Math.max(minDurationMs, 120_000)));
    out.push({
      weight: Math.floor(clampNum(r.weight, 1, 100, 1)),
      minMessages,
      maxMessages,
      minDurationMs,
      maxDurationMs,
      rewardExp: Math.floor(clampNum(r.rewardExp, 1, 100_000, 150)),
    });
    if (out.length >= 8) break;
  }
  return out.length ? out : fb.map((b) => ({ ...b }));
}

function normalizeMinigameGameOptions(raw: unknown): MinigameGameOptions {
  const d = defaultMinigameGameOptions();
  const r = raw && typeof raw === "object" ? (raw as any) : {};
  const gn = r.guessNumber && typeof r.guessNumber === "object" ? r.guessNumber : {};
  const hm = r.hangman && typeof r.hangman === "object" ? r.hangman : {};
  const me = r.memoryEmoji && typeof r.memoryEmoji === "object" ? r.memoryEmoji : {};
  const dq = r.drivingQuiz && typeof r.drivingQuiz === "object" ? r.drivingQuiz : {};
  const gp = r.guessPlayer && typeof r.guessPlayer === "object" ? r.guessPlayer : {};
  const gs = r.guessSong && typeof r.guessSong === "object" ? r.guessSong : {};
  const ga = r.guessAlbum && typeof r.guessAlbum === "object" ? r.guessAlbum : {};
  const fb = r.findBotVoice && typeof r.findBotVoice === "object" ? r.findBotVoice : {};
  const th = r.treasureHunt && typeof r.treasureHunt === "object" ? r.treasureHunt : {};
  const minN = Math.floor(clampNum(gn.min, 1, 1_000_000, d.guessNumber.min));
  const maxN = Math.floor(clampNum(gn.max, minN, 1_000_000, Math.max(minN, d.guessNumber.max)));
  return {
    guessNumber: { min: minN, max: maxN },
    hangman: { maxMisses: Math.floor(clampNum(hm.maxMisses, 3, 20, d.hangman.maxMisses)) },
    memoryEmoji: { displayMs: Math.floor(clampNum(me.displayMs, 2_000, 60_000, d.memoryEmoji.displayMs)) },
    drivingQuiz: {
      userAnswerCooldownMs: Math.floor(clampNum(dq.userAnswerCooldownMs, 0, 60_000, d.drivingQuiz.userAnswerCooldownMs)),
    },
    guessPlayer: { onlyFamous: gp.onlyFamous !== false },
    guessSong: { onlyFamous: gs.onlyFamous !== false },
    guessAlbum: { onlyFamousArtists: ga.onlyFamousArtists !== false },
    findBotVoice: { excludedChannelIds: uniqIds(fb.excludedChannelIds, 40) },
    treasureHunt: {
      emojiPairs: normalizeTreasurePairs(th.emojiPairs, d.treasureHunt.emojiPairs),
      buckets: normalizeTreasureBuckets(th.buckets, d.treasureHunt.buckets),
    },
  };
}

function importMinigameGameOptionsFromBotConfig(): MinigameGameOptions {
  const d = defaultMinigameGameOptions();
  try {
    const cfg = require("../../Vinili/config.json") as { minigames?: Record<string, any> };
    const mg = cfg?.minigames;
    if (!mg || typeof mg !== "object") return d;
    return normalizeMinigameGameOptions({
      guessNumber: mg.guessNumber,
      hangman: mg.hangman,
      memoryEmoji: mg.memoryEmoji,
      drivingQuiz: mg.drivingQuiz,
      guessPlayer: mg.guessPlayer,
      guessSong: mg.guessSong,
      guessAlbum: mg.guessAlbum,
      findBotVoice: mg.findBotVoice,
      treasureHunt: mg.treasureHunt,
    });
  } catch {
    return d;
  }
}

/** Unisce tipi nuovi dal catalogo/import senza sovrascrivere quelli già salvati. */
function mergeMinigameScoringWithImport(prevScoring: unknown): MinigameScoring {
  const imported = importMinigameScoringFromBotConfig();
  const prevRaw = prevScoring && typeof prevScoring === "object" ? (prevScoring as any) : {};
  const savedRows = Array.isArray(prevRaw.rewardExpByType) ? prevRaw.rewardExpByType : [];
  const savedTypes = new Set(
    savedRows.map((r: any) => String(r?.type || "").trim()).filter(Boolean),
  );
  if (!savedTypes.size) return imported;
  const normalizedPrev = normalizeMinigameScoring(prevScoring);
  const byType = new Map(normalizedPrev.rewardExpByType.map((r) => [r.type, r]));
  for (const row of imported.rewardExpByType) {
    if (!byType.has(row.type)) byType.set(row.type, row);
  }
  const order = imported.rewardExpByType.map((r) => r.type);
  const rewardExpByType: MinigameRewardExp[] = [];
  for (const type of order) {
    const row = byType.get(type);
    if (row) rewardExpByType.push(row);
  }
  for (const row of normalizedPrev.rewardExpByType) {
    if (!order.includes(row.type)) rewardExpByType.push(row);
  }
  return fillEmptyMinigameDrafts(
    {
      fastGuess: normalizedPrev.fastGuess,
      streak: normalizedPrev.streak,
      rewardExpByType,
      startDraft: normalizedPrev.startDraft,
      winDraft: normalizedPrev.winDraft,
    },
    prevRaw,
  );
}

function normalizeMinigameTypeRow(row: any, def?: MinigameRewardExp | null): MinigameRewardExp | null {
  const type = String(row?.type || def?.type || "").trim().slice(0, 64);
  if (!type) return null;
  const rewardExp = Math.floor(Number(row?.rewardExp ?? def?.rewardExp));
  if (!Number.isFinite(rewardExp) || rewardExp < 1 || rewardExp > 100000) return null;
  const durationMs = Math.floor(
    clampNum(row?.durationMs, 15_000, 1_800_000, def?.durationMs || defaultDurationForType(type)),
  );
  const enabled = row?.enabled === false ? false : true;
  return { type, rewardExp, enabled, durationMs };
}

function normalizeMinigameScoring(raw: unknown): MinigameScoring {
  const d = defaultMinigameScoring();
  const r = raw && typeof raw === "object" ? (raw as any) : {};
  const fg = r.fastGuess && typeof r.fastGuess === "object" ? r.fastGuess : {};
  const st = r.streak && typeof r.streak === "object" ? r.streak : {};
  const byType: MinigameRewardExp[] = [];
  const seen = new Set<string>();
  const savedRows = Array.isArray(r.rewardExpByType) ? r.rewardExpByType : [];
  const defByType = new Map(d.rewardExpByType.map((x) => [x.type, x]));
  const source = savedRows.length
    ? [...savedRows, ...d.rewardExpByType.filter((def) => !savedRows.some((row: any) => String(row?.type || "").trim() === def.type))]
    : d.rewardExpByType;
  for (const row of source) {
    const type = String(row?.type || "").trim().slice(0, 64);
    if (!type || seen.has(type)) continue;
    const normalized = normalizeMinigameTypeRow(row, defByType.get(type) || null);
    if (!normalized) continue;
    seen.add(type);
    byType.push(normalized);
    if (byType.length >= 80) break;
  }
  const base: MinigameScoring = {
    fastGuess: {
      windowMs: Math.floor(clampNum(fg.windowMs, 1000, 300_000, d.fastGuess.windowMs)),
      multiplier: clampNum(fg.multiplier, 1, 10, d.fastGuess.multiplier),
    },
    streak: {
      bonusPercentPerWin: Math.floor(clampNum(st.bonusPercentPerWin, 0, 100, d.streak.bonusPercentPerWin)),
      maxBonusPercent: Math.floor(clampNum(st.maxBonusPercent, 0, 500, d.streak.maxBonusPercent)),
    },
    rewardExpByType: byType.length ? byType : d.rewardExpByType,
    startDraft: optionalMinigameDraft(r.startDraft) || d.startDraft,
    winDraft: optionalMinigameDraft(r.winDraft) || d.winDraft,
  };
  return fillEmptyMinigameDrafts(base, r);
}

function defaultActivityWinners(): ActivityWinnersConfig {
  try {
    const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
    const staffKeys = ["Staff", "HighStaff", "Helper", "Mod", "SeniorModerator", "Director", "Admin", "Manager", "Founder"];
    return {
      channelId: T.isId((IDs as any)?.channels?.topWeeklyUser) ? String((IDs as any).channels.topWeeklyUser) : null,
      excludedRoleIds: staffKeys.map((k) => String((IDs as any)?.roles?.[k] || "")).filter((id) => T.isId(id)),
      weeklyTextRoleId: T.isId((IDs as any)?.roles?.TopWeeklyText) ? String((IDs as any).roles.TopWeeklyText) : null,
      weeklyVoiceRoleId: T.isId((IDs as any)?.roles?.TopWeeklyVoc) ? String((IDs as any).roles.TopWeeklyVoc) : null,
      weeklyMinigameRoleId: T.isId((IDs as any)?.roles?.MVP) ? String((IDs as any).roles.MVP) : null,
      monthlyMemberRoleId: T.isId((IDs as any)?.roles?.TopMonthlyMember) ? String((IDs as any).roles.TopMonthlyMember) : null,
    };
  } catch {
    return {
      channelId: null,
      excludedRoleIds: [],
      weeklyTextRoleId: null,
      weeklyVoiceRoleId: null,
      weeklyMinigameRoleId: null,
      monthlyMemberRoleId: null,
    };
  }
}

function normalizeActivityWinners(raw: unknown): ActivityWinnersConfig {
  const d = defaultActivityWinners();
  const r = raw && typeof raw === "object" ? (raw as any) : {};
  return {
    channelId: T.isId(r.channelId) ? String(r.channelId) : d.channelId,
    excludedRoleIds: Array.isArray(r.excludedRoleIds) ? uniqIds(r.excludedRoleIds, 40) : d.excludedRoleIds,
    weeklyTextRoleId: T.isId(r.weeklyTextRoleId) ? String(r.weeklyTextRoleId) : d.weeklyTextRoleId,
    weeklyVoiceRoleId: T.isId(r.weeklyVoiceRoleId) ? String(r.weeklyVoiceRoleId) : d.weeklyVoiceRoleId,
    weeklyMinigameRoleId: T.isId(r.weeklyMinigameRoleId) ? String(r.weeklyMinigameRoleId) : d.weeklyMinigameRoleId,
    monthlyMemberRoleId: T.isId(r.monthlyMemberRoleId) ? String(r.monthlyMemberRoleId) : d.monthlyMemberRoleId,
  };
}

function defaultLevelCurve(): LevelCurve {
  return {
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
}

function normalizeLevelCurve(raw: unknown): LevelCurve {
  const d = defaultLevelCurve();
  const r = raw && typeof raw === "object" ? (raw as any) : {};
  const segments: LevelCurveSegment[] = [];
  for (const row of Array.isArray(r.segments) ? r.segments : d.segments) {
    const upTo = Math.floor(Number(row?.upTo));
    const base = Math.floor(Number(row?.base));
    const from = Math.floor(Number(row?.from));
    const perLevel = Math.floor(Number(row?.perLevel));
    if (!Number.isFinite(upTo) || upTo < 1 || upTo > 100000) continue;
    if (!Number.isFinite(base) || base < 1 || base > 1_000_000) continue;
    if (!Number.isFinite(from) || from < 0 || from > 100000) continue;
    if (!Number.isFinite(perLevel) || perLevel < 0 || perLevel > 1_000_000) continue;
    segments.push({ upTo, base, from, perLevel });
    if (segments.length >= 12) break;
  }
  return {
    firstThreshold: Math.floor(clampNum(r.firstThreshold, 1, 1_000_000, d.firstThreshold)),
    roundTo: Math.floor(clampNum(r.roundTo, 1, 1000, d.roundTo)),
    minStepAdd: Math.floor(clampNum(r.minStepAdd, 0, 1_000_000, d.minStepAdd)),
    segments: (segments.length ? segments : d.segments).sort((a, b) => a.upTo - b.upTo),
  };
}

function normalizeWelcomeWords(raw: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of Array.isArray(raw) ? raw : []) {
    const s = String(w || "").trim().slice(0, 80);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 80) break;
  }
  return out;
}

function normalizeExpBonus(raw: unknown, fb: ExpBonus, kind: "firstMessageDaily" | "welcomeGreeting"): ExpBonus {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const notice = String(r.noticeTemplate ?? fb.noticeTemplate ?? "").trim().slice(0, 500);
  /* niente draft salvato: se c'era un testo personalizzato diventa il testo del messaggio */
  const customTemplate = typeof r.noticeTemplate === "string" && r.noticeTemplate.trim() && r.noticeTemplate.trim() !== fb.noticeTemplate ? notice : "";
  const out: ExpBonus = {
    enabled: r.enabled !== false,
    amount: clampNum(r.amount, 0, 100000, fb.amount),
    channelIds: uniqIds(r.channelIds, 20),
    noticeTemplate: notice || fb.noticeTemplate,
    noticeDraft: r.noticeDraft && typeof r.noticeDraft === "object" ? T.normalizeDraft(r.noticeDraft) : defaultBonusDraft(kind, customTemplate || undefined),
  };
  if (kind === "welcomeGreeting") {
    out.words = Array.isArray(r.words) ? normalizeWelcomeWords(r.words) : Array.isArray(fb.words) ? fb.words : [];
  }
  return out;
}

function normalizeCooldownRoleSec(raw: unknown, fb: number) {
  return Math.floor(clampNum(raw, 0, 3600, fb));
}

function normalizeCommandCooldown(raw: unknown): LevelsConfig["commandCooldown"] {
  const d = defaultCommandCooldown();
  const r = raw && typeof raw === "object" ? (raw as any) : {};
  const rolesRaw = r.roles && typeof r.roles === "object" ? r.roles : {};
  const tiers: CooldownTier[] = [];
  for (const row of Array.isArray(r.tiers) ? r.tiers : d.tiers) {
    const minLevel = Math.floor(Number(row?.minLevel));
    const seconds = Math.floor(Number(row?.seconds));
    if (!Number.isFinite(minLevel) || minLevel < 1 || minLevel > 10000) continue;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600) continue;
    tiers.push({ minLevel, seconds });
    if (tiers.length >= 20) break;
  }
  const customRoles: CooldownCustomRole[] = [];
  const seenRoles = new Set<string>();
  for (const row of Array.isArray(r.customRoles) ? r.customRoles : []) {
    const roleId = String(row?.roleId || "").trim();
    const seconds = Math.floor(Number(row?.seconds));
    if (!T.isId(roleId) || seenRoles.has(roleId) || !Number.isFinite(seconds) || seconds < 0 || seconds > 3600) continue;
    seenRoles.add(roleId);
    customRoles.push({ roleId, seconds });
    if (customRoles.length >= 40) break;
  }
  return {
    defaultSeconds: Math.floor(clampNum(r.defaultSeconds, 0, 3600, d.defaultSeconds)),
    tiers: (tiers.length ? tiers : d.tiers).sort((a, b) => b.minLevel - a.minLevel),
    roles: {
      staff: normalizeCooldownRoleSec(rolesRaw.staff, d.roles.staff),
      vipPlus: normalizeCooldownRoleSec(rolesRaw.vipPlus, d.roles.vipPlus),
      vip: normalizeCooldownRoleSec(rolesRaw.vip, d.roles.vip),
      doubleBooster: normalizeCooldownRoleSec(rolesRaw.doubleBooster, d.roles.doubleBooster),
      booster: normalizeCooldownRoleSec(rolesRaw.booster, d.roles.booster),
    },
    customRoles,
  };
}

function defaultCommandCooldown(): LevelsConfig["commandCooldown"] {
  return {
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
    customRoles: [],
  };
}

function defaultMinigameRewardDraft() {
  return T.normalizeDraft({
    content: "{user}",
    mentionUsers: true,
    embed: {
      enabled: true,
      title: "",
      description: [
        "<a:VC_Events:1482706144953897223> Premio ricevuto",
        "",
        "**{user}** hai ottenuto il ruolo {role} per aver raggiunto **{exp}** exp ai Minigiochi",
        "",
        "{next}",
      ].join("\n"),
      color: "#826bc2",
      imageUrl: "",
      thumbnailUrl: "",
      footerText: "Gli exp dei minigiochi si sommano al livello globale.",
      timestamp: false,
      authorName: "{username}",
      authorIconUrl: "{avatar}",
      fields: [],
    },
  });
}

function defaultBonuses(): LevelsConfig["bonuses"] {
  let chatId: string | null = null;
  try {
    const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
    chatId = T.isId((IDs as any)?.channels?.chat) ? String((IDs as any).channels.chat) : null;
  } catch {
    chatId = null;
  }
  return {
    firstMessageDaily: {
      enabled: true,
      amount: 150,
      channelIds: chatId ? [chatId] : [],
      noticeTemplate: "Sei stato/a il primo a scrivere oggi in chat!\n**{amount} exp** guadagnati!\n{user}",
      noticeDraft: defaultBonusDraft("firstMessageDaily"),
    },
    welcomeGreeting: {
      enabled: true,
      amount: 30,
      channelIds: [],
      noticeTemplate: "Grazie per il benvenuto!\n**{amount} exp** guadagnati!\n{user}",
      noticeDraft: defaultBonusDraft("welcomeGreeting"),
      words: [],
    },
  };
}

function defaultConfig(): LevelsConfig {
  return {
    seedVersion: 0,
    userSaved: false,
    messageEnabled: true,
    voiceEnabled: true,
    messageExp: 2,
    voiceExpPerMinute: 5,
    messageCooldownSec: 0,
    globalMultiplier: 1,
    lockedChannelIds: [],
    ignoredRoleIds: [],
    roleMultipliers: [],
    levelUpChannelId: null,
    levelUpDraft: defaultLevelUpDraft(),
    milestoneDraft: defaultMilestoneDraft(),
    roleRewards: [],
    perksEnabled: true,
    perksChannelId: null,
    perksDraft: defaultPerksDraft(),
    perkRoleId: null,
    perkMinLevel: 10,
    maxCombinedMultiplier: 8,
    bonuses: defaultBonuses(),
    minigameRewards: defaultMinigameRewards(),
    minigameRewardChannelId: null,
    minigameRewardDraft: defaultMinigameRewardDraft(),
    reviewRewardLevels: 5,
    commandCooldown: defaultCommandCooldown(),
    minigameScoring: defaultMinigameScoring(),
    minigameSpawn: defaultMinigameSpawn(),
    minigameGameOptions: defaultMinigameGameOptions(),
    activityWinners: defaultActivityWinners(),
    levelCurve: defaultLevelCurve(),
  };
}

function normalizeConfig(raw?): LevelsConfig {
  const r = raw && typeof raw === "object" ? raw : {};
  const base = defaultConfig();
  return {
    seedVersion: Math.max(0, Math.floor(Number(r.seedVersion) || 0)),
    userSaved: r.userSaved === true,
    messageEnabled: r.messageEnabled !== false,
    voiceEnabled: r.voiceEnabled !== false,
    messageExp: clampNum(r.messageExp, 0, 500, base.messageExp),
    voiceExpPerMinute: clampNum(r.voiceExpPerMinute, 0, 500, base.voiceExpPerMinute),
    messageCooldownSec: clampNum(r.messageCooldownSec, 0, 3600, 0),
    globalMultiplier: clampNum(r.globalMultiplier, 0.1, 50, base.globalMultiplier),
    lockedChannelIds: uniqIds(r.lockedChannelIds, 80),
    ignoredRoleIds: uniqIds(r.ignoredRoleIds, 40),
    roleMultipliers: normalizeRoleMultipliers(r.roleMultipliers),
    levelUpChannelId: T.isId(r.levelUpChannelId) ? String(r.levelUpChannelId) : null,
    levelUpDraft: r.levelUpDraft && typeof r.levelUpDraft === "object" ? T.normalizeDraft(r.levelUpDraft) : defaultLevelUpDraft(),
    milestoneDraft: r.milestoneDraft && typeof r.milestoneDraft === "object" ? T.normalizeDraft(r.milestoneDraft) : defaultMilestoneDraft(),
    roleRewards: normalizeRoleRewards(r.roleRewards),
    perksEnabled: r.perksEnabled !== false,
    perksChannelId: T.isId(r.perksChannelId) ? String(r.perksChannelId) : null,
    perksDraft: r.perksDraft && typeof r.perksDraft === "object" ? T.normalizeDraft(r.perksDraft) : defaultPerksDraft(),
    perkRoleId: T.isId(r.perkRoleId) ? String(r.perkRoleId) : null,
    perkMinLevel: Math.floor(clampNum(r.perkMinLevel, 0, 10000, 10)),
    maxCombinedMultiplier: clampNum(r.maxCombinedMultiplier, 1, 50, 8),
    /* lista mai salvata = quelli di sempre; lista vuota salvata = nessun premio */
    minigameRewards: Array.isArray(r.minigameRewards) ? normalizeMinigameRewards(r.minigameRewards) : defaultMinigameRewards(),
    minigameRewardChannelId: T.isId(r.minigameRewardChannelId) ? String(r.minigameRewardChannelId) : null,
    minigameRewardDraft:
      r.minigameRewardDraft && typeof r.minigameRewardDraft === "object"
        ? T.normalizeDraft(r.minigameRewardDraft)
        : defaultMinigameRewardDraft(),
    reviewRewardLevels: Math.floor(clampNum(r.reviewRewardLevels, 0, 100, 5)),
    commandCooldown: normalizeCommandCooldown(r.commandCooldown),
    minigameScoring: normalizeMinigameScoring(r.minigameScoring),
    minigameSpawn: r.minigameSpawn ? normalizeMinigameSpawn(r.minigameSpawn) : importMinigameSpawnFromBotConfig(),
    minigameGameOptions: r.minigameGameOptions
      ? normalizeMinigameGameOptions(r.minigameGameOptions)
      : importMinigameGameOptionsFromBotConfig(),
    activityWinners: normalizeActivityWinners(r.activityWinners),
    levelCurve: normalizeLevelCurve(r.levelCurve),
    bonuses: {
      firstMessageDaily: normalizeExpBonus(r.bonuses?.firstMessageDaily, base.bonuses.firstMessageDaily, "firstMessageDaily"),
      welcomeGreeting: normalizeExpBonus(r.bonuses?.welcomeGreeting, base.bonuses.welcomeGreeting, "welcomeGreeting"),
    },
  };
}

function remember(guildId: string, cfg: LevelsConfig) {
  cache.set(String(guildId), { at: Date.now(), cfg });
  return cfg;
}

async function getConfig(guildId: string, fresh = false): Promise<LevelsConfig> {
  const gid = String(guildId || "");
  if (!gid) return defaultConfig();
  if (!fresh) {
    const hit = cache.get(gid);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cfg;
  }
  const cfg = normalizeConfig(await T.getGuildBlob("levels", gid, fresh));
  if (!T.isMainGuild(gid)) cfg.reviewRewardLevels = 0;
  return remember(gid, cfg);
}

function getConfigSync(guildId?: string): LevelsConfig | null {
  const hit = cache.get(String(guildId || ""));
  return hit?.cfg || null;
}

async function saveConfig(guildId: string, raw?): Promise<LevelsConfig> {
  const gid = String(guildId || "");
  const prev = await getConfig(gid, true);
  const next = normalizeConfig({
    ...prev,
    ...(raw && typeof raw === "object" ? raw : {}),
    seedVersion: Math.max(prev.seedVersion, SEED_VERSION),
    userSaved: true,
  });
  /* premio recensione sito: solo sul principale */
  if (!T.isMainGuild(gid)) next.reviewRewardLevels = 0;
  await T.setGuildBlob("levels", gid, next);
  remember(gid, next);
  await syncGlobalSettingsFromConfig(gid, next).catch(() => null);
  return next;
}

/** Ruoli moltiplicatore di default dal catalogo IDs (solo seed principale). */
function defaultRoleMultipliersFromIds(): RoleMult[] {
  try {
    const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
    const defs: [string, number][] = [
      ["ServerBooster", 2],
      ["MVP", 2],
      ["DoubleBooster", 3],
      ["Donator", 4],
      ["VIP", 5],
      ["VIPplus", 6],
      ["birthdayFlair", 2],
      ["Level100", 1.15],
      ["Level120", 1.2],
      ["Level150", 1.25],
      ["Level200", 1.3],
      ["Level250", 1.35],
      ["Level300", 1.4],
      ["Level350", 1.45],
      ["Level400", 1.5],
      ["Level450", 1.55],
      ["Level500", 1.6],
      ["Level550", 1.65],
      ["Level600", 1.7],
      ["Level650", 1.75],
      ["Level700", 1.8],
      ["Level750", 1.85],
      ["Level800", 1.9],
      ["Level850", 1.95],
      ["Level900", 2],
      ["Level950", 2.05],
      ["Level1000", 2.1],
    ];
    const out: RoleMult[] = [];
    for (const [key, multiplier] of defs) {
      const roleId = String((IDs as any)?.roles?.[key] || "").trim();
      if (T.isId(roleId)) out.push({ roleId, multiplier });
    }
    return out;
  } catch {
    return [];
  }
}

function defaultRoleRewardsFromIds(): RoleReward[] {
  try {
    const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
    const rows: [number, string][] = [
      [10, "Level10"],
      [20, "Level20"],
      [30, "Level30"],
      [50, "Level50"],
      [70, "Level70"],
      [100, "Level100"],
      [125, "Level120"],
      [150, "Level150"],
      [200, "Level200"],
    ];
    const out: RoleReward[] = [];
    for (const [level, key] of rows) {
      const roleId = String((IDs as any)?.roles?.[key] || "").trim();
      if (T.isId(roleId)) out.push({ level, roleId });
    }
    return out;
  } catch {
    return [];
  }
}

/** Prima visita sul principale: importa tassi/ruoli/canale attuali del bot. */
async function ensureMainSeed(guildId?): Promise<boolean> {
  const gid = String(guildId || "");
  if (!T.isMainGuild(gid)) return false;
  const prev = await T.getGuildBlob("levels", gid, true);
  if (prev && Number(prev.seedVersion) >= SEED_VERSION) {
    remember(gid, normalizeConfig(prev));
    return false;
  }

  /* Upgrade seed: catalogo minigiochi + draft condivisi + spawn (+ seedVersion), senza resettare i livelli. */
  if (prev && Number(prev.seedVersion) >= 1) {
    const base = prev.userSaved
      ? mergeMinigameScoringWithImport(prev.minigameScoring)
      : importMinigameScoringFromBotConfig();
    const spawn = prev.minigameSpawn
      ? normalizeMinigameSpawn(prev.minigameSpawn)
      : importMinigameSpawnFromBotConfig();
    const gameOpts = prev.minigameGameOptions
      ? normalizeMinigameGameOptions(prev.minigameGameOptions)
      : importMinigameGameOptionsFromBotConfig();
    const seed = normalizeConfig({
      ...prev,
      seedVersion: SEED_VERSION,
      minigameScoring: fillEmptyMinigameDrafts(base, prev.minigameScoring),
      minigameSpawn: spawn,
      minigameGameOptions: gameOpts,
    });
    await T.setGuildBlob("levels", gid, seed);
    remember(gid, seed);
    return false;
  }

  const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
  let globalMultiplier = 1;
  let lockedChannelIds: string[] = [];
  let ignoredRoleIds: string[] = [];
  let roleMultipliers = defaultRoleMultipliersFromIds();
  try {
    const { GlobalSettings } = require("../../Vinili/Community/schemas/communitySchemas") as typeof import("../../Vinili/Community/schemas/communitySchemas");
    const doc = await GlobalSettings.findOne({ guildId: gid }).lean().catch(() => null);
    if (doc) {
      const m = Number(doc.expMultiplier);
      if (Number.isFinite(m) && m > 0) globalMultiplier = m;
      lockedChannelIds = uniqIds(doc.expLockedChannelIds, 80);
      ignoredRoleIds = uniqIds(doc.expIgnoredRoleIds, 40);
      const dbMap = doc.expRoleMultipliers && typeof doc.expRoleMultipliers === "object" ? doc.expRoleMultipliers : {};
      const merged = new Map(roleMultipliers.map((r) => [r.roleId, r.multiplier]));
      for (const [k, v] of Object.entries(dbMap)) {
        if (!T.isId(k)) continue;
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) merged.set(String(k), n);
      }
      roleMultipliers = [...merged.entries()].map(([roleId, multiplier]) => ({ roleId, multiplier }));
    }
  } catch (_) {}

  const seed = normalizeConfig({
    ...(prev || {}),
    seedVersion: SEED_VERSION,
    messageEnabled: true,
    voiceEnabled: true,
    messageExp: 2,
    voiceExpPerMinute: 5,
    messageCooldownSec: 0,
    globalMultiplier,
    lockedChannelIds,
    ignoredRoleIds,
    roleMultipliers,
    levelUpChannelId: prev?.levelUpChannelId || (IDs as any)?.channels?.commands || null,
    roleRewards: Array.isArray(prev?.roleRewards) && prev.roleRewards.length ? prev.roleRewards : defaultRoleRewardsFromIds(),
    perkRoleId: prev?.perkRoleId || (IDs as any)?.roles?.PicPerms || null,
    perkMinLevel: 10,
    maxCombinedMultiplier: 8,
    levelUpDraft: prev?.levelUpDraft || defaultLevelUpDraft(),
    milestoneDraft: prev?.milestoneDraft || defaultMilestoneDraft(),
    minigameScoring: fillEmptyMinigameDrafts(importMinigameScoringFromBotConfig()),
    minigameSpawn: importMinigameSpawnFromBotConfig(),
    minigameGameOptions: importMinigameGameOptionsFromBotConfig(),
  });
  await T.setGuildBlob("levels", gid, seed);
  remember(gid, seed);
  return !prev;
}

async function syncGlobalSettingsFromConfig(guildId: string, cfg: LevelsConfig) {
  if (!T.isMainGuild(guildId)) return;
  try {
    const { GlobalSettings } = require("../../Vinili/Community/schemas/communitySchemas") as typeof import("../../Vinili/Community/schemas/communitySchemas");
    const expRoleMultipliers: Record<string, number> = {};
    for (const row of cfg.roleMultipliers) expRoleMultipliers[row.roleId] = row.multiplier;
    await GlobalSettings.findOneAndUpdate(
      { guildId: String(guildId) },
      {
        $set: {
          expMultiplier: cfg.globalMultiplier,
          expLockedChannelIds: cfg.lockedChannelIds,
          expIgnoredRoleIds: cfg.ignoredRoleIds,
          expRoleMultipliers,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    try {
      const { invalidateSettingsCache } = require("../../Vinili/Level/services/expService") as any;
      invalidateSettingsCache?.(guildId);
    } catch (_) {}
    try {
      const { settingsCache } = require("../../Vinili/Level/services/expMultipliers") as typeof import("../../Vinili/Level/services/expMultipliers");
      settingsCache.delete(String(guildId));
    } catch (_) {}
  } catch (_) {}
}

function levelsActive(guildId?): boolean {
  const gid = String(guildId || "");
  if (!gid || !moduleOn(gid)) return false;
  /* finché il modulo è mainOnly, resta sul principale */
  return T.isMainGuild(gid);
}

async function getMessageExp(guildId?: string) {
  const cfg = await getConfig(String(guildId || ""));
  if (!cfg.messageEnabled) return 0;
  return Math.max(0, Math.floor(cfg.messageExp));
}

async function getVoiceExpPerMinute(guildId?: string) {
  const cfg = await getConfig(String(guildId || ""));
  if (!cfg.voiceEnabled) return 0;
  return Math.max(0, Math.floor(cfg.voiceExpPerMinute));
}

/** Premi minigiochi del server (sincrono, dalla cache; senza cache quelli di sempre). */
function getMinigameRewardsSync(guildId?: string): MinigameReward[] {
  const cfg = getConfigSync(guildId);
  if (cfg && (cfg.userSaved || cfg.seedVersion > 0)) return cfg.minigameRewards;
  return defaultMinigameRewards();
}

/* ── evento EXP a tempo (dashboard Livelli) ── */
async function getExpEvent(guildId?: string) {
  try {
    const { GlobalSettings } = require("../../Vinili/Community/schemas/communitySchemas") as typeof import("../../Vinili/Community/schemas/communitySchemas");
    const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
    const doc: any = await GlobalSettings.findOne({ guildId: String(IDs.guilds.main || guildId || "") }).select("expEventMultiplier expEventMultiplierExpiresAt").lean().catch(() => null);
    const multiplier = Number(doc?.expEventMultiplier) || 1;
    const expiresAt = doc?.expEventMultiplierExpiresAt ? new Date(doc.expEventMultiplierExpiresAt) : null;
    const active = multiplier !== 1 && Boolean(expiresAt && expiresAt.getTime() > Date.now());
    return { active, multiplier: active ? multiplier : 1, expiresAt: active && expiresAt ? expiresAt.toISOString() : null };
  } catch {
    return { active: false, multiplier: 1, expiresAt: null };
  }
}

/* ── eventi EXP programmati (partono da soli all'ora scelta) ── */
type ScheduledExpEvent = {
  id: string;
  multiplier: number;
  durationMs: number;
  startAt: string;
  createdBy: string;
  createdAt: string;
  announceEnabled: boolean;
  announceChannelId: string | null;
  announceContent: string;
};
const MAX_SCHEDULED_EVENTS = 20;

function normalizeScheduled(raw: unknown): ScheduledExpEvent[] {
  const out: ScheduledExpEvent[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const multiplier = Number((r as any)?.multiplier);
    const durationMs = Math.floor(Number((r as any)?.durationMs));
    const start = new Date((r as any)?.startAt).getTime();
    if (!Number.isFinite(multiplier) || multiplier < 1.05 || multiplier > 10) continue;
    if (!Number.isFinite(durationMs) || durationMs < 60_000) continue;
    if (!Number.isFinite(start)) continue;
    const announceChannelId = T.isId((r as any)?.announceChannelId) ? String((r as any).announceChannelId) : null;
    out.push({
      id: String((r as any)?.id || "").slice(0, 40) || Math.random().toString(36).slice(2, 12),
      multiplier,
      durationMs,
      startAt: new Date(start).toISOString(),
      createdBy: String((r as any)?.createdBy || ""),
      createdAt: String((r as any)?.createdAt || new Date().toISOString()),
      announceEnabled: (r as any)?.announceEnabled === true,
      announceChannelId,
      announceContent: String((r as any)?.announceContent || "").trim().slice(0, 2000),
    });
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, MAX_SCHEDULED_EVENTS);
}

async function listScheduledEvents(guildId?: string, fresh = false): Promise<ScheduledExpEvent[]> {
  const blob = await T.getGuildBlob("levelsEvents", String(guildId || ""), fresh).catch(() => null);
  return normalizeScheduled(blob?.scheduled);
}

async function saveScheduledEvents(guildId: string, list: ScheduledExpEvent[]) {
  await T.setGuildBlob("levelsEvents", guildId, list.length ? { scheduled: normalizeScheduled(list) } : null);
}

async function scheduleExpEvent(
  guildId?: string,
  ev: {
    multiplier: number;
    durationMs: number;
    startAt: string | number;
    actorId?: string;
    announceEnabled?: boolean;
    announceChannelId?: string | null;
    announceContent?: string;
  } = {} as any,
) {
  const gid = String(guildId || "");
  const list = await listScheduledEvents(gid, true);
  if (list.length >= MAX_SCHEDULED_EVENTS) return { ok: false, message: `Massimo ${MAX_SCHEDULED_EVENTS} eventi programmati.` };
  const startAt = new Date(ev.startAt).toISOString();
  list.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    multiplier: ev.multiplier,
    durationMs: ev.durationMs,
    startAt,
    createdBy: String(ev.actorId || ""),
    createdAt: new Date().toISOString(),
    announceEnabled: ev.announceEnabled === true,
    announceChannelId: T.isId(ev.announceChannelId) ? String(ev.announceChannelId) : null,
    announceContent: String(ev.announceContent || "").trim().slice(0, 2000),
  });
  await saveScheduledEvents(gid, list);
  return { ok: true, scheduled: await listScheduledEvents(gid, true) };
}

async function sendScheduledExpEventAnnounce(client?, ev: ScheduledExpEvent) {
  if (!ev?.announceEnabled || !ev.announceContent?.trim()) return false;
  try {
    const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
    const { GlobalSettings } = require("../../Vinili/Community/schemas/communitySchemas") as typeof import("../../Vinili/Community/schemas/communitySchemas");
    const { getClientChannelCached } = require("../../shared/discord/interactionEntityCache") as typeof import("../../shared/discord/interactionEntityCache");
    const channelId = ev.announceChannelId || String(IDs.channels?.eventAnnouncements || "").trim();
    if (!/^\d{5,30}$/.test(channelId)) return false;
    const key = `dash:${ev.id}`;
    const gid = String(IDs.guilds?.main || "");
    await GlobalSettings.findOneAndUpdate(
      { guildId: gid },
      { $setOnInsert: { guildId: gid, expEventStartAnnouncementsSent: [] } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    const claimed = await GlobalSettings.findOneAndUpdate(
      { guildId: gid, expEventStartAnnouncementsSent: { $nin: [key] } },
      { $addToSet: { expEventStartAnnouncementsSent: key } },
      { new: true },
    ).catch(() => null);
    if (!claimed) return false;
    const channel = await getClientChannelCached(client, channelId).catch(() => null);
    if (!channel?.send) {
      await GlobalSettings.updateOne({ guildId: gid }, { $pull: { expEventStartAnnouncementsSent: key } }).catch(() => null);
      return false;
    }
    const content = String(ev.announceContent)
      .replaceAll("{mult}", String(ev.multiplier))
      .replaceAll("{multiplier}", String(ev.multiplier))
      .trim();
    const roleIds = [...content.matchAll(/<@&(\d{5,30})>/g)].map((m) => m[1]);
    await channel.send({
      content,
      allowedMentions: {
        parse: /@everyone\b|@here\b/.test(content) ? ["everyone"] : [],
        roles: [...new Set(roleIds)],
        users: [],
      },
    });
    return true;
  } catch (err) {
    global.logger?.warn?.("[levels] exp event announce:", (err as any)?.message || err);
    return false;
  }
}

async function cancelScheduledEvent(guildId?: string, id?: string) {
  const gid = String(guildId || "");
  const list = await listScheduledEvents(gid, true);
  await saveScheduledEvents(gid, list.filter((e) => e.id !== String(id)));
  return listScheduledEvents(gid, true);
}

/** Fa partire subito un evento programmato (durata piena da adesso). */
async function startScheduledEventNow(guildId?: string, id?: string) {
  const gid = String(guildId || "");
  const list = await listScheduledEvents(gid, true);
  const ev = list.find((e) => e.id === String(id));
  if (!ev) return null;
  await saveScheduledEvents(gid, list.filter((e) => e.id !== ev.id));
  return setExpEvent(gid, ev.multiplier, ev.durationMs);
}

/** Avvia gli eventi arrivati all'ora (finiscono comunque all'ora prevista: inizio + durata). */
async function runDueScheduledEvents(guildId?: string, client?) {
  const gid = String(guildId || "");
  if (!gid) return 0;
  const list = await listScheduledEvents(gid, true);
  const now = Date.now();
  const due = list.filter((e) => new Date(e.startAt).getTime() <= now);
  if (!due.length) return 0;
  await saveScheduledEvents(gid, list.filter((e) => !due.includes(e)));
  /* se ne scadono più insieme vale l'ultimo iniziato ancora in corso */
  const live = due.filter((e) => new Date(e.startAt).getTime() + e.durationMs > now).sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
  if (live) await setExpEvent(gid, live.multiplier, new Date(live.startAt).getTime() + live.durationMs - now);
  if (client) {
    for (const ev of due) await sendScheduledExpEventAnnounce(client, ev).catch(() => null);
  }
  return due.length;
}

let eventTicker: NodeJS.Timeout | null = null;
/** Controllo ogni 30 secondi degli eventi programmati del server principale (un solo processo lo avvia). */
function startScheduledEventsTicker(client?) {
  if (eventTicker) return;
  const IDs = require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
  const tick = () => void runDueScheduledEvents(String(IDs.guilds.main || ""), client).catch(() => null);
  eventTicker = setInterval(tick, 30_000);
  eventTicker.unref?.();
  tick();
}

async function setExpEvent(guildId?: string, multiplier?: number, durationMs?: number) {
  const { setTemporaryEventMultiplier } = require("../../Vinili/Level/services/expService") as typeof import("../../Vinili/Level/services/expService");
  /* fermarlo = moltiplicatore 1 che scade subito */
  if (!multiplier || multiplier === 1 || !durationMs) await setTemporaryEventMultiplier(String(guildId || ""), 1, 60 * 1000);
  else await setTemporaryEventMultiplier(String(guildId || ""), multiplier, durationMs);
  try {
    const { settingsCache } = require("../../Vinili/Level/services/expMultipliers") as typeof import("../../Vinili/Level/services/expMultipliers");
    settingsCache.clear();
  } catch (_) {}
  return getExpEvent(guildId);
}

/* ── EXP di un utente (scheda Utenti della dashboard) ── */
async function getUserLevel(guildId?: string, userId?: string) {
  const { ActivityUserProfile } = require("../../Vinili/Community/schemas/communitySchemas") as typeof import("../../Vinili/Community/schemas/communitySchemas");
  const { getLevelInfo, getTotalExpForLevel } = require("../../Vinili/Level/services/expService") as typeof import("../../Vinili/Level/services/expService");
  const row: any = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) }).select("profile.totals.exp.totalExp profile.totals.exp.weeklyExp").lean().catch(() => null);
  const totalExp = Math.max(0, Math.floor(Number(row?.profile?.totals?.exp?.totalExp || 0)));
  const info: any = getLevelInfo(totalExp);
  const level = Number(info?.level || 0);
  return {
    userId: String(userId),
    totalExp,
    weeklyExp: Math.max(0, Math.floor(Number(row?.profile?.totals?.exp?.weeklyExp || 0))),
    level,
    levelStartExp: getTotalExpForLevel(level),
    nextLevelExp: getTotalExpForLevel(level + 1),
  };
}

/**
 * Imposta / aggiunge / toglie livelli o EXP, azzera, risincronizza i ruoli (dashboard Livelli).
 * I ruoli premio si aggiornano subito se il bot ha il server in memoria, altrimenti al prossimo messaggio.
 */
async function mutateUserLevel(client?, guildId?: string, userId?: string, actorId?: string, body: Record<string, any> = {}) {
  const { ActivityUserProfile } = require("../../Vinili/Community/schemas/communitySchemas") as typeof import("../../Vinili/Community/schemas/communitySchemas");
  const { getLevelInfo, getTotalExpForLevel, recordLevelHistory, syncLevelRolesForMember } = require("../../Vinili/Level/services/expService") as typeof import("../../Vinili/Level/services/expService");
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!T.isId(uid)) return { ok: false, message: "Utente non valido." };
  const action = String(body.action || "");
  const mode = body.mode === "level" ? "level" : "exp";
  const value = Math.floor(Number(body.value));
  const before = await getUserLevel(gid, uid);
  if (action !== "syncroles") {
    let afterExp = before.totalExp;
    if (action === "set") {
      if (!Number.isFinite(value) || value < 0) return { ok: false, message: "Valore non valido." };
      afterExp = mode === "exp" ? value : getTotalExpForLevel(value);
    } else if (action === "add" || action === "remove") {
      if (!Number.isFinite(value) || value <= 0) return { ok: false, message: "Valore non valido." };
      const sign = action === "add" ? 1 : -1;
      afterExp = mode === "exp" ? before.totalExp + sign * value : getTotalExpForLevel(Math.max(0, before.level + sign * value));
    } else if (action === "reset") {
      afterExp = 0;
    } else {
      return { ok: false, message: "Azione non valida." };
    }
    afterExp = Math.max(0, Math.min(2_000_000_000, Math.floor(afterExp)));
    const level = Number((getLevelInfo(afterExp) as any)?.level || 0);
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $set: { "profile.totals.exp.totalExp": afterExp, "profile.totals.exp.level": level }, $setOnInsert: { guildId: gid, userId: uid } },
      { upsert: true },
    );
    await recordLevelHistory({ guildId: gid, userId: uid, actorId: String(actorId || ""), action: `dashboard_${action}`, beforeExp: before.totalExp, afterExp, note: "Dashboard › Livelli › Utenti" }).catch(() => null);
  }
  const after = await getUserLevel(gid, uid);
  let rolesSynced = false;
  const guild = client?.guilds?.cache?.get?.(gid);
  if (guild) {
    rolesSynced = await syncLevelRolesForMember(guild, uid, after.level).then(() => true).catch(() => false);
  }
  return { ok: true, before, user: after, rolesSynced };
}

function roleRewardMap(cfg: LevelsConfig): Map<number, string> {
  return new Map(cfg.roleRewards.map((r) => [r.level, r.roleId]));
}

function roleMultiplierMap(cfg: LevelsConfig): Map<string, number> {
  /* finché Livelli non è seedato/salvato, usa i default IDs (Donator×4, VIP×5, …) —
     altrimenti {expmult} negli annunci resta 1 mentre l'EXP reale usa già quei valori. */
  const map = new Map<string, number>();
  if (!cfg.userSaved || !cfg.roleMultipliers.length) {
    for (const row of defaultRoleMultipliersFromIds()) map.set(row.roleId, row.multiplier);
  }
  for (const row of cfg.roleMultipliers) map.set(row.roleId, row.multiplier);
  return map;
}

/** Moltiplicatore più alto tra i ruoli dati (per annunci boost / VIP). */
function maxMultiplierForRoles(cfg: LevelsConfig, roleIds: string[] = []) {
  const map = roleMultiplierMap(cfg);
  let best = 1;
  for (const id of roleIds) {
    const n = Number(map.get(String(id)));
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best;
}

/** Formatta il multi per i placeholder ({expmult}): intero senza decimali inutili. */
function formatMultiplier(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "1";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

async function getCommunityBonuses(guildId?: string) {
  const cfg = await getConfig(String(guildId || ""));
  return cfg.bonuses;
}

function getActivityWinnersSync(guildId?: string): ActivityWinnersConfig {
  const cfg = getConfigSync(guildId);
  if (cfg && (cfg.userSaved || cfg.seedVersion > 0)) return cfg.activityWinners;
  return defaultActivityWinners();
}

function getMinigameScoringSync(guildId?: string): MinigameScoring {
  const cfg = getConfigSync(guildId);
  if (cfg && (cfg.userSaved || cfg.seedVersion > 0)) return cfg.minigameScoring;
  return defaultMinigameScoring();
}

function getMinigameSpawnSync(guildId?: string): MinigameSpawn {
  const cfg = getConfigSync(guildId);
  if (cfg && (cfg.userSaved || cfg.seedVersion > 0) && cfg.minigameSpawn) return cfg.minigameSpawn;
  return importMinigameSpawnFromBotConfig();
}

function getMinigameGameOptionsSync(guildId?: string): MinigameGameOptions {
  const cfg = getConfigSync(guildId);
  if (cfg && (cfg.userSaved || cfg.seedVersion > 0) && cfg.minigameGameOptions) return cfg.minigameGameOptions;
  return importMinigameGameOptionsFromBotConfig();
}

function getLevelCurveSync(guildId?: string): LevelCurve {
  const cfg = getConfigSync(guildId);
  if (cfg && (cfg.userSaved || cfg.seedVersion > 0) && cfg.levelCurve) return cfg.levelCurve;
  return defaultLevelCurve();
}

export = {
  MODULE_ID,
  SEED_VERSION,
  normalizeConfig,
  getConfig,
  getConfigSync,
  saveConfig,
  ensureMainSeed,
  levelsActive,
  moduleOn,
  getMessageExp,
  getVoiceExpPerMinute,
  roleRewardMap,
  roleMultiplierMap,
  defaultPerksDraft,
  defaultPerksText,
  withDefaultPerks,
  getMinigameRewardsSync,
  getExpEvent,
  setExpEvent,
  listScheduledEvents,
  scheduleExpEvent,
  cancelScheduledEvent,
  startScheduledEventNow,
  runDueScheduledEvents,
  startScheduledEventsTicker,
  getUserLevel,
  mutateUserLevel,
  maxMultiplierForRoles,
  formatMultiplier,
  defaultRoleMultipliersFromIds,
  getCommunityBonuses,
  defaultLevelUpDraft,
  defaultMilestoneDraft,
  defaultBonuses,
  defaultCommandCooldown,
  defaultMinigameRewardDraft,
  defaultMinigameScoring,
  defaultMinigameSpawn,
  defaultMinigameGameOptions,
  defaultActivityWinners,
  defaultLevelCurve,
  getActivityWinnersSync,
  getMinigameScoringSync,
  getMinigameSpawnSync,
  getMinigameGameOptionsSync,
  getLevelCurveSync,
};

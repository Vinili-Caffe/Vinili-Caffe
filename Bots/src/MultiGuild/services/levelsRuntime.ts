/**
 * Livelli / EXP della dashboard (modulo "livelli").
 * Per ora solo sul server principale (mainOnly): tassi, canali bloccati, moltiplicatori,
 * ruoli premio e messaggi di level-up personalizzabili. Il runtime Vinili Level legge da qui.
 */
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

type RoleMult = { roleId: string; multiplier: number };
type RoleReward = { level: number; roleId: string };

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
  perkRoleId: string | null;
  perkMinLevel: number;
  maxCombinedMultiplier: number;
};

const SEED_VERSION = 1;
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
    out.push({ level, roleId });
    if (out.length >= 60) break;
  }
  return out.sort((a, b) => a.level - b.level);
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
    perkRoleId: null,
    perkMinLevel: 10,
    maxCombinedMultiplier: 8,
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
    perkRoleId: T.isId(r.perkRoleId) ? String(r.perkRoleId) : null,
    perkMinLevel: Math.floor(clampNum(r.perkMinLevel, 0, 10000, 10)),
    maxCombinedMultiplier: clampNum(r.maxCombinedMultiplier, 1, 50, 8),
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

function roleRewardMap(cfg: LevelsConfig): Map<number, string> {
  return new Map(cfg.roleRewards.map((r) => [r.level, r.roleId]));
}

function roleMultiplierMap(cfg: LevelsConfig): Map<string, number> {
  return new Map(cfg.roleMultipliers.map((r) => [r.roleId, r.multiplier]));
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
  defaultLevelUpDraft,
  defaultMilestoneDraft,
};

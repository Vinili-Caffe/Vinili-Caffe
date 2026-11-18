/**
 * Impostazioni Musica + TTS per server (dashboard → BotState).
 * Overlay sui default di process/env e client.config.tts.
 */
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

const CACHE_TTL_MS = 15_000;
const syncCache = new Map<string, { at: number; cfg: VoiceConfig }>();

function clampInt(v: unknown, min: number, max: number, fb: number) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fb;
  return Math.max(min, Math.min(max, n));
}

function idList(raw: unknown, max = 25): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const id = String(x || "").trim();
    if (!T.isId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function defaultAlwaysOn() {
  return {
    enabled: false,
    voiceChannelId: null as string | null,
    source: "radio" as "radio" | "chill",
    radioId: "rtl1025",
  };
}

function normalizeAlwaysOn(raw?) {
  const d = defaultAlwaysOn();
  const a = raw && typeof raw === "object" ? raw : {};
  const source = String(a.source || d.source).trim().toLowerCase() === "chill" ? "chill" : "radio";
  let radioId = String(a.radioId || d.radioId).trim().toLowerCase().slice(0, 32) || d.radioId;
  try {
    const { getRadioById, listItalianRadios } = require("../../shared/music/services/musicAlwaysOnCatalog") as typeof import("../../shared/music/services/musicAlwaysOnCatalog");
    if (!getRadioById(radioId)) radioId = listItalianRadios()[0]?.id || d.radioId;
  } catch (_) {}
  const voiceChannelId = T.isId(a.voiceChannelId) ? String(a.voiceChannelId) : null;
  return {
    enabled: a.enabled === true && Boolean(voiceChannelId),
    voiceChannelId,
    source: source as "radio" | "chill",
    radioId,
  };
}

function defaultConfig(): VoiceConfig {
  const envVol = Number(process.env.MUSIC_DEFAULT_VOLUME);
  const defaultVolume =
    Number.isFinite(envVol) && envVol >= 0
      ? clampInt(envVol > 100 ? envVol / 10 : envVol, 0, 100, 20)
      : 20;
  const envIdle = Number(process.env.MUSIC_INACTIVITY_IDLE_MS || 180_000);
  return {
    music: {
      defaultVolume,
      inactivityLeaveMs: Math.max(60_000, Number.isFinite(envIdle) && envIdle > 0 ? Math.floor(envIdle) : 180_000),
      textChannelIds: [],
      djRoleIds: [],
      alwaysOn: defaultAlwaysOn(),
    },
    tts: {
      enabled: true,
      autojoin: null,
      includeUsername: null,
      stayConnected: null,
      defaultLang: "it",
      textChannelIds: [],
    },
    userSaved: false,
  };
}

function normalizeConfig(raw?): VoiceConfig {
  const d = defaultConfig();
  const r = raw && typeof raw === "object" ? raw : {};
  const m = r.music && typeof r.music === "object" ? r.music : {};
  const t = r.tts && typeof r.tts === "object" ? r.tts : {};
  const lang = String(t.defaultLang || d.tts.defaultLang).trim().toLowerCase().slice(0, 8) || "it";
  return {
    music: {
      defaultVolume: clampInt(m.defaultVolume, 0, 100, d.music.defaultVolume),
      inactivityLeaveMs: clampInt(m.inactivityLeaveMs, 60_000, 3_600_000, d.music.inactivityLeaveMs),
      textChannelIds: idList(m.textChannelIds),
      djRoleIds: idList(m.djRoleIds),
      alwaysOn: normalizeAlwaysOn(m.alwaysOn),
    },
    tts: {
      enabled: t.enabled !== false,
      autojoin: typeof t.autojoin === "boolean" ? t.autojoin : null,
      includeUsername: typeof t.includeUsername === "boolean" ? t.includeUsername : null,
      stayConnected: typeof t.stayConnected === "boolean" ? t.stayConnected : null,
      defaultLang: /^[a-z]{2}(-[a-z]{2})?$/i.test(lang) ? lang : "it",
      textChannelIds: idList(t.textChannelIds),
    },
    userSaved: r.userSaved === true,
  };
}

type VoiceConfig = ReturnType<typeof defaultConfig>;

function putCache(guildId: string, cfg: VoiceConfig) {
  syncCache.set(String(guildId), { at: Date.now(), cfg });
}

async function getConfig(guildId: string, fresh = false): Promise<VoiceConfig> {
  const gid = String(guildId || "").trim();
  if (!gid) return defaultConfig();
  if (!fresh) {
    const hit = syncCache.get(gid);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cfg;
  }
  const cfg = normalizeConfig(await T.getGuildBlob("voice", gid, true));
  putCache(gid, cfg);
  return cfg;
}

function getConfigSync(guildId?: string): VoiceConfig {
  const gid = String(guildId || "").trim();
  if (!gid) return defaultConfig();
  const hit = syncCache.get(gid);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cfg;
  void getConfig(gid, true).catch(() => null);
  return hit?.cfg || defaultConfig();
}

async function saveConfig(guildId: string, raw?): Promise<VoiceConfig> {
  const gid = String(guildId || "").trim();
  const prev = await getConfig(gid, true);
  const r = raw && typeof raw === "object" ? raw : {};
  const next = normalizeConfig({
    music: { ...prev.music, ...(r.music && typeof r.music === "object" ? r.music : {}) },
    tts: { ...prev.tts, ...(r.tts && typeof r.tts === "object" ? r.tts : {}) },
    userSaved: true,
  });
  await T.setGuildBlob("voice", gid, next);
  putCache(gid, next);
  return next;
}

function memberHasDjRole(member?, djRoleIds: string[] = []) {
  if (!djRoleIds.length || !member?.roles?.cache) return false;
  for (const id of djRoleIds) {
    if (member.roles.cache.has(id)) return true;
  }
  return false;
}

function isMusicTextChannelAllowed(guildId?, channelId?) {
  const cfg = getConfigSync(guildId);
  const allow = cfg.music.textChannelIds;
  if (!allow.length) return true;
  const cid = String(channelId || "").trim();
  return Boolean(cid && allow.includes(cid));
}

function isTtsTextChannelAllowed(guildId?, channelId?) {
  const cfg = getConfigSync(guildId);
  if (!cfg.tts.enabled) return false;
  const allow = cfg.tts.textChannelIds;
  if (!allow.length) return true;
  const cid = String(channelId || "").trim();
  return Boolean(cid && allow.includes(cid));
}

function resolveMusicDefaultVolumePercent(guildId?) {
  return getConfigSync(guildId).music.defaultVolume;
}

function resolveMusicInactivityMs(guildId?) {
  return getConfigSync(guildId).music.inactivityLeaveMs;
}

function isMusicAlwaysOnActive(guildId?) {
  const a = getConfigSync(guildId).music.alwaysOn;
  return Boolean(a?.enabled && a?.voiceChannelId);
}

function resolveMusicAlwaysOn(guildId?) {
  return getConfigSync(guildId).music.alwaysOn;
}

async function listAlwaysOnGuildIds(fresh = false): Promise<string[]> {
  const map = await T.allGuildBlobs("voice", fresh);
  const out: string[] = [];
  for (const [gid, raw] of Object.entries(map || {})) {
    const cfg = normalizeConfig(raw);
    if (cfg.music.alwaysOn.enabled && cfg.music.alwaysOn.voiceChannelId) out.push(String(gid));
  }
  return out;
}

/** Overlay TTS: booleani null = eredita client.config.tts */
function resolveGuildTtsOverlay(guildId?, clientConfig?) {
  const cfg = getConfigSync(guildId);
  const base = clientConfig?.tts && typeof clientConfig.tts === "object" ? clientConfig.tts : {};
  const bool = (overlay: boolean | null, key: string, fb = false) => {
    if (typeof overlay === "boolean") return overlay;
    const { booleanFromConfig } = require("../../shared/tts/services/ttsText") as typeof import("../../shared/tts/services/ttsText");
    return booleanFromConfig(base?.[key], fb);
  };
  return {
    enabled: cfg.tts.enabled !== false && (base.enabled !== false),
    autojoin: bool(cfg.tts.autojoin, "autojoin", false),
    includeUsername: bool(cfg.tts.includeUsername, "includeUsername", false),
    stayConnected: bool(cfg.tts.stayConnected, "stayConnected", false),
    lang: cfg.tts.defaultLang || String(base.lang || "it"),
    textChannelIds: cfg.tts.textChannelIds,
  };
}

async function setTtsAutojoin(guildId: string, on: boolean) {
  return saveConfig(guildId, { tts: { autojoin: on === true } });
}

export = {
  defaultConfig,
  normalizeConfig,
  getConfig,
  getConfigSync,
  saveConfig,
  memberHasDjRole,
  isMusicTextChannelAllowed,
  isTtsTextChannelAllowed,
  resolveMusicDefaultVolumePercent,
  resolveMusicInactivityMs,
  isMusicAlwaysOnActive,
  resolveMusicAlwaysOn,
  listAlwaysOnGuildIds,
  resolveGuildTtsOverlay,
  setTtsAutojoin,
};

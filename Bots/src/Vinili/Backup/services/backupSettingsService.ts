/**
 * Impostazioni backup per guild (manuale + automatico).
 * Persistenza: Data/Backups/{guildId}/__dashboard_settings.json
 */
const fs = require("fs/promises") as typeof import("fs/promises");
const path = require("path") as typeof import("path");
const { getBackupFolder, writeFileAtomic } = require("./serverBackupIo") as typeof import("./serverBackupIo");
const { isViniliProtectedGuild } = require("../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../MultiGuild/core/viniliProtectedGuilds");

const SETTINGS_FILE = "__dashboard_settings.json";

type CaptureOpts = {
  maxMessagesPerChannel: number;
  maxAuditLogs: number;
  includeAssetData: boolean;
  includeStructureAssetBytes: boolean;
};

type BackupSettings = {
  manual: CaptureOpts;
  automatic: CaptureOpts & {
    enabled: boolean;
    hour: number;
    minute: number;
    keepCount: number;
  };
  retention: {
    maxManual: number;
    maxManualAgeDays: number;
    minManualToKeep: number;
  };
};

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function defaultSettings(guildId?: string): BackupSettings {
  const protectedGuild = isViniliProtectedGuild(String(guildId || ""));
  return {
    manual: {
      maxMessagesPerChannel: 2500,
      /* Audit non è ripristinabile: 0 di default (prima 1500 rallentava i backup struttura). */
      maxAuditLogs: 0,
      includeAssetData: true,
      includeStructureAssetBytes: true,
    },
    automatic: {
      /* principali: on di default a mezzanotte; tenant: off finché non li accendi */
      enabled: protectedGuild,
      hour: 0,
      minute: 0,
      keepCount: 7,
      maxMessagesPerChannel: 0,
      maxAuditLogs: 0,
      includeAssetData: false,
      includeStructureAssetBytes: true,
    },
    retention: {
      maxManual: 50,
      maxManualAgeDays: 45,
      minManualToKeep: 8,
    },
  };
}

function settingsPath(guildId?) {
  return path.join(getBackupFolder(guildId), SETTINGS_FILE);
}

function normalizeCapture(raw: any, fallback: CaptureOpts): CaptureOpts {
  return {
    maxMessagesPerChannel: clampInt(raw?.maxMessagesPerChannel, 0, 50000, fallback.maxMessagesPerChannel),
    /* Sempre 0: audit legacy nei settings.json non deve più passare al capture. */
    maxAuditLogs: 0,
    includeAssetData: raw?.includeAssetData == null ? fallback.includeAssetData : Boolean(raw.includeAssetData),
    includeStructureAssetBytes:
      raw?.includeStructureAssetBytes == null
        ? fallback.includeStructureAssetBytes
        : Boolean(raw.includeStructureAssetBytes),
  };
}

function normalizeSettings(guildId?, raw: any = {}): BackupSettings {
  const base = defaultSettings(guildId);
  return {
    manual: normalizeCapture(raw?.manual, base.manual),
    automatic: {
      ...normalizeCapture(raw?.automatic, base.automatic),
      enabled: raw?.automatic?.enabled == null ? base.automatic.enabled : Boolean(raw.automatic.enabled),
      hour: clampInt(raw?.automatic?.hour, 0, 23, base.automatic.hour),
      minute: clampInt(raw?.automatic?.minute, 0, 59, base.automatic.minute),
      keepCount: clampInt(raw?.automatic?.keepCount, 1, 30, base.automatic.keepCount),
    },
    retention: {
      maxManual: clampInt(raw?.retention?.maxManual, 1, 200, base.retention.maxManual),
      maxManualAgeDays: clampInt(raw?.retention?.maxManualAgeDays, 1, 3650, base.retention.maxManualAgeDays),
      minManualToKeep: clampInt(raw?.retention?.minManualToKeep, 1, 100, base.retention.minManualToKeep),
    },
  };
}

async function getBackupSettings(guildId?) {
  const gid = String(guildId || "");
  if (!/^\d{16,20}$/.test(gid)) return defaultSettings(gid);
  const raw = await fs.readFile(settingsPath(gid), "utf8").catch(() => null);
  if (!raw) return defaultSettings(gid);
  try {
    return normalizeSettings(gid, JSON.parse(raw));
  } catch {
    return defaultSettings(gid);
  }
}

async function setBackupSettings(guildId?, patch: Record<string, any> = {}) {
  const gid = String(guildId || "");
  if (!/^\d{16,20}$/.test(gid)) return null;
  const current = await getBackupSettings(gid);
  const next = normalizeSettings(gid, {
    manual: { ...current.manual, ...(patch.manual || {}) },
    automatic: { ...current.automatic, ...(patch.automatic || {}) },
    retention: { ...current.retention, ...(patch.retention || {}) },
  });
  /* minManual non può superare maxManual */
  next.retention.minManualToKeep = Math.min(next.retention.minManualToKeep, next.retention.maxManual);
  await fs.mkdir(getBackupFolder(gid), { recursive: true });
  await writeFileAtomic(settingsPath(gid), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function captureOptionsFrom(settings: BackupSettings, source: "manual" | "automatic") {
  const row = source === "automatic" ? settings.automatic : settings.manual;
  return {
    source,
    maxMessagesPerChannel: row.maxMessagesPerChannel,
    /* Forza 0 anche su settings.json legacy con 1500/300: l'audit non serve al restore. */
    maxAuditLogs: 0,
    includeAssetData: row.includeAssetData,
    includeStructureAssetBytes: row.includeStructureAssetBytes,
  };
}

/** Scansiona le cartelle backup per guild con auto abilitato (oltre ai default protetti). */
async function listGuildIdsWithAutoEnabled() {
  const root = path.join(__dirname, "..", "..", "Data", "Backups");
  const dirs = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const d of dirs) {
    if (!d?.isDirectory?.()) continue;
    const gid = String(d.name || "");
    if (!/^\d{16,20}$/.test(gid)) continue;
    const s = await getBackupSettings(gid);
    if (s.automatic.enabled) out.push(gid);
  }
  return out;
}

export = {
  defaultSettings,
  getBackupSettings,
  setBackupSettings,
  captureOptionsFrom,
  listGuildIdsWithAutoEnabled,
  normalizeSettings,
};

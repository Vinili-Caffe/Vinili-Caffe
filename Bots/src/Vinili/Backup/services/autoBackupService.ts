const fs = require("fs/promises") as typeof import("fs/promises");
const path = require("path") as typeof import("path");
const cron = require("node-cron") as typeof import("node-cron");
const {
  createGuildBackup,
  pruneGuildBackups,
  validateAndHealGuildBackups,
} = require("./serverBackupService") as typeof import("./serverBackupService");
const {
  getProtectedGuildIds,
  isViniliProtectedGuild,
} = require("../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../MultiGuild/core/viniliProtectedGuilds");
const {
  getBackupSettings,
  captureOptionsFrom,
  listGuildIdsWithAutoEnabled,
} = require("./backupSettingsService") as typeof import("./backupSettingsService");

const MIN_BACKUP_GAP_MS = 50 * 60 * 1000;
const AUTO_BACKUP_TIMEZONE = "Europe/Rome";

function getZonedParts(date = new Date(), timeZone = AUTO_BACKUP_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: any = formatter.formatToParts(date).reduce((acc?, part?) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 0),
    day: Number(parts.day || 0),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
  };
}

function getZonedDayKey(date = new Date(), timeZone = AUTO_BACKUP_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function moduleAllowsBackup(guildId?) {
  try {
    const MS = require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches");
    return MS.isModuleOn(String(guildId || ""), "backup");
  } catch {
    return true;
  }
}

async function listAutoBackupGuildIds(client?) {
  const ids = new Set<string>();
  for (const id of getProtectedGuildIds().filter((gid?) => isViniliProtectedGuild(gid))) {
    ids.add(String(id));
  }
  const main = String(client?.config?.mainGuildId || "").trim();
  if (/^\d{16,20}$/.test(main)) ids.add(main);

  for (const id of await listGuildIdsWithAutoEnabled()) {
    ids.add(String(id));
  }

  const out: string[] = [];
  for (const gid of ids) {
    if (!/^\d{16,20}$/.test(gid)) continue;
    if (!moduleAllowsBackup(gid)) continue;
    const settings = await getBackupSettings(gid);
    if (!settings.automatic.enabled) continue;
    out.push(gid);
  }
  return out;
}

async function resolveAutoBackupGuilds(client?) {
  const out = [];
  for (const guildId of await listAutoBackupGuildIds(client)) {
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (guild) out.push(guild);
  }
  return out;
}

function getMarkerPath(guildId?) {
  return path.join(__dirname, "..", "..", "Data", "Backups", String(guildId), "__auto_latest.json");
}

async function readMarker(guildId?) {
  const markerPath = getMarkerPath(guildId);
  const raw = await fs.readFile(markerPath, "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeMarker(guildId?, payload?) {
  const markerPath = getMarkerPath(guildId);
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify(payload, null, 2), "utf8");
}

async function runGuildAutoBackup(guild?, { forceHourCheck = true } = {}) {
  if (!guild?.id) return null;
  if (!moduleAllowsBackup(guild.id)) return null;

  const settings = await getBackupSettings(guild.id);
  if (!settings.automatic.enabled) return null;

  const now = new Date();
  const parts = getZonedParts(now);
  if (forceHourCheck) {
    if (parts.hour !== settings.automatic.hour) return null;
    const want = settings.automatic.minute;
    if (parts.minute < want || parts.minute >= want + 15) return null;
  }

  const currentDayKey = getZonedDayKey(now);
  const marker = await readMarker(guild.id);
  const lastCreatedAt = Number(marker?.createdAtMs || 0);
  const lastDayKey = String(marker?.dayKey || marker?.hourKey || "").split("T")[0];
  if (lastDayKey === currentDayKey) return null;
  if (Date.now() - lastCreatedAt < MIN_BACKUP_GAP_MS) return null;

  const capture = captureOptionsFrom(settings, "automatic");
  const created = await createGuildBackup(guild, capture);

  await writeMarker(guild.id, {
    backupId: created.backupId,
    createdAtMs: Date.now(),
    dayKey: currentDayKey,
  });

  await pruneGuildBackups(guild.id, {
    maxManual: settings.retention.maxManual,
    maxAutomatic: settings.automatic.keepCount,
    maxManualAgeDays: settings.retention.maxManualAgeDays,
    minManualToKeep: settings.retention.minManualToKeep,
  }).catch(() => null);

  await validateAndHealGuildBackups(guild.id, { limit: 30 }).catch(() => null);

  return created;
}

/* Un giro di backup sulle guild con auto abilitato (al massimo uno al giorno per guild). */
async function runAutoBackupTick(client?) {
  const guilds = await resolveAutoBackupGuilds(client);
  for (const guild of guilds) {
    try {
      await validateAndHealGuildBackups(guild.id, { limit: 20 }).catch(() => null);
      await runGuildAutoBackup(guild, { forceHourCheck: true });
    } catch (error) {
      global.logger?.error?.(`[backup.auto] failed guild=${guild.id}:`, error);
    }
  }
}

function startAutoBackupLoop(client?) {
  const dedicated = String(process.env.AUTO_BACKUP_WORKER || "").trim() === "1";
  const external = String(process.env.AUTO_BACKUP_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) {
    return;
  }
  if (client._autoBackupLoopStarted) return;
  client._autoBackupLoopStarted = true;

  void listAutoBackupGuildIds(client).then((targets) => {
    global.logger?.info?.(
      `[backup.auto] loop avviato — guild candidate (${targets.length}): ${targets.join(", ") || "(nessuna)"}`,
    );
  });

  const runTick = () => runAutoBackupTick(client);

  runTick().catch(() => {});

  /* ogni 15 min: ogni guild usa ora/minuto dalle impostazioni dashboard */
  client._autoBackupCron = cron.schedule(
    "*/15 * * * *",
    () => {
      void runTick().catch(() => {});
    },
    { timezone: AUTO_BACKUP_TIMEZONE },
  );
}

export = {
  startAutoBackupLoop,
  runAutoBackupTick,
  runGuildAutoBackup,
  listAutoBackupGuildIds,
  isViniliProtectedGuild,
};

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
} = require("../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../MultiGuild/core/viniliProtectedGuilds");

const MIN_BACKUP_GAP_MS = 50 * 60 * 1000;
const MAX_MANUAL_BACKUPS = 50;
const MAX_AUTOMATIC_BACKUPS = Math.max(
  1,
  Math.min(30, Number(process.env.BACKUP_AUTO_KEEP || 7) || 7),
);
const MAX_MANUAL_BACKUP_AGE_DAYS = 45;
const MIN_MANUAL_BACKUPS_TO_KEEP = 8;
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

function listAutoBackupGuildIds(client?) {
  const protectedIds = getProtectedGuildIds().filter((id?) => isViniliProtectedGuild(id));
  if (protectedIds.length) return protectedIds;
  const main = String(client?.config?.mainGuildId || "").trim();
  return /^\d{16,20}$/.test(main) ? [main] : [];
}

async function resolveAutoBackupGuilds(client?) {
  const out = [];
  for (const guildId of listAutoBackupGuildIds(client)) {
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

async function runGuildAutoBackup(guild?) {
  if (!guild?.id || !isViniliProtectedGuild(guild.id)) return null;

  const now = new Date();
  const currentDayKey = getZonedDayKey(now);
  const marker = await readMarker(guild.id);
  const lastCreatedAt = Number(marker?.createdAtMs || 0);
  const lastDayKey = String(marker?.dayKey || marker?.hourKey || "").split("T")[0];
  if (lastDayKey === currentDayKey) return null;
  if (Date.now() - lastCreatedAt < MIN_BACKUP_GAP_MS) return null;

  const previousAutoId = String(marker?.backupId || "").trim().toUpperCase();

  const created = await createGuildBackup(guild, {
    source: "automatic",
    maxMessagesPerChannel: 0,
    includeAssetData: false,
    includeStructureAssetBytes: true,
  });

  // Keep last N automatic backups via prune — do not delete the previous immediately.
  void previousAutoId;

  await writeMarker(guild.id, {
    backupId: created.backupId,
    createdAtMs: Date.now(),
    dayKey: currentDayKey,
  });

  await pruneGuildBackups(guild.id, {
    maxManual: MAX_MANUAL_BACKUPS,
    maxAutomatic: MAX_AUTOMATIC_BACKUPS,
    maxManualAgeDays: MAX_MANUAL_BACKUP_AGE_DAYS,
    minManualToKeep: MIN_MANUAL_BACKUPS_TO_KEEP,
  }).catch(() => null);

  await validateAndHealGuildBackups(guild.id, { limit: 30 }).catch(() => null);

  return created;
}

/* Un giro di backup su tutte le guild protette (al massimo uno al giorno per guild, vedi runGuildAutoBackup). */
async function runAutoBackupTick(client?) {
  const guilds = await resolveAutoBackupGuilds(client);
  for (const guild of guilds) {
    try {
      await validateAndHealGuildBackups(guild.id, { limit: 20 }).catch(() => null);
      await runGuildAutoBackup(guild);
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

  const targets = listAutoBackupGuildIds(client);
  global.logger?.info?.(
    `[backup.auto] loop avviato — solo guild protette (${targets.length}): ${targets.join(", ") || "(nessuna)"}`,
  );

  const runTick = () => runAutoBackupTick(client);

  runTick().catch(() => {});

  client._autoBackupCron = cron.schedule(
    "0 0 * * *",
    () => {
      void runTick().catch(() => {});
    },
    { timezone: AUTO_BACKUP_TIMEZONE },
  );
}

export = {
  startAutoBackupLoop,
  runAutoBackupTick,
  listAutoBackupGuildIds,
  isViniliProtectedGuild,
};

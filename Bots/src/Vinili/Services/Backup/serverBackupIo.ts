const fs = require("fs/promises") as typeof import("fs/promises");
const path = require("path") as typeof import("path");
const zlib = require("zlib") as typeof import("zlib");
const crypto = require("crypto") as typeof import("crypto");
const { promisify } = require("util") as typeof import("util");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const gunzipAsync = promisify(zlib.gunzip);
const gzipAsync = promisify(zlib.gzip);

const SECURITY_SNAPSHOT_PREFIX = "SEC-";
const BACKUP_SCHEMA_VERSION = 2;

function sha256(input?) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function generateBackupId() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

function getBackupFolder(guildId?) {
  return path.join(__dirname, "..", "..", "Data", "Backups", String(guildId));
}

function getBackupsRootFolder() {
  return path.join(__dirname, "..", "..", "Data", "Backups");
}

function assertSafeBackupId(backupId?) {
  const normalizedId = String(backupId || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,64}$/.test(normalizedId)) {
    const err: any = new Error("backup_id non valido.");
    err.code = "EINVAL";
    throw err;
  }
  return normalizedId;
}

function assertSafeGuildId(guildId?) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,22}$/.test(gid)) {
    const err: any = new Error("guild_id non valido.");
    err.code = "EINVAL";
    throw err;
  }
  return gid;
}

function resolveUnderBackupRoot(guildId?, fileName?) {
  const gid = assertSafeGuildId(guildId);
  const root = path.resolve(getBackupFolder(gid));
  const full = path.resolve(root, fileName);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(rootWithSep)) {
    const err: any = new Error("backup path fuori dalla cartella consentita.");
    err.code = "EINVAL";
    throw err;
  }
  return full;
}

function getBackupFilePath(guildId?, backupId?) {
  const normalizedId = assertSafeBackupId(backupId);
  return resolveUnderBackupRoot(guildId, `${normalizedId}.json.gz`);
}

function getBackupBakPath(guildId?, backupId?) {
  const normalizedId = assertSafeBackupId(backupId);
  return resolveUnderBackupRoot(guildId, `${normalizedId}.json.gz.bak`);
}

function getBackupMetaPath(guildId?, backupId?) {
  const normalizedId = assertSafeBackupId(backupId);
  return resolveUnderBackupRoot(guildId, `${normalizedId}.meta.json`);
}

async function readBackupMetaFile(guildId?, backupId?) {
  const metaPath = getBackupMetaPath(guildId, backupId);
  const raw = await fs.readFile(metaPath, "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeBackupMetaFile(guildId?, backupId?, meta?) {
  const metaPath = getBackupMetaPath(guildId, backupId);
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  await writeFileAtomic(metaPath, JSON.stringify(safeMeta, null, 2), "utf8");
}

async function writeFileAtomic(targetPath?, data?, encoding = undefined) {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmpPath, data, encoding ? { encoding } : undefined);
  await fs.rename(tmpPath, targetPath);
}

function toMs(value?) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function readGuildBackup(guildId?, backupId?) {
  const filePath = getBackupFilePath(guildId, backupId);
  const backupPath = getBackupBakPath(guildId, backupId);
  const meta = await readBackupMetaFile(guildId, backupId);
  const expectedCompressed = String(meta?.checksum?.compressed || "").trim().toLowerCase();
  const expectedPayload = String(meta?.checksum?.payload || "").trim().toLowerCase();

  const tryRead = async (targetPath?, sourceLabel?) => { const compressed = await fs.readFile(targetPath); const compressedSha256 = sha256(compressed); const uncompressed = await gunzipAsync(compressed); const serialized = uncompressed.toString("utf8"); const payloadSha256 = sha256(Buffer.from(serialized, "utf8")); if (expectedCompressed && expectedCompressed !== compressedSha256.toLowerCase()) { const err: any = new Error("checksum compressed mismatch"); err.code = "EBADCHK"; throw err; } if (expectedPayload && expectedPayload !== payloadSha256.toLowerCase()) { const err: any = new Error("checksum payload mismatch"); err.code = "EBADCHK"; throw err; } const payload = JSON.parse(serialized); return { filePath: targetPath, sizeBytes: compressed.length, payload, meta, checksum: { algorithm: "sha256", compressed: compressedSha256, payload: payloadSha256, compressedVerified: expectedCompressed ? true : null, payloadVerified: expectedPayload ? true : null, }, source: sourceLabel, }; };

  let primaryError = null;
  try {
    return await tryRead(filePath, "primary");
  } catch (error) {
    primaryError = error;
  }

  const fromBackup = await tryRead(backupPath, "backup").catch(() => null);
  if (fromBackup) {
    await fs.copyFile(backupPath, filePath).catch(() => null);
    return fromBackup;
  }

  const err: any = new Error(`Backup ${String(backupId || "").toUpperCase()} non leggibile (primary+backup).${String(primaryError?.message || "",)}`,
  );
  err.code = primaryError?.code || "EBADBACKUP";
  throw err;
}

async function deleteGuildBackup(guildId?, backupId?) {
  const filePath = getBackupFilePath(guildId, backupId);
  const metaPath = getBackupMetaPath(guildId, backupId);
  const backupPath = getBackupBakPath(guildId, backupId);
  await fs.unlink(filePath).catch(() => null);
  await fs.unlink(metaPath).catch(() => null);
  await fs.unlink(backupPath).catch(() => null);
  return { filePath, metaPath, backupPath };
}

function parseBackupIdFromFileName(fileName?) {
  const raw = String(fileName || "");
  if (!raw.toLowerCase().endsWith(".json.gz")) return null;
  return raw.slice(0, -8).trim().toUpperCase() || null;
}

function toSafeDateLabel(value?) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "<a:VC_Alert:1482706673176150077> Data sconosciuta";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function readBackupMeta(guildId?, backupId?) {
  const meta = await readBackupMetaFile(guildId, backupId);
  const sourceFromMeta = String(meta?.source || "").trim().toLowerCase();
  const data = await readGuildBackup(guildId, backupId);
  const payload = data?.payload || {};
  return {
    backupId: String(payload?.backupId || backupId || "")
      .trim()
      .toUpperCase(),
    guildName: String(payload?.guild?.name || ""),
    createdAt: payload?.createdAt || null,
    source: sourceFromMeta || String(payload?.source || "manual").trim().toLowerCase(),
    checksum: data?.checksum || null,
    schemaVersion: Number(payload?.schemaVersion || meta?.schemaVersion || 1),
  };
}

function parseBackupRef(value?) {
  const raw = String(value || "").trim();
  if (!raw) return { guildId: null, backupId: "" };
  const parts = raw.split(":");
  if (parts.length === 2 && /^\d{16,20}$/.test(parts[0])) {
    return {
      guildId: String(parts[0]),
      backupId: String(parts[1] || "").trim().toUpperCase(),
    };
  }
  return { guildId: null, backupId: raw.toUpperCase() };
}

async function listGuildBackupMetas(guildId?, { search = "", limit = 25, offset = 0 } = {}) {
  const folder = getBackupFolder(guildId);
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(250, Number(limit || 25)));
  const safeOffset = Math.max(0, Number(offset || 0));

  const files = await fs.readdir(folder).catch(() => []);
  const backupFiles = files.filter((name?) => String(name).toLowerCase().endsWith(".json.gz"));

  const withStats = await Promise.all(backupFiles.map(async (name?) => { const filePath = path.join(folder, name); const stat = await fs.stat(filePath).catch(() => null); return { name, mtimeMs: Number(stat?.mtimeMs || 0), }; }),);

  withStats.sort((a?, b?) => b.mtimeMs - a.mtimeMs);

  const out = [];
  let seen = 0;
  for (const file of withStats) {
    const backupId = parseBackupIdFromFileName(file.name);
    if (!backupId) continue;
    if (normalizedSearch && !backupId.toLowerCase().includes(normalizedSearch)) {
      const hitName = file.name.toLowerCase().includes(normalizedSearch);
      if (!hitName) continue;
    }
    const meta = await readBackupMeta(guildId, backupId).catch(() => null);
    if (!meta) continue;

    const guildName = meta.guildName || "<a:VC_Alert:1482706673176150077> Server sconosciuto";
    const dateLabel = toSafeDateLabel(meta.createdAt || file.mtimeMs);
    const label = `${guildName} | ${dateLabel} (${meta.backupId})`;
    const haystack = `${label} ${meta.backupId}`.toLowerCase();
    if (normalizedSearch && !haystack.includes(normalizedSearch)) continue;

    if (seen < safeOffset) {
      seen += 1;
      continue;
    }

    out.push({
      backupId: meta.backupId,
      guildName,
      createdAt: meta.createdAt || null,
      source: meta.source || "manual",
      label,
    });
    if (out.length >= safeLimit) break;
  }

  return out;
}

async function listAllBackupMetas({ search = "", limit = 25, offset = 0 } = {}) {
  const root = getBackupsRootFolder();
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 25)));
  const safeOffset = Math.max(0, Number(offset || 0));
  const normalizedSearch = String(search || "").trim().toLowerCase();

  const guildDirs = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const entries = [];

  for (const dirent of guildDirs) {
    if (!dirent?.isDirectory?.()) continue;
    const guildId = String(dirent.name || "").trim();
    if (!/^\d{16,20}$/.test(guildId)) continue;

    const folder = path.join(root, guildId);
    const files = await fs.readdir(folder).catch(() => []);
    for (const fileName of files) {
      const backupId = parseBackupIdFromFileName(fileName);
      if (!backupId) continue;
      if (normalizedSearch && !backupId.toLowerCase().includes(normalizedSearch)) {
        if (!String(fileName).toLowerCase().includes(normalizedSearch)) continue;
      }
      const filePath = path.join(folder, fileName);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat) continue;
      entries.push({
        guildId,
        backupId,
        mtimeMs: Number(stat.mtimeMs || 0),
      });
    }
  }

  entries.sort((a?, b?) => b.mtimeMs - a.mtimeMs);

  const out = [];
  let seen = 0;
  for (const entry of entries) {
    const meta = await readBackupMeta(entry.guildId, entry.backupId).catch(() => null);
    if (!meta) continue;

    const guildName = meta.guildName || "<a:VC_Alert:1482706673176150077> Server sconosciuto";
    const dateLabel = toSafeDateLabel(meta.createdAt || entry.mtimeMs);
    const label = `${guildName} | ${dateLabel} (${meta.backupId})`;
    const haystack = `${label} ${meta.backupId} ${entry.guildId}`.toLowerCase();
    if (normalizedSearch && !haystack.includes(normalizedSearch)) continue;

    if (seen < safeOffset) {
      seen += 1;
      continue;
    }

    out.push({
      guildId: entry.guildId,
      backupId: meta.backupId,
      guildName,
      createdAt: meta.createdAt || null,
      source: meta.source || "manual",
      label,
    });
    if (out.length >= safeLimit) break;
  }

  return out;
}

async function listAllBackupMetasPaginated({ search = "", page = 1, pageSize = 10 } = {}) {
  const safePageSize = Math.max(1, Math.min(25, Number(pageSize || 10)));
  const safePage = Math.max(1, Number(page || 1));
  const all = await listAllBackupMetas({ search, limit: 2000, offset: 0 });
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const finalPage = Math.min(safePage, totalPages);
  const start = (finalPage - 1) * safePageSize;
  const items = all.slice(start, start + safePageSize);

  return {
    items,
    total,
    totalPages,
    page: finalPage,
    pageSize: safePageSize,
  };
}

async function readBackupByIdGlobal(backupRef?) {
  const parsed = parseBackupRef(backupRef);
  const backupId = String(parsed.backupId || "").trim().toUpperCase();
  if (!backupId) {
    const err: any = new Error("backup_id non valido.");
    err.code = "EINVAL";
    throw err;
  }

  if (parsed.guildId) {
    const data = await readGuildBackup(parsed.guildId, backupId);
    return { ...data, guildId: parsed.guildId, backupId };
  }

  const all = await listAllBackupMetas({ search: backupId, limit: 2000, offset: 0 });
  const matches = all.filter(
    (meta?) => String(meta.backupId || "").toUpperCase() === backupId,
  );
  const uniqueGuildIds = Array.from(
    new Set(matches.map((meta?) => String(meta?.guildId || "").trim()).filter(Boolean)),
  );
  if (uniqueGuildIds.length > 1) {
    const err: any = new Error(
      `<a:VC_Alert:1482706673176150077> Backup \`${backupId}\` trovato in più server. Usa il formato \`guildId:${backupId}\`.`,
    );
    err.code = "EAMBIGUOUS";
    throw err;
  }
  const hit = matches[0] || null;
  if (!hit?.guildId) {
    const err: any = new Error(`<a:VC_Alert:1482706673176150077> Backup \`${backupId}\` non trovato.`);
    err.code = "ENOENT";
    throw err;
  }
  const data = await readGuildBackup(hit.guildId, backupId);
  return { ...data, guildId: hit.guildId, backupId };
}

async function deleteBackupByIdGlobal(backupRef?) {
  const { guildId, backupId } = await readBackupByIdGlobal(backupRef);
  await deleteGuildBackup(guildId, backupId);
  return { guildId, backupId };
}

async function pruneGuildBackups(guildId?, { maxManual = 20, maxAutomatic = 1, maxManualAgeDays = 30, minManualToKeep = 5 } = {}) {
  const safeManual = Math.max(1, Math.min(500, Number(maxManual || 20)));
  const safeAutomatic = Math.max(1, Math.min(100, Number(maxAutomatic || 1)));
  const safeMaxAgeDays = Math.max(1, Math.min(3650, Number(maxManualAgeDays || 30)));
  const safeMinManual = Math.max(1, Math.min(safeManual, Number(minManualToKeep || 5)));
  const all = await listGuildBackupMetas(guildId, { limit: 2000, offset: 0 });

  const manual = all.filter((m?) => String(m?.source || "manual") !== "automatic");
  const automatic = all.filter((m?) => String(m?.source || "manual") === "automatic");

  const now = Date.now();
  const ageCutoff = now - safeMaxAgeDays * 24 * 60 * 60 * 1000;
  const manualSorted = [...manual].sort((a?, b?) => toMs(b?.createdAt) - toMs(a?.createdAt));

  const manualKeepSet = new Set();
  manualSorted.slice(0, safeMinManual).forEach((m?) => manualKeepSet.add(String(m.backupId)));

  const manualDeleteByAge = manualSorted.filter((entry?) => { if (manualKeepSet.has(String(entry.backupId))) return false; const createdMs = toMs(entry?.createdAt); return createdMs > 0 && createdMs < ageCutoff; });

  const manualAfterAge = manualSorted.filter((entry?) => !manualDeleteByAge.some((d?) => d.backupId === entry.backupId),);
  const manualDeleteByCount = manualAfterAge.slice(safeManual);

  const automaticSorted = [...automatic].sort((a?, b?) => toMs(b?.createdAt) - toMs(a?.createdAt));
  const automaticToDelete = automaticSorted.slice(safeAutomatic);

  const toDelete = [...manualDeleteByAge, ...manualDeleteByCount, ...automaticToDelete,];

  const removed = [];
  for (const entry of toDelete) {
    await deleteGuildBackup(guildId, entry.backupId).catch(() => null);
    removed.push(entry.backupId);
  }

  return {
    removed,
    keptManual: Math.max(0, manual.length - (manualDeleteByAge.length + manualDeleteByCount.length)),
    keptAutomatic: Math.max(0, automatic.length - automaticToDelete.length),
  };
}

async function validateAndHealGuildBackups(guildId?, { limit = 30 } = {}) {
  const metas = await listGuildBackupMetas(guildId, { limit: Math.max(1, Math.min(200, Number(limit || 30))), });
  const healed = [];
  const failed = [];

  for (const meta of metas) {
    const backupId = String(meta?.backupId || "").toUpperCase();
    if (!backupId) continue;

    const primary = getBackupFilePath(guildId, backupId);
    const backup = getBackupBakPath(guildId, backupId);

    const hasPrimary = await fs.access(primary).then(() => true).catch(() => false);
    const hasBackup = await fs.access(backup).then(() => true).catch(() => false);

    if (hasPrimary && !hasBackup) {
      await fs.copyFile(primary, backup).catch(() => null);
      healed.push(`${backupId}:created-bak`);
    } else if (!hasPrimary && hasBackup) {
      await fs.copyFile(backup, primary).catch(() => null);
      healed.push(`${backupId}:restored-primary`);
    }

    try {
      await readGuildBackup(guildId, backupId);
    } catch {
      failed.push(backupId);
    }
  }

  return { healed, failed };
}

function generateSecuritySnapshotId() {
  const now = new Date();
  const base = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `${SECURITY_SNAPSHOT_PREFIX}${base}-${rand}`;
}

function getEffectiveGuildIdForSecurity(guildId?) {
  const raw = String(guildId || "").trim();
  if (raw) return raw;
  return IDs?.guilds?.main || "global";
}

async function writeSecuritySnapshot(guildId?, payload?, options: Record<string, any> = {}) {
  const effectiveGuildId = getEffectiveGuildIdForSecurity(guildId);
  const snapshotId = generateSecuritySnapshotId();
  const createdAt = Date.now();
  const entry = { id: snapshotId, createdAt, guildId: String(guildId || ""), actorId: String(options.actorId || ""), reason: String(options.reason || "manual"), payload: payload && typeof payload === "object" ? payload : {}, };
  const serialized = JSON.stringify(entry);
  const compressed = await gzipAsync(serialized, { level: zlib.constants.Z_BEST_COMPRESSION, });
  const payloadSha256 = sha256(Buffer.from(serialized, "utf8"));
  const compressedSha256 = sha256(compressed);
  const outputDir = getBackupFolder(effectiveGuildId);
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `${snapshotId}.json.gz`;
  const absolutePath = path.join(outputDir, fileName);
  const backupPath = path.join(outputDir, `${snapshotId}.json.gz.bak`);
  await writeFileAtomic(absolutePath, compressed);
  await fs.copyFile(absolutePath, backupPath).catch(() => null);
  await writeBackupMetaFile(effectiveGuildId, snapshotId, {
    type: "security",
    snapshotId,
    guildId: effectiveGuildId,
    createdAt: new Date(createdAt).toISOString(),
    actorId: entry.actorId,
    reason: entry.reason,
    checksum: {
      algorithm: "sha256",
      payload: payloadSha256,
      compressed: compressedSha256,
    },
    file: {
      primary: fileName,
      backup: `${snapshotId}.json.gz.bak`,
      sizeBytes: compressed.length,
    },
  });
  return { ok: true, snapshotId, snapshot: entry };
}

async function listSecuritySnapshots(guildId?, limit = 30) {
  const effectiveGuildId = getEffectiveGuildIdForSecurity(guildId);
  const folder = getBackupFolder(effectiveGuildId);
  const files = await fs.readdir(folder).catch(() => []);
  const secFiles = files.filter((name?) => name.startsWith(SECURITY_SNAPSHOT_PREFIX) && name.toLowerCase().endsWith(".json.gz")).map((name?) => name.slice(0, -8));
  const withMeta = await Promise.all(secFiles.map(async (snapshotId?) => { const meta = await readBackupMetaFile(effectiveGuildId, snapshotId).catch(() => null); return { id: snapshotId, createdAt: meta?.createdAt ? new Date(meta.createdAt).getTime() : 0, guildId: String(meta?.guildId ?? effectiveGuildId), actorId: String(meta?.actorId ?? ""), reason: String(meta?.reason ?? ""), }; }),);
  withMeta.sort((a?, b?) => b.createdAt - a.createdAt);
  const safeLimit = Math.max(1, Math.min(50, Number(limit || 30)));
  return withMeta.slice(0, safeLimit);
}

async function readSecuritySnapshot(guildId?, snapshotId?) {
  const effectiveGuildId = getEffectiveGuildIdForSecurity(guildId);
  const normalizedId = String(snapshotId || "").trim();
  if (!normalizedId.startsWith(SECURITY_SNAPSHOT_PREFIX)) {
    const err: any = new Error("<a:VC_Alert:1482706673176150077> Invalid security snapshot id");
    err.code = "EBADSEC";
    throw err;
  }
  const filePath = path.join(getBackupFolder(effectiveGuildId), `${normalizedId}.json.gz`);
  const backupPath = path.join(getBackupFolder(effectiveGuildId), `${normalizedId}.json.gz.bak`);
  const tryRead = async (targetPath?) => { const compressed = await fs.readFile(targetPath); const uncompressed = await gunzipAsync(compressed); const serialized = uncompressed.toString("utf8"); const entry = JSON.parse(serialized); return entry; };
  try {
    return await tryRead(filePath);
  } catch (primaryErr) {
    const fromBackup = await tryRead(backupPath).catch(() => null);
    if (fromBackup) {
      await fs.copyFile(backupPath, filePath).catch(() => null);
      return fromBackup;
    }
    throw primaryErr;
  }
}

export = {
  BACKUP_SCHEMA_VERSION,
  sha256,
  generateBackupId,
  getBackupFolder,
  getBackupBakPath,
  writeFileAtomic,
  writeBackupMetaFile,
  listAllBackupMetasPaginated,
  readBackupByIdGlobal,
  deleteBackupByIdGlobal,
  pruneGuildBackups,
  validateAndHealGuildBackups,
  writeSecuritySnapshot,
  listSecuritySnapshots,
  readSecuritySnapshot,
  getEffectiveGuildIdForSecurity,
};

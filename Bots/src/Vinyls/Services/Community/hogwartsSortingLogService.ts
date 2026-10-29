const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { accountUsername, resolveEmbedUserAvatarUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta, HOUSE_META } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");

const LOG_DIR = path.resolve(__dirname, "../../Data/Hogwarts");
const LOG_FILE = path.join(LOG_DIR, "sorting-log.jsonl");
const HOUSE_ANNOUNCE_LOG_FILE = path.join(LOG_DIR, "house-sorting-announce.jsonl");
const SORT_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const DEFAULT_SITE_URL = "https://www.viniliecaffe.it";
const HOGWARTS_IMG_DIR = path.resolve(__dirname, "../../Assets/evento-hogwarts");
const BACKFILL_DISCORD_DELAY_MS = 400;
const HOUSE_LOG_CHANNELS = Object.freeze({
  gryffindor: () => IDs.channels?.hogwartsHouseGryffindor,
  hufflepuff: () => IDs.channels?.hogwartsHouseHufflepuff,
  ravenclaw: () => IDs.channels?.hogwartsHouseRavenclaw,
  slytherin: () => IDs.channels?.hogwartsHouseSlytherin,
});

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function normalizeHouseId(value?) {
  const house = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(HOUSE_LOG_CHANNELS, house) ? house : "";
}

function resolveSortedHouseFromDoc(doc?) {
  const status = normalizeHouseId(doc?.status);
  if (status) return status;
  return normalizeHouseId(doc?.planKey);
}

function buildHouseAnnounceDedupeKey({ guildId, userId, eventKey }) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  const e = String(eventKey || "").trim();
  if (!g || !u || !e) return "";
  return `${g}:${u}:${e}`;
}

function loadHouseAnnounceLogRows() {
  const rows = [];
  try {
    if (!fs.existsSync(HOUSE_ANNOUNCE_LOG_FILE)) return rows;
    const raw = fs.readFileSync(HOUSE_ANNOUNCE_LOG_FILE, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        rows.push(JSON.parse(trimmed));
      } catch {
              }
    }
  } catch (err) {
    global.logger?.warn?.("[hogwarts-sorting-log] house announce read:", err?.message || err);
  }
  return rows;
}

function loadHouseAnnounceDedupeKeysFromJsonl() {
  const keys = new Set();
  for (const row of loadHouseAnnounceLogRows()) {
    const key = String(row?.dedupeKey || buildHouseAnnounceDedupeKey(row) || "").trim();
    if (key) keys.add(key);
  }
  return keys;
}

function loadHouseAnnounceDedupeKeys() {
  return loadHouseAnnounceDedupeKeysFromJsonl();
}

function isHouseAnnounceBackfillSendEnabled() {
  const raw = String(process.env.HOGWARTS_SORTING_ANNOUNCE_BACKFILL || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function loadHouseAnnounceDedupeKeysFromMongo(guildId?, eventKey?) {
  const keys = new Set();
  const g = String(guildId || "").trim();
  const e = String(eventKey || "").trim();
  if (!g || !e) return keys;
  const docs = await SiteDocument.find({
    docType: SORT_DOC,
    guildId: g,
    dedupeKey: e,
    houseAnnounceAt: { $ne: null },
  })
    .select("userId guildId dedupeKey houseAnnounceHouseId")
    .lean()
    .catch(() => []);
  for (const doc of Array.isArray(docs) ? docs : []) {
    const uid = String(doc?.userId || "").trim();
    if (!uid) continue;
    const key = buildHouseAnnounceDedupeKey({ guildId: g, userId: uid, eventKey: e });
    if (key) keys.add(key);
  }
  return keys;
}

async function loadHouseAnnounceDedupeKeysMerged(guildId?, eventKey?) {
  const keys = loadHouseAnnounceDedupeKeysFromJsonl();
  for (const key of await loadHouseAnnounceDedupeKeysFromMongo(guildId, eventKey)) {
    keys.add(key);
  }
  return keys;
}

async function findSortingDocForAnnounce(guildId?, userId?, eventKey?) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  const e = String(eventKey || "").trim();
  if (!g || !u || !e) return null;
  return SiteDocument.findOne({ docType: SORT_DOC, guildId: g, userId: u, dedupeKey: e })
    .select("_id userId guildId dedupeKey houseAnnounceAt houseAnnounceHouseId status planKey")
    .lean()
    .catch(() => null);
}

async function persistHouseAnnounceOnSortingDoc({
  guildId,
  userId,
  eventKey,
  houseId,
  announcedAtMs,
}) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  const e = String(eventKey || "").trim();
  const house = normalizeHouseId(houseId);
  if (!g || !u || !e || !house) return { ok: false, reason: "invalid_entry" };
  const announcedAt = new Date(Number(announcedAtMs || Date.now()));
  if (Number.isNaN(announcedAt.getTime())) return { ok: false, reason: "invalid_date" };
  const updated = await SiteDocument.updateOne(
    { docType: SORT_DOC, guildId: g, userId: u, dedupeKey: e },
    { $set: { houseAnnounceAt: announcedAt, houseAnnounceHouseId: house } },
  ).catch(() => null);
  if (!updated?.matchedCount) return { ok: false, reason: "doc_not_found" };
  return { ok: true };
}

async function hydrateHouseAnnounceDedupeFromJsonlToMongo(guildId?, eventKey?) {
  const g = String(guildId || "").trim();
  const e = String(eventKey || "").trim();
  if (!g || !e) return { ok: false, reason: "invalid_scope", hydrated: 0 };
  let hydrated = 0;
  for (const row of loadHouseAnnounceLogRows()) {
    if (String(row?.guildId || "").trim() !== g) continue;
    if (String(row?.eventKey || e).trim() !== e) continue;
    const uid = String(row?.userId || "").trim();
    const houseId = normalizeHouseId(row?.houseId);
    if (!uid || !houseId) continue;
    const doc = await findSortingDocForAnnounce(g, uid, e);
    if (!doc || doc.houseAnnounceAt) continue;
    const ms = Number(row?.sortedAtMs || 0);
    const result = await persistHouseAnnounceOnSortingDoc({
      guildId: g,
      userId: uid,
      eventKey: e,
      houseId,
      announcedAtMs: Number.isFinite(ms) && ms > 0 ? ms : Date.now(),
    });
    if (result.ok) hydrated += 1;
  }
  return { ok: true, hydrated };
}

async function seedHouseAnnounceDedupeFromSortingDocs(guildId?, eventKey?) {
  const g = String(guildId || "").trim();
  const e = String(eventKey || "").trim();
  if (!g || !e) return { ok: false, reason: "invalid_scope", seeded: 0 };
  const docs = await SiteDocument.find({
    docType: SORT_DOC,
    guildId: g,
    dedupeKey: e,
    houseAnnounceAt: null,
  })
    .select("userId status planKey createdAt updatedAt")
    .lean()
    .catch(() => []);
  let seeded = 0;
  for (const doc of Array.isArray(docs) ? docs : []) {
    const uid = String(doc?.userId || "").trim();
    const houseId = resolveSortedHouseFromDoc(doc);
    if (!uid || !houseId) continue;
    const sortedAtMs = new Date(doc?.createdAt || doc?.updatedAt || 0).getTime();
    const result = await persistHouseAnnounceOnSortingDoc({
      guildId: g,
      userId: uid,
      eventKey: e,
      houseId,
      announcedAtMs: Number.isFinite(sortedAtMs) && sortedAtMs > 0 ? sortedAtMs : Date.now(),
    });
    if (result.ok) seeded += 1;
  }
  return { ok: true, seeded };
}

function rewriteHouseAnnounceLogFile(shouldRemoveRow?) {
  try {
    if (!fs.existsSync(HOUSE_ANNOUNCE_LOG_FILE)) return { ok: true, removed: 0 };
    const raw = fs.readFileSync(HOUSE_ANNOUNCE_LOG_FILE, "utf8");
    const kept = [];
    let removed = 0;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed);
        if (shouldRemoveRow(row)) {
          removed += 1;
          continue;
        }
      } catch {
        kept.push(trimmed);
        continue;
      }
      kept.push(trimmed);
    }
    if (!removed) return { ok: true, removed: 0 };
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(HOUSE_ANNOUNCE_LOG_FILE, kept.length ? `${kept.join("\n")}\n` : "", "utf8");
    return { ok: true, removed };
  } catch (err) {
    global.logger?.warn?.("[hogwarts-sorting-log] house announce rewrite:", err?.message || err);
    return { ok: false, reason: "write_failed" };
  }
}

async function clearHouseAnnounceOnSortingDocs(guildId?, userId?, eventKey?) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  if (!g || !u) return { ok: false, reason: "invalid_member" };
  const filter: Record<string, any> = { docType: SORT_DOC, guildId: g, userId: u };
  if (eventKey) filter.dedupeKey = String(eventKey).trim();
  await SiteDocument.updateMany(filter, { $unset: { houseAnnounceAt: "", houseAnnounceHouseId: "" } }).catch(() => null);
  return { ok: true };
}

function revokeHouseSortingAnnouncesForMember({ guildId, userId, eventKey }: any) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  if (!g || !u) return { ok: false, reason: "invalid_member" };
  void clearHouseAnnounceOnSortingDocs(g, u, eventKey);
  return rewriteHouseAnnounceLogFile((row?) => {
    const rowGuild = String(row?.guildId || "").trim();
    const rowUser = String(row?.userId || "").trim();
    return rowGuild === g && rowUser === u;
  });
}

function findStoredAnnounceHouseForMember(guildId?, userId?) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  if (!g || !u) return "";
  for (const row of loadHouseAnnounceLogRows()) {
    if (String(row?.guildId || "").trim() !== g) continue;
    if (String(row?.userId || "").trim() !== u) continue;
    const houseId = normalizeHouseId(row?.houseId);
    if (houseId) return houseId;
  }
  return "";
}

function appendHouseAnnounceLogFile(entry?) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(HOUSE_ANNOUNCE_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
    return true;
  } catch (err) {
    global.logger?.warn?.("[hogwarts-sorting-log] house announce file:", err?.message || err);
    return false;
  }
}

function revokeHouseSortingAnnounce({ guildId, userId, eventKey }) {
  const dedupeKey = buildHouseAnnounceDedupeKey({ guildId, userId, eventKey });
  if (dedupeKey) {
    const exact = rewriteHouseAnnounceLogFile((row?) => {
      const key = String(row?.dedupeKey || buildHouseAnnounceDedupeKey(row) || "").trim();
      return key === dedupeKey;
    });
    void clearHouseAnnounceOnSortingDocs(guildId, userId, eventKey);
    if (exact.removed > 0) return exact;
  }
  return revokeHouseSortingAnnouncesForMember({ guildId, userId, eventKey });
}

function hogwartsImageDirs() {
  const dirs = [];
  const envDir = String(process.env.VC_HOGWARTS_IMG_DIR || "").trim();
  if (envDir) dirs.push(path.resolve(envDir));
  dirs.push(HOGWARTS_IMG_DIR);
  const vinylsRoot = path.resolve(__dirname, "../..");
  dirs.push(path.join(vinylsRoot, "Assets", "evento-hogwarts"));
  dirs.push(path.join(vinylsRoot, "assets", "evento-hogwarts"));
  const cwd = path.resolve(process.cwd());
  dirs.push(path.join(cwd, "Vinyls", "Assets", "evento-hogwarts"));
  dirs.push(path.join(cwd, "Vinyls", "assets", "evento-hogwarts"));
  dirs.push("/var/www/viniliecaffe/images/evento-hogwarts");
  return [...new Set(dirs.map((d?) => path.resolve(d)))];
}

function findHogwartsAssetPath(relativePath?) {
  const rel = String(relativePath || "").trim().replace(/\\/g, "/");
  if (!rel) return null;
  const baseName = path.basename(rel).toLowerCase();
  for (const dir of hogwartsImageDirs()) {
    const direct = path.join(dir, ...rel.split("/"));
    if (fs.existsSync(direct)) return direct;
    const parent = path.dirname(direct);
    try {
      if (!fs.existsSync(parent)) continue;
      const hit = fs.readdirSync(parent).find((entry?) => String(entry).toLowerCase() === baseName);
      if (hit) return path.join(parent, hit);
    } catch {
          }
  }
  return null;
}

function resolveSitePublicUrl(client?) {
  const fromEnv = String(process.env.WEBSITE_PUBLIC_URL || "").trim();
  if (/^https?:\/\//i.test(fromEnv)) return fromEnv.replace(/\/+$/, "");
  const fromClient = String(client?.config?.siteUrl || client?.config?.websiteUrl || "").trim();
  if (/^https?:\/\//i.test(fromClient)) return fromClient.replace(/\/+$/, "");
  return DEFAULT_SITE_URL;
}

function resolveHouseCrestThumbnailUrl(client?, cfg?, houseId?) {
  const house = normalizeHouseId(houseId);
  if (!house) return "";
  const custom = String(cfg?.houses?.[house]?.crestUrl || "").trim();
  if (/^https?:\/\//i.test(custom)) return custom;
  const base = resolveSitePublicUrl(client);
  const file = String(HOUSE_META[house]?.crestFile || `${house}.png`).trim();
  return `${base}/images/evento-hogwarts/crests/${file}`;
}

function buildHouseCrestAttachment(houseId?) {
  const house = normalizeHouseId(houseId);
  if (!house) return null;
  const crestFile = String(HOUSE_META[house]?.crestFile || `${house}.png`).trim();
  const candidates = [`crests/${crestFile}`, `crests/${house}.png`];
  for (const rel of candidates) {
    const filePath = findHogwartsAssetPath(rel);
    if (!filePath) continue;
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".svg") continue;
    const attachName = `vc-${house}-crest${ext || ".png"}`;
    return {
      attachment: new AttachmentBuilder(filePath, { name: attachName }),
      thumbnail: `attachment://${attachName}`,
    };
  }
  return null;
}

function resolveHouseLogChannelId(cfg?, houseId?) {
  const house = normalizeHouseId(houseId);
  if (!house) return "";
  const fromCfg = String(cfg?.houses?.[house]?.logChannelId || cfg?.houses?.[house]?.announceChannelId || "").trim();
  if (fromCfg) return fromCfg;
  const pick = HOUSE_LOG_CHANNELS[house];
  return pick ? String(pick() || "").trim() : "";
}

function formatSortedAtIt(ms?, timezone = "Europe/Rome") {
  const n = Number(ms || Date.now());
  if (!Number.isFinite(n)) return "";
  return new Date(n).toLocaleString("it-IT", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function appendSortingLogFile(entry?) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
    return true;
  } catch (err) {
    global.logger?.warn?.("[hogwarts-sorting-log] file:", err?.message || err);
    return false;
  }
}

async function sendHouseSortingLogDiscord(client?, guild?, cfg?, entry?, member?) {
  const houseId = normalizeHouseId(entry.houseId);
  if (!houseId || !guild) return { ok: false, reason: "no_house" };
  try {
    const { isHouseChannelQuietHours } = require("./hogwartsHouseChannelMinigameService") as typeof import("./hogwartsHouseChannelMinigameService");
    if (isHouseChannelQuietHours(client)) return { ok: false, reason: "quiet_hours" };
  } catch (_) {}
  const channelId = resolveHouseLogChannelId(cfg, houseId);
  if (!channelId) return { ok: false, reason: "no_channel" };
  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_unavailable" };
  const meta = getHouseMeta(houseId, cfg?.houses?.[houseId]?.crestUrl);
  const crestAttach = buildHouseCrestAttachment(houseId);
  const houseLabel = String(entry.houseLabel || meta?.label || houseId).trim();
  const motto = String(meta?.motto || "").trim();
  const uid = String(entry.userId || "").trim();
  const userMention = uid ? `<@${uid}>` : entry.username;
  const embed = new EmbedBuilder()
    .setColor(meta?.primary || "#6f4e37")
    .setTitle("<a:VC_Events:1482706144953897223> Nuovo mago in casata")
    .setDescription(
      [
        `${userMention} è stato smistato in **${houseLabel}**!`,
        motto ? `> *${motto}*` : "",
        `<a:VC_Calendar:1482706208149475358> ${entry.sortedAtLabel}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setTimestamp(new Date(entry.sortedAtMs || Date.now()));
  const files = [];
  if (crestAttach) {
    embed.setThumbnail(crestAttach.thumbnail);
    files.push(crestAttach.attachment);
  } else {
    const crestUrl = resolveHouseCrestThumbnailUrl(client, cfg, houseId);
    if (crestUrl) embed.setThumbnail(crestUrl);
  }
    const avatarUrl = await resolveEmbedUserAvatarUrl(member || member?.user || { id: uid }, { size: 256 });
  embed.setAuthor({ name: String(entry.username || uid), iconURL: avatarUrl });
  const roleId = String(cfg?.houses?.[houseId]?.roleId || "").trim();
  const contentParts = [];
  if (uid) contentParts.push(`<@${uid}>`);
  if (roleId) contentParts.push(`<@&${roleId}>`);
  const content = contentParts.join(" ");
  await channel
    .send({
      content: content || undefined,
      embeds: [embed],
      files: files.length ? files : undefined,
      allowedMentions: {
        users: uid ? [uid] : [],
        roles: roleId ? [roleId] : [],
      },
    })
    .catch((err?) => {
      global.logger?.warn?.("[hogwarts-sorting-log] house channel:", houseId, err?.message || err);
      return null;
    });
  return { ok: true };
}

async function announceHouseSorting({
  client,
  guild,
  cfg,
  member,
  userId,
  houseId,
  houseLabel,
  sortedAtMs,
  source,
  knownDedupeKeys,
}: any) {
  const uid = String(userId || member?.id || "").trim();
  const sortedHouse = normalizeHouseId(houseId);
  if (!uid || !sortedHouse || !guild) return { ok: false, reason: "invalid_entry" };
  const eventKey = String(cfg?.eventKey || "").trim();
  const dedupeKey = buildHouseAnnounceDedupeKey({ guildId: guild.id, userId: uid, eventKey });
  if (!dedupeKey) return { ok: false, reason: "invalid_dedupe" };
  const sortingDoc = await findSortingDocForAnnounce(guild.id, uid, eventKey);
  if (sortingDoc?.houseAnnounceAt) {
    const storedHouse = normalizeHouseId(sortingDoc.houseAnnounceHouseId) || findStoredAnnounceHouseForMember(guild.id, uid);
    if (!storedHouse || storedHouse === sortedHouse) {
      return { ok: false, reason: "duplicate", dedupeKey };
    }
  }
  const keys = knownDedupeKeys || (await loadHouseAnnounceDedupeKeysMerged(guild.id, eventKey));
  if (keys.has(dedupeKey)) {
    const storedHouse = findStoredAnnounceHouseForMember(guild.id, uid);
    if (!storedHouse || storedHouse === sortedHouse) {
      return { ok: false, reason: "duplicate", dedupeKey };
    }
    revokeHouseSortingAnnouncesForMember({ guildId: guild.id, userId: uid });
    keys.delete(dedupeKey);
  }
  const ms = Number(sortedAtMs || Date.now());
  const sortedAt = Number.isFinite(ms) ? ms : Date.now();
  const username = accountUsername(member?.user || member) || String(member?.user?.username || uid);
  const meta = getHouseMeta(sortedHouse, cfg?.houses?.[sortedHouse]?.crestUrl);
  const entry = {
    dedupeKey,
    userId: uid,
    username,
    sortedAtMs: sortedAt,
    sortedAtLabel: formatSortedAtIt(sortedAt, cfg?.timezone),
    houseId: sortedHouse,
    houseLabel: String(houseLabel || meta?.label || sortedHouse).trim(),
    guildId: String(guild.id || ""),
    eventKey,
    source: String(source || "site").trim(),
  };
  const sent = await sendHouseSortingLogDiscord(client, guild, cfg, entry, member);
  if (!sent?.ok) return sent;
  appendHouseAnnounceLogFile(entry);
  await persistHouseAnnounceOnSortingDoc({
    guildId: guild.id,
    userId: uid,
    eventKey,
    houseId: sortedHouse,
    announcedAtMs: sortedAt,
  }).catch(() => null);
  keys.add(dedupeKey);
  return { ok: true, entry, dedupeKey };
}

async function logHogwartsSortingCompleted({ client, guild, cfg, member, userId, houseId, houseLabel }) {
  const uid = String(userId || member?.id || "").trim();
  if (!uid) return { ok: false, reason: "no_user" };
  const sortedHouse = normalizeHouseId(houseId);
  if (!sortedHouse) return { ok: false, reason: "no_house" };
  const sortedAtMs = Date.now();
  const username = accountUsername(member?.user || member) || String(member?.user?.username || uid);
  const meta = getHouseMeta(sortedHouse, cfg?.houses?.[sortedHouse]?.crestUrl);
  const entry = {
    userId: uid,
    username,
    sortedAtMs,
    sortedAtLabel: formatSortedAtIt(sortedAtMs, cfg?.timezone),
    houseId: sortedHouse,
    houseLabel: String(houseLabel || meta?.label || sortedHouse).trim(),
    guildId: String(guild?.id || ""),
    eventKey: String(cfg?.eventKey || ""),
    source: "site",
  };
  appendSortingLogFile(entry);
  if (client && guild) {
    revokeHouseSortingAnnouncesForMember({ guildId: guild.id, userId: uid, eventKey: String(cfg?.eventKey || "") });
    await announceHouseSorting({
      client,
      guild,
      cfg,
      member,
      userId: uid,
      houseId: sortedHouse,
      houseLabel: entry.houseLabel,
      sortedAtMs,
      source: "site",
    }).catch(() => null);
  }
  return { ok: true, entry };
}

let houseAnnounceBackfillStarted = false;

async function syncHouseSortingAnnouncesOnStartup(client?) {
  if (houseAnnounceBackfillStarted) return { ok: false, reason: "already_running" };
  houseAnnounceBackfillStarted = true;
  const cfg = resolveHogwartsEventConfig(client);
  const guildId = String(IDs.guilds?.main || "").trim();
  const eventKey = String(cfg.eventKey || "").trim();
  if (!guildId || !client || !eventKey) return { ok: false, reason: "no_guild" };
  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_unavailable" };

  const hydrated = await hydrateHouseAnnounceDedupeFromJsonlToMongo(guildId, eventKey);
  const seeded = await seedHouseAnnounceDedupeFromSortingDocs(guildId, eventKey);
  if (!isHouseAnnounceBackfillSendEnabled()) {
    return {
      ok: true,
      announced: 0,
      skipped: seeded.seeded || 0,
      hydrated: hydrated.hydrated || 0,
      seeded: seeded.seeded || 0,
      sendDisabled: true,
      total: seeded.seeded || 0,
    };
  }

  const keys = await loadHouseAnnounceDedupeKeysMerged(guildId, eventKey);
  const docs = await SiteDocument.find({
    docType: SORT_DOC,
    guildId,
    dedupeKey: eventKey,
    houseAnnounceAt: null,
  })
    .select("guildId userId status planKey createdAt updatedAt houseAnnounceAt")
    .lean()
    .catch(() => []);
  let announced = 0;
  let skipped = 0;
  for (const doc of Array.isArray(docs) ? docs : []) {
    const uid = String(doc?.userId || "").trim();
    const houseId = resolveSortedHouseFromDoc(doc);
    if (!uid || !houseId) continue;
    const sortedAtMs = new Date(doc?.createdAt || doc?.updatedAt || 0).getTime();
    const member = await getGuildMemberCached(guild, uid).catch(() => null);
    const meta = getHouseMeta(houseId, cfg?.houses?.[houseId]?.crestUrl);
    const result = await announceHouseSorting({
      client,
      guild,
      cfg,
      member,
      userId: uid,
      houseId,
      houseLabel: meta?.label || houseId,
      sortedAtMs: Number.isFinite(sortedAtMs) && sortedAtMs > 0 ? sortedAtMs : Date.now(),
      source: "backfill",
      knownDedupeKeys: keys,
    });
    if (result.ok) {
      announced += 1;
      await sleep(BACKFILL_DISCORD_DELAY_MS);
    } else if (result.reason === "duplicate") {
      skipped += 1;
    }
  }
  return {
    ok: true,
    announced,
    skipped,
    hydrated: hydrated.hydrated || 0,
    seeded: seeded.seeded || 0,
    total: docs.length,
  };
}

export = {
  logHogwartsSortingCompleted,
  syncHouseSortingAnnouncesOnStartup,
  announceHouseSorting,
  revokeHouseSortingAnnounce,
  revokeHouseSortingAnnouncesForMember,
  LOG_FILE,
  HOUSE_ANNOUNCE_LOG_FILE,
};
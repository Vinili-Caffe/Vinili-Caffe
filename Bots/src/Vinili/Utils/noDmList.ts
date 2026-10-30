const fs = require("fs/promises") as typeof import("fs/promises");
const path = require("path") as typeof import("path");
const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const { getNoDmPreference, setNoDmPreference, listNoDmPreferences, clearNoDmPreference } = require("../Services/Community/profileStore") as typeof import("../Services/Community/profileStore");
const IDs = require("./Config/ids") as typeof import("./Config/ids");
const {
  notifyDmPrivacyBlockedInCommands,
  sendUserDirectMessage,
  isUserDmPrivacyBlockedError,
} = require("../../shared/discord/dmPrivacyNotice") as typeof import("../../shared/discord/dmPrivacyNotice");
const DATA_PATH = path.join(__dirname, "..", "Data", "noDmList.json");
const BACKUP_PATH = `${DATA_PATH}.bak`;
const TMP_PATH = `${DATA_PATH}.tmp`;
let cache = null;
let writeQueue = Promise.resolve();
let migrationPromise = null;

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function normalizeData(raw?) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, any> = {};
  for (const [guildId, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const unique = new Set(list.map((id?) => String(id)).filter((id?) => id && id !== "undefined" && id !== "null"),);
    out[String(guildId)] = [...unique];
  }
  return out;
}

async function readJsonIfExists(filePath?) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeData(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadFileData() {
  if (cache !== null) return cache;

  const main = await readJsonIfExists(DATA_PATH);
  if (main) {
    cache = main;
    return cache;
  }

  const backup = await readJsonIfExists(BACKUP_PATH);
  if (backup) {
    cache = backup;
    await atomicWrite(cache).catch(() => { });
    return cache;
  }

  cache = {};
  return cache;
}

async function atomicWrite(data?) {
  const dir = path.dirname(DATA_PATH);
  await fs.mkdir(dir, { recursive: true });
  const payload = JSON.stringify(normalizeData(data), null, 2);

  await fs.writeFile(TMP_PATH, payload, "utf8");
  await fs.copyFile(DATA_PATH, BACKUP_PATH).catch(() => { });
  await fs.rename(TMP_PATH, DATA_PATH);
  await fs.copyFile(DATA_PATH, BACKUP_PATH).catch(() => { });
}

async function saveFileData(data?) {
  cache = normalizeData(data);
  await atomicWrite(cache);
}

function withWriteLock(task?) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

async function mirrorAddToFile(guildId?, userId?) {
  await withWriteLock(async () => {
    const data = await loadFileData();
    const key = String(guildId);
    const uid = String(userId);
    const list = Array.isArray(data[key]) ? [...data[key]] : [];
    if (!list.includes(uid)) list.push(uid);
    data[key] = list;
    await saveFileData(data);
  });
}

async function mirrorRemoveFromFile(guildId?, userId?) {
  await withWriteLock(async () => {
    const data = await loadFileData();
    const key = String(guildId);
    const uid = String(userId);
    const list = Array.isArray(data[key]) ? data[key] : [];
    data[key] = list.filter((id?) => String(id) !== uid);
    await saveFileData(data);
  });
}

async function migrateFileToDbOnce() {
  if (!isDbReady()) return;
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const data = await loadFileData();
    const ops = [];
    for (const [guildId, list] of Object.entries(data)) {
      for (const userId of list) {
        ops.push({
          updateOne: {
            filter: { guildId: String(guildId), userId: String(userId) },
            update: {
              $setOnInsert: {
                guildId: String(guildId),
                userId: String(userId),
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length > 0) {
      const profileOps = ops.map((op?) => ({
        updateOne: {
          filter: op.updateOne.filter,
          update: {
            $setOnInsert: op.updateOne.update.$setOnInsert,
            $set: { "profile.noDmPreference.categories": ["all"] },
          },
          upsert: true,
        },
      }));
      await ActivityUserProfile.bulkWrite(profileOps, { ordered: false }).catch(() => { });
    }
  })();

  return migrationPromise;
}

let voteTopggSplitMigrationPromise = null;
async function migrateVoteTopggNoDmSplitOnce() {
  if (!isDbReady()) return;
  if (voteTopggSplitMigrationPromise) return voteTopggSplitMigrationPromise;
  voteTopggSplitMigrationPromise = (async () => {
    try {
      await ActivityUserProfile.updateMany(
        {
          $and: [{ "profile.noDmPreference.categories": "bump" }, { "profile.noDmPreference.categories": { $ne: "vote_topgg" } }],
        },
        { $addToSet: { "profile.noDmPreference.categories": "vote_topgg" } },
      );
    } catch (_) {}
  })();
  return voteTopggSplitMigrationPromise;
}

const DM_CATEGORIES = Object.freeze(["bump", "vote_topgg", "broadcast", "invites", "perks"]);
const DM_CATEGORY_ALL = "all";
const DM_CATEGORY_LABELS = Object.freeze({
  bump: "Promemoria voto Discadia",
  vote_topgg: "Promemoria voto Top.gg",
  broadcast: "Avvisi dallo staff",
  invites: "Inviti",
  perks: "Livelli e perk",
});

async function getNoDmSet(guildId?) {
  const key = String(guildId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await migrateVoteTopggNoDmSplitOnce();
    const rows = await listNoDmPreferences(key);
    return new Set(
      rows
        .filter((row?) => {
          const cat = row.categories;
          return !cat || cat.length === 0 || (Array.isArray(cat) && cat.includes(DM_CATEGORY_ALL));
        })
        .map((row?) => String(row.userId)),
    );
  }

  const data = await loadFileData();
  const list = Array.isArray(data[key]) ? data[key] : [];
  return new Set(list);
}

async function getNoDmPreferences(guildId?, userId?) {
  const key = String(guildId);
  const uid = String(userId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await migrateVoteTopggNoDmSplitOnce();
    const doc = await getNoDmPreference(key, uid);
    if (!doc) return { blockAll: false, disabled: new Set() };
    const cat = doc.categories;
    if (cat == null) return { blockAll: false, disabled: new Set() };
    if (!Array.isArray(cat) || cat.length === 0) return { blockAll: true, disabled: new Set([DM_CATEGORY_ALL]) };
    if (cat.includes(DM_CATEGORY_ALL)) return { blockAll: true, disabled: new Set([DM_CATEGORY_ALL]) };
    return { blockAll: false, disabled: new Set(cat) };
  }

  const data = await loadFileData();
  const list = Array.isArray(data[key]) ? data[key] : [];
  const inList = list.some((id?) => String(id) === uid);
  return inList ? { blockAll: true, disabled: new Set([DM_CATEGORY_ALL]) } : { blockAll: false, disabled: new Set() };
}

async function setNoDmCategories(guildId?, userId?, categories?) {
  const key = String(guildId);
  const uid = String(userId);
  const list = Array.isArray(categories) ? categories.filter(Boolean).map(String) : [];

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await migrateVoteTopggNoDmSplitOnce();
    if (list.length === 0) {
      await clearNoDmPreference(key, uid);
      await mirrorRemoveFromFile(key, uid).catch(() => { });
      return;
    }
    await setNoDmPreference(key, uid, list);
    await mirrorAddToFile(key, uid).catch(() => { });
    return;
  }

  if (list.includes(DM_CATEGORY_ALL)) await mirrorAddToFile(key, uid);
  else await mirrorRemoveFromFile(key, uid);
}

async function shouldBlockDm(guildId?, userId?, category?) {
  const prefs = await getNoDmPreferences(guildId, userId).catch(() => ({ blockAll: false, disabled: new Set() }));
  if (prefs.blockAll) return true;
  if (!category) return false;
  return prefs.disabled.has(category);
}

async function getAllNoDmPreferences(guildId?) {
  const key = String(guildId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await migrateVoteTopggNoDmSplitOnce();
    const rows = await listNoDmPreferences(key);
    return rows.map((row?) => {
      const uid = String(row.userId);
      const cat = row.categories;
      if (!cat || !Array.isArray(cat) || cat.length === 0)
        return { userId: uid, blockAll: true, disabled: [] };
      if (cat.includes(DM_CATEGORY_ALL))
        return { userId: uid, blockAll: true, disabled: [] };
      return { userId: uid, blockAll: false, disabled: [...cat] };
    });
  }

  const data = await loadFileData();
  const list = Array.isArray(data[key]) ? data[key] : [];
  return list.map((uid?) => ({ userId: String(uid), blockAll: true, disabled: [] }));
}

async function addNoDm(guildId?, userId?) {
  const key = String(guildId);
  const uid = String(userId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await setNoDmPreference(key, uid, [DM_CATEGORY_ALL]);
    await mirrorAddToFile(key, uid).catch(() => { });
    return;
  }

  await mirrorAddToFile(key, uid);
}

async function removeNoDm(guildId?, userId?) {
  const key = String(guildId);
  const uid = String(userId);

  if (isDbReady()) {
    await migrateFileToDbOnce();
    await clearNoDmPreference(key, uid);
    await mirrorRemoveFromFile(key, uid).catch(() => { });
    return;
  }

  await mirrorRemoveFromFile(key, uid);
}

async function shouldNotifyDiscordPrivacyBlockForUser(user?, options: Record<string, any> = {}) {
  const guildId = String(options.guildId || "").trim();
  if (!guildId || options.notifyOnPrivacyBlock === false) return false;
  if (options.bypassNoDm) {
    const prefs = await getNoDmPreferences(guildId, user.id).catch(() => ({ blockAll: false, disabled: new Set() }));
    return !prefs.blockAll;
  }
  if (options.category) {
    return !(await shouldBlockDm(guildId, user.id, options.category).catch(() => false));
  }
  const set = await getNoDmSet(guildId).catch(() => new Set());
  return !set.has(String(user.id));
}

async function deliverUserDm(user?, payload?, options: Record<string, any> = {}) {
  const guildId = String(options.guildId || "").trim();
  const commandsChannelId = String(options.commandsChannelId || IDs.channels?.commands || "").trim();
  if (!guildId) {
    try {
      return await user.send(payload);
    } catch {
      return null;
    }
  }
  return sendUserDirectMessage(user, payload, {
    guildId,
    commandsChannelId,
    client: options.client,
    botLabel: options.botLabel,
    notifyOnPrivacyBlock: options.notifyOnPrivacyBlock !== false,
    shouldNotifyForDiscordPrivacyBlock: () => shouldNotifyDiscordPrivacyBlockForUser(user, options),
  });
}

async function sendDm(user?, payload?, options: Record<string, any> = {}) {
  const { guildId, bypassNoDm = false, category = null } = options;
  if (!user?.send) return null;
  if (options.skipIfWebPush) {
    try {
      const { shouldSkipDiscordDmForActiveWebPush } = require("../Web/siteNotifPrefs") as typeof import("../Web/siteNotifPrefs");
      const skip = await shouldSkipDiscordDmForActiveWebPush(
        guildId || IDs.guilds?.main,
        user.id,
        options.webPushNotifMeta || {},
      );
      if (skip) return null;
    } catch (_) {}
  }
  if (bypassNoDm) {
    return deliverUserDm(user, payload, options);
  }
  if (!guildId) {
    try {
      return await user.send(payload);
    } catch {
      return null;
    }
  }
  if (category) {
    const block = await shouldBlockDm(guildId, user.id, category).catch(() => false);
    if (block) return null;
  } else {
    const set = await getNoDmSet(guildId).catch(() => new Set());
    if (set.has(String(user.id))) return null;
  }
  return deliverUserDm(user, payload, options);
}

export = { getNoDmSet, addNoDm, removeNoDm, sendDm, getNoDmPreferences, setNoDmCategories, shouldBlockDm, getAllNoDmPreferences, DM_CATEGORIES, DM_CATEGORY_ALL, DM_CATEGORY_LABELS, isUserDmPrivacyBlockedError, notifyDmPrivacyBlockedInCommands };
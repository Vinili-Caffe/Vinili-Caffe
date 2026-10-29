const { ChannelType, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Config/ids") as typeof import("../Config/ids");

/* categoryCenterPad3: sidePad=1 frame=9 — PRIVATE(7) → left=2 right=2 */
const CUSTOM_PRIVATE_CATEGORY_NAME = "・　　PRIVATE　　・";
const CATEGORY_INDEX_PREFIX_RE = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s*/;

function extractCategoryIndexPrefix(name?) {
  /* solo apici; niente spazio forzato (rompe il centro ・…・) */
  const match = String(name || "").match(/^([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/);
  if (!match) return "";
  return match[1];
}

function stripCategoryIndexPrefix(name?) {
  return String(name || "").replace(CATEGORY_INDEX_PREFIX_RE, "");
}

function isCanonicalCustomPrivateCategoryName(name?) {
  const core = stripCategoryIndexPrefix(name);
  return normalizeCategoryName(core) === normalizeCategoryName(CUSTOM_PRIVATE_CATEGORY_NAME);
}

function normalizeCategoryName(name?) {
  return String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isCustomPrivateCategoryName(name?) {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return false;
  if (normalized === normalizeCategoryName(CUSTOM_PRIVATE_CATEGORY_NAME)) return true;
  return normalized.includes("private");
}

function isConfiguredCustomPrivateCategory(category?) {
  const configured = String(IDs?.categories?.categoryPrivate || "").trim();
  return Boolean(configured && category && String(category.id) === configured);
}

function isCustomPrivateCategory(category?) {
  if (!category || category.type !== ChannelType.GuildCategory) return false;
  return isCustomPrivateCategoryName(category.name) || isConfiguredCustomPrivateCategory(category);
}

function listCustomPrivateCategories(guild?) {
  if (!guild?.channels?.cache) return [];
  const out = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildCategory) continue;
    if (isCustomPrivateCategoryName(ch.name) || isConfiguredCustomPrivateCategory(ch)) out.push(ch);
  }
  return out.sort((a?, b?) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));
}

function getCustomPrivateCategoryIdSet(guild?) {
  const ids = new Set();
  const configured = String(IDs?.categories?.categoryPrivate || "").trim();
  if (configured) ids.add(configured);
  for (const cat of listCustomPrivateCategories(guild)) ids.add(String(cat.id));
  return ids;
}

function isChannelInCustomPrivateCategory(channel?, guild?) {
  const parentId = String(channel?.parentId || "");
  if (!parentId || !guild) return false;
  return getCustomPrivateCategoryIdSet(guild).has(parentId);
}

async function warmGuildChannelsIfNeeded(guild?) {
  if (!guild?.channels?.cache?.size && typeof guild?.channels?.fetch === "function") {
    await guild.channels.fetch().catch(() => { });
  }
}

function countCustomPrivateCategoryChildren(guild?, categoryId?, excludeChannelId = "") {
  const catId = String(categoryId || "");
  const exclude = String(excludeChannelId || "");
  if (!guild?.channels?.cache || !catId) return 0;
  return guild.channels.cache.filter(
    (ch?) => String(ch.parentId || "") === catId && String(ch.id) !== exclude,
  ).size;
}

async function fetchGuildCategory(guild?, categoryId?) {
  const id = String(categoryId || "").trim();
  if (!id || !guild) return null;
  const cached = guild.channels.cache.get(id);
  if (cached?.type === ChannelType.GuildCategory) return cached;
  const fetched = await guild.channels.fetch(id).catch(() => null);
  return fetched?.type === ChannelType.GuildCategory ? fetched : null;
}

function resolveLimitateCategory(guild?) {
  const duoChannelId = String(IDs?.channels?.vocaleDuo1 || "").trim();
  if (!duoChannelId || !guild?.channels?.cache) return null;
  const duo = guild.channels.cache.get(duoChannelId);
  const parentId = String(duo?.parentId || "").trim();
  if (!parentId) return null;
  const parent = guild.channels.cache.get(parentId);
  return parent?.type === ChannelType.GuildCategory ? parent : null;
}

function computePrivateCategoryTargetPosition(category?, partner?, limitate?) {
  if (!partner || !category) return null;

  const partnerPos = Number(partner.rawPosition);
  const floor =
    limitate && String(limitate.id) !== String(category.id)
      ? Number(limitate.rawPosition) + 1
      : 0;

      let target = partnerPos - 1;
  if (!Number.isFinite(target)) return null;
  if (target < floor) target = floor;
  if (target >= partnerPos) target = Math.max(floor, partnerPos - 1);
  return target;
}

function isPrivateCategoryCorrectlyPlaced(category?, partner?, limitate?) {
  const target = computePrivateCategoryTargetPosition(category, partner, limitate);
  if (target == null) return true;
  const current = Number(category.rawPosition);
  if (current < Number(partner.rawPosition) && current > Number(limitate?.rawPosition ?? -1)) {
    return true;
  }
  return current === target;
}

async function placePrivateCategoryAbovePartner(guild?, category?) {
  const partnerId = String(IDs?.categories?.categoryPartner || "").trim();
  if (!partnerId || !category) return;
  await warmGuildChannelsIfNeeded(guild);

  const partner = await fetchGuildCategory(guild, partnerId);
  if (!partner) return;

  const limitate = resolveLimitateCategory(guild);
  if (isPrivateCategoryCorrectlyPlaced(category, partner, limitate)) return;

  const targetPosition = computePrivateCategoryTargetPosition(category, partner, limitate);
  if (targetPosition == null) return;

  await category
    .setPosition(targetPosition, { reason: "Mantieni categoria vocali private sopra Partner/Staff" })
    .catch((err?) => {
      global.logger?.warn?.(
        `[CUSTOM PRIVATE CATEGORY] setPosition failed for ${category.id} -> ${targetPosition}:`,
        err?.message || err,
      );
    });
}

async function syncCustomPrivateCategoryLayout(guild?, category?) {
  if (!guild || !category || category.type !== ChannelType.GuildCategory) return category;
    const prefix = extractCategoryIndexPrefix(category.name);
  const desired = `${prefix}${CUSTOM_PRIVATE_CATEGORY_NAME}`;
  if (String(category.name || "") !== desired) {
    await category.setName(desired, "Allinea nome categoria vocali private").catch(() => { });
  }
  await placePrivateCategoryAbovePartner(guild, category);
  return category;
}

async function tryDeleteEmptyCustomPrivateCategory(guild?, { excludeChannelId = "", reason = "Auto cleanup empty custom private category" } = {}) {
  if (!guild) return false;
  await warmGuildChannelsIfNeeded(guild);
  let deletedAny = false;
  for (const cat of listCustomPrivateCategories(guild)) {
    const count = countCustomPrivateCategoryChildren(guild, cat.id, excludeChannelId);
    if (count > 0) continue;
    const ok = await cat.delete(reason).then(() => true).catch((err?) => {
      global.logger?.warn?.(`[CUSTOM PRIVATE CATEGORY] Delete failed for ${cat.id}: ${err?.message || err}`);
      return false;
    });
    if (!ok) continue;
    deletedAny = true;
    global.logger?.info?.(`[CUSTOM PRIVATE CATEGORY] Deleted empty category ${cat.id}`);
    const client = guild.client;
    if (client?.customPrivateCategoryCache?.get?.(guild.id) === cat.id) {
      client.customPrivateCategoryCache.delete(guild.id);
    }
  }
  return deletedAny;
}

async function ensureCustomPrivateCategory(guild?, client?) {
  if (!guild || !client) return null;
  await warmGuildChannelsIfNeeded(guild);
  if (!client.customPrivateCategoryCache) client.customPrivateCategoryCache = new Map();
  const cachedId = client.customPrivateCategoryCache.get(guild.id);
  if (cachedId) {
    const cached =
      guild.channels.cache.get(cachedId) ||
      (await guild.channels.fetch(cachedId).catch(() => null));
    if (cached?.type === ChannelType.GuildCategory && (isCustomPrivateCategoryName(cached.name) || isConfiguredCustomPrivateCategory(cached))) {
      await syncCustomPrivateCategoryLayout(guild, cached);
      return cached;
    }
    client.customPrivateCategoryCache.delete(guild.id);
  }
  const existing = listCustomPrivateCategories(guild)[0] || null;
  if (existing) {
    await syncCustomPrivateCategoryLayout(guild, existing);
    client.customPrivateCategoryCache.set(guild.id, existing.id);
    return existing;
  }
  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) return null;
  const category = await guild.channels
    .create({
      name: CUSTOM_PRIVATE_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: "Auto create custom private voice category",
    })
    .catch(() => null);
  if (!category) return null;
  await syncCustomPrivateCategoryLayout(guild, category);
  client.customPrivateCategoryCache.set(guild.id, category.id);
  try {
    const { queueIdsCatalogSync } = require("../Config/idsAutoSync") as typeof import("../Config/idsAutoSync");
    queueIdsCatalogSync(client, guild.id, "customPrivateCategoryCreate");
  } catch (_) { }
  return category;
}

export = {
  CUSTOM_PRIVATE_CATEGORY_NAME,
  CATEGORY_INDEX_PREFIX_RE,
  extractCategoryIndexPrefix,
  stripCategoryIndexPrefix,
  isCanonicalCustomPrivateCategoryName,
  isCustomPrivateCategoryName,
  isCustomPrivateCategory,
  listCustomPrivateCategories,
  getCustomPrivateCategoryIdSet,
  isChannelInCustomPrivateCategory,
  tryDeleteEmptyCustomPrivateCategory,
  ensureCustomPrivateCategory,
  syncCustomPrivateCategoryLayout,
};
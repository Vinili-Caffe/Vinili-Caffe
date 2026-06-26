const { ChannelType, PermissionFlagsBits } = require("discord.js");
const IDs = require("../Config/ids");

const CUSTOM_PRIVATE_CATEGORY_NAME = "⁰⁹・ PRIVATE ・";

function normalizeCategoryName(name) {
  return String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isCustomPrivateCategoryName(name) {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return false;
  if (normalized === normalizeCategoryName(CUSTOM_PRIVATE_CATEGORY_NAME)) return true;
  return normalized.includes("private");
}

function isConfiguredCustomPrivateCategory(category) {
  const configured = String(IDs?.categories?.categoryPrivate || "").trim();
  return Boolean(configured && category && String(category.id) === configured);
}

function isCustomPrivateCategory(category) {
  if (!category || category.type !== ChannelType.GuildCategory) return false;
  return isCustomPrivateCategoryName(category.name) || isConfiguredCustomPrivateCategory(category);
}

function listCustomPrivateCategories(guild) {
  if (!guild?.channels?.cache) return [];
  const out = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildCategory) continue;
    if (isCustomPrivateCategoryName(ch.name) || isConfiguredCustomPrivateCategory(ch)) out.push(ch);
  }
  return out.sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));
}

function getCustomPrivateCategoryIdSet(guild) {
  const ids = new Set();
  const configured = String(IDs?.categories?.categoryPrivate || "").trim();
  if (configured) ids.add(configured);
  for (const cat of listCustomPrivateCategories(guild)) ids.add(String(cat.id));
  return ids;
}

function isChannelInCustomPrivateCategory(channel, guild) {
  const parentId = String(channel?.parentId || "");
  if (!parentId || !guild) return false;
  return getCustomPrivateCategoryIdSet(guild).has(parentId);
}

async function warmGuildChannelsIfNeeded(guild) {
  if (!guild?.channels?.cache?.size && typeof guild?.channels?.fetch === "function") {
    await guild.channels.fetch().catch(() => { });
  }
}

function countCustomPrivateCategoryChildren(guild, categoryId, excludeChannelId = "") {
  const catId = String(categoryId || "");
  const exclude = String(excludeChannelId || "");
  if (!guild?.channels?.cache || !catId) return 0;
  return guild.channels.cache.filter(
    (ch) => String(ch.parentId || "") === catId && String(ch.id) !== exclude,
  ).size;
}

async function placeCategoryBelowAnchor(guild, category) {
  const anchorId = String(IDs?.categories?.categoryPrivateAnchor || "").trim();
  if (!anchorId || !category) return;
  const anchor =
    guild.channels.cache.get(anchorId) ||
    (await guild.channels.fetch(anchorId).catch(() => null));
  if (anchor?.type !== ChannelType.GuildCategory) return;
  await category.setPosition(anchor.rawPosition + 1).catch(() => { });
}

async function tryDeleteEmptyCustomPrivateCategory(guild, { excludeChannelId = "", reason = "Auto cleanup empty custom private category" } = {}) {
  if (!guild) return false;
  await warmGuildChannelsIfNeeded(guild);
  let deletedAny = false;
  for (const cat of listCustomPrivateCategories(guild)) {
    const count = countCustomPrivateCategoryChildren(guild, cat.id, excludeChannelId);
    if (count > 0) continue;
    const ok = await cat.delete(reason).then(() => true).catch((err) => {
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

async function ensureCustomPrivateCategory(guild, client) {
  if (!guild || !client) return null;
  await warmGuildChannelsIfNeeded(guild);
  if (!client.customPrivateCategoryCache) client.customPrivateCategoryCache = new Map();
  const cachedId = client.customPrivateCategoryCache.get(guild.id);
  if (cachedId) {
    const cached =
      guild.channels.cache.get(cachedId) ||
      (await guild.channels.fetch(cachedId).catch(() => null));
    if (cached?.type === ChannelType.GuildCategory && (isCustomPrivateCategoryName(cached.name) || isConfiguredCustomPrivateCategory(cached))) {
      await placeCategoryBelowAnchor(guild, cached);
      return cached;
    }
    client.customPrivateCategoryCache.delete(guild.id);
  }
  const existing = listCustomPrivateCategories(guild)[0] || null;
  if (existing) {
    await placeCategoryBelowAnchor(guild, existing);
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
  await placeCategoryBelowAnchor(guild, category);
  client.customPrivateCategoryCache.set(guild.id, category.id);
  try {
    const { queueIdsCatalogSync } = require("../Config/idsAutoSync");
    queueIdsCatalogSync(client, guild.id, "customPrivateCategoryCreate");
  } catch (_) { }
  return category;
}

module.exports = {
  CUSTOM_PRIVATE_CATEGORY_NAME,
  isCustomPrivateCategoryName,
  isCustomPrivateCategory,
  listCustomPrivateCategories,
  getCustomPrivateCategoryIdSet,
  isChannelInCustomPrivateCategory,
  tryDeleteEmptyCustomPrivateCategory,
  ensureCustomPrivateCategory,
};
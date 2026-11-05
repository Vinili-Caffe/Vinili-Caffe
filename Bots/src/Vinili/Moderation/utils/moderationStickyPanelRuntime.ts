const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached, getClientChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { personalityPanelUpdateOne } = require("../../Community/services/globalSettingsGuildStores") as typeof import("../../Community/services/globalSettingsGuildStores");
const {
  MOD_GUIDE_BUTTON_IDS,
  buildModerationGuideStickyPayload,
} = require("./moderationGuidePanelComponents") as typeof import("./moderationGuidePanelComponents");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "1329080093599076474").trim();
const moderationStickyLocks = new Map();

function getSanzioniChannelId() {
  return String(IDs.channels?.sanzioniUtenti || "1442569245878648924").trim();
}

function walkComponents(node?, out?) {
  if (!node) return;
  out.push(node);
  const children = node?.components || node?.data?.components || [];
  for (const child of children) walkComponents(child, out);
}

function iterMessageComponents(message?) {
  const out = [];
  for (const row of message?.components || []) walkComponents(row, out);
  return out;
}

function componentCustomId(c?) {
  return String(c?.customId || c?.custom_id || "");
}

function collectMessagePlainText(message?) {
  const parts = [];
  const embedDesc = String(
    message?.embeds?.[0]?.description || message?.embeds?.[0]?.data?.description || "",
  );
  if (embedDesc) parts.push(embedDesc);
  for (const c of iterMessageComponents(message)) {
    const content = String(c?.content || c?.data?.content || "").trim();
    if (content) parts.push(content);
  }
  return parts.join("\n").toLowerCase();
}

function isModerationStickyPanelMessage(message?) {
  if (!message?.author?.bot) return false;
  const ids = new Set(MOD_GUIDE_BUTTON_IDS);
  for (const c of iterMessageComponents(message)) {
    if (ids.has(componentCustomId(c))) return true;
  }
  const text = collectMessagePlainText(message);
  return text.includes("applicare") && text.includes("sanzioni") && text.includes("prove");
}

async function getSanzioniPanelRow(channelId?) {
  const { GlobalSettings } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const doc = await GlobalSettings.findOne({ guildId: MAIN_GUILD_ID })
    .select("personalityPanels")
    .lean()
    .catch(() => null);
  const row = (doc?.personalityPanels || []).find((x?) => String(x?.channelId) === String(channelId));
  return row || null;
}

async function saveSanzioniPanelMessageId(channelId?, messageId?) {
  const cid = String(channelId || "").trim();
  const mid = messageId ? String(messageId) : null;
  if (!cid) return;
  await personalityPanelUpdateOne({ channelId: cid }, { $set: { sanzioniPanelMessageId: mid } }).catch(() => null);
}

async function resolveSanzioniChannel(client?, channelRef?) {
  if (channelRef?.isTextBased?.()) return channelRef;
  const channelId = getSanzioniChannelId();
  if (!channelId) return null;
  if (channelRef?.guild) {
    return (
      channelRef.guild.channels.cache.get(channelId) ||
      (await getGuildChannelCached(channelRef.guild, channelId))
    );
  }
  return client?.channels?.cache?.get(channelId) || (await getClientChannelCached(client, channelId));
}

async function deleteRecentModerationStickies(channel?, keepId = "") {
  const keep = String(keepId || "").trim();
  const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!recent?.size) return;
  const deletions = [];
  for (const message of recent.values()) {
    if (!isModerationStickyPanelMessage(message)) continue;
    if (keep && String(message.id) === keep) continue;
    deletions.push(message.delete().catch(() => null));
  }
  if (deletions.length) await Promise.all(deletions);
}

async function withModerationStickyLock(channelId?, fn?) {
  const lockKey = String(channelId || "").trim();
  if (!lockKey) return fn();
  while (moderationStickyLocks.get(lockKey)) {
    await moderationStickyLocks.get(lockKey);
  }
  let release;
  const gate = new Promise((resolve?) => {
    release = resolve;
  });
  moderationStickyLocks.set(lockKey, gate);
  try {
    return await fn();
  } finally {
    moderationStickyLocks.delete(lockKey);
    release?.();
  }
}

/** Guida sanzioni solo sul sito: cancella sticky Discord se ancora presente. */
async function removeModerationStickyPanel(client?, channelRef?) {
  const channel = await resolveSanzioniChannel(client, channelRef);
  if (!channel?.isTextBased?.()) return null;

  return withModerationStickyLock(channel.id, async () => {
    const panelRow = await getSanzioniPanelRow(channel.id);
    const existingId = String(panelRow?.sanzioniPanelMessageId || "").trim();
    if (existingId) {
      const existing = await channel.messages.fetch(existingId).catch(() => null);
      if (existing) await existing.delete().catch(() => null);
    }
    await deleteRecentModerationStickies(channel, "");
    await saveSanzioniPanelMessageId(channel.id, null);
    return null;
  });
}

/** @deprecated sticky guida rimossa — alias di removeModerationStickyPanel */
async function ensureModerationStickyPanel(client?, channelRef?) {
  return removeModerationStickyPanel(client, channelRef);
}

async function maybeRepositionModerationStickyNow(_channelRef?, _client?) {
  return null;
}

async function maybeRepositionModerationSticky(_channelRef?, _client?, _options: Record<string, any> = {}) {
  return null;
}

export = {
  getSanzioniChannelId,
  buildModerationGuideStickyPayload,
  removeModerationStickyPanel,
  ensureModerationStickyPanel,
  maybeRepositionModerationSticky,
  maybeRepositionModerationStickyNow,
  isModerationStickyPanelMessage,
};

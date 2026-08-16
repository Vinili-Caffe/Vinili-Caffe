const { getPartnershipConfigSync } = require("../../MultiGuild/core/tenantPartnershipSettings");
const { normalizePartnerDescriptionInviteLinks } = require("../../Utils/Partner/partnershipMessageUtils");
const { resolveGuildInviteUrl } = require("../../Utils/Partner/tenantLeaderboardRuntime");
const {
  normalizeDescriptionText,
  extractPartnershipMessageText,
} = require("../../Utils/Partner/partnershipMessageBody");

const guildCache = new Map();

function getPartnerDescConfig(guildId) {
  const cfg = getPartnershipConfigSync(guildId);
  return cfg?.partnerDesc && typeof cfg.partnerDesc === "object" ? cfg.partnerDesc : null;
}

function isTenantPartnerDescriptionChannel(guildId, channelId) {
  const desc = getPartnerDescConfig(guildId);
  if (!desc || desc.mode !== "channel" || !desc.channelId) return false;
  return String(channelId || "") === String(desc.channelId);
}

function setTenantDescriptionCache(guildId, channelId, text, messageId = null) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  guildCache.set(gid, {
    channelId: String(channelId || ""),
    text: normalizeDescriptionText(text),
    messageId: messageId != null && String(messageId).trim() !== "" ? String(messageId).trim() : null,
  });
}

function clearTenantDescriptionCache(guildId) {
  const gid = String(guildId || "").trim();
  if (gid) guildCache.delete(gid);
}

function pickLatestDescriptionFromMessages(messages) {
  const list = [...(messages?.values?.() || messages || [])];
  const withContent = list
    .map((message) => ({ message, text: extractPartnershipMessageText(message) }))
    .filter((entry) => entry.text)
    .sort((a, b) => b.message.createdTimestamp - a.message.createdTimestamp);

  if (!withContent.length) return null;

  const nonBot = withContent.filter((entry) => !entry.message.author?.bot);
  const pick = (nonBot.length ? nonBot : withContent)[0];
  return { text: pick.text, messageId: pick.message.id };
}

async function syncTenantPartnerDescription(client, guildId) {
  const desc = getPartnerDescConfig(guildId);
  if (!desc || desc.mode !== "channel" || !desc.channelId || !client) {
    clearTenantDescriptionCache(guildId);
    return "";
  }

  const channelId = String(desc.channelId);
  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) {
    clearTenantDescriptionCache(guildId);
    return "";
  }

  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!messages?.size) {
    clearTenantDescriptionCache(guildId);
    return "";
  }

  const picked = pickLatestDescriptionFromMessages(messages);
  if (!picked) {
    clearTenantDescriptionCache(guildId);
    return "";
  }

  setTenantDescriptionCache(guildId, channelId, picked.text, picked.messageId);
  return picked.text;
}

async function applyTenantPartnershipInviteLink(client, guildId, text) {
  const normalized = normalizeDescriptionText(text);
  if (!normalized) return "";
  const inviteUrl = await resolveGuildInviteUrl(client, guildId).catch(() => null);
  if (!inviteUrl) return normalized;
  return normalizePartnerDescriptionInviteLinks(normalized, inviteUrl);
}

async function getTenantPartnerDescriptionText(client, guildId) {
  const desc = getPartnerDescConfig(guildId);
  if (!desc?.configured) return "";

  let text = "";
  if (desc.mode === "static") {
    text = normalizeDescriptionText(desc.staticText);
  } else if (desc.mode === "channel") {
    const cached = guildCache.get(String(guildId || ""));
    if (cached?.text && cached.channelId === String(desc.channelId || "")) {
      text = cached.text;
    } else {
      text = await syncTenantPartnerDescription(client, guildId);
    }
  }

  return applyTenantPartnershipInviteLink(client, guildId, text);
}

async function getTenantPartnerDescriptionTextOrSync(client, guildId) {
  const text = await getTenantPartnerDescriptionText(client, guildId);
  if (text) return text;
  const desc = getPartnerDescConfig(guildId);
  if (desc?.mode === "channel") {
    const synced = await syncTenantPartnerDescription(client, guildId);
    return applyTenantPartnershipInviteLink(client, guildId, synced);
  }
  return "";
}

async function handleTenantPartnerDescriptionMessageUpsert(client, message) {
  const guildId = message?.guild?.id || message?.guildId;
  const channelId = message?.channelId || message?.channel?.id;
  if (!guildId || !channelId || !isTenantPartnerDescriptionChannel(guildId, channelId)) {
    return false;
  }

  const text = extractPartnershipMessageText(message);
  if (!text) return false;

  setTenantDescriptionCache(guildId, channelId, text, message.id);
  return true;
}

async function handleTenantPartnerDescriptionMessageDelete(client, message) {
  const guildId = message?.guild?.id || message?.guildId;
  const channelId = message?.channelId || message?.channel?.id;
  if (!guildId || !channelId || !isTenantPartnerDescriptionChannel(guildId, channelId)) {
    return false;
  }

  const cached = guildCache.get(String(guildId));
  const deletedId = String(message?.id || "");
  if (cached?.messageId && deletedId && deletedId !== cached.messageId) {
    return false;
  }

  await syncTenantPartnerDescription(client || message?.client, guildId);
  return true;
}

async function syncAllTenantPartnerDescriptions(client) {
  if (!client) return;
  try {
    const { listConfiguredPartnershipGuildIds } = require("../../MultiGuild/core/tenantPartnershipSettings");
    for (const guildId of listConfiguredPartnershipGuildIds()) {
      const cfg = getPartnershipConfigSync(guildId);
      if (cfg?.partnerDesc?.mode === "channel" && cfg.partnerDesc.channelId) {
        await syncTenantPartnerDescription(client, guildId).catch(() => "");
      }
    }
  } catch (_) {}
}

module.exports = {
  isTenantPartnerDescriptionChannel,
  getTenantPartnerDescriptionText,
  getTenantPartnerDescriptionTextOrSync,
  syncTenantPartnerDescription,
  syncAllTenantPartnerDescriptions,
  handleTenantPartnerDescriptionMessageUpsert,
  handleTenantPartnerDescriptionMessageDelete,
  clearTenantDescriptionCache,
};

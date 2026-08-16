const IDs = require("../../Utils/Config/ids");
const {
  normalizeDescriptionText,
  extractPartnershipMessageText,
} = require("../../Utils/Partner/partnershipMessageBody");

const DESCRIPTION_CHANNEL_ID = String(IDs.channels?.descriptionPartner || "").trim();

let cachedText = "";
let cachedMessageId = null;

function isPartnerDescriptionChannel(channelId) {
  return Boolean(DESCRIPTION_CHANNEL_ID) && String(channelId || "") === DESCRIPTION_CHANNEL_ID;
}

function pickDescriptionFromMessages(messages, preferredMessageId = null) {
  const list = [...(messages?.values?.() || messages || [])];
  if (!list.length) return null;

  const preferred = String(preferredMessageId || "").trim();
  if (preferred) {
    const hit = list.find((message) => String(message?.id || "") === preferred);
    const text = extractPartnershipMessageText(hit);
    if (text) return { text, messageId: hit.id };
  }

  const withContent = list
    .map((message) => ({ message, text: extractPartnershipMessageText(message) }))
    .filter((entry) => entry.text)
    .sort((a, b) => a.message.createdTimestamp - b.message.createdTimestamp);

  if (!withContent.length) return null;
  if (withContent.length === 1) {
    return { text: withContent[0].text, messageId: withContent[0].message.id };
  }

  const nonBot = withContent.filter((entry) => !entry.message.author?.bot);
  const pick = (nonBot.length ? nonBot : withContent)[0];
  return { text: pick.text, messageId: pick.message.id };
}

function setPartnerDescriptionCache(text, messageId) {
  cachedText = normalizeDescriptionText(text);
  cachedMessageId = messageId != null && String(messageId).trim() !== "" ? String(messageId).trim() : null;
}

function getPartnerDescriptionText() {
  return cachedText;
}

function getPartnerDescriptionMessageId() {
  return cachedMessageId;
}

async function syncPartnerDescription(client) {
  if (!DESCRIPTION_CHANNEL_ID || !client) {
    setPartnerDescriptionCache("", null);
    return "";
  }

  const channel = client.channels.cache.get(DESCRIPTION_CHANNEL_ID) ||
    (await client.channels.fetch(DESCRIPTION_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.()) {
    setPartnerDescriptionCache("", null);
    return "";
  }

  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!messages?.size) {
    setPartnerDescriptionCache("", null);
    return "";
  }

  const picked = pickDescriptionFromMessages(messages, cachedMessageId);
  if (!picked) {
    setPartnerDescriptionCache("", null);
    return "";
  }

  setPartnerDescriptionCache(picked.text, picked.messageId);
  return cachedText;
}

async function getPartnerDescriptionTextOrSync(client) {
  if (cachedText) return cachedText;
  return syncPartnerDescription(client);
}

async function handlePartnerDescriptionMessageUpsert(client, message) {
  if (!message || !isPartnerDescriptionChannel(message.channelId || message.channel?.id)) return false;
  const text = extractPartnershipMessageText(message);
  if (!text) return false;
  setPartnerDescriptionCache(text, message.id);
  return true;
}

async function handlePartnerDescriptionMessageDelete(client, message) {
  if (!message || !isPartnerDescriptionChannel(message.channelId || message.channel?.id)) return false;
  const deletedId = String(message.id || "");
  if (cachedMessageId && deletedId && deletedId !== cachedMessageId) return false;
  await syncPartnerDescription(client || message.client);
  return true;
}

module.exports = {
  DESCRIPTION_CHANNEL_ID,
  isPartnerDescriptionChannel,
  getPartnerDescriptionText,
  getPartnerDescriptionMessageId,
  syncPartnerDescription,
  getPartnerDescriptionTextOrSync,
  handlePartnerDescriptionMessageUpsert,
  handlePartnerDescriptionMessageDelete,
};
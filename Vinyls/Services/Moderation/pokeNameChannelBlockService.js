const IDs = require("../../Utils/Config/ids");

const POKE_NAME_BOT_ID = String(IDs.bots?.PokeName || "874910942490677270");
const POKE_NAME_ALLOWED_CHANNEL_ID = String(IDs.channels?.poketwo || "1442569184281362552");

function isPokeNameBotMessage(message) {
  const authorId = String(message?.author?.id || "");
  const appId = String(message?.applicationId || "");
  return authorId === POKE_NAME_BOT_ID || appId === POKE_NAME_BOT_ID;
}

function isPokeNameAllowedChannel(message) {
  const channelId = String(message?.channelId || message?.channel?.id || "");
  if (channelId === POKE_NAME_ALLOWED_CHANNEL_ID) return true;
  const parentId = String(message?.channel?.parentId || "");
  return parentId === POKE_NAME_ALLOWED_CHANNEL_ID;
}

/**
 * Elimina i messaggi di Poké-Name fuori dal canale pokétwo.
 * @returns {Promise<boolean>} true se il messaggio è stato rimosso (o tentato).
 */
async function maybeDeletePokeNameOutsideAllowedChannel(message) {
  if (!message?.guild || message.system) return false;
  if (!isPokeNameBotMessage(message)) return false;
  if (isPokeNameAllowedChannel(message)) return false;
  await message.delete().catch(() => {});
  return true;
}

module.exports = {
  POKE_NAME_BOT_ID,
  POKE_NAME_ALLOWED_CHANNEL_ID,
  isPokeNameBotMessage,
  isPokeNameAllowedChannel,
  maybeDeletePokeNameOutsideAllowedChannel,
};
const IDs = require("../Config/ids");

function partnersChatChannelId() {
  return String(IDs.channels?.partnersChat || "").trim();
}

/** #partners-chat o thread sotto quel canale (comandi PM / thread giornaliero). */
function isChannelOrThreadUnderPartnersChat(channel) {
  const chat = partnersChatChannelId();
  if (!channel) return false;
  const id = String(channel.id);
  if (chat && id === chat) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const parent = String(channel.parentId || "");
    if (chat && parent === chat) return true;
  }
  return false;
}

module.exports = {
  partnersChatChannelId,
  isChannelOrThreadUnderPartnersChat,
};
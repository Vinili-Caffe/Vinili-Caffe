const IDs = require("../Config/ids");

function partnersCmdsChannelId() {
  return String(IDs.channels?.partnersCmds || "").trim();
}

function partnersChatChannelId() {
  return String(IDs.channels?.partnersChat || "").trim();
}

/** #partners-cmds, #partners-chat o thread sotto uno di questi (comandi PM / thread giornaliero). */
function isChannelOrThreadUnderPartnersCmds(channel) {
  const cmds = partnersCmdsChannelId();
  const chat = partnersChatChannelId();
  if (!channel) return false;
  const id = String(channel.id);
  if (cmds && id === cmds) return true;
  if (chat && id === chat) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const parent = String(channel.parentId || "");
    if (cmds && parent === cmds) return true;
    if (chat && parent === chat) return true;
  }
  return false;
}

module.exports = {
  partnersCmdsChannelId,
  partnersChatChannelId,
  isChannelOrThreadUnderPartnersCmds,
};
const IDs = require("../Config/ids");
const { getStaffChatThreadIds } = require("../Global/globalSettingsBucket");

function staffChatChannelId() {
  return String(IDs.channels?.staffChat || "").trim();
}

/** #staff-chat o thread sotto quel canale. */
function isChannelOrThreadUnderStaffChat(channel) {
  const chat = staffChatChannelId();
  if (!channel) return false;
  const id = String(channel.id);
  if (chat && id === chat) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const parent = String(channel.parentId || "");
    if (chat && parent === chat) return true;
  }
  return false;
}

async function isStaffChatManagedThread(channel) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const chatId = staffChatChannelId();
  if (!chatId || String(channel.parentId || "") !== chatId) return false;
  const ids = await getStaffChatThreadIds();
  const threadId = String(channel.id);
  return threadId === ids.pm || threadId === ids.senior || threadId === ids.highStaff;
}

async function resolveStaffChatPmThread(client) {
  const cached = getStaffChatThreadIdsCache().pm;
  const threadId = cached || (await getStaffChatThreadIds()).pm;
  if (!threadId) return null;
  const resolved =
    client?.channels?.cache?.get(threadId) || (await client?.channels?.fetch(threadId).catch(() => null));
  return resolved?.isThread?.() ? resolved : null;
}

module.exports = {
  staffChatChannelId,
  isChannelOrThreadUnderStaffChat,
  isStaffChatManagedThread,
  resolveStaffChatPmThread,
};
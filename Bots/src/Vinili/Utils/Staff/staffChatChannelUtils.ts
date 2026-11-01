const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getStaffChatThreadIds } = require("../Global/globalSettingsBucket") as typeof import("../Global/globalSettingsBucket");
const {
  ensureStaffCmdsThreadIdsHydrated,
  isStaffCmdsManagedCommandsThread,
  staffCmdsChannelId,
} = require("./staffCmdsChannelUtils") as typeof import("./staffCmdsChannelUtils");

function staffChatChannelId() {
  return String(IDs.channels?.staffChat || "").trim();
}

function isChannelOrThreadUnderStaffChat(channel?) {
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

async function isStaffChatManagedThread(channel?) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const chatId = staffChatChannelId();
  if (!chatId || String(channel.parentId || "") !== chatId) return false;
  const ids = await getStaffChatThreadIds();
  const threadId = String(channel.id);
  return threadId === ids.pm || threadId === ids.senior || threadId === ids.highStaff || threadId === ids.blogger;
}

async function resolveStaffChatPmThread(client?) {
  const ids = await getStaffChatThreadIds();
  const threadId = String(ids?.pm || "").trim();
  if (!threadId) return null;
  const resolved =
    client?.channels?.cache?.get(threadId) || (await client?.channels?.fetch(threadId).catch(() => null));
  return resolved?.isThread?.() ? resolved : null;
}

async function staffChatCommandsDeniedReplyContent(channel?) {
  if (!isChannelOrThreadUnderStaffChat(channel)) return null;
  await ensureStaffCmdsThreadIdsHydrated().catch(() => {});
  if (await isStaffCmdsManagedCommandsThread(channel)) return null;
  const staffCmdsId = staffCmdsChannelId();
  const staffChatId = staffChatChannelId();
  const hint = staffCmdsId
    ? ` Usa un thread **Comandi** sotto <#${staffCmdsId}>.`
    : " Usa un thread **Comandi** sotto #staff-cmds.";
  const chatHint = staffChatId ? ` (non nei thread **Chat** sotto <#${staffChatId}>).` : ".";
  return (
    "<:vegax:1443934876440068179> I comandi staff vanno usati solo nei thread **Comandi** sotto #staff-cmds," +
    chatHint +
    hint
  );
}

export = {
  staffChatChannelId,
  isChannelOrThreadUnderStaffChat,
  isStaffChatManagedThread,
  resolveStaffChatPmThread,
  staffChatCommandsDeniedReplyContent,
};
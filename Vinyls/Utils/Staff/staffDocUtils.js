const StaffModel = require("../../Schemas/Staff/staffSchema");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");

async function getOrCreateStaffDoc(guildId, userId) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  let doc = await StaffModel.findOne({ guildId: g, userId: u });
  if (!doc) doc = new StaffModel({ guildId: g, userId: u });
  return doc;
}

async function deleteThreadForMessage(guild, messageIdOrMessage) {
  const id = typeof messageIdOrMessage === "object" && messageIdOrMessage != null
    ? String(messageIdOrMessage?.id || "")
    : String(messageIdOrMessage || "");
  if (!/^\d{16,20}$/.test(id)) return;
  const thread = guild.channels.cache.get(id) || (await getGuildChannelCached(guild, id));
  if (thread?.isThread?.()) {
    await thread.delete().catch(() => null);
  }
}

module.exports = { getOrCreateStaffDoc, deleteThreadForMessage };
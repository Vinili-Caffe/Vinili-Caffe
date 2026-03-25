const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");

function ensureStaff(profileDoc) {
  if (!profileDoc) return null;
  if (!profileDoc.staff) {
    profileDoc.staff = {};
  }
  return profileDoc.staff;
}

async function getOrCreateStaffDoc(guildId, userId) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  let doc = await ActivityUserProfile.findOne({ guildId: g, userId: u });
  if (!doc) {
    doc = new ActivityUserProfile({ guildId: g, userId: u });
  }
  ensureStaff(doc);
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

module.exports = { getOrCreateStaffDoc, deleteThreadForMessage, ensureStaff };
const IDs = require("../Config/ids");

const JOIN_GHOST_PING_CHANNEL_IDS = [IDs.channels?.news, IDs.channels?.eventAnnouncements]
  .filter(Boolean)
  .map((id) => String(id));

async function sendGhostUserPing(channel, userId) {
  if (!channel?.isTextBased?.()) return;
  const uid = String(userId || "").trim();
  if (!/^\d{17,22}$/.test(uid)) return;
  const msg = await channel
    .send({
      content: `<@${uid}>`,
      allowedMentions: { users: [uid] },
    })
    .catch(() => null);
  if (msg?.deletable) await msg.delete().catch(() => {});
}

/**
 * Un utente appena entrato nel server: ghost ping in #news e #eventi (solo server principale).
 */
async function ghostPingNewMemberOnJoin(client, member) {
  if (!client || !member?.user || member.user.bot) return;
  const uid = String(member.id || "").trim();
  if (!/^\d{17,22}$/.test(uid)) return;
  for (const chId of JOIN_GHOST_PING_CHANNEL_IDS) {
    const channel = await client.channels.fetch(chId).catch(() => null);
    await sendGhostUserPing(channel, uid);
  }
}

module.exports = {
  JOIN_GHOST_PING_CHANNEL_IDS,
  ghostPingNewMemberOnJoin,
};
const IDs = require("../Config/ids");

const JOIN_GHOST_PING_CHANNEL_IDS = [IDs.channels?.news, IDs.channels?.eventAnnouncements]
  .filter(Boolean)
  .map((id) => String(id));

function isGhostPingParentChannelId(channelId) {
  const cid = String(channelId || "").trim();
  if (!cid) return false;
  return JOIN_GHOST_PING_CHANNEL_IDS.includes(cid);
}

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

function resolveUserId(subject) {
  if (typeof subject === "string") return subject;
  return subject?.user?.id || subject?.member?.user?.id || subject?.guildMember?.user?.id || subject?.id;
}

async function isHumanUser(channel, subject) {
  if (subject?.user?.bot || subject?.member?.user?.bot || subject?.guildMember?.user?.bot) return false;
  if (subject?.bot) return false;

  const userId = resolveUserId(subject);
  if (!/^\d{17,22}$/.test(String(userId || ""))) return false;

  const guild = channel?.guild || subject?.guild || subject?.member?.guild || subject?.guildMember?.guild;
  if (guild?.members?.fetch) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.user?.bot) return false;
  }

  const client = channel?.client || guild?.client || subject?.client;
  if (client?.users?.fetch) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (user?.bot) return false;
  }

  return true;
}

/**
 * Ghost ping in a configured channel/thread only when the target is a human user.
 */
async function ghostPingUserIfHuman(channel, subject) {
  if (!channel?.isTextBased?.()) return;
  const parentId = channel.parentId || channel.id;
  if (!isGhostPingParentChannelId(parentId)) return;

  const userId = resolveUserId(subject);
  if (!(await isHumanUser(channel, subject))) return;

  await sendGhostUserPing(channel, userId);
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
  ghostPingUserIfHuman,
  ghostPingNewMemberOnJoin,
  isGhostPingParentChannelId,
};
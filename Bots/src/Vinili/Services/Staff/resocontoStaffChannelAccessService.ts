const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { RESOCONTO_SEGMENT_REVIEWER_USER_IDS } = require("../../Utils/Staff/resocontoAccess") as typeof import("../../Utils/Staff/resocontoAccess");

function buildResocontoStaffChannelMemberOverwrite() {
  return {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: false,
    SendMessagesInThreads: true,
    AttachFiles: true,
    EmbedLinks: true,
    AddReactions: true,
    UseExternalEmojis: true,
  };
}

async function ensureResocontoStaffChannelMemberOverwrite(channel?, userId?) {
  if (!channel?.permissionOverwrites?.edit || !userId) return;
  const uid = String(userId).trim();
  if (!/^\d{16,22}$/.test(uid)) return;

  const guild = channel.guild;
  if (!guild?.members?.fetch) return;

      const member =
    guild.members.cache.get(uid) ||
    (await guild.members.fetch(uid).catch(() => null));
  if (!member) return;

  await channel.permissionOverwrites
    .edit(member, buildResocontoStaffChannelMemberOverwrite(), {
      reason: "Accesso canale resoconti staff per revisore segmento",
    })
    .catch((err?) => {
      global.logger?.warn?.(
        "[RESOCONTO STAFF CHANNEL] Overwrite utente fallito:",
        uid,
        err?.message || err,
      );
    });
}

async function ensureResocontoStaffChannelAccessOnReady(client?) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return;

  const guildId = String(IDs.guilds?.main || "");
  const channelId = String(IDs.channels?.resocontiStaff || "").trim();
  if (!guildId || !channelId) {
    global.logger?.warn?.("[RESOCONTO STAFF CHANNEL] Manca main guild o resocontiStaff in ids.");
    return;
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  const channel =
    guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.permissionOverwrites?.edit) {
    global.logger?.warn?.("[RESOCONTO STAFF CHANNEL] Canale non valido:", channelId);
    return;
  }
  const userIds = new Set();
  for (const ids of Object.values(RESOCONTO_SEGMENT_REVIEWER_USER_IDS)) {
    for (const userId of Array.isArray(ids) ? ids : []) {
      if (userId) userIds.add(String(userId));
    }
  }
  for (const userId of userIds) {
    await ensureResocontoStaffChannelMemberOverwrite(channel, userId);
  }
}

function startResocontoStaffChannelAccessLoop(client?) {
  setImmediate(() => {
    ensureResocontoStaffChannelAccessOnReady(client).catch((err?) =>
      global.logger?.warn?.("[RESOCONTO STAFF CHANNEL] Avvio fallito:", err?.message || err),
    );
  });
}

export = {
  ensureResocontoStaffChannelAccessOnReady,
  startResocontoStaffChannelAccessLoop,
};

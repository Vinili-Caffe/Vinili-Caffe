const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const profileButton = require("../../Buttons/profile");
const IDs = require("../../Utils/Config/ids");
const { buildStaffProfilePayload, SECTION_HOME } = require("../../Utils/Staff/staffProfilePanelRuntime");

const PROFILE_STAFF_PM_ONLY_CHANNEL_ID = "1495544523848286340";
const PROFILE_STAFF_PROFILE_CHANNEL_IDS = new Set(
  [IDs.channels?.staffCmds, IDs.channels?.highCmds].filter(Boolean).map(String),
);

async function resolveTargetUser(message, args = []) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned) return mentioned;
  const raw = String(Array.isArray(args) ? args.join(" ") : "").trim();
  if (!raw) return message?.author || null;
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    return message.client.users.fetch(id).catch(() => null);
  }
  return message?.author || null;
}

async function upsertProfileReply(message, payload) {
  const normalizedPayload = {
    ...(payload && typeof payload === "object" ? payload : {}),
    allowedMentions: { repliedUser: false },
  };
  const botId = String(message?.client?.user?.id || "");
  if (!botId || !message?.channel?.messages?.fetch) {
    return safeMessageReply(message, normalizedPayload);
  }
  const recent = await message.channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = recent?.find?.(
    (msg) =>
      String(msg?.author?.id || "") === botId &&
      String(msg?.reference?.messageId || "") === String(message.id || "") &&
      msg?.editable,
  );
  if (existing) {
    const updated = await existing.edit(normalizedPayload).catch(() => null);
    if (updated) return updated;
  }
  return safeMessageReply(message, normalizedPayload);
}

module.exports = {
  name: "profile",
  allowEmptyArgs: true,
  usage: "`+profile` · `+profile @utente`",
  examples: ["+profile", "+profile @Lore"],

  async execute(message, args = []) {
    if (!message?.guild || !message?.author) return;
    await message.channel.sendTyping().catch(() => {});
    const targetUser = await resolveTargetUser(message, args);
    if (!targetUser) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Utente non trovato.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const channelId = String(message.channel?.id || "");
    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
    const targetHasPm = Boolean(IDs.roles?.PartnerManager && targetMember?.roles?.cache?.has(IDs.roles.PartnerManager));

    if (channelId === PROFILE_STAFF_PM_ONLY_CHANNEL_ID) {
      if (!targetHasPm) {
        await upsertProfileReply(message, {
          content: "<:VC_Attention:1482534443632558151> Qui `+profile` mostra solo profili **Partner Manager**.",
        });
        return;
      }
      const staffPayload = await buildStaffProfilePayload(
        message.guild,
        targetUser.id,
        message.author.id,
        message.client,
        SECTION_HOME,
        { sourceMessageId: message.id, partnersChatPanel: true },
      );
      await upsertProfileReply(message, staffPayload);
      return;
    }

    if (PROFILE_STAFF_PROFILE_CHANNEL_IDS.has(channelId)) {
      const staffPayload = await buildStaffProfilePayload(
        message.guild,
        targetUser.id,
        message.author.id,
        message.client,
        SECTION_HOME,
        { sourceMessageId: message.id, partnersChatPanel: false },
      );
      await upsertProfileReply(message, staffPayload);
      return;
    }

    const payload = await profileButton.buildPanelPayload(
      message.guild,
      targetUser.id,
      message.client,
      "home",
    );
    await upsertProfileReply(message, payload);
  },
};
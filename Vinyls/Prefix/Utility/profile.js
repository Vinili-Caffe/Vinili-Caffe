const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const profileButton = require("../../Buttons/profile");
const IDs = require("../../Utils/Config/ids");
const { buildStaffProfilePayload, SECTION_HOME } = require("../../Utils/Staff/staffProfilePanelRuntime");

const PROFILE_STAFF_PM_ONLY_CHANNEL_ID = "1495544523848286340";
const PROFILE_STAFF_OR_PM_CHANNEL_ID = String(IDs.channels?.staffCmds || "1442569262689554444");
const STAFF_NON_PM_ROLE_IDS = [
  IDs.roles?.Founder,
  IDs.roles?.Admin,
  IDs.roles?.HighStaff,
  IDs.roles?.Mod,
  IDs.roles?.Helper,
  IDs.roles?.Staff,
  IDs.roles?.CommunityManager,
].filter(Boolean).map((id) => String(id));

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
    const targetHasNonPmStaff = STAFF_NON_PM_ROLE_IDS.some((roleId) => targetMember?.roles?.cache?.has?.(roleId));

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

    if (channelId === PROFILE_STAFF_OR_PM_CHANNEL_ID) {
      if (!targetHasNonPmStaff) {
        await upsertProfileReply(message, {
          content: "<:VC_Attention:1482534443632558151> Qui `+profile` mostra solo **Staff** o **Staff + Partner Manager**.",
        });
        return;
      }
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
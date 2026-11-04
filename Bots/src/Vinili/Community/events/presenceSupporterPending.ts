const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { applyPronounGenderToEmbedForMember } = require("../../Community/utils/pronounGenderUtils") as typeof import("../../Community/utils/pronounGenderUtils");
const { SUPPORTER_STATUS_LINK_HINT_IT } = require("../../Community/utils/supporterStatusLink") as typeof import("../../Community/utils/supporterStatusLink");
const { isBotMember, computeSupporterLinkState } = require("./presenceSupporterInviteState") as typeof import("./presenceSupporterInviteState");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  getCachedState,
  setCachedState,
  setPendingState,
  deletePendingState,
  hasPendingState,
  resolveSupportersChannel,
  refreshMember,
  persistStatus,
} = require("./presenceSupporterStateCache") as typeof import("./presenceSupporterStateCache");
const { addRoleIfPossible } = require("./presenceSupporterRoles") as typeof import("./presenceSupporterRoles");

const PENDING_MS = 3 * 60 * 1000;
const ANNOUNCE_COOLDOWN_MS = 30 * 60 * 1000;

function buildPendingEmbed(member?) {
  const thumb = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: accountUsername(member),
      iconURL: thumb || undefined,
    })
    .setTitle(`Nuovx Fan ${E.VC_StarPink}`)
    .setThumbnail(thumb || null)
    .setDescription(
      [
        `<@${member.id}>, \`hai sbloccato:\``,
        `${E.VC_Reply} Ti verrà dato entro **3 minuti** dal bot!`,
        `${E.VC_Infinity} - Permesso di allegare immagini e link in chat`,
        `${E.VC_HeartWhite} - Permesso di cambiare nickname`,
        "",
        `${E.VC_Arrow} Metti ${SUPPORTER_STATUS_LINK_HINT_IT} nel tuo status.`,
      ].join("\n"),
    )
    .setFooter({ text: "Grazie per il tuo supporto!" });
  return applyPronounGenderToEmbedForMember(embed, member);
}

async function scheduleSupporterRoleGrantWithoutChannelEmbed(member?) {
  if (!member || isBotMember(member)) return;
  const guildId = member.guild.id;
  const userId = member.id;
  if (hasPendingState(guildId, userId)) return;

  setPendingState(guildId, userId, {
    timeout: null,
    messageId: null,
    inFlight: true,
  });

  const timeout = setTimeout(async () => {
    try {
      const freshMember = await refreshMember(member.guild, userId);
      if (!freshMember) {
        deletePendingState(guildId, userId);
        return;
      }
      const cached = getCachedState(guildId, userId);
      const stillHasInvite = computeSupporterLinkState(cached || { hasLink: true }, freshMember.presence).newHas;
      if (!stillHasInvite) {
        deletePendingState(guildId, userId);
        const current = getCachedState(guildId, userId);
        setCachedState(guildId, userId, {
          hasLink: false,
          lastAnnounced: current?.lastAnnounced || 0,
          lastMessageId: null,
          lastSeenOnlineAt: current?.lastSeenOnlineAt || 0,
          inviteMissSince: null,
        });
        return;
      }
      await addRoleIfPossible(freshMember);
      deletePendingState(guildId, userId);
    } catch (_) {
      deletePendingState(guildId, userId);
    }
  }, PENDING_MS);
  timeout.unref?.();

  setPendingState(guildId, userId, { timeout, messageId: null, inFlight: false });
  await persistStatus(guildId, userId, { hasLink: true, lastMessageId: null });
}

async function startPendingFlow(member?, channel?) {
  if (!member || isBotMember(member)) return;
  const guildId = member.guild.id;
  const userId = member.id;
  if (hasPendingState(guildId, userId)) return;

  const existing = getCachedState(guildId, userId);
  let sent = null;
  const botId = member.client.user?.id;

  if (existing?.lastMessageId && channel?.isTextBased?.() && botId) {
    try {
      const fetched = await channel.messages.fetch(existing.lastMessageId);
      if (fetched && String(fetched.author?.id) === String(botId)) {
        sent = fetched;
      }
    } catch (_) { }
  }

  if (!sent) {
    setPendingState(guildId, userId, { timeout: null, messageId: null, inFlight: true });

    sent = await channel
      .send({
        content: `<@${userId}>`,
        embeds: [buildPendingEmbed(member)],
      })
      .catch(() => null);
  } else {
    await sent
      .edit({
        content: `<@${userId}>`,
        embeds: [buildPendingEmbed(member)],
      })
      .catch(() => { });
    setPendingState(guildId, userId, { timeout: null, messageId: sent.id, inFlight: true });
  }

  if (sent) {
    const timeout = setTimeout(async () => {
      const freshMember = await refreshMember(member.guild, userId);
      if (!freshMember) {
        deletePendingState(guildId, userId);
        return;
      }
      const liveChannel = await resolveSupportersChannel(member.guild);
      const cached = getCachedState(guildId, userId);
      const stillHasInvite = computeSupporterLinkState(cached || { hasLink: true }, freshMember.presence).newHas;
      if (!stillHasInvite) {
        if (liveChannel?.isTextBased?.()) await liveChannel.messages.delete(sent.id).catch(() => { });
        deletePendingState(guildId, userId);
        const current = getCachedState(guildId, userId);
        setCachedState(guildId, userId, {
          hasLink: false,
          lastAnnounced: current?.lastAnnounced || 0,
          lastMessageId: null,
          lastSeenOnlineAt: current?.lastSeenOnlineAt || 0,
          inviteMissSince: null,
        });
        return;
      }
      await addRoleIfPossible(freshMember);
      deletePendingState(guildId, userId);
    }, PENDING_MS);
    timeout.unref?.();
    setPendingState(guildId, userId, { timeout, messageId: sent.id, inFlight: false });
  } else {
    deletePendingState(guildId, userId);
  }

  const current = getCachedState(guildId, userId);
  setCachedState(guildId, userId, { hasLink: true, lastAnnounced: Date.now(), lastMessageId: sent?.id || null, lastSeenOnlineAt: current?.lastSeenOnlineAt || Date.now(), inviteMissSince: null });
  await persistStatus(guildId, userId, { hasLink: true, lastMessageId: sent?.id || null, lastSentAt: new Date() });
}

export = {
  PENDING_MS,
  ANNOUNCE_COOLDOWN_MS,
  buildPendingEmbed,
  scheduleSupporterRoleGrantWithoutChannelEmbed,
  startPendingFlow,
};

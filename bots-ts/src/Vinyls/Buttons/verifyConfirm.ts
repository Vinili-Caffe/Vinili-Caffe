const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { upsertVerifiedMember, applyTenureForMember } = require("../Services/Community/communityOpsService") as typeof import("../Services/Community/communityOpsService");
const { addRolesAndGetMember, getGuildChannelCached, getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { removePreMemberRoleIfPresent } = require("../Utils/Community/preMemberRoleService") as typeof import("../Utils/Community/preMemberRoleService");
const { userAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const {
  parseVerifyCustomId,
  takePendingVerify,
} = require("../Utils/Moderation/verifyPendingStore") as typeof import("../Utils/Moderation/verifyPendingStore");

function formatUserList(list?) {
  if (!Array.isArray(list) || list.length === 0) return "Nessuno";
  const maxVisible = 5;
  const shown = list.slice(0, maxVisible);
  const lines = shown.map((entry?, index?) =>
    index === 0 ? `**${entry}**` : `<:VC_Space:1482459974667075685> **${entry}**`,
  );
  const remaining = list.length - shown.length;
  if (remaining > 0) lines.push(`<:VC_Space:1482459974667075685> \`+${remaining} users\``);
  return lines.join("\n");
}

function buildCancelledEmbed() {
  return new EmbedBuilder().setColor("#6f4e37").setTitle("Action cancelled!");
}

function buildResultEmbed(staffId?, ownerId?, successList?, failList?) {
  const successText = successList.length ? formatUserList(successList) : "Nessuno";
  const failText = failList.length ? formatUserList(failList) : "Tutti gli utenti sono stati verificati!";
  const ownerMark = ownerId && staffId === ownerId ? " <:owner:1465451914039787654>" : "";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Verification Result:")
    .setFields(
      {
        name: "<:trustedAdmin:1465451915428102156> Staff:",
        value: `<@${staffId}>${ownerMark}`,
      },
      {
        name: "<:success:1461731530333229226> Successful verifications",
        value: `<:rightSort:1461726104422453298> ${successText}`,
      },
      {
        name: "<:cancel:1461730653677551691> Unsuccessful verifications",
        value: `${failText}`,
      },
    );
}

function match(interaction?) {
  return interaction?.isButton?.() && Boolean(parseVerifyCustomId(interaction.customId));
}

async function execute(interaction?) {
  const parsed = parseVerifyCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id) !== parsed.authorId) {
    await interaction
      .reply({ content: "<:vegax:1443934876440068179> Questo pannello non è tuo.", flags: 1 << 6 })
      .catch(() => null);
    return true;
  }

  const pending = takePendingVerify(parsed.authorId, interaction.message?.id || parsed.promptMessageId);
  if (!pending) {
    await interaction
      .update({
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Action cancelled! [Timeout / Restart]")
            .setDescription("Sessione scaduta. Rifai `+verify`."),
        ],
        components: [],
      })
      .catch(() => null);
    return true;
  }

  if (parsed.action === "no") {
    await interaction.update({ embeds: [buildCancelledEmbed()], components: [] }).catch(() => null);
    return true;
  }

  const guild = interaction.guild;
  const guildId = guild?.id;
  const success = [];
  const fail = [];
  const modLogId = IDs.channels?.modLogs;
  const logChannel =
    modLogId && guild
      ? guild.channels.cache.get(modLogId) ||
        (await getGuildChannelCached(guild, modLogId)) ||
        (await getClientChannelCached(interaction.client, modLogId)) ||
        (await guild.channels.fetch(modLogId).catch(() => null))
      : null;
  const sanitizeEmbed = (v?) =>
    String(v || "")
      .replace(/[\\`*_~|>]/g, "\\$&")
      .replace(/\n/g, " ")
      .trim();
  const validVerifyRoleIds = pending.validVerifyRoleIds || [];
  const requiredVerifyRoleIds = pending.requiredVerifyRoleIds || [];

  for (const targetId of pending.targetIds || []) {
    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      fail.push(targetId);
      continue;
    }
    const cache = targetMember.roles?.cache;
    const rolesToAdd = cache && validVerifyRoleIds.filter((id?) => !cache.has(id));
    const displayName = targetMember.user?.username || targetMember.displayName || targetMember.id;
    try {
      if (rolesToAdd?.length > 0) {
        const resolvedMember = await addRolesAndGetMember(guild, targetMember.id, rolesToAdd);
        if (!resolvedMember) throw new Error("Failed to add roles");
        const missingRoleIds = requiredVerifyRoleIds.filter((id?) => !resolvedMember.roles.cache.has(id));
        if (missingRoleIds.length) throw new Error(`Verify roles not applied: ${missingRoleIds.join(",")}`);
        success.push(displayName);
        try {
          const record = await upsertVerifiedMember(guildId, targetMember.id, new Date());
          await applyTenureForMember(resolvedMember, record);
        } catch (dbErr) {
          global.logger?.warn?.("[+verify] upsert:", dbErr?.message || dbErr);
        }
        await removePreMemberRoleIfPresent(resolvedMember, "Verifica staff (+verify): preMember rimosso.").catch(() => {});
        if (logChannel?.isTextBased?.() && resolvedMember?.user) {
          const user = resolvedMember.user;
          const createdAtUnix = Math.floor((user.createdTimestamp || 0) / 1000);
          const createdAtText = createdAtUnix ? `<t:${createdAtUnix}:F>` : "-";
          const safeUsername = sanitizeEmbed(user.username);
          await logChannel
            .send({
              embeds: [
                new EmbedBuilder()
                  .setColor("#6f4e37")
                  .setTitle(`**${safeUsername}'s Verification Result:**`)
                  .setDescription(
                    `<:profile:1461732907508039834> **Member**: ${safeUsername} **[${user.id}]**\n` +
                      `<:creation:1461732905016492220> Creation: ${createdAtText}\n\n` +
                      "Status:\n" +
                      `<:VC_Space:1482459974667075685><:success:1461731530333229226> \`${safeUsername}\` has passed verification successfully.\n` +
                      "<:VC_Space:1482459974667075685><:VC_Space:1482459974667075685><:rightSort:1461726104422453298> Auto roles have been assigned as well.",
                  )
                  .setThumbnail(userAvatarUrlDynamic(user, { size: 256 }) || undefined),
              ],
            })
            .catch(() => {});
        }
      } else if (validVerifyRoleIds.every((id?) => cache.has(id))) {
        success.push(displayName);
        try {
          const record = await upsertVerifiedMember(guildId, targetMember.id, new Date());
          await applyTenureForMember(targetMember, record);
        } catch (_) {}
        await removePreMemberRoleIfPresent(targetMember, "Verifica staff (+verify): preMember rimosso.").catch(() => {});
      } else {
        fail.push(displayName);
      }
    } catch (err) {
      global.logger?.error?.(err);
      fail.push(displayName);
    }
  }

  await interaction.deferUpdate().catch(() => null);
  await interaction.message?.delete?.().catch(() => null);
  const resultMsg = await interaction.channel
    .send({
      embeds: [buildResultEmbed(interaction.user.id, interaction.guild?.ownerId, success, fail)],
      allowedMentions: { users: [] },
    })
    .catch(() => null);
  if (resultMsg) {
    const timer = setTimeout(() => resultMsg.delete().catch(() => {}), 5000);
    timer.unref?.();
  }
  return true;
}

export = { name: "verifyConfirm", order: 48, match, execute };

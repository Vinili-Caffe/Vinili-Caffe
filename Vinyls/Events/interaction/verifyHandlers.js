const { EmbedBuilder, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { safeReply, safeEditReply, safeDeferReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, getClientChannelCached, addRolesAndGetMember } = require("../../Utils/Interaction/interactionEntityCache");
const { verifyState, VERIFY_CODE_TTL_MS, VERIFY_MAX_ATTEMPTS, CENTRAL_VERIFY_LOG_CHANNEL_ID, VERIFY_PING_CHANNEL_IDS, VERIFY_CAPTCHA, getVerifyStateKey, clearVerifyState, isSponsorGuildVerify, getMainGuild, isUserVerifiedInMainGuild, makeExpiredEmbed, makeWrongAnswerEmbed, makeTooManyAttemptsEmbed, makeVerifyStartRow, makeVerifiedEmbed, makeAlreadyVerifiedEmbed, makeOwnerEmbed, isUnknownInteraction, sanitizeEmbedText, makeCode, makeCaptchaPng, resolveValidVerifyRoleIds, isAlreadyVerifiedInThisGuild } = require("../../Utils/Interaction/verifyUtils");
const { VERIFY_UNAVAILABLE, VERIFY_LOAD_MEMBER, VERIFY_CONFIG, VERIFY_ROLES_FAILED } = require("../../Utils/Text/replyMessages");
const { upsertVerifiedMember, applyTenureForMember } = require("../../Services/Community/communityOpsService");
const { userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");

const CONTEST_DISEGNI_VERIFY_FLOW_CHANNEL_ID = String(IDs.channels?.contestDisegniEventVerifyPing || "").trim();
const VERIFY_GHOST_PING_DELETE_MS = 2500;

function verifyInteractionIsInDisegniVerifyFlowChannel(interaction) {
  if (!CONTEST_DISEGNI_VERIFY_FLOW_CHANNEL_ID) return false;
  const target = CONTEST_DISEGNI_VERIFY_FLOW_CHANNEL_ID;
  if (String(interaction.channelId || "") === target) return true;
  const ch = interaction.channel;
  if (ch?.isThread?.() && String(ch.parentId || "") === target) return true;
  return false;
}

function withFooter(interaction, payload) {
  return payload?.embeds?.length ? applyDefaultFooterToEmbeds(payload, interaction?.guild) : payload;
}

async function finalizeVerification(interaction, member) {
  const guild = interaction.guild;
  const guildId = guild?.id;

  if (!guild || !guildId) {
    await safeReply(interaction, withFooter(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(VERIFY_UNAVAILABLE),
      ],
      flags: 1 << 6,
    })).catch(() => { });
    return true;
  }

  const freshMember = member?.id && (await getGuildMemberCached(guild, member.id, { preferFresh: true }));
  const targetMember = freshMember || member;
  if (!targetMember?.roles?.cache) {
    await safeReply(interaction, withFooter(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(VERIFY_LOAD_MEMBER),
      ],
      flags: 1 << 6,
    })).catch(() => { });
    return true;
  }

  const validRoleIds = await resolveValidVerifyRoleIds(guild);
  if (!validRoleIds.length) {
    await safeReply(interaction, withFooter(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(VERIFY_CONFIG),
      ],
      flags: 1 << 6,
    })).catch(() => {});
    return true;
  }

  const rolesToAdd = validRoleIds.filter((id) => !targetMember.roles.cache.has(id),);
  await safeDeferReply(interaction, { flags: 1 << 6 });

  const memberAfterAdd = await addRolesAndGetMember(guild, targetMember.id, rolesToAdd);
  if (!memberAfterAdd) {
    await safeEditReply(interaction, withFooter(interaction, {
      embeds: [new EmbedBuilder().setColor("Red").setDescription(VERIFY_LOAD_MEMBER)],
    })).catch(() => { });
    return true;
  }
  if (rolesToAdd.length > 0) {
    const missingRoles = rolesToAdd.filter((roleId) => !memberAfterAdd.roles.cache.has(roleId));
    if (missingRoles.length > 0) {
      await safeEditReply(interaction, withFooter(interaction, {
        embeds: [new EmbedBuilder().setColor("Red").setDescription(VERIFY_ROLES_FAILED)],
      })).catch(() => { });
      return true;
    }
  }

  try {
    const record = await upsertVerifiedMember(guildId, memberAfterAdd.id, new Date(),);
    await applyTenureForMember(memberAfterAdd, record);
  } catch (err) {
    global.logger?.warn?.("[VERIFY] upsertVerifiedMember/applyTenureForMember:", err);
  }

  const mainGuild = await getMainGuild(interaction.client);
  let logChannel = mainGuild ? await getGuildChannelCached(mainGuild, CENTRAL_VERIFY_LOG_CHANNEL_ID) : null;
  if (!logChannel?.isTextBased?.() && CENTRAL_VERIFY_LOG_CHANNEL_ID) {
    logChannel = await getClientChannelCached(interaction.client, CENTRAL_VERIFY_LOG_CHANNEL_ID);
  }
  if (logChannel?.isTextBased?.()) {
    const createdAtUnix = Math.floor(interaction.user.createdTimestamp / 1000);
    const createdAtText = `<t:${createdAtUnix}:F>`;
    const safeUsername = sanitizeEmbedText(interaction.user.username);
    const serverName = guild?.name || "Unknown";

    const logEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`**${safeUsername}'s Verification Result**`)
      .setDescription(`<:profile:1461732907508039834> **Member**: ${safeUsername} **[${interaction.user.id}]**\n` + `<:creation:1461732905016492220> Creation: ${createdAtText}\n` +
      `<:info:1466070288554004604> **Server**: ${sanitizeEmbedText(serverName)}\n\n` +
      `<:info:1466070288554004604> Status:\n` +
      `<:VC_Space:1482459974667075685><:success:1461731530333229226>\`${safeUsername}\` has passed verification successfully.\n` + "<:VC_Space:1482459974667075685><:VC_Space:1482459974667075685><:rightSort:1461726104422453298> Auto roles have been assigned as well.",)
      .setThumbnail(userAvatarUrlDynamic(interaction.member || interaction.user, { size: 256 }) || null);

    await logChannel.send({ embeds: [logEmbed] }).catch((err) => {
      global.logger?.warn?.("[VERIFY] Failed to send verification log:", err);
    });
  }

  if (!isSponsorGuildVerify(guildId)) {
    const pingContent = `<@${interaction.user.id}>`;
    const guildForPing = mainGuild || guild;
    const pingChannelIds = VERIFY_PING_CHANNEL_IDS && VERIFY_PING_CHANNEL_IDS.length ? VERIFY_PING_CHANNEL_IDS : [];
    const allowedMentions = { users: [interaction.user.id] };
    for (const channelId of pingChannelIds) {
      const pingChannel = channelId && guildForPing ? await getGuildChannelCached(guildForPing, channelId) : null;
      if (!pingChannel?.isTextBased?.()) continue;
      const pingMsg = await pingChannel.send({ content: pingContent, allowedMentions }).catch((err) => {
        global.logger?.warn?.("[VERIFY] Ping failed for channel", channelId, err?.message || err);
        return null;
      });
      if (pingMsg) {
        const t = setTimeout(() => pingMsg.delete().catch(() => {}), VERIFY_GHOST_PING_DELETE_MS);
        if (t?.unref) t.unref();
      }
    }

    if (verifyInteractionIsInDisegniVerifyFlowChannel(interaction)) {
      const disegniCh = guildForPing ? await getGuildChannelCached(guildForPing, CONTEST_DISEGNI_VERIFY_FLOW_CHANNEL_ID) : null;
      if (disegniCh?.isTextBased?.()) {
        const pingMsg = await disegniCh.send({ content: pingContent, allowedMentions }).catch((err) => {
          global.logger?.warn?.("[VERIFY] Ghost ping canale contest disegni:", err?.message || err);
          return null;
        });
        if (pingMsg) {
          const t = setTimeout(() => pingMsg.delete().catch(() => {}), VERIFY_GHOST_PING_DELETE_MS);
          if (t?.unref) t.unref();
        }
      }
    }
  }

  const serverName = guild?.name || "this server";
  await safeEditReply(interaction, withFooter(interaction, {
    content: "<:vegacheckmark:1443666279058772028> Verification done.",
    embeds: [makeVerifiedEmbed(serverName)],
  }));

  return true;
}

async function handleVerifyInteraction(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === "verify_start") {
      const guildId = interaction.guild?.id;
      const stateKey = getVerifyStateKey(interaction.user?.id, guildId);

      if (interaction.guild?.ownerId === interaction.user.id) {
        await safeReply(interaction, withFooter(interaction, {
          embeds: [makeOwnerEmbed()],
          flags: 1 << 6,
        }));
        return true;
      }

      let memberForVerify = interaction.member;
      if (
        interaction.guild &&
        memberForVerify &&
        (!memberForVerify.roles?.cache?.size ||
          memberForVerify.partial)
      ) {
        memberForVerify =
          (await interaction.guild.members
            .fetch(interaction.user.id)
            .catch(() => null)) || memberForVerify;
      }
      if (isAlreadyVerifiedInThisGuild(memberForVerify, guildId)) {
        await safeReply(interaction, withFooter(interaction, {
          embeds: [makeAlreadyVerifiedEmbed()],
          flags: 1 << 6,
        }));
        return true;
      }

      if (isSponsorGuildVerify(guildId)) {
        const verifiedInMain = await isUserVerifiedInMainGuild(interaction.client, interaction.user.id);
        if (!verifiedInMain) {
          await safeReply(interaction, withFooter(interaction, {
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setTitle("<:alarm:1461725841451909183> Server principale richiesto")
                .setDescription(
                  "Per verificarti in questo server devi essere nel **server principale Vinili & Caffè** e aver completato la **verifica** lì.\n\n" +
                  "<:rightSort:1461726104422453298> Unisciti qui: **https://discord.gg/viniliecaffe**\n" +
                  "<:rightSort:1461726104422453298> Completa la verifica nel server principale\n" +
                  "Poi torna qui e clicca di nuovo **Verify**.",
                ),
            ],
            flags: 1 << 6,
          }));
          return true;
        }
      }

      clearVerifyState(stateKey);

      const deferred = await safeDeferReply(interaction, { flags: 1 << 6 });
      if (!deferred) return true;
      try {
        const code = makeCode(VERIFY_CAPTCHA.codeLength);
        const captchaPng = await makeCaptchaPng(code);
        const captchaFile = new AttachmentBuilder(captchaPng, { name: "captcha.png", });

        const timeoutId = setTimeout(() => {
          clearVerifyState(stateKey);
        }, VERIFY_CODE_TTL_MS);
        if (typeof timeoutId?.unref === "function") timeoutId.unref();
        verifyState.set(stateKey, {
          code,
          expiresAt: Date.now() + VERIFY_CODE_TTL_MS,
          attemptsLeft: VERIFY_MAX_ATTEMPTS,
          timeoutId,
        });

        const embed = new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            `<:verification:1461725843125571758> Hello! Are you human? Let's find out!\n` +
            "`Please type the captcha below to be able to access this server!`\n\n" +
            "**Additional Notes:**\n" +
            "<:tracedColored:1461728858955976805> Type out the traced colored characters from left to right.\n" +
            "<:decoy:1461728857114546421> Ignore the decoy characters spread-around.\n" +
            "<:nocases:1461728855642341509> You do not have to respect characters cases (upper/lower case)!\n\n",
          )
          .setFooter({ text: "Verification Period: 5 minutes" })
          .setImage("attachment://captcha.png");

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify_enter").setLabel("Answer").setStyle(ButtonStyle.Primary),);

        await safeEditReply(interaction, withFooter(interaction, {
          embeds: [embed],
          components: [row],
          files: [captchaFile],
        }));

        try {
          const replyMsg = await interaction.fetchReply();
          if (replyMsg) {
            const state = verifyState.get(stateKey);
            if (state) {
              state.promptMessage = replyMsg;
              verifyState.set(stateKey, state);
            }
          }
        } catch (err) {
          global.logger?.warn?.("[verifyHandlers] ", err?.message || err);
        }
      } catch (err) {
        clearVerifyState(stateKey);
        global.logger?.warn?.("[verifyHandlers] verify_start failed:", err?.message || err);
        await safeEditReply(interaction, withFooter(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("<:vegax:1443934876440068179> Errore verifica")
              .setDescription(
                "Impossibile preparare il captcha in questo momento. Riprova tra poco.",
              ),
          ],
          components: [makeVerifyStartRow()],
        }));
      }
      return true;
    }

    if (interaction.customId === "verify_enter") {
      const stateKey = getVerifyStateKey(interaction.user?.id, interaction.guild?.id);
      const state = verifyState.get(stateKey);
      if (!state || Date.now() > state.expiresAt) {
        clearVerifyState(stateKey);
        try {
          await interaction.deferUpdate().catch((e) => {
            if (!isUnknownInteraction(e)) throw e;
          });
          const retryRow = makeVerifyStartRow();
          await interaction.message
            .edit({
              embeds: [makeExpiredEmbed()],
              components: [retryRow],
              files: [],
            })
            .catch(() => { });
        } catch {
          if (!interaction.replied && !interaction.deferred) {
            await safeReply(interaction, withFooter(interaction, {
              embeds: [makeExpiredEmbed()],
              components: [makeVerifyStartRow()],
              flags: 1 << 6,
            }));
          }
        }
        return true;
      }

      state.promptMessage = interaction.message;
      verifyState.set(stateKey, state);

      const modal = new ModalBuilder().setCustomId(`verify_code:${interaction.user.id}`)
        .setTitle("Captcha Answer");
      const input = new TextInputBuilder().setCustomId("verify_input").setLabel("Answer").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Type the captcha text here").setMaxLength(VERIFY_CAPTCHA.codeLength);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      try {
        await interaction.showModal(modal);
      } catch (error) {
        if (!isUnknownInteraction(error)) throw error;
      }
      return true;
    }
  }

  if (
    interaction.isModalSubmit() &&
    String(interaction.customId || "").startsWith("verify_code:")
  ) {
    const modalUserId = String(interaction.customId || "").split(":")[1] || "";
    if (modalUserId && modalUserId !== String(interaction.user?.id || "")) {
      await safeReply(interaction, withFooter(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Sessione non valida. Usa di nuovo **Verifica**.",
            ),
        ],
        flags: 1 << 6,
      })).catch(() => {});
      return true;
    }
    const stateKey = getVerifyStateKey(interaction.user?.id, interaction.guild?.id);
    const state = verifyState.get(stateKey);
    if (!state || Date.now() > state.expiresAt) {
      clearVerifyState(stateKey);
      const retryRow = makeVerifyStartRow();
      if (state?.promptMessage) {
        await state.promptMessage
          .edit({
            embeds: [makeExpiredEmbed()],
            components: [retryRow],
            files: [],
          })
          .catch(() => { });
      }
      await safeReply(interaction, withFooter(interaction, {
        embeds: [makeExpiredEmbed()],
        components: [makeVerifyStartRow()],
        flags: 1 << 6,
      }));
      return true;
    }

    let inputCode = "";
    try {
      inputCode = String(
        interaction.fields.getTextInputValue("verify_input") ?? "",
      ).trim();
    } catch {
      await safeReply(interaction, withFooter(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Risposta non valida. Riprova con **Verify**.",
            ),
        ],
        flags: 1 << 6,
      })).catch(() => {});
      return true;
    }
    if (inputCode.toLowerCase() !== state.code.toLowerCase()) {
      state.attemptsLeft -= 1;
      if (state.attemptsLeft <= 0) {
        clearVerifyState(stateKey);
        const retryRow = makeVerifyStartRow();
        if (state?.promptMessage) {
          await state.promptMessage
            .edit({
              embeds: [makeTooManyAttemptsEmbed()],
              components: [retryRow],
              files: [],
            })
            .catch(() => { });
        }
        await safeReply(interaction, withFooter(interaction, {
          embeds: [makeTooManyAttemptsEmbed()],
          components: [makeVerifyStartRow()],
          flags: 1 << 6,
        }));
        return true;
      }
      verifyState.set(stateKey, state);
      await safeReply(interaction, withFooter(interaction, {
        embeds: [makeWrongAnswerEmbed()],
        flags: 1 << 6,
      }));
      return true;
    }

    clearVerifyState(stateKey);

    const member = interaction.member;
    if (!member || !member.roles) {
      await safeReply(interaction, withFooter(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Errore interno: membro non trovato.",
            ),
        ],
        flags: 1 << 6,
      }));
      return true;
    }

    if (state.promptMessage) {
      await state.promptMessage
        .edit({
          content: "<:vegacheckmark:1443666279058772028> Verification done.",
          embeds: [],
          components: [],
        })
        .catch(() => { });
    }

    return await finalizeVerification(interaction, member);
  }

  return false;
}

module.exports = { handleVerifyInteraction };

module.exports.hasActiveVerifySession = function hasActiveVerifySession(userId, guildId = null) {
  if (!userId) return false;
  if (guildId) {
    const state = verifyState.get(getVerifyStateKey(userId, guildId));
    if (!state) return false;
    if (Date.now() > Number(state.expiresAt || 0)) return false;
    return true;
  }
  for (const [key, state] of verifyState.entries()) {
    if (!key.endsWith(`:${String(userId)}`)) continue;
    if (Date.now() > Number(state?.expiresAt || 0)) continue;
    return true;
  }
  return false;
};
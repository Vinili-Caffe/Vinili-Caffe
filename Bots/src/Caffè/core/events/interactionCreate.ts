const { InteractionType, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { buildErrorLogEmbed } = require("../../../shared/discord/errorLogEmbed") as typeof import("../../../shared/discord/errorLogEmbed");
const { checkButtonPermission, checkStringSelectPermission, checkModalPermission, checkSlashPermission, buildGlobalPermissionDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../../Moderation/utils/commandPermissions") as typeof import("../../Moderation/utils/commandPermissions");
const { handleButtonInteraction } = require("./interaction/buttonHandlers") as typeof import("./interaction/buttonHandlers");
const { getCentralChannel } = require("./interaction/commandUsageLogger") as typeof import("./interaction/commandUsageLogger");
const {
  PRIVATE_FLAG,
  acquireButtonSpamGuard,
  sendPrivateInteractionResponse,
} = require("../../../shared/discord/interactionAck") as typeof import("../../../shared/discord/interactionAck");
const MONO_GUILD_DENIED = "Questo bot è utilizzabile solo nei server autorizzati.";
const STANZA_BUTTON_DENIED ="<:VC_Attention:1482534443632558151> Solo il **creatore della stanza** e il **vice** possono usare questi pulsanti.";
const INTERACTION_DEDUPE_TTL_MS = 30 * 1000;

function markInteractionSeen(client?, interactionId?) {
  if (!interactionId) return false;
  if (!client._interactionSeenAt) client._interactionSeenAt = new Map();
  const seenAtMap = client._interactionSeenAt;
  const now = Date.now();
  const lastSeen = seenAtMap.get(interactionId) || 0;
  if (lastSeen && now - lastSeen < INTERACTION_DEDUPE_TTL_MS) return true;

  seenAtMap.set(interactionId, now);
  for (const [id, ts] of seenAtMap.entries()) {
    if (now - ts > INTERACTION_DEDUPE_TTL_MS) seenAtMap.delete(id);
  }
  return false;
}

function buildDeniedEmbed(gate?, controlLabel?, guild = null) {
  if (gate.reason === "stanza_actor") {
    return buildGlobalPermissionDeniedEmbed([], controlLabel, STANZA_BUTTON_DENIED, guild);
  }
  if (gate.reason === "not_owner") return buildGlobalNotYourControlEmbed();
  if (gate.reason === "mono_guild") {
    return buildGlobalPermissionDeniedEmbed([], controlLabel, MONO_GUILD_DENIED, guild);
  }
  return buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], controlLabel, null, guild);
}

async function runPermissionGate(interaction?) {
  if (interaction.isButton?.()) {
    const gate = await checkButtonPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "bottone")],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isStringSelectMenu?.()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "menu", interaction.guild)],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isModalSubmit?.()) {
    const gate = await checkModalPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "modulo", interaction.guild)],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  return true;
}

async function logInteractionError(interaction?, client?, err?) {
  try {
    global.logger?.error?.(
      `[INTERACTION ERROR] context=${String(interaction?.commandName || interaction?.customId || "unknown")} guild=${String(interaction?.guildId || "dm")} user=${String(interaction?.user?.id || "unknown")}`,
      err?.stack || err?.message || err,
    );
    const errorChannelId = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    const errorChannel = errorChannelId ? await getCentralChannel(client, errorChannelId) : null;

    if (errorChannel?.isTextBased?.()) {
      const contextValue = interaction?.commandName || interaction?.customId || "unknown";
      const embed = buildErrorLogEmbed({
        contextLabel: "Contesto",
        contextValue,
        userTag: interaction?.user?.tag || "unknown",
        error: err,
        serverName: interaction?.guild ? `${interaction.guild.name} [${interaction.guild.id}]` : null,
      });
      await errorChannel.send({ embeds: [embed] }).catch(() => { });
    }

    await sendPrivateInteractionResponse(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<a:VC_Cross:1482532424570376253> Errore durante l'esecuzione dell'interazione.",
          ),
      ],
      flags: PRIVATE_FLAG,
    });
  } catch (nestedErr) {
    global.logger.error("[interactionCreate] error-log", nestedErr);
  }
}

export = {
  name: "interactionCreate",
  async execute(interaction?, client?) {
    if (!interaction || interaction.replied || interaction.deferred) return;
    if (markInteractionSeen(client, interaction.id)) return;

    if (false) {
      const isComponentFlow =
        interaction.isButton?.() ||
        interaction.isStringSelectMenu?.() ||
        interaction.isModalSubmit?.();
      if (isComponentFlow) {
        if (
          (interaction.isButton?.() || interaction.isStringSelectMenu?.()) &&
          !interaction.replied &&
          !interaction.deferred
        ) {
          await interaction.deferUpdate().catch(() => { });
        }
        return;
      }
      if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Orange")
                .setDescription("Questo bot è utilizzabile solo nei server autorizzati."),
            ],
            flags: PRIVATE_FLAG,
          })
          .catch(() => { });
      }
      return;
    }

    let releaseButtonGuard = null;

    try {
      const buttonGuard = acquireButtonSpamGuard(interaction, client);
      releaseButtonGuard = buttonGuard.release;
      if (buttonGuard.blocked) {
        if (
          !interaction.replied &&
          !interaction.deferred &&
          (interaction.isButton?.() || interaction.isStringSelectMenu?.())
        ) {
          await interaction.deferUpdate().catch(() => { });
        }
        return;
      }

      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        const cmd = client.commands.get(`${interaction.commandName}:${interaction.commandType || 1}`,);
        if (cmd?.autocomplete) {
          await cmd.autocomplete(interaction, client);
        } else {
          await interaction.respond([]).catch(() => { });
        }
        return;
      }

      if (interaction.isChatInputCommand?.()) {
        const command = client.commands.get(`${interaction.commandName}:${interaction.commandType || 1}`,);
        if (!command) return;

        const allowed = await checkSlashPermission(interaction);
        if (!allowed) {
          await interaction
            .reply({
              embeds: [buildGlobalPermissionDeniedEmbed([], "comando", null, interaction.guild)],
              flags: PRIVATE_FLAG,
            })
            .catch(() => { });
          return;
        }

        await command.execute(interaction, client);
        return;
      }

      const allowedByGate = await runPermissionGate(interaction);
      if (!allowedByGate) return;

      if (interaction.isButton?.()) {
        const customId = String(interaction.customId || "");
        const gw = require("../../../shared/giveaway/giveawayService") as typeof import("../../../shared/giveaway/giveawayService");
        if (customId.startsWith("giveaway_enter:")) {
          const handled = await gw.enterGiveaway(interaction, client);
          if (handled) return;
        }
        if (customId.startsWith("giveaway_reroll:")) {
          const handled = await gw.rerollGiveaway(interaction, client);
          if (handled) return;
        }
        if (await handleButtonInteraction(interaction, client)) return;
      }
    } catch (err) {
      global.logger.error("[interactionCreate] error", err?.stack || err?.message || err);
      await logInteractionError(interaction, client, err);
    } finally {
      if (typeof releaseButtonGuard === "function") releaseButtonGuard();
    }
  },
};
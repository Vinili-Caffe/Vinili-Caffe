const { buildErrorLogEmbed } = require("./errorLogEmbed") as typeof import("./errorLogEmbed");
const {
  PRIVATE_FLAG,
  isAckError,
  isTransientDiscordError,
  sendPrivateInteractionResponse,
} = require("./interactionAck") as typeof import("./interactionAck");

/**
 * @param {object} options
 * @param {(client, interaction?) => string|null} options.resolveErrorChannelId
 * @param {(client, channelId) => Promise<any>} options.getCentralChannel
 * @param {object|((interaction, err) => object)} [options.userErrorPayload]
 * @param {(nestedErr) => void} [options.onNestedError]
 */
function createInteractionErrorLogger(options: Record<string, any> = {}) {
  const resolveErrorChannelId = options.resolveErrorChannelId;
  const getCentralChannel = options.getCentralChannel;
  const onNestedError =
    typeof options.onNestedError === "function"
      ? options.onNestedError
      : (nestedErr?) => {
          global.logger?.error?.("[interactionCreate] nested error handling failed", nestedErr);
        };

  function resolveUserPayload(interaction?, err?) {
    if (typeof options.userErrorPayload === "function") {
      return options.userErrorPayload(interaction, err);
    }
    if (options.userErrorPayload && typeof options.userErrorPayload === "object") {
      return { ...options.userErrorPayload, flags: options.userErrorPayload.flags ?? PRIVATE_FLAG };
    }
    return {
      content: "<a:VC_Alert:1482706673176150077> C'è stato un errore nell'esecuzione del comando.",
      flags: PRIVATE_FLAG,
    };
  }

  async function logInteractionError(interaction?, client?, err?) {
    try {
      global.logger?.error?.(
        `[INTERACTION ERROR] context=${String(interaction?.commandName || interaction?.customId || "unknown")} guild=${String(interaction?.guildId || "dm")} user=${String(interaction?.user?.id || "unknown")}`,
        err?.stack || err?.message || err,
      );
      const resolvedClient = client || interaction?.client || null;
      const errorChannelId =
        typeof resolveErrorChannelId === "function"
          ? resolveErrorChannelId(resolvedClient, interaction)
          : null;
      const errorChannel =
        errorChannelId && resolvedClient && typeof getCentralChannel === "function"
          ? await getCentralChannel(resolvedClient, errorChannelId)
          : null;

      if (errorChannel?.isTextBased?.()) {
        const contextValue = interaction?.commandName || interaction?.customId || "unknown";
        const staffEmbed = buildErrorLogEmbed({
          contextLabel: "Contesto",
          contextValue,
          userTag: interaction?.user?.tag || "unknown",
          error: err,
          serverName: interaction?.guild
            ? `${interaction.guild.name} [${interaction.guild.id}]`
            : null,
        });
        await errorChannel.send({ embeds: [staffEmbed] }).catch(() => null);
      }

      await sendPrivateInteractionResponse(interaction, resolveUserPayload(interaction, err));
    } catch (nestedErr) {
      if (isAckError(nestedErr)) return;
      if (isTransientDiscordError(nestedErr)) {
        global.logger?.warn?.(
          "[interactionCreate] Impossibile inviare risposta errore all'utente (Discord API non disponibile, es. 503).",
        );
        return;
      }
      onNestedError(nestedErr);
    }
  }

  return { logInteractionError, PRIVATE_FLAG };
}

export = { createInteractionErrorLogger };

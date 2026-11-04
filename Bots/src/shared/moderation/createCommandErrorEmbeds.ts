const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");

const { E } = require("../emojis/emojiCatalog") as typeof import("../emojis/emojiCatalog");
/**
 * @param {object} [options]
 * @param {string|number} [options.color]
 * @param {string} [options.cancelEmoji]
 * @param {(remaining: number) => string} [options.cooldownDescription]
 */
function createCommandErrorEmbeds(options: Record<string, any> = {}) {
  const color = options.color ?? "Red";
  const cancel = String(options.cancelEmoji || E.VC_Cross);

  function buildBaseErrorEmbed(title?, description?) {
    return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
  }

  function buildCooldownErrorEmbed(remainingSeconds?) {
    const remaining = Math.max(1, Number(remainingSeconds || 1));
    const description =
      typeof options.cooldownDescription === "function"
        ? options.cooldownDescription(remaining)
        : `${E.VC_Attention} Aspetta **${remaining}s** prima di usare un altro comando.`;
    return buildBaseErrorEmbed(`${cancel} Cooldown attivo`, description);
  }

  function buildBusyCommandErrorEmbed() {
    return buildBaseErrorEmbed(
      `${cancel} Comando in esecuzione`,
      `${E.VC_Attention} Hai già un comando in esecuzione, attendi un attimo.`,
    );
  }

  function buildMissingArgumentsErrorEmbed() {
    return buildBaseErrorEmbed(
      `${cancel} Argomenti mancanti`,
      `${E.VC_Attention} Non hai aggiunto nessun argomento.`,
    );
  }

  function buildInternalCommandErrorEmbed(rawError?) {
    const raw = String(rawError || "Errore sconosciuto");
    const compact = raw.length > 900 ? `${raw.slice(0, 900)}...` : raw;
    return buildBaseErrorEmbed(
      `${cancel} Errore comando`,
      `${E.VC_Attention} C'è stato un errore nell'esecuzione del comando.\n\`\`\`${compact}\`\`\``,
    );
  }

  return {
    buildBaseErrorEmbed,
    buildCooldownErrorEmbed,
    buildBusyCommandErrorEmbed,
    buildMissingArgumentsErrorEmbed,
    buildInternalCommandErrorEmbed,
  };
}

export = { createCommandErrorEmbeds };

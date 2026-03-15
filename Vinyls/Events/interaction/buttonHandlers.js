const EPHEMERAL_FLAG = 1 << 6;

function ensureEphemeralDefault(options) {
  if (options == null) return options;
  if (typeof options !== "object") return { content: String(options), flags: EPHEMERAL_FLAG };
  if (options.flags !== undefined || options.ephemeral !== undefined) return options;
  return { ...options, flags: EPHEMERAL_FLAG };
}

function wrapInteractionForEphemeralDefault(interaction) {
  if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) return interaction;
  const origReply = interaction.reply?.bind(interaction);
  if (origReply) {
    interaction.reply = function reply(options) {
      return origReply(ensureEphemeralDefault(options));
    };
  }
  const origDeferReply = interaction.deferReply?.bind(interaction);
  if (origDeferReply) {
    interaction.deferReply = function deferReply(options) {
      return origDeferReply(ensureEphemeralDefault(options || {}));
    };
  }
  return interaction;
}

module.exports = {
  async handleButtonInteraction(interaction, client) {
    const isComponent = interaction?.isButton?.() || interaction?.isStringSelectMenu?.() || interaction?.isModalSubmit?.();
    if (!isComponent) {
      return false;
    }
    wrapInteractionForEphemeralDefault(interaction);
    const handlers = client?.buttonHandlers;
    if (!Array.isArray(handlers) || handlers.length === 0) {
      return false;
    }
    for (const handler of handlers) {
      try {
        if (handler.match(interaction)) {
          const result = await handler.execute(interaction, client);
          return result === true;
        }
      } catch (error) {
        global.logger?.error?.(`[BUTTON_HANDLERS] ${handler.name} execute error:`, error);
      }
    }
    return false;
  },
};
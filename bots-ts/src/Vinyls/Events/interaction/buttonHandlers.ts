export = {
  async handleButtonInteraction(interaction?, client?) {
    const isComponent = interaction?.isButton?.() || interaction?.isStringSelectMenu?.() || interaction?.isUserSelectMenu?.() || interaction?.isChannelSelectMenu?.() || interaction?.isRoleSelectMenu?.() || interaction?.isModalSubmit?.();
    if (!isComponent) {
      return false;
    }
    const handlers = client?.buttonHandlers;
    if (!Array.isArray(handlers) || handlers.length === 0) {
      return false;
    }
    for (const handler of handlers) {
      try {
        if (handler.match(interaction)) {
          const result = await handler.execute(interaction, client);
          if (result === true) {
            return true;
          }
        }
      } catch (error) {
        global.logger?.error?.(
          `[BUTTON_HANDLERS] ${handler.name} execute error customId=${String(interaction?.customId || "")} guild=${String(interaction?.guildId || "dm")} user=${String(interaction?.user?.id || "unknown")}:`,
          error?.stack || error?.message || error,
        );
        if (!interaction?.replied && !interaction?.deferred) {
          await interaction
            .reply({
              content: "<a:VC_Cross:1482532424570376253> C'è stato un errore nell'esecuzione del pulsante.",
              flags: 1 << 6,
            })
            .catch(() => null);
        }
        return true;
      }
    }
    return false;
  },
};
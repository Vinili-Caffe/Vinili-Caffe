const { Events } = require("discord.js") as typeof import("discord.js");

function createInteractionCommandLogging({ logCommandUsage, channelId } = {} as any) {
  function isCommandInteraction(interaction?) {
    return (
      interaction?.isChatInputCommand?.() ||
      interaction?.isMessageContextMenuCommand?.() ||
      interaction?.isUserContextMenuCommand?.()
    );
  }

  function getCommandContent(interaction?) {
    if (interaction?.isChatInputCommand?.()) return `${interaction}`;
    if (interaction?.isMessageContextMenuCommand?.()) return `Context (messaggio): ${interaction.commandName}`;
    if (interaction?.isUserContextMenuCommand?.()) return `Context (utente): ${interaction.commandName}`;
    return interaction?.commandName || "unknown";
  }

  return {
    name: Events.InteractionCreate,
    async execute(interaction?, client?) {
      if (!interaction) return;
      if (!isCommandInteraction(interaction)) return;
      const resolvedClient = client || interaction.client || null;
      if (!resolvedClient?.channels) return;
      try {
        const user = interaction.user;
        if (!user) return;
        const resolvedChannelId =
          typeof channelId === "function" ? channelId(resolvedClient) : channelId;
        await logCommandUsage(resolvedClient, {
          channelId: resolvedChannelId,
          serverName: interaction.guild?.name || "DM",
          user: user.tag || user.username || "unknown",
          userId: user.id || "unknown",
          content: getCommandContent(interaction),
          userLike: interaction.member || interaction.user,
        });
      } catch (error) {
        global.logger?.error?.("[interactionCreateCommandLogging] failed:", error);
      }
    },
  };
}

function createPrefixCommandLogging({
  logCommandUsage,
  getStandardPrefixes,
  getPrefixOverrideMap = null,
  resolveLogChannelId,
} = {} as any) {
  function resolveCommandFromContent(message?, client?) {
    const content = String(message?.content || "");
    if (!content) return null;

    if (typeof getPrefixOverrideMap === "function") {
      const overrideMap = getPrefixOverrideMap(client) || new Map();
      let matchedOverridePrefix = null;
      for (const prefix of overrideMap.keys()) {
        if (!content.startsWith(prefix)) continue;
        if (!matchedOverridePrefix || prefix.length > matchedOverridePrefix.length) {
          matchedOverridePrefix = prefix;
        }
      }
      if (matchedOverridePrefix) {
        const raw = content.slice(matchedOverridePrefix.length).trim();
        const commandToken = String(raw.split(/\s+/)[0] || "").toLowerCase();
        if (!commandToken) return null;
        const resolved = overrideMap.get(matchedOverridePrefix)?.get(commandToken) || null;
        if (!resolved) return null;
        return { command: resolved, usedPrefix: matchedOverridePrefix };
      }
    }

    const prefixes = (getStandardPrefixes?.(client) || ["+"]).slice().sort((a?, b?) => b.length - a.length);
    const matchedPrefix = prefixes.find((prefix?) => content.startsWith(prefix));
    if (!matchedPrefix) return null;
    const raw = content.slice(matchedPrefix.length).trim();
    const commandToken = String(raw.split(/\s+/)[0] || "").toLowerCase();
    if (!commandToken) return null;
    const resolved =
      client?.pcommands?.get?.(commandToken) ||
      client?.pcommands?.get?.(client?.aliases?.get?.(commandToken)) ||
      null;
    if (!resolved) return null;
    return { command: resolved, usedPrefix: matchedPrefix };
  }

  return {
    name: Events.MessageCreate,
    async execute(message?, client?) {
      if (!message) return;
      if (message.__fromMessageUpdatePrefix) return;
      if (message.system || message.webhookId || message.author?.bot) return;
      const resolvedClient = client || message.client;
      if (!resolvedClient) return;
      const resolved = resolveCommandFromContent(message, resolvedClient);
      if (!resolved?.command) return;
      try {
        if (!message.author?.id) return;
        await logCommandUsage(resolvedClient, {
          channelId: resolveLogChannelId?.(resolvedClient),
          serverName: message.guild?.name || "DM",
          user: message.author.tag || message.author.username || "unknown",
          userId: message.author.id,
          content: message.content,
          userLike: message.member || message.author,
        });
      } catch (error) {
        global.logger?.error?.("[prefixCommandLogging] failed:", error);
      }
    },
  };
}

export = { createInteractionCommandLogging, createPrefixCommandLogging };

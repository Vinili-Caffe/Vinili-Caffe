const { Events } = require("discord.js");
const { logCommandUsage } = require("../Utils/Logging/commandUsageLogger");
const IDs = require("../Utils/Config/ids");
const { userAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity");

function getStandardPrefixes(client) {
  const configured = String(client?.config?.prefix || ",").trim() || ",";
  return Array.from(new Set([configured]));
}

function resolveCommandFromContent(message, client) {
  const content = String(message?.content || "");
  if (!content) return null;

  const prefixes = getStandardPrefixes(client).sort((a, b) => b.length - a.length);
  const matchedPrefix = prefixes.find((prefix) => content.startsWith(prefix));
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

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
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
        channelId: IDs.channels.commandLogChannel,
        serverName: message.guild?.name || "DM",
        user: message.author.tag || message.author.username || "unknown",
        userId: message.author.id,
        content: message.content,
        userAvatarUrl: userAvatarUrlDynamic(message.member || message.author, { size: 128 }),
      });
    } catch (error) {
      global.logger?.error?.("[prefixCommandLogging] failed:", error);
    }
  },
};

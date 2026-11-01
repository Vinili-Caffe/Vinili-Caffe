const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { isChannelInTicketCategory } = require("../../features/tickets/discord/ticketCategoryUtils") as typeof import("../../features/tickets/discord/ticketCategoryUtils");

/** Dopo strip invisibili / trim: `# Titolo` … `###### Titolo` (anche nbsp / ideographic space). */
const DISCORD_HEADING_LINE_RE = /^#{1,6}[\t\f\v \u00a0\u3000]+/;
const DISCORD_HEADING_FULLWIDTH_RE = /^＃{1,6}[\t\f\v \u00a0\u3000]+/;
const INVISIBLE_RE = /[\u200B-\u200D\uFEFF\u2060\u180E]/g;
const PATRON_ROLE_ID = String(IDs.roles?.Patron || "").trim();

function stripTripleBacktickFences(text?) {
  return String(text || "").replace(/```[\s\S]*?```/g, "");
}

function normalizeHeadingSource(content?) {
  return stripTripleBacktickFences(String(content || "").replace(/\r\n/g, "\n").replace(INVISIBLE_RE, ""));
}

function discordMessageUsesHeadingMarkdown(content?) {
  const raw = normalizeHeadingSource(content);
  if (!raw) return false;
  for (const line of raw.split("\n")) {
    const t = line.trimStart();
    if (DISCORD_HEADING_LINE_RE.test(t) || DISCORD_HEADING_FULLWIDTH_RE.test(t)) return true;
  }
  return false;
}

function memberHasPatronRole(member?) {
  if (!PATRON_ROLE_ID || !member?.roles?.cache) return false;
  if (member.roles.cache.has(PATRON_ROLE_ID)) return true;
  try {
    return Boolean(member.roles.resolve?.(PATRON_ROLE_ID));
  } catch {
    return false;
  }
}

function memberHasAdministrator(member?) {
  try {
    return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
  } catch {
    return false;
  }
}

async function resolveMemberForHeadingGate(message?) {
  const guild = message.guild;
  const userId = message.author?.id;
  if (!guild || !userId) return null;
  // preferFresh: ruoli aggiornati (Patron appena tolto/messo)
  const fresh = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
  if (fresh) return fresh;
  if (message.member) return message.member;
  return getGuildMemberCached(guild, userId).catch(() => null);
}

async function maybeBlockDiscordHeadingMarkdown(message?) {
  if (!message?.guild || message.system) return false;
  if (String(message.guild.id) === String(IDs.guilds?.test || "")) return false;
  if (message.author?.bot || message.webhookId) return false;
  // edit parziale senza content: non decidere
  if (message.content == null) return false;
  const channel = message.channel;
  if (!channel?.isTextBased?.()) return false;
  if (isChannelInTicketCategory(channel)) return false;
  if (!discordMessageUsesHeadingMarkdown(message.content)) return false;

  const member = await resolveMemberForHeadingGate(message);
  // Patron + Administrator; staff senza Admin resta bloccato
  if (member && (memberHasPatronRole(member) || memberHasAdministrator(member))) return false;

  const deleted = await message.delete().catch((err?) => {
    global.logger?.warn?.("[HEADING BLOCK] delete failed", {
      guildId: String(message.guild?.id || ""),
      channelId: String(message.channelId || ""),
      userId: String(message.author?.id || ""),
      code: err?.code,
      message: String(err?.message || err || ""),
    });
    return null;
  });
  return Boolean(deleted);
}

export = {
  maybeBlockDiscordHeadingMarkdown,
};

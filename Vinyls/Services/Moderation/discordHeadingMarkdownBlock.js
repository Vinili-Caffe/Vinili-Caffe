const { PermissionFlagsBits } = require("discord.js");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

/** Titoli Discord: inizio riga con 1–6 `#` seguiti da spazio (testo ingrandito). */
const DISCORD_HEADING_LINE_RE = /^#{1,6}\s+/m;

function stripTripleBacktickFences(text) {
  return String(text || "").replace(/```[\s\S]*?```/g, "");
}

function discordMessageUsesHeadingMarkdown(content) {
  const raw = stripTripleBacktickFences(String(content || "").replace(/\r\n/g, "\n"));
  if (!raw) return false;
  return DISCORD_HEADING_LINE_RE.test(raw);
}

function memberHasDiscordAdministrator(member) {
  if (!member?.permissions || typeof member.permissions.has !== "function") return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

async function memberHasLevel20OrMore(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  const row = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.totals.exp.level")
    .lean()
    .catch(() => null);
  const level = Math.max(0, Math.floor(Number(row?.profile?.totals?.exp?.level || 0)));
  return level >= 20;
}

/**
 * Elimina silenziosamente messaggi che usano titoli Markdown (# …) in chat: consentito solo con permesso **Amministratore** (Discord).
 * @returns {Promise<boolean>} true se il messaggio è stato rimosso (o tentato).
 */
async function maybeBlockDiscordHeadingMarkdown(message) {
  if (!message?.guild || message.system) return false;
  if (message.author?.bot || message.webhookId) return false;
  const channel = message.channel;
  if (!channel?.isTextBased?.()) return false;
  if (isChannelInTicketCategory(channel)) return false;
  if (!discordMessageUsesHeadingMarkdown(message.content)) return false;

  let member = message.member;
  if (!member && message.guild && message.author?.id) {
    member = await getGuildMemberCached(message.guild, message.author.id).catch(() => null);
  }
  if (!member) return false;
  if (memberHasDiscordAdministrator(member)) return false;
  if (await memberHasLevel20OrMore(message.guild?.id, message.author?.id)) return false;

  await message.delete().catch(() => {});
  return true;
}

module.exports = {
  discordMessageUsesHeadingMarkdown,
  maybeBlockDiscordHeadingMarkdown,
};
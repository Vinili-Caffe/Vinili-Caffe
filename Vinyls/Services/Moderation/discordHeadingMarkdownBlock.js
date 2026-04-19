const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");

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

/**
 * Elimina messaggi che usano titoli Markdown (# …) in chat: consentito solo con permesso **Amministratore** (Discord).
 * @returns {Promise<boolean>} true se il messaggio è stato rimosso.
 */
async function maybeBlockDiscordHeadingMarkdown(message) {
  if (!message?.guild || message.system) return false;
  if (message.author?.bot || message.webhookId) return false;
  const channel = message.channel;
  if (!channel?.isTextBased?.()) return false;
  if (!discordMessageUsesHeadingMarkdown(message.content)) return false;

  let member = message.member;
  if (!member && message.guild && message.author?.id) {
    member = await getGuildMemberCached(message.guild, message.author.id).catch(() => null);
  }
  if (!member) return false;
  if (memberHasDiscordAdministrator(member)) return false;

  await message.delete().catch(() => {});
  const tip = await channel
    .send({
      content: `${message.author}`,
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            "<:VC_Attention:1482534443632558151> In questa chat **non** puoi usare titoli con `#`, `##`, ecc. a inizio riga (Discord li rende troppo grandi). " +
              "Possono farlo **solo** gli utenti con permesso **Amministratore**.",
          ),
      ],
    })
    .catch(() => null);
  if (tip) scheduleMessageDeletion(tip, EPHEMERAL_TTL_SHORT_MS);
  return true;
}

module.exports = {
  discordMessageUsesHeadingMarkdown,
  maybeBlockDiscordHeadingMarkdown,
};
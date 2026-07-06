const { InteractionWebhook } = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const { hasStaffTicketRole } = require("./ticketStaffPanelBuild");

const TICKET_MEMBER_PROMPT_TTL_MS = 90_000;
const pendingTicketMemberPrompts = new Map();

function ticketMemberPromptKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function clearTicketMemberPrompt(guildId, userId) {
  const key = ticketMemberPromptKey(guildId, userId);
  const old = pendingTicketMemberPrompts.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  pendingTicketMemberPrompts.delete(key);
}

function registerTicketMemberPrompt(interaction, data) {
  const guildId = String(interaction.guild?.id || "");
  const userId = String(interaction.user?.id || "");
  if (!guildId || !userId) return;
  clearTicketMemberPrompt(guildId, userId);
  const key = ticketMemberPromptKey(guildId, userId);
  const timerId = setTimeout(() => pendingTicketMemberPrompts.delete(key), TICKET_MEMBER_PROMPT_TTL_MS);
  timerId.unref?.();
  pendingTicketMemberPrompts.set(key, {
    ...(data || {}),
    guildId,
    requesterId: userId,
    channelId: String(interaction.channelId || interaction.channel?.id || ""),
    interactionApplicationId: interaction.applicationId ? String(interaction.applicationId) : "",
    interactionToken: interaction.token ? String(interaction.token) : "",
    expiresAt: Date.now() + TICKET_MEMBER_PROMPT_TTL_MS,
    timerId,
  });
}

async function editTicketMemberPromptReply(client, pending, content) {
  const appId = pending?.interactionApplicationId;
  const token = pending?.interactionToken;
  if (!client || !appId || !token) return false;
  const hook = new InteractionWebhook(client, appId, token);
  return hook.editMessage("@original", { content, embeds: [], components: [] }).then(() => true).catch(() => false);
}

function extractMentionOrId(message) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned?.id) return String(mentioned.id);
  const match = String(message?.content || "").match(/\d{16,20}/);
  return match ? String(match[0]) : "";
}

async function handleTicketMemberPromptMessage(message) {
  if (!message?.guild || message.author?.bot || message.webhookId || message.system) return false;
  const key = ticketMemberPromptKey(message.guild.id, message.author.id);
  const pending = pendingTicketMemberPrompts.get(key);
  if (!pending) return false;
  if (Date.now() > Number(pending.expiresAt || 0)) {
    clearTicketMemberPrompt(message.guild.id, message.author.id);
    return false;
  }
  if (String(message.channelId || "") !== String(pending.channelId || "")) return false;
  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;
  if (/^annulla$/i.test(rawLine)) {
    clearTicketMemberPrompt(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    await editTicketMemberPromptReply(message.client, pending, "<:cancel:1461730653677551691> Operazione annullata.");
    return true;
  }

  const type = String(pending.type || "");
  if (type !== "ticket_add" && type !== "ticket_remove") return false;

  const ticketDoc = await Ticket.findOne({ channelId: message.channel.id, open: true }).lean().catch(() => null);
  if (!ticketDoc) {
    clearTicketMemberPrompt(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    await editTicketMemberPromptReply(message.client, pending, "<:vegax:1443934876440068179> Ticket non trovato o non aperto.");
    return true;
  }

  const member = message.member || (await getGuildMemberCached(message.guild, message.author.id).catch(() => null));
  if (!hasStaffTicketRole(member, ticketDoc.ticketType)) {
    clearTicketMemberPrompt(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    await editTicketMemberPromptReply(message.client, pending, "<:vegax:1443934876440068179> Non hai permesso per questa azione.");
    return true;
  }

  const targetId = extractMentionOrId(message);
  if (!targetId) return false;

  const targetMember = await getGuildMemberCached(message.guild, targetId).catch(() => null);
  if (!targetMember || targetMember.user?.bot) {
    clearTicketMemberPrompt(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    await editTicketMemberPromptReply(message.client, pending, "<:vegax:1443934876440068179> Utente non valido o bot.");
    return true;
  }

  if (type === "ticket_add") {
    await message.channel.permissionOverwrites.edit(targetId, {
      ViewChannel: true,
      SendMessages: true,
    }).catch(() => {});
    clearTicketMemberPrompt(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    await editTicketMemberPromptReply(
      message.client,
      pending,
      `<:vegacheckmark:1443666279058772028> <@${targetId}> è stato aggiunto al ticket.`,
    );
    return true;
  }

  const overwrite = message.channel.permissionOverwrites?.cache?.get?.(targetId);
  if (!overwrite || overwrite.type !== 1) {
    clearTicketMemberPrompt(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    await editTicketMemberPromptReply(message.client, pending, "<:vegax:1443934876440068179> Questo utente non ha permessi individuali nel ticket.");
    return true;
  }

  await message.channel.permissionOverwrites.edit(targetId, {
    ViewChannel: false,
    SendMessages: false,
  }).catch(() => {});
  clearTicketMemberPrompt(message.guild.id, message.author.id);
  await message.delete().catch(() => {});
  await editTicketMemberPromptReply(
    message.client,
    pending,
    `<:vegacheckmark:1443666279058772028> <@${targetId}> è stato rimosso dal ticket.`,
  );
  return true;
}

module.exports = {
  registerTicketMemberPrompt,
  clearTicketMemberPrompt,
  handleTicketMemberPromptMessage,
};
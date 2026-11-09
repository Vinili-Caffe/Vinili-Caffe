const { SlashCommandBuilder } = require("discord.js") as typeof import("discord.js");
const { safeEditReply, safeReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const Ticket = require("../../../tickets/data/guildFeatureBucketTicketModel");
const { getTicketSettingsSync } = require("../../../tickets/tenant/tenantTicketSettings") as typeof import("../../../tickets/tenant/tenantTicketSettings");
const { memberCanActAsTicketStaff } = require("../../../tickets/discord/ticketStaffPanelBuild") as typeof import("../../../tickets/discord/ticketStaffPanelBuild");
const { getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");

const EPHEMERAL_FLAG = 1 << 6;

function listQuickReplies(guildId?) {
  const settings: any = getTicketSettingsSync(guildId) || {};
  return Array.isArray(settings.quickReplies) ? settings.quickReplies : [];
}

function findReply(guildId?, rawId?) {
  const id = String(rawId || "").trim();
  if (!id) return null;
  return listQuickReplies(guildId).find((r?) => String(r?.id || "") === id) || null;
}

export = {
  category: "Ticket",
  helpDescription: "Invia una risposta rapida preimpostata nel ticket corrente.",
  data: new SlashCommandBuilder()
    .setName("risposta")
    .setDescription("Invia una risposta rapida nel ticket")
    .addStringOption((o?) =>
      o
        .setName("modello")
        .setDescription("Quale risposta usare")
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction?) {
    const guildId = interaction.guild?.id;
    if (!guildId) return interaction.respond([]).catch(() => null);
    const focused = String(interaction.options.getFocused(true)?.value || "")
      .trim()
      .toLowerCase();
    const choices = listQuickReplies(guildId)
      .filter((r?) => {
        if (!focused) return true;
        const title = String(r?.title || "").toLowerCase();
        const id = String(r?.id || "").toLowerCase();
        return title.includes(focused) || id.includes(focused);
      })
      .slice(0, 25)
      .map((r?) => ({
        name: String(r.title || r.id || "Risposta").slice(0, 100),
        value: String(r.id || "").slice(0, 100),
      }))
      .filter((c?) => c.value);
    return interaction.respond(choices).catch(() => null);
  },

  async execute(interaction?, client?) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    if (!guild || !channel?.isTextBased?.()) {
      return safeReply(interaction, {
        content: `${E.vegax} Usa questo comando in un canale ticket.`,
        flags: EPHEMERAL_FLAG,
      });
    }

    const settings: any = getTicketSettingsSync(guild.id) || {};
    if (settings.enabled !== true) {
      return safeReply(interaction, {
        content: `${E.vegax} I ticket non sono attivi su questo server.`,
        flags: EPHEMERAL_FLAG,
      });
    }

    const replies = listQuickReplies(guild.id);
    if (!replies.length) {
      return safeReply(interaction, {
        content: `${E.vegax} Non ci sono risposte rapide. Aggiungile dalla dashboard → Ticket.`,
        flags: EPHEMERAL_FLAG,
      });
    }

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => null);

    const ticket = await Ticket.findOne({ guildId: guild.id, channelId: channel.id, open: true }).lean().catch(() => null);
    if (!ticket) {
      return safeEditReply(interaction, {
        content: `${E.vegax} Questo non è un ticket aperto.`,
      });
    }

    const member =
      interaction.member ||
      (await getGuildMemberCached(guild, interaction.user.id).catch(() => null));
    if (!memberCanActAsTicketStaff(member, ticket)) {
      return safeEditReply(interaction, {
        content: `${E.vegax} Solo lo staff del ticket può usare le risposte rapide.`,
      });
    }

    const reply = findReply(guild.id, interaction.options.getString("modello"));
    if (!reply?.content) {
      return safeEditReply(interaction, {
        content: `${E.vegax} Risposta rapida non trovata.`,
      });
    }

    const sent = await channel
      .send({ content: String(reply.content).slice(0, 2000), allowedMentions: { parse: ["users", "roles"] } })
      .catch((err?) => {
        global.logger?.warn?.("[risposta] send failed", channel.id, err?.message || err);
        return null;
      });
    if (!sent) {
      return safeEditReply(interaction, {
        content: `${E.vegax} Non sono riuscito a inviare il messaggio nel ticket.`,
      });
    }

    return safeEditReply(interaction, {
      content: `${E.vegacheckmark} Inviata: **${String(reply.title || reply.id).slice(0, 60)}**.`,
    });
  },
};

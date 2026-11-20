/**
 * /bump — riporta in cima alla Vetrina di Vinili & Caffè la scheda del server dove lo usi.
 * Come Disboard: una volta ogni 2 ore per server, lo può fare chiunque nel server.
 */
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js") as typeof import("discord.js");

const SITE = "https://www.viniliecaffe.it";
const COLOR = 0xd99a5b;

export = {
  category: "Vetrina",
  helpDescription: "Riporta in cima alla Vetrina di Vinili & Caffè la scheda di questo server (ogni 2 ore).",
  data: new SlashCommandBuilder()
    .setName("bump")
    .setDescription("Riporta in cima alla Vetrina di Vinili & Caffè la scheda di questo server")
    .setDMPermission(false),

  async execute(interaction?, client?) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: "Usa /bump dentro un server.", flags: MessageFlags.Ephemeral }).catch(() => null);
    await interaction.deferReply().catch(() => null);
    let out: any = null;
    try {
      const { bumpGuildListing } = require("../../../../Vinili/site/boards/boardVotes") as typeof import("../../../../Vinili/site/boards/boardVotes");
      out = await bumpGuildListing(client || interaction.client, String(guild.id), {
        id: String(interaction.user.id),
        name: String(interaction.user.globalName || interaction.user.username || ""),
        channelId: String(interaction.channelId || ""),
      });
    } catch (err) {
      global.logger?.warn?.("[/bump] vetrina:", err?.message || err);
      out = { ok: false, message: "Non riesco a fare il bump adesso, riprova tra poco." };
    }

    const listingUrl = out?.slug ? `${SITE}/vetrina/scheda/?slug=${encodeURIComponent(out.slug)}` : `${SITE}/vetrina/`;
    /* ringraziamento personalizzato (tab Bump della scheda): diventa la risposta al comando */
    if (out?.ok && out.replyBody) {
      try {
        const { Routes } = require("discord.js") as typeof import("discord.js");
        const c = client || interaction.client;
        await c.rest.patch(Routes.webhookMessage(String(c.application?.id || c.user?.id), interaction.token), { body: out.replyBody });
        return null;
      } catch (err) {
        global.logger?.warn?.("[/bump] risposta personalizzata:", err?.message || err);
      }
    }
    if (out?.ok) {
      const next = out.nextBumpAt ? Math.floor(new Date(out.nextBumpAt).getTime() / 1000) : null;
      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("Bump fatto!")
        .setDescription(
          [`<@${interaction.user.id}> ha riportato **${out.name || guild.name}** in cima alla Vetrina di Vinili & Caffè.`, next ? `Il prossimo bump si può fare <t:${next}:R>.` : ""]
            .filter(Boolean)
            .join("\n"),
        )
        .setThumbnail(guild.iconURL({ size: 128 }) || null);
      const row = (new ActionRowBuilder() as any).addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Apri la scheda").setURL(listingUrl));
      return interaction.editReply({ embeds: [embed], components: [row] }).catch(() => null);
    }

    const next = out?.nextBumpAt ? Math.floor(new Date(out.nextBumpAt).getTime() / 1000) : null;
    const embed = new EmbedBuilder()
      .setColor(0xa83a2c)
      .setTitle(out?.error === "no_listing" ? "Server non in vetrina" : "Non ancora")
      .setDescription(
        out?.error === "bump_cooldown" && next
          ? `Il prossimo bump si può fare <t:${next}:R> (<t:${next}:t>).`
          : String(out?.message || "Bump non riuscito."),
      );
    const row =
      out?.error === "no_listing"
        ? (new ActionRowBuilder() as any).addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Metti il server in vetrina").setURL(`${SITE}/vetrina/invia/`))
        : null;
    return interaction.editReply({ embeds: [embed], components: row ? [row] : [] }).catch(() => null);
  },
};

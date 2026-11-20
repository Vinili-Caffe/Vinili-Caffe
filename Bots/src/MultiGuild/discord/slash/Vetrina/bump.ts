/**
 * /bump — riporta in cima alla Vetrina di Vinili & Caffè la scheda del server dove lo usi.
 * Come Disboard: una volta ogni 2 ore per server, lo può fare chiunque nel server. Risposta visibile a tutti.
 */
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js") as typeof import("discord.js");

const SITE = "https://www.viniliecaffe.it";
const VETRINA = `${SITE}/vetrina/`;
/** Immagine grande del messaggio quando il server non ha un banner. */
const FALLBACK_IMAGE = "https://cdn.viniliecaffe.it/images/hero-cafe-atmosphere.jpg";
const COLOR = 0xd99a5b;
const COLOR_WAIT = 0x6f4e37;

function isHttp(u?: string) {
  return /^https:\/\//i.test(String(u || ""));
}

function linkRow(buttons: { label: string; url: string; emoji?: string }[]) {
  const row = new ActionRowBuilder() as any;
  for (const b of buttons) {
    const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(b.label).setURL(b.url);
    if (b.emoji) btn.setEmoji(b.emoji);
    row.addComponents(btn);
  }
  return row;
}

export = {
  category: "Vetrina",
  /* il bump si vede da tutti, come quello di Disboard */
  alwaysPublicReply: true,
  publicReply: true,
  helpDescription: "Riporta in cima alla Vetrina di Vinili & Caffè la scheda di questo server (ogni 2 ore).",
  data: new SlashCommandBuilder()
    .setName("bump")
    .setDescription("Riporta in cima alla Vetrina di Vinili & Caffè la scheda di questo server")
    .setDMPermission(false),

  async execute(interaction?, client?) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: "Usa /bump dentro un server.", flags: MessageFlags.Ephemeral }).catch(() => null);
    await interaction.deferReply().catch(() => null);
    const c = client || interaction.client;
    let out: any = null;
    try {
      const { bumpGuildListing } = require("../../../../Vinili/site/boards/boardVotes") as typeof import("../../../../Vinili/site/boards/boardVotes");
      out = await bumpGuildListing(c, String(guild.id), {
        id: String(interaction.user.id),
        name: String(interaction.user.globalName || interaction.user.username || ""),
        channelId: String(interaction.channelId || ""),
      });
    } catch (err) {
      global.logger?.warn?.("[/bump] vetrina:", err?.message || err);
      out = { ok: false, message: "Non riesco a fare il bump adesso, riprova tra poco." };
    }

    /* ringraziamento personalizzato (tab Bump della scheda): diventa la risposta al comando */
    if (out?.ok && out.replyBody) {
      try {
        const { Routes } = require("discord.js") as typeof import("discord.js");
        await c.rest.patch(Routes.webhookMessage(String(c.application?.id || c.user?.id), interaction.token), { body: out.replyBody });
        return null;
      } catch (err) {
        global.logger?.warn?.("[/bump] risposta personalizzata:", err?.message || err);
      }
    }

    const botAvatar = c.user?.displayAvatarURL?.({ size: 128 }) || undefined;
    const listingUrl = out?.slug ? `${SITE}/vetrina/scheda/?slug=${encodeURIComponent(out.slug)}` : VETRINA;
    const next = out?.nextBumpAt ? Math.floor(new Date(out.nextBumpAt).getTime() / 1000) : null;

    if (out?.ok) {
      const name = String(out.name || guild.name);
      const lines = [
        `Grazie <@${interaction.user.id}>: **${name}** è tornato in cima alla [Vetrina](${listingUrl}).`,
        "",
        "**Fatti trovare da chi cerca una nuova community.**",
        "Ogni bump riporta il server tra i primi dell'elenco: più bump, più persone lo scoprono.",
      ];
      if (next) lines.push("", `⏰ Il prossimo bump si può fare <t:${next}:R>.`);
      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: "Vinili & Caffè · Vetrina", iconURL: botAvatar, url: VETRINA })
        .setTitle("Bump fatto! 🚀")
        .setURL(listingUrl)
        .setDescription(lines.join("\n"))
        .setImage(isHttp(out.bannerUrl) ? out.bannerUrl : FALLBACK_IMAGE);
      if (isHttp(out.iconUrl)) embed.setThumbnail(out.iconUrl);
      return interaction
        .editReply({
          embeds: [embed],
          components: [
            linkRow([
              { label: "Apri la scheda", url: listingUrl, emoji: "☕" },
              { label: "Vota il server", url: out?.slug ? `${SITE}/vetrina/vota/?slug=${encodeURIComponent(out.slug)}` : VETRINA, emoji: "⭐" },
            ]),
          ],
        })
        .catch(() => null);
    }

    if (out?.error === "no_listing") {
      const embed = new EmbedBuilder()
        .setColor(COLOR_WAIT)
        .setAuthor({ name: "Vinili & Caffè · Vetrina", iconURL: botAvatar, url: VETRINA })
        .setTitle("Questo server non è ancora in vetrina")
        .setDescription(
          ["Metti il server nella **Vetrina di Vinili & Caffè**: una scheda con descrizione, recensioni e voti.", "Quando è approvata, con `/bump` lo riporti in cima ogni 2 ore."].join("\n"),
        )
        .setImage(FALLBACK_IMAGE);
      return interaction.editReply({ embeds: [embed], components: [linkRow([{ label: "Metti il server in vetrina", url: `${SITE}/vetrina/invia/`, emoji: "✨" }])] }).catch(() => null);
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR_WAIT)
      .setAuthor({ name: "Vinili & Caffè · Vetrina", iconURL: botAvatar, url: VETRINA })
      .setTitle(out?.error === "bump_cooldown" ? "Ancora un attimo ⏳" : "Bump non riuscito")
      .setDescription(
        out?.error === "bump_cooldown" && next
          ? `Il server è già stato bumpato da poco.\nIl prossimo bump si può fare <t:${next}:R> (alle <t:${next}:t>).`
          : String(out?.message || "Bump non riuscito, riprova tra poco."),
      );
    return interaction.editReply({ embeds: [embed], components: [] }).catch(() => null);
  },
};

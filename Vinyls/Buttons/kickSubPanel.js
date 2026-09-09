const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  createLinkAuthorizeUrl,
  getLinkStatus,
  unlinkKickAccount,
  resolveSubSyncConfig,
} = require("../Services/Community/kickSubscriberSyncService");

const EPHEMERAL = 1 << 6;
const PREFIX = "kick_sub:";
const KICK_GREEN = 0x53fc18;
const MUTED = 0x64748b;

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && id.startsWith(PREFIX);
}

function buildPublicPanelPayload(cfg) {
  const slug = String(cfg?.streamerSlug || "diunk17").trim() || "diunk17";
  const roleMention = cfg?.roleId ? `<@&${cfg.roleId}>` : "il ruolo sub";
  const embed = new EmbedBuilder()
    .setColor(KICK_GREEN)
    .setTitle("Kick Sub")
    .setDescription(
      `Collega il tuo account **Kick**.\n` +
        `Per ricevere ${roleMention} devi essere sub di **${slug}** e scrivere **almeno un messaggio** nella chat dello stream su Kick (con badge Sub).\n\n` +
        `Il link da solo non assegna il ruolo.`,
    )
    .setFooter({ text: "I tuoi dati restano privati · solo tu vedi il collegamento" });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}open`)
      .setStyle(ButtonStyle.Success)
      .setLabel("Gestisci Kick")
      .setEmoji("🔗"),
  );
  return { embeds: [embed], components: [row] };
}

async function buildPrivateDashboard(client, discordUserId) {
  const cfg = resolveSubSyncConfig(client);
  const st = await getLinkStatus(client, discordUserId);
  const slug = String(cfg.streamerSlug || "diunk17").trim() || "diunk17";
  const components = [];

  if (!st.linked) {
    const url = await createLinkAuthorizeUrl(client, discordUserId);
    const embed = new EmbedBuilder()
      .setColor(MUTED)
      .setTitle("Il tuo Kick")
      .setDescription(
        `**Stato:** non collegato\n\n` +
          `1. Collega Kick qui sotto\n` +
          `2. Scrivi **un messaggio** nella chat di **${slug}** su Kick (devi essere sub)\n` +
          `3. Il ruolo Discord arriva in automatico\n\n` +
          `Il solo collegamento **non** assegna il ruolo.`,
      );
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Collega Kick").setURL(url),
      ),
    );
    return { embeds: [embed], components, flags: EPHEMERAL };
  }

  const exp = st.expiresAt
    ? `<t:${Math.floor(Number(st.expiresAt) / 1000)}:R>`
    : "—";
  const kickName = st.kickUsername || st.kickUserId;
  const embed = new EmbedBuilder()
    .setColor(st.subActive ? KICK_GREEN : MUTED)
    .setTitle("Il tuo Kick")
    .setDescription(
      `**Account:** \`${kickName}\`\n` +
        `**Sub attivo:** ${st.subActive ? "sì" : "no"}\n` +
        `**Scadenza:** ${exp}` +
        (st.subActive
          ? ""
          : `\n\n**Per il ruolo:** scrivi un messaggio nella chat di **${slug}** su Kick (badge Sub). Il link da solo non basta.`),
    );

  const url = await createLinkAuthorizeUrl(client, discordUserId);
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Ricollega").setURL(url),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}refresh`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Aggiorna"),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}unlink`)
        .setStyle(ButtonStyle.Danger)
        .setLabel("Scollega"),
    ),
  );
  return { embeds: [embed], components, flags: EPHEMERAL };
}

async function execute(interaction, client) {
  const cfg = resolveSubSyncConfig(client || interaction.client);
  if (!cfg.enabled) {
    await interaction
      .reply({ content: "Il sync Kick sub è disattivato.", flags: EPHEMERAL })
      .catch(() => null);
    return true;
  }

  const action = String(interaction.customId || "").slice(PREFIX.length);

    if (action.startsWith("staff_ok:") || action.startsWith("staff_no:") || action === "claim") {
    await interaction
      .reply({
        content:
          "Questa azione non è più disponibile. Per il ruolo sub: collega Kick e scrivi un messaggio in chat dello streamer.",
        flags: EPHEMERAL,
      })
      .catch(() => null);
    return true;
  }

  if (action === "open") {
    await interaction.deferReply({ flags: EPHEMERAL }).catch(() => {});
    try {
      const payload = await buildPrivateDashboard(interaction.client, interaction.user.id);
      await interaction.editReply(payload);
    } catch (err) {
      global.logger?.warn?.("[KICK SUB] open panel:", err?.message || err);
      await interaction
        .editReply({ content: "Non riesco ad aprire il pannello Kick adesso. Riprova tra poco." })
        .catch(() => null);
    }
    return true;
  }

  if (action === "refresh") {
    await interaction.deferUpdate().catch(() => {});
    try {
      const payload = await buildPrivateDashboard(interaction.client, interaction.user.id);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components, content: null });
    } catch (err) {
      global.logger?.warn?.("[KICK SUB] refresh:", err?.message || err);
    }
    return true;
  }

  if (action === "unlink") {
    await interaction.deferUpdate().catch(() => {});
    try {
      await unlinkKickAccount(interaction.client, interaction.user.id);
      const payload = await buildPrivateDashboard(interaction.client, interaction.user.id);
      await interaction.editReply({ embeds: payload.embeds, components: payload.components, content: null });
    } catch (err) {
      global.logger?.warn?.("[KICK SUB] unlink:", err?.message || err);
    }
    return true;
  }

  return false;
}

module.exports = {
  name: "kickSubPanel",
  order: 40,
  match,
  execute,
  buildPublicPanelPayload,
  buildPrivateDashboard,
};

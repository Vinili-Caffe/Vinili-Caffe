const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || "").replace(/[<@!>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

module.exports = {
  name: "level",
  aliases: [],
  usage: "+level | +level <@utente | id>",
  examples: ["+level", "+level @utente"],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const guildId = message.guild?.id;
    if (!guildId) return;

    if (!args.length) {
      await safeMessageReply(message, {
        ...buildLevelServerPanelPayload(message.author.id),
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const target = await resolveTargetUser(message, args[0]);
    if (!target) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Usa `+level` oppure `+level <@utente | id>`.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await safeMessageReply(message, {
      ...buildLevelUserPanelPayload(message.author.id, target.id),
      allowedMentions: { repliedUser: false },
    });
  },
};

function buildLevelServerPanelPayload(ownerId, targetUserId = null) {
  const safeOwner = String(ownerId || "");
  const safeTarget = String(targetUserId || "");
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Pannello Level — Server")
    .setDescription([
      "Usa questo pannello per gestire la configurazione EXP del server.",
      "",
      "Azioni rapide disponibili:",
      "- Configurazione corrente",
      "- Lock/Unlock canali EXP",
      "- Moltiplicatore evento / globale",
      "- Ignore/Unignore ruoli EXP",
    ].join("\n"));

  const rowSwitch = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`level_panel:view:server:${safeOwner}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel("Server"),
    new ButtonBuilder()
      .setCustomId(safeTarget ? `level_panel:view:user:${safeOwner}:${safeTarget}` : `level_panel:view:user:${safeOwner}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Utente")
      .setDisabled(!safeTarget),
  );
  const rowActions = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`level_panel:server_actions:${safeOwner}`)
      .setPlaceholder("Scegli azione server")
      .addOptions(
        { label: "config", value: "config", description: "Mostra configurazione level attuale" },
        { label: "lock", value: "lock", description: "Blocca EXP in un canale" },
        { label: "unlock", value: "unlock", description: "Sblocca EXP in un canale" },
        { label: "multiplier", value: "multiplier", description: "Imposta moltiplicatore evento temporaneo" },
        { label: "gmulti", value: "gmulti", description: "Imposta moltiplicatore globale" },
        { label: "ignore", value: "ignore", description: "Esclude un ruolo dal guadagno EXP" },
        { label: "unignore", value: "unignore", description: "Riabilita un ruolo al guadagno EXP" },
      ),
  );
  return { embeds: [embed], components: [rowSwitch, rowActions] };
}

function buildLevelUserPanelPayload(ownerId, targetUserId) {
  const safeOwner = String(ownerId || "");
  const safeTarget = String(targetUserId || "");
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Pannello Level — Utente")
    .setDescription([
      `Target: <@${safeTarget}>`,
      "",
      "Azioni rapide disponibili:",
      "- set exp/level",
      "- add/remove livelli",
      "- reset livello",
      "- sync ruoli livello",
    ].join("\n"));

  const rowSwitch = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`level_panel:view:server:${safeOwner}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Server"),
    new ButtonBuilder()
      .setCustomId(`level_panel:view:user:${safeOwner}:${safeTarget}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel("Utente"),
  );
  const rowActions = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`level_panel:user_actions:${safeOwner}:${safeTarget}`)
      .setPlaceholder("Scegli azione utente")
      .addOptions(
        { label: "set", value: "set", description: "Imposta exp o level manualmente" },
        { label: "add", value: "add", description: "Aggiunge livelli all'utente" },
        { label: "remove", value: "remove", description: "Rimuove livelli all'utente" },
        { label: "reset", value: "reset", description: "Azzera exp/livello dell'utente" },
        { label: "syncroles", value: "syncroles", description: "Sincronizza ruoli livello dell'utente" },
      ),
  );
  return { embeds: [embed], components: [rowSwitch, rowActions] };
}

module.exports.buildLevelServerPanelPayload = buildLevelServerPanelPayload;
module.exports.buildLevelUserPanelPayload = buildLevelUserPanelPayload;
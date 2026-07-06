const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");
const { KNOWN_RULE_DOTS } = require("./staffRegolamentoSteps");

const EPHEMERAL = MessageFlags.Ephemeral;
const IN_RULE = "sanziona_regola";
const IN_REASON = "sanziona_motivo";
const IN_DURATION = "sanziona_tempo";
const RULE_HINT = KNOWN_RULE_DOTS.slice(0, 12).join(", ") + "…";

function validateSanzionaTargetUser(targetUser, actorId) {
  if (!targetUser?.id) {
    return { ok: false, content: "<a:VC_Cross:1482532424570376253> Utente non valido." };
  }
  if (targetUser.bot) {
    return { ok: false, content: "<a:VC_Cross:1482532424570376253> Non puoi sanzionare un bot." };
  }
  if (String(targetUser.id) === String(actorId || "")) {
    return { ok: false, content: "<a:VC_Cross:1482532424570376253> Non puoi sanzionare te stesso." };
  }
  return { ok: true, targetUser };
}

function buildSanzionaModal(interaction, targetUser) {
  const modal = new ModalBuilder()
    .setCustomId(`sanziona_m:${interaction.user.id}:${targetUser.id}`)
    .setTitle("Sanziona utente");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(IN_RULE)
        .setLabel("Numero regola violata")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Es. 1.2")
        .setRequired(true)
        .setMaxLength(8),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(IN_REASON)
        .setLabel("Motivo (opzionale)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Se vuoto: Violazione della regola X (N°)")
        .setRequired(false)
        .setMaxLength(400),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(IN_DURATION)
        .setLabel("Tempo (opzionale, es. 4h)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Default dalla guida moderazione (${RULE_HINT})`)
        .setRequired(false)
        .setMaxLength(16),
    ),
  );
  return modal;
}

async function executeSanzionaContextMenu(interaction, targetUser) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "<a:VC_Cross:1482532424570376253> Comando disponibile solo nel server.",
      flags: EPHEMERAL,
    });
    return;
  }
  const check = validateSanzionaTargetUser(targetUser, interaction.user.id);
  if (!check.ok) {
    await interaction.reply({ content: check.content, flags: EPHEMERAL });
    return;
  }
  await interaction.showModal(buildSanzionaModal(interaction, check.targetUser));
}

module.exports = { executeSanzionaContextMenu };

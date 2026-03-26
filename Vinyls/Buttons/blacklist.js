const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const {
  normalizeGuildId,
  addPartnershipBlacklistGuild,
  removePartnershipBlacklistGuild,
  listPartnershipBlacklistGuilds,
} = require("../Services/Partner/partnershipBlacklistService");
const blacklistCommand = require("../Prefix/Admin/blacklist");

const PREFIX = "blacklist_ui";
const MODAL_PREFIX = "blacklist_ui_modal";
const PRIVATE_FLAG = 1 << 6;

function parseCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  const [prefix, action, ownerId] = parts;
  if (prefix !== PREFIX) return null;
  if (!/^\d{16,20}$/.test(String(ownerId || ""))) return null;
  return { action, ownerId };
}

function parseModalId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  const [prefix, action, ownerId] = parts;
  if (prefix !== MODAL_PREFIX) return null;
  if (!/^\d{16,20}$/.test(String(ownerId || ""))) return null;
  return { action, ownerId };
}

async function ensureOwnerAndRole(interaction, ownerId, mode = "view") {
  if (String(interaction.user?.id || "") !== String(ownerId)) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Questo pannello non è tuo.",
      flags: PRIVATE_FLAG,
    }).catch(() => {});
    return false;
  }
  const allowed =
    mode === "manage"
      ? blacklistCommand.hasBlacklistManageRole(interaction.member)
      : blacklistCommand.hasBlacklistViewRole(interaction.member);
  if (!allowed) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Non hai i ruoli necessari.",
      flags: PRIVATE_FLAG,
    }).catch(() => {});
    return false;
  }
  return true;
}

function buildListEmbed(rows) {
  if (!rows.length) {
    return new EmbedBuilder()
      .setColor("#57f287")
      .setDescription("Nessun server in blacklist partnership.");
  }
  const lines = rows.map((r) => `\`${r.guildId}\`${r.note ? ` — ${String(r.note).slice(0, 80)}` : ""}`);
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Server in blacklist partnership")
    .setDescription(lines.join("\n").slice(0, 3900));
}

function match(interaction) {
  const customId = String(interaction?.customId || "");
  return customId.startsWith(`${PREFIX}:`) || customId.startsWith(`${MODAL_PREFIX}:`);
}

async function execute(interaction) {
  if (interaction.isButton?.()) {
    const parsed = parseCustomId(interaction.customId);
    if (!parsed) return false;
    const { action, ownerId } = parsed;
    const requiredMode = action === "list" ? "view" : "manage";
    if (!(await ensureOwnerAndRole(interaction, ownerId, requiredMode))) return true;

    if (action === "list") {
      const rows = await listPartnershipBlacklistGuilds(40).catch(() => []);
      await interaction.reply({ embeds: [buildListEmbed(rows)], flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }

    if (action === "add" || action === "remove") {
      const modal = new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}:${action}:${ownerId}`)
        .setTitle(action === "add" ? "Aggiungi blacklist" : "Rimuovi blacklist");
      const idInput = new TextInputBuilder()
        .setCustomId("guild_id")
        .setLabel("Guild ID (17-20 cifre)")
        .setPlaceholder("1329080093599076474")
        .setRequired(true)
        .setStyle(TextInputStyle.Short);
      const noteInput = new TextInputBuilder()
        .setCustomId("note")
        .setLabel("Nota (opzionale)")
        .setPlaceholder("Motivo blacklist...")
        .setRequired(false)
        .setStyle(TextInputStyle.Short);
      modal.addComponents(
        new ActionRowBuilder().addComponents(idInput),
        new ActionRowBuilder().addComponents(noteInput),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
  }

  if (interaction.isModalSubmit?.()) {
    const parsed = parseModalId(interaction.customId);
    if (!parsed) return false;
    const { action, ownerId } = parsed;
    if (!(await ensureOwnerAndRole(interaction, ownerId, "manage"))) return true;

    const gid = normalizeGuildId(interaction.fields.getTextInputValue("guild_id"));
    if (!gid) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Guild ID non valido.",
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }

    if (action === "add") {
      const note = String(interaction.fields.getTextInputValue("note") || "").trim();
      const r = await addPartnershipBlacklistGuild(gid, interaction.user.id, note).catch(() => ({ ok: false, reason: "db_error" }));
      if (!r.ok) {
        await interaction.reply({
          content: `<:vegax:1443934876440068179> Errore: ${r.reason || "sconosciuto"}`,
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      await interaction.reply({
        content: `<:success:1461731530333229226> Server \`${gid}\` aggiunto alla blacklist partnership.`,
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }

    if (action === "remove") {
      const r = await removePartnershipBlacklistGuild(gid).catch(() => ({ deleted: false }));
      const content = r.deleted
        ? `<:success:1461731530333229226> Server \`${gid}\` rimosso dalla blacklist.`
        : `Nessuna entry per \`${gid}\` (già assente o ID errato).`;
      await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
  }

  return false;
}

module.exports = { name: "blacklist", order: 40, match, execute };

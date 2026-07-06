const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const {
  normalizeGuildId,
  addPartnershipBlacklistGuild,
  removePartnershipBlacklistGuild,
  listPartnershipBlacklistGuilds,
} = require("../Services/Partner/partnershipBlacklistService");
const { extractInviteCode, fetchInviteGuildMeta } = require("../Utils/Partner/partnershipBlacklistDisplay");
const blacklistCommand = require("../Prefix/Staff/blacklist");
const { partnersChatPartnerCommandDeniedReplyContent, schedulePartnersDeniedDeleteReply } = require("../Utils/Partner/partnersChatChannelUtils");
const PREFIX = "blacklist_ui";
const MODAL_PREFIX = "blacklist_ui_modal";
const PRIVATE_FLAG = 1 << 6;

function parseCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  const [prefix, action, ownerId] = parts;
  if (prefix !== PREFIX) return null;
  if (!/^\d{16,20}$/.test(String(ownerId || ""))) return null;
  const pageIndex = parts.length >= 4 && /^\d+$/.test(String(parts[3] || "")) ? Number(parts[3]) : null;
  return { action, ownerId, pageIndex };
}

function parseModalId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  const [prefix, action, ownerId] = parts;
  if (prefix !== MODAL_PREFIX) return null;
  if (!/^\d{16,20}$/.test(String(ownerId || ""))) return null;
  if (action !== "add" && action !== "remove") return null;
  const panelMessageId =
    parts.length >= 4 && /^\d{16,20}$/.test(String(parts[3] || "")) ? String(parts[3]) : null;
  return { action, ownerId, panelMessageId };
}

async function refreshBlacklistPanelMessage(interaction, ownerId, panelMessageId, pageIndex = 0) {
  const mid = String(panelMessageId || "").trim();
  const ch = interaction.channel;
  if (!mid || !ch?.messages?.fetch || !interaction.guild) return;
  const msg = await ch.messages.fetch(mid).catch(() => null);
  if (!msg?.editable) return;
  const canView = blacklistCommand.hasBlacklistViewRole(interaction.member);
  const canManage = blacklistCommand.hasBlacklistManageRole(interaction.member);
  const rows = canView ? await listPartnershipBlacklistGuilds(200).catch(() => []) : [];
  const safeIndex = blacklistCommand.normalizePageIndex(pageIndex, rows.length);
  const payload = await blacklistCommand.buildBlacklistPanelPayload(
    interaction.client,
    ownerId,
    canView,
    canManage,
    rows,
    safeIndex,
  );
  await msg.edit(payload).catch(() => null);
}

async function ensureOwnerAndRole(interaction, ownerId, mode = "view") {
  if (String(interaction.user?.id || "") !== String(ownerId)) {
    await interaction.reply({
      content: "<a:VC_Alert:1482706673176150077> Questo pannello non è tuo.",
      flags: 1 << 6,
    }).catch(() => {});
    return false;
  }
  const allowed =
    mode === "manage"
      ? blacklistCommand.hasBlacklistManageRole(interaction.member)
      : blacklistCommand.hasBlacklistViewRole(interaction.member);
  if (!allowed) {
    await interaction.reply({
      content: "<a:VC_Alert:1482706673176150077> Non hai i ruoli necessari.",
      flags: 1 << 6,
    }).catch(() => {});
    return false;
  }
  return true;
}

function match(interaction) {
  const customId = String(interaction?.customId || "");
  return customId.startsWith(`${PREFIX}:`) || customId.startsWith(`${MODAL_PREFIX}:`);
}

async function execute(interaction) {
  const deniedZone = await partnersChatPartnerCommandDeniedReplyContent(interaction.channel);
  if (deniedZone) {
    await interaction.reply({ content: deniedZone, flags: PRIVATE_FLAG }).catch(() => {});
    schedulePartnersDeniedDeleteReply(interaction);
    return true;
  }
  if (interaction.isButton?.()) {
    const parsed = parseCustomId(interaction.customId);
    if (!parsed) return false;
    const { action, ownerId, pageIndex } = parsed;
    const requiredMode = action === "prev" || action === "next" ? "view" : "manage";
    if (!(await ensureOwnerAndRole(interaction, ownerId, requiredMode))) return true;

    if (action === "prev" || action === "next") {
      const rows = await listPartnershipBlacklistGuilds(200).catch(() => []);
      if (!rows.length) {
        await interaction.deferUpdate().catch(() => {});
        return true;
      }
      const currentIndex = blacklistCommand.normalizePageIndex(pageIndex, rows.length);
      const delta = action === "next" ? 1 : -1;
      const nextIndex = blacklistCommand.normalizePageIndex(currentIndex + delta, rows.length);
      const canView = blacklistCommand.hasBlacklistViewRole(interaction.member);
      const canManage = blacklistCommand.hasBlacklistManageRole(interaction.member);
      const payload = await blacklistCommand.buildBlacklistPanelPayload(
        interaction.client,
        ownerId,
        canView,
        canManage,
        rows,
        nextIndex,
      );
      await interaction.update(payload).catch(() => interaction.message?.edit?.(payload).catch(() => {}));
      return true;
    }

    if (action === "add" || action === "remove") {
      const panelMessageId = interaction.message?.id;
      if (!panelMessageId) {
        await interaction.reply({
          content: "<:vegax:1443934876440068179> Impossibile aggiornare il pannello: messaggio non trovato. Rilancia `+blacklist`.",
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      const modal = new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}:${action}:${ownerId}:${panelMessageId}`)
        .setTitle(action === "add" ? "Aggiungi blacklist" : "Rimuovi blacklist");
      const idInput = new TextInputBuilder()
        .setCustomId("guild_id")
        .setLabel("Guild ID")
        .setPlaceholder("1329080093599076474")
        .setRequired(true)
        .setStyle(TextInputStyle.Short);
      const noteInput = new TextInputBuilder()
        .setCustomId("note")
        .setLabel(action === "add" ? "Motivo blacklist" : "Conferma (motivo)")
        .setPlaceholder("Motivo blacklist...")
        .setRequired(true)
        .setStyle(TextInputStyle.Paragraph);
      const rows = [new ActionRowBuilder().addComponents(idInput), new ActionRowBuilder().addComponents(noteInput)];
      if (action === "add") {
        const inviteInput = new TextInputBuilder()
          .setCustomId("invite")
          .setLabel("Invito Discord")
          .setPlaceholder("https://discord.gg/...")
          .setRequired(false)
          .setStyle(TextInputStyle.Short);
        rows.splice(1, 0, new ActionRowBuilder().addComponents(inviteInput));
      }
      modal.addComponents(...rows);
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
  }

  if (interaction.isModalSubmit?.()) {
    const parsed = parseModalId(interaction.customId);
    if (!parsed) return false;
    const { action, ownerId, panelMessageId } = parsed;
    if (!(await ensureOwnerAndRole(interaction, ownerId, "manage"))) return true;

    const gid = normalizeGuildId(interaction.fields.getTextInputValue("guild_id"));
    if (!gid) {
      await interaction.reply({
        content: "<a:VC_Alert:1482706673176150077> Guild ID non valido.",
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }

    if (action === "add") {
      const note = String(interaction.fields.getTextInputValue("note") || "").trim();
      const inviteRaw = String(interaction.fields.getTextInputValue("invite") || "").trim();
      let meta = {};
      if (inviteRaw) {
        const inviteMeta = await fetchInviteGuildMeta(inviteRaw).catch(() => null);
        if (!inviteMeta) {
          await interaction.reply({
            content: "<a:VC_Alert:1482706673176150077> Invito non valido o non raggiungibile.",
            flags: PRIVATE_FLAG,
          }).catch(() => {});
          return true;
        }
        if (inviteMeta.guildId && inviteMeta.guildId !== gid) {
          await interaction.reply({
            content: `<a:VC_Alert:1482706673176150077> L'invito appartiene al server \`${inviteMeta.guildId}\`, diverso dal Guild ID indicato.`,
            flags: PRIVATE_FLAG,
          }).catch(() => {});
          return true;
        }
        meta = {
          invite: inviteMeta.invite,
          guildName: inviteMeta.guildName,
          iconUrl: inviteMeta.iconUrl,
        };
      } else if (!extractInviteCode(inviteRaw) && inviteRaw) {
        await interaction.reply({
          content: "<a:VC_Alert:1482706673176150077> Formato invito non valido.",
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      const r = await addPartnershipBlacklistGuild(gid, interaction.user.id, note, meta).catch(() => ({ ok: false, reason: "db_error" }));
      if (!r.ok) {
        await interaction.reply({
          content: `<a:VC_Alert:1482706673176150077> Errore: ${r.reason || "sconosciuto"}`,
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      await refreshBlacklistPanelMessage(interaction, ownerId, panelMessageId, 0);
      await interaction.reply({
        content: `<a:VC_Verified:1482532479637127188> Server \`${gid}\` aggiunto alla blacklist partnership.`,
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }

    if (action === "remove") {
      const rowsBefore = await listPartnershipBlacklistGuilds(200).catch(() => []);
      const removedIndex = rowsBefore.findIndex((row) => String(row?.guildId) === gid);
      const r = await removePartnershipBlacklistGuild(gid).catch(() => ({ deleted: false }));
      const content = r.deleted
        ? `<a:VC_Verified:1482532479637127188> Server \`${gid}\` rimosso dalla blacklist.`
        : `<a:VC_Cross:1482532424570376253> Nessun server trovato per \`${gid}\`.`;
      if (r.deleted) {
        const rowsAfter = rowsBefore.filter((row) => String(row?.guildId) !== gid);
        const nextIndex = removedIndex >= 0 ? Math.min(removedIndex, Math.max(0, rowsAfter.length - 1)) : 0;
        await refreshBlacklistPanelMessage(interaction, ownerId, panelMessageId, nextIndex);
      }
      await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
  }
  return false;
}

module.exports = { name: "blacklist", order: 40, match, execute };
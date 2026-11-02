const sec = require("../../../Prefix/Admin/security") as typeof import("../../../Prefix/Admin/security");
const { getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const {
  notYourPanelReply,
  extractOwnerIdFromCustomId,
  replyEphemeral,
  handleHub,
  handleBack,
  handlePager,
} = require("./securityPanelPagerHelpers") as typeof import("./securityPanelPagerHelpers");
const { handlePick, handleToggle, handleBulk } = require("./securityPanelMutationsHelpers") as typeof import("./securityPanelMutationsHelpers");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) return false;
  return id.startsWith("security_panel:");
}

async function execute(interaction?) {
  const guild = interaction.guild;
  if (!guild) return false;

  const id = String(interaction.customId || "");
  const parts = id.split(":");

  try {
    let member = interaction.member;
    if (!member && interaction.user?.id) {
      member = await getGuildMemberCached(guild, interaction.user.id).catch(() => null);
    }
    if (!member) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile verificare il tuo profilo nel server. Riprova.");
      return true;
    }
    if (!sec.hasStaffAccess(member, guild)) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Non hai i permessi.");
      return true;
    }

    const ownerId = extractOwnerIdFromCustomId(id);
    if (!/^\d{16,20}$/.test(ownerId)) {
      await replyEphemeral(
        interaction,
        "<a:VC_Cross:1482532424570376253> Pannello non valido o scaduto. Esegui di nuovo **`+security`**.",
      );
      return true;
    }

    if (String(interaction.user?.id || "") !== ownerId) {
      await replyEphemeral(interaction, notYourPanelReply().content);
      return true;
    }

    if (interaction.isStringSelectMenu() && parts[1] === "hub") {
      return await handleHub(interaction, guild, member, ownerId);
    }

    if (interaction.isStringSelectMenu() && parts[1] === "pick") {
      return await handlePick(interaction, parts, guild, member, ownerId);
    }

    if (interaction.isButton() && parts[1] === "toggle") {
      return await handleToggle(interaction, parts, guild, member, ownerId);
    }

    if (interaction.isButton() && parts[1] === "bulk") {
      return await handleBulk(interaction, parts, guild, member, ownerId);
    }

    if (interaction.isButton() && parts[1] === "back") {
      return await handleBack(interaction, guild, ownerId, member);
    }

    if (interaction.isButton() && ["status", "panic", "statics"].includes(parts[1])) {
      const handled = await handlePager(interaction, parts, guild, ownerId);
      if (handled) return true;
    }

    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Azione pannello non riconosciuta.");
    return true;
  } catch (err) {
    global.logger?.error?.(
      `[securityPanel] execute error customId=${id} guild=${String(guild?.id || "")} user=${String(interaction?.user?.id || "")}:`,
      err?.stack || err?.message || err,
    );
    await replyEphemeral(
      interaction,
      "<a:VC_Cross:1482532424570376253> Errore nel pannello sicurezza. Controlla i log del bot o riprova tra poco.",
    );
    return true;
  }
}

export = { name: "securityPanel", order: 12, match, execute };

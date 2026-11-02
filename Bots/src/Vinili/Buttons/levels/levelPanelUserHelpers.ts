const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getLevelInfo, getTotalExpForLevel, recordLevelHistory, syncLevelRolesForMember, sendLevelUpAnnouncement } = require("../../Services/Community/expService") as typeof import("../../Services/Community/expService");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { PRIVATE_FLAG, asInt, buildModal, buildSimpleEmbed } = require("./levelPanelModalsHelpers") as typeof import("./levelPanelModalsHelpers");

async function runUserAction(interaction?, action?, targetId?) {
  const guildId = interaction.guild?.id;
  if (!guildId || !/^\d{16,20}$/.test(String(targetId || ""))) return buildSimpleEmbed("Level", "Utente non valido.");
  if (action === "syncroles") {
    const profileRow = await ActivityUserProfile.findOne({ guildId, userId: targetId }).select("profile.totals.exp.totalExp").lean().catch(() => null);
    const totalExp = Math.max(0, Number(profileRow?.profile?.totals?.exp?.totalExp || 0));
    const level = getLevelInfo(totalExp).level;
    await syncLevelRolesForMember(interaction.guild, targetId, level);
    return buildSimpleEmbed("Level", `Ruoli allineati al livello **${level}** per <@${targetId}>.`);
  }
  if (action === "reset") {
    return runUserMutation(interaction, "reset", targetId, null, null);
  }
  return null;
}

async function runUserMutation(interaction?, action?, targetId?, modeInput = null, valueInput = null) {
  const guildId = interaction.guild?.id;
  const mode = String(modeInput || "").toLowerCase();
  const value = asInt(valueInput);
  let doc = await ActivityUserProfile.findOne({ guildId, userId: targetId });
  if (!doc) doc = new ActivityUserProfile({ guildId, userId: targetId });
  if (!doc.profile) doc.profile = {} as any;
  if (!doc.profile.totals) doc.profile.totals = {} as any;
  if (!doc.profile.totals.exp) doc.profile.totals.exp = {} as any;
  const beforeExp = Math.max(0, Math.floor(Number(doc.profile.totals.exp.totalExp || 0)));
  const beforeLevel = getLevelInfo(beforeExp).level;
  let afterExp = beforeExp;
  if (action === "set") {
    if (!["exp", "level"].includes(mode) || !Number.isFinite(value) || value < 0) return buildSimpleEmbed("Level", "Valori non validi per set.");
    afterExp = mode === "exp" ? value : getTotalExpForLevel(value);
  } else if (action === "add") {
    if (!Number.isFinite(value) || value <= 0) return buildSimpleEmbed("Level", "Valore non valido per add.");
    afterExp = getTotalExpForLevel(beforeLevel + value);
  } else if (action === "remove") {
    if (!Number.isFinite(value) || value <= 0) return buildSimpleEmbed("Level", "Valore non valido per remove.");
    afterExp = getTotalExpForLevel(Math.max(0, beforeLevel - value));
  } else if (action === "reset") {
    afterExp = 0;
  }
  doc.profile.totals.exp.totalExp = Math.max(0, Math.floor(afterExp));
  doc.profile.totals.exp.level = getLevelInfo(doc.profile.totals.exp.totalExp).level;
  await doc.save();
  await syncLevelRolesForMember(interaction.guild, targetId, doc.profile.totals.exp.level);
  await recordLevelHistory({ guildId, userId: targetId, actorId: interaction.user.id, action: `staff_${action}`, beforeExp, afterExp: doc.profile.totals.exp.totalExp, note: `Pannello +level ${action}` });
  if (doc.profile.totals.exp.level > beforeLevel) {
    const member = interaction.guild.members.cache.get(targetId) || await getGuildMemberCached(interaction.guild, targetId).catch(() => null);
    if (member) await sendLevelUpAnnouncement(interaction.guild, member, doc.profile.totals.exp.level).catch(() => {});
  }
  return buildSimpleEmbed("Aggiornamento Level", [
    `- Utente: <@${targetId}>`,
    `- Azione: **${action}**`,
    `- Livello: **${beforeLevel} -> ${doc.profile.totals.exp.level}**`,
    `- EXP: **${beforeExp} -> ${doc.profile.totals.exp.totalExp}**`,
  ].join("\n"));
}

async function runUserModal(interaction?, action?, modalParsed?) {
  const targetId = String(modalParsed.targetId || "");
  if (action === "set") {
    return runUserMutation(interaction, action, targetId, interaction.fields.getTextInputValue("mode"), interaction.fields.getTextInputValue("value"));
  }
  if (action === "add" || action === "remove") {
    return runUserMutation(interaction, action, targetId, null, interaction.fields.getTextInputValue("value"));
  }
  return buildSimpleEmbed("Level", "Azione utente non supportata da modal.");
}

async function handleUserButton(interaction?, compParsed?, ownerId?) {
  const action = String(compParsed.action || "").toLowerCase();
  const targetId = String(compParsed.targetId || "");
  if (!/^\d{16,20}$/.test(targetId)) {
    await interaction.reply({ embeds: [buildSimpleEmbed("Level", "Target utente non valido.")], flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }
  if (action === "syncroles" || action === "reset") {
    const embed = await runUserAction(interaction, action, targetId);
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }
  if (action === "set" || action === "add" || action === "remove") {
    const modal = buildModal("user", action, ownerId, targetId);
    await interaction.showModal(modal).catch(() => {});
    return true;
  }
  return false;
}

export = {
  runUserAction,
  runUserMutation,
  runUserModal,
  handleUserButton,
};

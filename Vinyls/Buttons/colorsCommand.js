const { EmbedBuilder } = require("discord.js");
const { applyDefaultFooterToEmbeds } = require("../Utils/Embeds/defaultFooter");
const unlocks = require("../Utils/Community/personalityColorUnlocks");
const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
const { ROLE_TRY_AGAIN } = require("../Utils/Text/replyMessages");
const CMD_COLORS_SEG = "cmd_colors_seg:";
const CMD_COLORS_BTN = "cmd_colors_btn:";

function logButtonErr(err, opts = {}) {
  if (!err) return;
  const msg = err?.message ?? err;
  if (opts.warn) global.logger?.warn?.("[colorsCommand]", msg);
  else global.logger?.error?.("[colorsCommand]", msg);
}

function partitionRoleIdsByExisting(guild, roleIds) {
  if (!guild?.roles?.cache || !Array.isArray(roleIds)) return { existing: [], missing: [] };
  const existing = roleIds.filter((id) => id && guild.roles.cache.has(id));
  const missing = roleIds.filter((id) => id && !guild.roles.cache.has(id));
  return { existing, missing };
}

async function setMemberRolesBulk(member, roleIdsToRemove, roleIdsToAdd = []) {
  if (!member?.guild || !Array.isArray(roleIdsToRemove)) return;
  const m = await member.guild.members.fetch(member.id).catch((err) => {
    logButtonErr(err, { warn: true });
    return member;
  });
  const removeSet = new Set(roleIdsToRemove.filter(Boolean));
  const current = [...m.roles.cache.keys()].filter((id) => id !== member.guild?.id);
  const next = current.filter((id) => !removeSet.has(id)).concat(roleIdsToAdd.filter(Boolean));
  await m.edit({ roles: [...new Set(next)] }).catch((err) => {
    logButtonErr(err);
  });
}

function formatRemoveSuccess(count) {
  if (count <= 0) return "<a:VC_Cross:1482532424570376253> **Non hai nessun colore da rimuovere!**";
  if (count === 1) return "<a:VC_Verified:1482532479637127188> **Rimosso 1 colore!**";
  return `<a:VC_Verified:1482532479637127188> **Rimossi ${count} colori!**`;
}

module.exports = {
  name: "colorsCommand",
  order: 52,
  match(interaction) {
    const id = String(interaction?.customId || "");
    if (interaction?.isStringSelectMenu?.() && id.startsWith(CMD_COLORS_SEG)) return true;
    if (interaction?.isButton?.() && id.startsWith(CMD_COLORS_BTN)) return true;
    return false;
  },
  async execute(interaction) {
    if (!interaction.guild || !interaction.member || !interaction.message) return false;
    const guild = interaction.guild;
    const withFooter = (p) => (p && typeof p === "object" && Array.isArray(p.embeds) && p.embeds.length ? applyDefaultFooterToEmbeds(p, guild) : p);
    const origReply = interaction.reply.bind(interaction);
    interaction.reply = (p) => origReply(withFooter(p));
    const origFollowUp = interaction.followUp.bind(interaction);
    interaction.followUp = (p) => origFollowUp(withFooter(p));

    if (interaction.isButton()) {
      const menuId = String(interaction.customId || "");
      const parts = menuId.split(":");
      if (parts.length < 3) return false;
      const ownerId = parts[1];
      const action = parts[2];
      if (interaction.user?.id !== ownerId) {
        await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questo pannello non è tuo. Usa `+profile`.", flags: 1 << 6 }).catch((err) => logButtonErr(err));
        return true;
      }
      const member = await getGuildMemberCached(guild, ownerId, { preferFresh: true }).catch(() => interaction.member);
      if (action === "info") {
        let desc = unlocks.buildColorsHowToUnlockEmbedDescription();
        if (desc.length > 4090) desc = `${desc.slice(0, 4087)}…`;
        const embed = new EmbedBuilder().setColor("#6f4e37").setDescription(desc);
        await interaction.reply({ embeds: [embed], flags: 1 << 6, allowedMentions: { roles: unlocks.listRoleIdsForColorsEmbedMentions(guild) } }).catch((err) => logButtonErr(err));
        return true;
      }
      if (action === "remove") {
        const allTracked = unlocks.getAllPersonalityChatColorRoleIds();
        const { existing: rolesToRemoveExisting } = partitionRoleIdsByExisting(guild, allTracked);
        const beforeMember = await guild.members.fetch({ user: ownerId, force: true }).catch(() => member);
        const onMember = rolesToRemoveExisting.filter((rid) => beforeMember?.roles?.cache?.has(rid));
        if (!onMember.length) {
          await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> **Non hai nessun colore da rimuovere!**", flags: 1 << 6 }).catch((err) => logButtonErr(err));
          return true;
        }
        await setMemberRolesBulk(member, rolesToRemoveExisting, []);
        await interaction.reply({
          content: formatRemoveSuccess(onMember.length),
          flags: 1 << 6,
        }).catch((err) => logButtonErr(err));
        return true;
      }
      return false;
    }

    if (!interaction.isStringSelectMenu()) return false;
    const menuId = String(interaction.customId || "");
    const parts = menuId.split(":");
    if (parts.length < 3) return false;
    const ownerId = parts[1];
    const segment = parts[2];
    if (interaction.user?.id !== ownerId) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questo menu non è tuo. Usa `+profile`.", flags: 1 << 6 }).catch((err) => logButtonErr(err));
      return true;
    }
    const values = Array.isArray(interaction.values) ? interaction.values : [];
    const value = String(values[0] || "");
    const member = await getGuildMemberCached(guild, ownerId, { preferFresh: true }).catch(() => interaction.member);
    const level = await unlocks.fetchNumericProfileLevel(guild.id, ownerId);
    const canPickPlus = await unlocks.memberHasPlusColorFullEligibilityAsync(member);
    if (!unlocks.isValueAllowedForCmdColors(segment, value, member, level, canPickPlus)) {
      await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Non puoi applicare quel colore.", flags: 1 << 6 }).catch((err) => logButtonErr(err));
      return true;
    }
    const pool = segment === "tier" ? unlocks.getTierExclusiveRoleIds() : segment === "plus"
      ? unlocks.getPlusColorRoleIds()
      : unlocks.getAllPersonalityChatColorRoleIds();
    const trackedSet = new Set(pool);
    const { existing: rolesToRemoveExisting } = partitionRoleIdsByExisting(guild, pool);

    const beforeMember = await guild.members.fetch({ user: ownerId, force: true }).catch(() => member);
    const beforeRoleSet = new Set(beforeMember?.roles?.cache?.keys?.() || []);
    const isRemove = value === "remove" || !value;
    let canDupCheck = false;
    if (!isRemove && value) {
      if (segment === "tier") canDupCheck = unlocks.listUnlockedTierRoleIds(level).includes(value);
      else if (segment === "plus") canDupCheck = unlocks.listUnlockedPlusRoleIds(guild, canPickPlus, level).includes(value);
      else canDupCheck = unlocks.isAllowedColorValue(value, member, level, canPickPlus);
    }
    if (!isRemove && value && canDupCheck) {
      const held = [...trackedSet].filter((rid) => beforeRoleSet.has(rid));
      if (held.length === 1 && held[0] === value) {
        await interaction.reply({ content: `<a:VC_Verified:1482532479637127188> **Hai già questo colore.** <@&${value}>`, flags: 1 << 6, allowedMentions: { roles: [value] } }).catch((err) => logButtonErr(err));
        return true;
      }
    }

    await interaction.deferUpdate().catch((err) => logButtonErr(err));
    if (!interaction.deferred) {
      await interaction.reply({ content: ROLE_TRY_AGAIN, flags: 1 << 6 }).catch((err) => logButtonErr(err));
      return true;
    }
    try {
      const beforeRoleSet2 = new Set(beforeMember?.roles?.cache?.keys?.() || []);
      const valuesExisting = isRemove ? [] : partitionRoleIdsByExisting(guild, [value]).existing;
      if (isRemove) {
 await setMemberRolesBulk(member, rolesToRemoveExisting, []);
      } else {
        await setMemberRolesBulk(member, rolesToRemoveExisting, valuesExisting);
      }
      const m = await guild.members.fetch({ user: ownerId, force: true }).catch(() => member);
      const afterRoleSet = new Set(m?.roles?.cache?.keys?.() || []);
      const removedRoleIds = [...trackedSet].filter((rid) => beforeRoleSet2.has(rid) && !afterRoleSet.has(rid));
      const addedRoleIds = [...trackedSet].filter((rid) => !beforeRoleSet2.has(rid) && afterRoleSet.has(rid));
      let content;
      if (isRemove) {
        content = formatRemoveSuccess(removedRoleIds.length);
      } else if (addedRoleIds.length) {
        content = `<a:VC_Verified:1482532479637127188> **Assegnato** <@&${addedRoleIds[0]}>`;
      } else if (!valuesExisting.length && value && value !== "remove") {
        content = "<a:VC_Alert:1482706673176150077> Ruolo colore non trovato sul server.";
      } else {
        content = "<a:VC_Alert:1482706673176150077> Non è stato possibile applicare il colore. Controlla permessi del bot e gerarchia ruoli.";
      }
      await interaction.followUp({ content, flags: 1 << 6, allowedMentions: addedRoleIds.length ? { roles: [addedRoleIds[0]] } : {} }).catch((err) => logButtonErr(err));
    } catch (err) {
      logButtonErr(err);
      await interaction.followUp({ content: "<a:VC_Alert:1482706673176150077> Errore durante l’aggiornamento del colore.", flags: 1 << 6 }).catch((e) => logButtonErr(e));
    }
    return true;
  },
};
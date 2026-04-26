const { applyDefaultFooterToEmbeds } = require("../Utils/Embeds/defaultFooter");
const unlocks = require("../Utils/Community/personalityColorUnlocks");
const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
const { ROLE_TRY_AGAIN } = require("../Utils/Text/replyMessages");

const PRIVATE_FLAG = 1 << 6;
const CMD_COLORS_PREFIX = "cmd_colors_seg:";

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

module.exports = {
  name: "colorsCommand",
  order: 52,
  match(interaction) {
    return Boolean(interaction?.isStringSelectMenu?.() && String(interaction.customId || "").startsWith(CMD_COLORS_PREFIX));
  },
  async execute(interaction) {
    if (!interaction.guild || !interaction.member || !interaction.message) return false;
    const guild = interaction.guild;
    const withFooter = (p) => (p && typeof p === "object" && Array.isArray(p.embeds) && p.embeds.length ? applyDefaultFooterToEmbeds(p, guild) : p);
    const origReply = interaction.reply.bind(interaction);
    interaction.reply = (p) => origReply(withFooter(p));
    const origFollowUp = interaction.followUp.bind(interaction);
    interaction.followUp = (p) => origFollowUp(withFooter(p));

    const menuId = String(interaction.customId || "");
    const parts = menuId.split(":");
    if (parts.length < 3) return false;
    const ownerId = parts[1];
    const segment = parts[2];
    if (interaction.user?.id !== ownerId) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Questo menu non è tuo. Usa `+colors`.",
        flags: PRIVATE_FLAG,
      }).catch((err) => logButtonErr(err));
      return true;
    }
    const values = Array.isArray(interaction.values) ? interaction.values : [];
    const value = String(values[0] || "");
    const member = await getGuildMemberCached(guild, ownerId, { preferFresh: true }).catch(() => interaction.member);
    const level = await unlocks.fetchNumericProfileLevel(guild.id, ownerId);
    const canPickPlus = await unlocks.memberHasPlusColorFullEligibilityAsync(member);
    if (!unlocks.isValueAllowedForCmdColors(segment, value, member, level, canPickPlus)) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Non puoi applicare quel colore.",
        flags: PRIVATE_FLAG,
      }).catch((err) => logButtonErr(err));
      return true;
    }
    const allTracked = unlocks.getAllPersonalityChatColorRoleIds();
    const { existing: rolesToRemoveExisting } = partitionRoleIdsByExisting(guild, allTracked);

    await interaction.deferUpdate().catch((err) => logButtonErr(err));
    if (!interaction.deferred) {
      await interaction.reply({ content: ROLE_TRY_AGAIN, flags: PRIVATE_FLAG }).catch((err) => logButtonErr(err));
      return true;
    }
    try {
      const beforeMember = await guild.members.fetch({ user: ownerId, force: true }).catch(() => member);
      const beforeRoleSet = new Set(beforeMember?.roles?.cache?.keys?.() || []);
      const isRemove = value === "remove" || !value;
      const valuesExisting = isRemove ? [] : partitionRoleIdsByExisting(guild, [value]).existing;
      if (isRemove) {
        await setMemberRolesBulk(member, rolesToRemoveExisting, []);
      } else {
        await setMemberRolesBulk(member, rolesToRemoveExisting, valuesExisting);
      }
      const m = await guild.members.fetch({ user: ownerId, force: true }).catch(() => member);
      const afterRoleSet = new Set(m?.roles?.cache?.keys?.() || []);
      const trackedSet = new Set(allTracked);
      const removedRoleIds = [...trackedSet].filter((rid) => beforeRoleSet.has(rid) && !afterRoleSet.has(rid));
      const addedRoleIds = [...trackedSet].filter((rid) => !beforeRoleSet.has(rid) && afterRoleSet.has(rid));
      const toRoleLabel = (rid) => {
        const role = guild?.roles?.cache?.get?.(rid);
        return role ? `<@&${rid}>` : null;
      };
      const removedRows = removedRoleIds.map(toRoleLabel).filter(Boolean).map((label) => `[-] ${label}`);
      const addedRows = addedRoleIds.map(toRoleLabel).filter(Boolean).map((label) => `[+] ${label}`);
      const header = "Colore aggiornato:";
      const summaryLines = [...removedRows, ...addedRows];
      await interaction.followUp({
        content: summaryLines.length ? [header, ...summaryLines].join("\n") : `${header}\nNessuna modifica.`,
        flags: PRIVATE_FLAG,
      }).catch((err) => logButtonErr(err));
    } catch (err) {
      logButtonErr(err);
    }
    return true;
  },
};
const { PermissionFlagsBits, ChannelType, } = require("discord.js");
const { TICKETS_CATEGORY_NAME, isTicketCategoryName, } = require("./ticketCategoryUtils");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const { warmGuildChannels } = require("./ticketInteractionRuntime");

async function createTicketsCategory(interaction, guild) {
  if (!guild) return null;
  if (!interaction.client.ticketCategoryCache) interaction.client.ticketCategoryCache = new Map();

  const getTopCategoryPosition = () => 0;
  const moveCategoryToTop = async (category) => {
    if (!category || category.type !== ChannelType.GuildCategory) return;
    await category.setPosition(getTopCategoryPosition()).catch(() => { });
  };
  const getChildrenCount = (categoryId) => guild.channels.cache.filter((ch) => ch.parentId === categoryId).size;

  const cachedCategoryId = interaction.client.ticketCategoryCache.get(guild.id);
  if (cachedCategoryId) {
    const cachedCategory = await getGuildChannelCached(guild, cachedCategoryId);
    if (cachedCategory && cachedCategory.type === ChannelType.GuildCategory && isTicketCategoryName(cachedCategory.name) && getChildrenCount(cachedCategory.id) < 50) {
      await moveCategoryToTop(cachedCategory);
      return cachedCategory;
    }
    interaction.client.ticketCategoryCache.delete(guild.id);
  }

  await warmGuildChannels(guild);
  const ticketCategories = guild.channels.cache
    .filter((ch) => ch.type === ChannelType.GuildCategory && isTicketCategoryName(ch.name))
    .sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));

  const reusableCategory = ticketCategories.find((category) => getChildrenCount(category.id) < 50);
  if (reusableCategory) {
    await moveCategoryToTop(reusableCategory);
    interaction.client.ticketCategoryCache.set(guild.id, reusableCategory.id);
    return reusableCategory;
  }

  const category = await guild.channels.create({
    name: TICKETS_CATEGORY_NAME,
    position: getTopCategoryPosition(),
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ],
  }).catch(() => null);
  if (!category) return null;

  await moveCategoryToTop(category);
  interaction.client.ticketCategoryCache.set(guild.id, category.id);
  try {
    const { scheduleDiscordAutomodRulesResync } = require("../../Services/Moderation/discordAutomodRulesService");
    scheduleDiscordAutomodRulesResync(interaction.client);
  } catch (_) {}
  return category;
}

module.exports = { createTicketsCategory };
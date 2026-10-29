const { PermissionFlagsBits, ChannelType } = require("discord.js") as typeof import("discord.js");
const {
  TICKETS_CATEGORY_NAME,
  isTicketCategoryName,
  resolveDiscordTicketCategoryName,
  normalizeCategoryName,
  TICKETS_OVERFLOW_SEPARATOR,
} = require("./ticketCategoryUtils") as typeof import("./ticketCategoryUtils");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { warmGuildChannels } = require("./ticketInteractionRuntime") as typeof import("./ticketInteractionRuntime");
const { buildTicketRoleCreateOverwrite } = require("./ticketHighStaffOverwrites") as typeof import("./ticketHighStaffOverwrites");

function getChildrenCount(guild?, categoryId?) {
  return guild.channels.cache.filter((ch?) => ch.parentId === categoryId).size;
}

function getTicketSettingsSafe(guildId?) {
  try {
    const { getTicketSettingsSync } = require("../../MultiGuild/core/tenantTicketSettings") as typeof import("../../MultiGuild/core/tenantTicketSettings");
    return getTicketSettingsSync(guildId) || {};
  } catch (_) {
    return {};
  }
}

function buildManagedCategoryOverwrites(guild?) {
  return [
    buildTicketRoleCreateOverwrite(guild.roles.everyone.id, {
      deny: [PermissionFlagsBits.ViewChannel],
    }),
  ].filter(Boolean);
}

async function createNamedTicketCategory(guild?, name?, position = 0) {
  return guild.channels
    .create({
      name: String(name || TICKETS_CATEGORY_NAME).slice(0, 100),
      position,
      type: ChannelType.GuildCategory,
      permissionOverwrites: buildManagedCategoryOverwrites(guild),
    })
    .catch(() => null);
}

async function findCategoriesByName(guild?, name?) {
  const want = normalizeCategoryName(name);
  if (!want) return [];
  return [...guild.channels.cache.values()]
    .filter(
      (ch?) =>
        ch.type === ChannelType.GuildCategory &&
        normalizeCategoryName(ch.name) === want,
    )
    .sort((a?, b?) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));
}

async function resolveFixedTicketCategory(guild?, categoryId?) {
  const primary = await getGuildChannelCached(guild, categoryId);
  if (!primary || primary.type !== ChannelType.GuildCategory) return null;
  if (getChildrenCount(guild, primary.id) < 50) return primary;

  const base = String(primary.name || "Tickets");
  const siblings = [...guild.channels.cache.values()]
    .filter((ch?) => {
      if (ch.type !== ChannelType.GuildCategory) return false;
      const n = String(ch.name || "");
      return n === base || n.startsWith(`${base}${TICKETS_OVERFLOW_SEPARATOR}`);
    })
    .sort((a?, b?) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));

  const reusable = siblings.find((c?) => getChildrenCount(guild, c.id) < 50);
  if (reusable) return reusable;

  let nextIndex = 2;
  for (const ch of siblings) {
    const n = String(ch.name || "");
    if (!n.startsWith(`${base}${TICKETS_OVERFLOW_SEPARATOR}`)) continue;
    const idx = Number.parseInt(n.slice(base.length + TICKETS_OVERFLOW_SEPARATOR.length), 10);
    if (Number.isFinite(idx) && idx >= nextIndex) nextIndex = idx + 1;
  }
  return createNamedTicketCategory(
    guild,
    `${base}${TICKETS_OVERFLOW_SEPARATOR}${nextIndex}`,
    (primary.rawPosition || 0) + 1,
  );
}

async function resolveCustomTicketCategory(guild?, dashboardName?) {
  const categoryName = resolveDiscordTicketCategoryName(dashboardName);
  const matches = await findCategoriesByName(guild, categoryName);
  const reusable = matches.find((c?) => getChildrenCount(guild, c.id) < 50);
  if (reusable) return reusable;

  if (matches.length) {
        return createNamedTicketCategory(
      guild,
      `${categoryName}${TICKETS_OVERFLOW_SEPARATOR}${matches.length + 1}`,
      (matches[matches.length - 1].rawPosition || 0) + 1,
    );
  }
  return createNamedTicketCategory(guild, categoryName, 0);
}

async function resolveAutoTicketCategory(guild?, interaction?) {
  let categoryName = TICKETS_CATEGORY_NAME;
  try {
    categoryName = resolveDiscordTicketCategoryName((getTicketSettingsSafe(guild.id) as any)?.categoryName);
  } catch (_) {
    categoryName = TICKETS_CATEGORY_NAME;
  }
  const fancyNormalized = normalizeCategoryName(TICKETS_CATEGORY_NAME);

  const preferFancyName = async (category?) => {
    if (!category || categoryName !== TICKETS_CATEGORY_NAME) return category;
    if (normalizeCategoryName(category.name) === fancyNormalized) return category;
    const core = String(category.name || "")
      .replace(/^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/, "")
      .replace(/\s*[•·]\s*\d+\s*$/, "")
      .replace(/[・·]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (core === "tickets" || normalizeCategoryName(category.name) === "tickets") {
      await category.setName(TICKETS_CATEGORY_NAME).catch(() => null);
    }
    return category;
  };

  const matchesTicketCategory = (name?) =>
    isTicketCategoryName(name) ||
    String(name || "").trim().toLowerCase() === String(categoryName || "").trim().toLowerCase();

  const ticketCategories = guild.channels.cache
    .filter((ch?) => ch.type === ChannelType.GuildCategory && matchesTicketCategory(ch.name))
    .sort((a?, b?) => {
      const aFancy = normalizeCategoryName(a.name) === fancyNormalized ? 0 : 1;
      const bFancy = normalizeCategoryName(b.name) === fancyNormalized ? 0 : 1;
      return aFancy - bFancy || a.rawPosition - b.rawPosition || a.id.localeCompare(b.id);
    });

  const reusableCategory = ticketCategories.find((category?) => getChildrenCount(guild, category.id) < 50);
  if (reusableCategory) {
    await preferFancyName(reusableCategory);
    await reusableCategory.setPosition(0).catch(() => { });
    return reusableCategory;
  }

  const category = await createNamedTicketCategory(guild, categoryName, 0);
  if (!category) return null;
  await category.setPosition(0).catch(() => { });
  try {
    const { scheduleDiscordAutomodRulesResync } = require("../../Services/Moderation/discordAutomodRulesService") as typeof import("../../Services/Moderation/discordAutomodRulesService");
    scheduleDiscordAutomodRulesResync(interaction.client);
  } catch (_) {}
  return category;
}

async function createTicketsCategory(interaction?, guild?, options: Record<string, any> = {}) {
  if (!guild) return null;
  if (!interaction.client.ticketCategoryCache) interaction.client.ticketCategoryCache = new Map();

  const overrideCategoryId = String(options?.categoryId || "").trim();
  if (/^\d{16,22}$/.test(overrideCategoryId)) {
    const forced = await getGuildChannelCached(guild, overrideCategoryId);
    if (
      forced &&
      forced.type === ChannelType.GuildCategory &&
      getChildrenCount(guild, forced.id) < 50
    ) {
      return forced;
    }
  }

  const settings: any = getTicketSettingsSafe(guild.id);
  const modeRef = String(settings.overflowCategoryId || "").trim();

  const cacheAndReturn = (category?) => {
    if (!category?.id) return null;
    interaction.client.ticketCategoryCache.set(guild.id, category.id);
    return category;
  };

  const cachedCategoryId = interaction.client.ticketCategoryCache.get(guild.id);
  if (cachedCategoryId) {
    const cachedCategory = await getGuildChannelCached(guild, cachedCategoryId);
    const hasRoom =
      cachedCategory &&
      cachedCategory.type === ChannelType.GuildCategory &&
      getChildrenCount(guild, cachedCategory.id) < 50;
    if (hasRoom) {
      if (modeRef === "__custom__") {
        const expected = resolveDiscordTicketCategoryName(settings.categoryName);
        const n = String(cachedCategory.name || "");
        if (
          normalizeCategoryName(n) === normalizeCategoryName(expected) ||
          n.startsWith(`${expected}${TICKETS_OVERFLOW_SEPARATOR}`)
        ) {
          return cacheAndReturn(cachedCategory);
        }
      } else if (/^\d{16,20}$/.test(modeRef)) {
        if (cachedCategoryId === modeRef) return cacheAndReturn(cachedCategory);
        const primary = await getGuildChannelCached(guild, modeRef);
        const base = String(primary?.name || "");
        const n = String(cachedCategory.name || "");
        if (base && (n === base || n.startsWith(`${base}${TICKETS_OVERFLOW_SEPARATOR}`))) {
          return cacheAndReturn(cachedCategory);
        }
      } else {
        return cacheAndReturn(cachedCategory);
      }
    }
    interaction.client.ticketCategoryCache.delete(guild.id);
  }

  await warmGuildChannels(guild);

  if (/^\d{16,20}$/.test(modeRef)) {
    const fixed = await resolveFixedTicketCategory(guild, modeRef);
    return cacheAndReturn(fixed);
  }

  if (modeRef === "__custom__") {
    const custom = await resolveCustomTicketCategory(guild, settings.categoryName);
    return cacheAndReturn(custom);
  }

  const auto = await resolveAutoTicketCategory(guild, interaction);
  return cacheAndReturn(auto);
}

async function maybeDeleteEmptyCustomTicketCategory(guild?, categoryId?) {
  const cid = String(categoryId || "").trim();
  if (!guild || !cid) return false;
  const settings: any = getTicketSettingsSafe(guild.id);
  if (String(settings.overflowCategoryId || "") !== "__custom__") return false;

  await warmGuildChannels(guild).catch(() => null);
  const category = await getGuildChannelCached(guild, cid);
  if (!category || category.type !== ChannelType.GuildCategory) return false;

  const expected = resolveDiscordTicketCategoryName(settings.categoryName);
  const catNorm = normalizeCategoryName(category.name);
  const expectedNorm = normalizeCategoryName(expected);
  const baseMatch =
    catNorm === expectedNorm ||
    catNorm === normalizeCategoryName(settings.categoryName) ||
    String(category.name || "").startsWith(`${expected}${TICKETS_OVERFLOW_SEPARATOR}`);
  if (!baseMatch) return false;

  if (getChildrenCount(guild, cid) > 0) return false;
  await category.delete("Categoria ticket custom vuota").catch(() => null);
  if (guild.client?.ticketCategoryCache) {
    guild.client.ticketCategoryCache.delete(String(guild.id));
  }
  return true;
}

async function syncCustomTicketCategoryName(client?, guildId?, prevSettings?, nextSettings?) {
  const gid = String(guildId || "").trim();
  if (!client || !gid) return { ok: false };
  if (String(nextSettings?.overflowCategoryId || "") !== "__custom__") return { ok: true, skipped: true };

  const guild =
    client.guilds?.cache?.get(gid) ||
    (await client.guilds?.fetch?.(gid).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_missing" };

  await warmGuildChannels(guild).catch(() => null);
  const newName = resolveDiscordTicketCategoryName(nextSettings.categoryName);
  const oldName = resolveDiscordTicketCategoryName(prevSettings?.categoryName);
  const candidates = [
    ...new Set(
      [oldName, newName, prevSettings?.categoryName, nextSettings?.categoryName]
        .map((n?) => String(n || "").trim())
        .filter(Boolean),
    ),
  ];

  let target = null;
  for (const name of candidates) {
    const found = await findCategoriesByName(guild, resolveDiscordTicketCategoryName(name));
    if (found[0]) {
      target = found[0];
      break;
    }
  }
  if (!target) {
        const soft = [...guild.channels.cache.values()]
      .filter((ch?) => ch.type === ChannelType.GuildCategory)
      .filter((ch?) => {
        const nl = String(ch.name || "").toLowerCase();
        return nl.includes("tickets") || nl.includes("ticket");
      })
      .sort((a?, b?) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));
    target = soft[0] || null;
  }
  if (!target) return { ok: true, missing: true };
  if (String(target.name) === newName) return { ok: true, unchanged: true, categoryId: target.id, name: target.name };
  await target.setName(newName).catch(() => null);
  return { ok: true, renamed: true, categoryId: target.id, name: newName };
}

export = {
  createTicketsCategory,
  maybeDeleteEmptyCustomTicketCategory,
  syncCustomTicketCategoryName,
};

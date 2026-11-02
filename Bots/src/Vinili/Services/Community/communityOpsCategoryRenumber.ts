/** Community ops: orchestrazione numbering categorie e coda debounce. */
const { ChannelType } = require("discord.js") as typeof import("discord.js");
const { getClientGuildCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { guildTimers, guildRenumberInflight, guildRenumberPending } = require("./communityOpsRuntime") as typeof import("./communityOpsRuntime");
const {
  getCategorySettings,
  isCategoryNumberingGuild,
  toSuperscriptNumber,
  extractCoreCategoryLabel,
  buildNumberedCenteredCategoryName,
  replaceNumberPrefixOnly,
  shouldSkipCategoryNumbering,
  resolveRestoredTicketsCategoryName,
} = require("./communityOpsCategoryNames") as typeof import("./communityOpsCategoryNames");
const { CATEGORY_RENAME_GAP_MS, pauseMs, renameChannelNameForNumbering, resolveGuildMembersMe } = require("./communityOpsCategoryRename") as typeof import("./communityOpsCategoryRename");
const { renumberCategoryVoiceChannels } = require("./communityOpsPublicVoice") as typeof import("./communityOpsPublicVoice");

const MAIN_GUILD_ID = IDs.guilds.main;

async function renumberGuildCategoryNames(guild?, options?) {
  const categories = guild.channels.cache
    .filter((channel?) => channel.type === ChannelType.GuildCategory)
    .sort((a?, b?) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id))
    .map((channel?) => channel);

  let maxCoreLen = 0;
  for (const category of categories) {
    if (!category || shouldSkipCategoryNumbering(category)) continue;
    const core = extractCoreCategoryLabel(category.name);
    if (!core) continue;
    maxCoreLen = Math.max(maxCoreLen, Array.from(core).length);
  }
  const centerOpts = {
    ...options,
    centerFrameWidth: Math.max(maxCoreLen, Number(options.centerInnerSlots) || 10),
  };

  let nonTicketIndex = 1;
  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    if (!category?.manageable) continue;
    if (shouldSkipCategoryNumbering(category)) {
      const restored = resolveRestoredTicketsCategoryName(category.name);
      if (restored && restored !== category.name) {
        await renameChannelNameForNumbering(category, restored, "category");
      }
      continue;
    }

    const nextNumber = toSuperscriptNumber(nonTicketIndex++, options.minDigits);
    let expectedName;
    if (options.centerWithInvisibleSpaces !== false) {
      expectedName = buildNumberedCenteredCategoryName(nextNumber, category.name, centerOpts);
    } else {
      expectedName = replaceNumberPrefixOnly(category.name, nextNumber, options.separator);
    }
    if (category.name === expectedName) continue;
    await renameChannelNameForNumbering(category, expectedName, "category");
  }
}

async function renumberGuildCategories(guild?, options?, client = null) {
  if (!guild) return { pending: 0 };
  const guildId = String(guild.id || "");
  if (!guildId) return { pending: 0 };
    if (!isCategoryNumberingGuild(guildId)) return { pending: 0 };
  if (guildRenumberInflight.has(guildId)) {
    guildRenumberPending.add(guildId);
    return { pending: 0, skipped: true };
  }

  const job = (async () => {
    const channelCategoryIds = options.channelCategoryIds || [];
    if (!channelCategoryIds.length) return { pending: 0 };

    let pending = 0;
    await renumberGuildCategoryNames(guild, options);
    await pauseMs(CATEGORY_RENAME_GAP_MS);
    for (const categoryId of channelCategoryIds) {
      pending += await renumberCategoryVoiceChannels(guild, categoryId, options);
    }
    if (pending > 0) {
      global.logger?.info?.(
        "[CATEGORY NUMBERING] voice renumber pending:",
        guild.id,
        pending,
      );
    }
    const mainGuildId = String(IDs?.guilds?.main || "").trim();
    if (mainGuildId && String(guild.id) === mainGuildId) {
      const {
        listCustomPrivateCategories,
        syncCustomPrivateCategoryLayout,
      } = require("../../Utils/Community/customPrivateCategoryUtils") as typeof import("../../Utils/Community/customPrivateCategoryUtils");
      for (const cat of listCustomPrivateCategories(guild)) {
        await syncCustomPrivateCategoryLayout(guild, cat).catch(() => null);
      }
    }
    return { pending };
  })();

  guildRenumberInflight.set(guildId, job);
  try {
    return await job;
  } finally {
    guildRenumberInflight.delete(guildId);
    if (guildRenumberPending.has(guildId)) {
      guildRenumberPending.delete(guildId);
      if (client) queueCategoryRenumber(client, guildId, 5000);
    }
  }
}

function queueCategoryRenumber(client?, guildId?, delayMs = null) {
  if (!client || !guildId) return;
  if (!isCategoryNumberingGuild(guildId)) return;
  const options = getCategorySettings(client);
  if (!options.enabled) return;

  const pending = guildTimers.get(guildId);
  if (pending) clearTimeout(pending);

  const timeout = setTimeout(async () => {
    guildTimers.delete(guildId);
    const guild = await getClientGuildCached(client, guildId);
    if (!guild) return;
    await guild.channels.fetch().catch(() => { });
    await resolveGuildMembersMe(guild).catch(() => null);
    let result = { pending: 0 };
    try {
      result = await renumberGuildCategories(guild, options, client);
    } catch (err) {
      global.logger?.warn?.(
        "[CATEGORY NUMBERING] debounced renumber failed:",
        guildId,
        err?.message || err,
      );
    }
    if (Number(result?.pending || 0) > 0) {
      queueCategoryRenumber(client, guildId, Math.max(options.debounceMs, 15_000));
    }
  }, delayMs == null ? options.debounceMs : delayMs);
  timeout.unref?.();
  guildTimers.set(guildId, timeout);
}

async function runAllGuilds(client?) {
  if (!client) return;
  const options = getCategorySettings(client);
  if (!options.enabled) return;
  const mainGuildId = String(MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  if (!mainGuildId) return;
  const guild = await getClientGuildCached(client, mainGuildId);
  if (!guild) return;
  await guild.channels.fetch().catch(() => { });
  await resolveGuildMembersMe(guild).catch(() => null);
  let result = { pending: 0 };
  try {
    result = await renumberGuildCategories(guild, options, client);
  } catch (err) {
    global.logger?.warn?.(
      "[CATEGORY NUMBERING] guild renumber failed:",
      guild.id,
      err?.message || err,
    );
  }
  if (Number(result?.pending || 0) > 0) {
    queueCategoryRenumber(client, guild.id, Math.max(options.debounceMs, 15_000));
  }
}

export = {
  queueCategoryRenumber,
  runAllGuilds,
};

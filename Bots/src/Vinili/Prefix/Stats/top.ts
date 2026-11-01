const { AttachmentBuilder, ChannelType } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getServerOverviewStats } = require("../../Services/Community/activityService") as typeof import("../../Services/Community/activityService");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getLevelInfo, getTopExpGainsInPeriod, PERIOD_LOOKBACK_DAYS } = require("../../Services/Community/expService") as typeof import("../../Services/Community/expService");
const { voteCountMonthKeyRome } = require("../../Utils/romeVoteMonthKey") as typeof import("../../Utils/romeVoteMonthKey");
const { renderTopStatisticsCanvas, renderTopLeaderboardPageCanvas } = require("../../Utils/Render/activityCanvas") as typeof import("../../Utils/Render/activityCanvas");
const { getOrBuildStatsCanvasBuffer } = require("../../Utils/Stats/statsCanvasCache") as typeof import("../../Utils/Stats/statsCanvasCache");
const { upsertChannelSnapshot, syncGuildChannelSnapshots, getChannelSnapshotMap } = require("../../Utils/Community/channelSnapshotUtils") as typeof import("../../Utils/Community/channelSnapshotUtils");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const topComponents = require("../../Buttons/topChannel/components") as typeof import("../../Buttons/topChannel/components");

const TOP_CHANNEL_DIRECT_CHANNEL_IDS = new Set([IDs.channels.commands, IDs.channels.staffCmds].filter(Boolean).map(String));

const {
  TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID,
  normalizeLookbackDays,
  normalizeTopView,
  normalizeControlsView,
  normalizePage,
  buildTopChannelComponents,
  buildTopPageJumpModal,
} = topComponents;

const TOP_PAGE_DATA_LIMIT = 100;
const TOP_SOURCE_CACHE_TTL_MS = 45 * 1000;
const SNAPSHOT_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const topSourceCache = new Map();
const snapshotSyncByGuild = new Map();
const ALL_TIME_TOP_VIEWS = new Set(["invites_users", "level_users"]);
const PERIOD_UI_LOCKED_VIEWS = new Set([...ALL_TIME_TOP_VIEWS, "votes_users"]);

function normalizeCanvasLabel(value?, fallback?) {
  const text=String(value||"").replace(/\s+/g," ").trim();
  if (!text) return fallback;
  if (/^<@!?\d+>$/.test(text)) return fallback;
  if (/^<#\d+>$/.test(text)) return fallback;
  return text;
}

async function resolveStatsUsernameLabel(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return "—";
  const cachedMember = guild.members.cache.get(uid);
  const fetchedMember = cachedMember || (await getGuildMemberCached(guild, uid).catch(() => null));
  let userObj = fetchedMember?.user || null;
  if (!userObj && guild.client?.users?.fetch) {
    try {
      userObj = await guild.client.users.fetch(uid);
    } catch (_) {
      userObj = null;
    }
  }
  if (userObj) {
    const raw = String(userObj.username || "").trim();
    return normalizeCanvasLabel(raw, `utente_${uid.slice(-6)}`);
  }
  return `utente_${uid.slice(-6)}`;
}

async function resolveActiveHumanMember(guild?, userId?) {
  const safeId = String(userId || "").trim();
  if (!safeId) return null;
  const cached = guild.members.cache.get(safeId);
  if (cached) return cached.user?.bot ? null : cached;
  const fetched = await getGuildMemberCached(guild, safeId);
  if (!fetched) return null;
  return fetched.user?.bot ? null : fetched;
}

function isTextChannelUnderVoiceCategory(guild?, channel?) {
  if (!guild || !channel) return false;
  const parentId = channel.parentId || channel.parent?.id;
  if (!parentId) return false;
  const siblings = guild.channels?.cache?.filter((ch?) => ch.parentId === parentId);
  if (!siblings?.size) return false;

  let voiceCount = 0;
  let textCount = 0;
  for (const ch of siblings.values()) {
    if (
      ch.type === ChannelType.GuildVoice ||
      ch.type === ChannelType.GuildStageVoice
    ) {
      voiceCount += 1;
      continue;
    }
    if (
      ch.type === ChannelType.GuildText ||
      ch.type === ChannelType.GuildAnnouncement
    ) {
      textCount += 1;
    }
  }

  return voiceCount >= 2 && textCount <= 2;
}

async function resolveTopUserEntriesForCanvas(guild?, entries = []) {
  const items = (entries || [])
    .map((item?) => ({
      userId: String(item?.id || "").trim(),
      value: Number(item?.value || 0),
    }))
    .filter((item?) => item.userId);
  if (!items.length) return [];
  const labels = await Promise.all(items.map((item?) => resolveStatsUsernameLabel(guild, item.userId)));
  return items.map((item?, index?) => ({
    id: item.userId,
    label: labels[index],
    value: item.value,
  }));
}

function voteCountInt(v?) {
  if (v == null || v === "") return 0;
  const x = Number(String(v).trim().replace(/[,\s]/g, ""));
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
}

function combinedRomeMonthVotesFromLeaf(leaf?) {
  const currentMonthKey = voteCountMonthKeyRome(new Date());
  const storedMonthKey = String(leaf?.voteCountMonthKey || "").trim();
  if (!storedMonthKey || storedMonthKey !== currentMonthKey) return 0;
  return voteCountInt(leaf?.voteCountTopgg) + voteCountInt(leaf?.voteCountDiscadia);
}

async function resolveTopVoteMonthEntries(guild?, guildId?, limit = TOP_PAGE_DATA_LIMIT) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return [];
  const monthKey = voteCountMonthKeyRome(new Date());
  const safeLimit = Math.max(1, Math.min(TOP_PAGE_DATA_LIMIT, Number(limit || TOP_PAGE_DATA_LIMIT)));
  const docs = await ActivityUserProfile.find({
    guildId: safeGuildId,
    "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountMonthKey": monthKey,
    $or: [
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountTopgg": { $gt: 0 } },
      { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountDiscadia": { $gt: 0 } },
    ],
  })
    .select("userId profile.totals.exp.bumpVoteRewards.discadia_vote")
    .limit(Math.max(200, safeLimit * 6))
    .lean()
    .catch(() => []);
  const leafPath = (d?) => d?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
  const scored = docs
    .map((d?) => ({
      userId: String(d?.userId || "").trim(),
      value: combinedRomeMonthVotesFromLeaf(leafPath(d)),
    }))
    .filter((x?) => x.userId && x.value > 0)
    .sort((a?, b?) => b.value - a.value || a.userId.localeCompare(b.userId));
  const out = [];
  for (const row of scored) {
    if (out.length >= safeLimit) break;
    const member = await resolveActiveHumanMember(guild, row.userId);
    if (!member) continue;
    const label = await resolveStatsUsernameLabel(guild, row.userId);
    out.push({
      id: row.userId,
      label,
      value: row.value,
    });
  }
  return out;
}

async function resolveTopInviteEntries(
  guild?,
  guildId?,
  limit = TOP_PAGE_DATA_LIMIT,
) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return [];

  let trackedTotals = [];
  try {
    trackedTotals = await ActivityUserProfile.aggregate([
      {
        $match: {
          guildId: safeGuildId,
          "profile.inviteTrack.inviterId": { $exists: true, $nin: [null, ""] },
        },
      },
      { $group: { _id: "$profile.inviteTrack.inviterId", value: { $sum: 1 } } },
      { $sort: { value: -1 } },
      { $limit: Math.max(20, Number(limit || TOP_PAGE_DATA_LIMIT) * 2) },
    ]);
  } catch {
    trackedTotals = [];
  }

  const trackedByInviter = new Map();
  for (const item of trackedTotals) {
    const inviterId = String(item?._id || "").trim();
    if (!inviterId) continue;
    trackedByInviter.set(inviterId, Number(item?.value || 0));
  }

  const liveUsesByInviter = new Map();
  const liveInvites = await guild.invites.fetch().catch(() => null);
  if (liveInvites?.size) {
    for (const invite of liveInvites.values()) {
      const inviterId = String(invite?.inviter?.id || "").trim();
      if (!inviterId) continue;
      const uses = Number(invite?.uses || 0);
      liveUsesByInviter.set(
        inviterId,
        Number(liveUsesByInviter.get(inviterId) || 0) + uses,
      );
    }
  }

  const inviterIds=new Set([...trackedByInviter.keys(),...liveUsesByInviter.keys(),]);

  const out = [];
  for (const userId of inviterIds) {
    if (!userId) continue;
    const member = await resolveActiveHumanMember(guild, userId);
    if (!member) continue;

    const trackedTotal = Number(trackedByInviter.get(userId) || 0);
    const liveUses = Number(liveUsesByInviter.get(userId) || 0);
    const effectiveValue = Math.max(trackedTotal, liveUses);
    if (effectiveValue <= 0) continue;

    const label = await resolveStatsUsernameLabel(guild, userId);
    out.push({
      id: userId,
      label,
      value: effectiveValue,
    });
  }

  out.sort((a?, b?) => Number(b.value || 0) - Number(a.value || 0));
  return out.slice(0, Math.max(1, Number(limit || TOP_PAGE_DATA_LIMIT)));
}

async function resolveTopExpEntries(guild?, guildId?, lookbackDays?, limit = TOP_PAGE_DATA_LIMIT) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return [];
  const safeLimit = Math.max(1, Math.min(TOP_PAGE_DATA_LIMIT, Number(limit || TOP_PAGE_DATA_LIMIT)));
  const usePeriod = PERIOD_LOOKBACK_DAYS.includes(Number(lookbackDays));

  if (usePeriod) {
    const periodEntries = await getTopExpGainsInPeriod(safeGuildId, lookbackDays, safeLimit * 2);
    const out = [];
    for (const item of periodEntries) {
      const userId = String(item?.userId || "").trim();
      if (!userId) continue;
      const member = await resolveActiveHumanMember(guild, userId);
      if (!member) continue;
      const label = await resolveStatsUsernameLabel(guild, userId);
      out.push({
        id: userId,
        label,
        value: Math.max(0, Number(item?.expGain || 0)),
      });
      if (out.length >= safeLimit) break;
    }
    if (out.length > 0) return out;
  }

  const profileDocs = await ActivityUserProfile.find({ guildId: safeGuildId, "profile.totals.exp.totalExp": { $gt: 0 } })
    .sort({ "profile.totals.exp.totalExp": -1 })
    .limit(safeLimit * 2)
    .select("userId profile.totals.exp.totalExp")
    .lean()
    .catch(() => []);
  const docs = profileDocs.map((d?) => ({ userId: d?.userId, totalExp: d?.profile?.totals?.exp?.totalExp }));
  const out = [];
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    const member = await resolveActiveHumanMember(guild, userId);
    if (!member) continue;
    const label = await resolveStatsUsernameLabel(guild, userId);
    out.push({
      id: userId,
      label,
      value: Math.max(0, Math.floor(Number(doc?.totalExp || 0))),
    });
    if (out.length >= safeLimit) break;
  }
  return out;
}

async function resolveTopLevelEntries(guild?, guildId?, _lookbackDays?, limit = TOP_PAGE_DATA_LIMIT) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return [];
  const safeLimit = Math.max(1, Math.min(TOP_PAGE_DATA_LIMIT, Number(limit || TOP_PAGE_DATA_LIMIT)));

  const profileDocs = await ActivityUserProfile.find({ guildId: safeGuildId, "profile.totals.exp.totalExp": { $gt: 0 } })
    .sort({ "profile.totals.exp.totalExp": -1 })
    .limit(safeLimit * 2)
    .select("userId profile.totals.exp.totalExp profile.totals.exp.level")
    .lean()
    .catch(() => []);
  const docs = profileDocs.map((d?) => ({ userId: d?.userId, totalExp: d?.profile?.totals?.exp?.totalExp, level: d?.profile?.totals?.exp?.level }));
  const withLevel = docs.map((doc?) => {
    const totalExp = Math.max(0, Math.floor(Number(doc?.totalExp || 0)));
    const storedLevel = Math.max(0, Math.floor(Number(doc?.level || 0)));
    return { userId: String(doc?.userId || "").trim(), totalExp, level: storedLevel || getLevelInfo(totalExp).level };
  }).filter((x?) => x.userId);
  withLevel.sort((a?, b?) => b.level - a.level || b.totalExp - a.totalExp);
  const out = [];
  for (const item of withLevel.slice(0, safeLimit)) {
    const userId = item.userId;
    const member = await resolveActiveHumanMember(guild, userId);
    if (!member) continue;
    const label = await resolveStatsUsernameLabel(guild, userId);
    out.push({
      id: userId,
      label,
      value: item.level,
    });
  }
  return out;
}

async function resolveTopChannelEntries(guild?, entries = [], snapshotMap = new Map()) {
  const afkIds=new Set([guild?.afkChannelId,IDs.channels?.vocaleAFK].filter(Boolean).map((x?) => String(x)),);

  const out = [];
  for (const item of entries) {
    const channelId = String(item?.id || "");
    if (afkIds.has(channelId)) continue;

    const channel = guild.channels?.cache?.get(channelId) || null;
    if (channel) {
      upsertChannelSnapshot(channel).catch(() => {});
    }
    const snapshotName = String(snapshotMap.get(channelId) || "").trim();
    const rawLabel = channel
      ? `# ${channel.name}`
      : snapshotName
        ? `# ${snapshotName}`
        : "# canale-eliminato";
    out.push({
      id: channelId,
      label: normalizeCanvasLabel(rawLabel, "#canale-eliminato"),
      value: Number(item?.value || 0),
    });
  }
  return out;
}

async function resolveTopTextChannelEntries(guild?, entries = [], snapshotMap = new Map()) {
  const rows = await resolveTopChannelEntries(guild, entries, snapshotMap);
  const out = [];

  for (const row of rows) {
    const channelId = String(row?.id || "");
    const channel = guild.channels?.cache?.get(channelId) || null;

    if (!channel) {
      out.push(row);
      continue;
    }
    if (isTextChannelUnderVoiceCategory(guild, channel)) continue;
    out.push(row);
  }

  return out;
}

function buildSourceCacheKey(guildId?, lookbackDays?) {
  return `${String(guildId || "")}:${Number(lookbackDays || 14)}`;
}

function scheduleSnapshotSync(guild?) {
  const guildId = String(guild?.id || "");
  if (!guildId) return;
  const now = Date.now();
  const nextAllowed = Number(snapshotSyncByGuild.get(guildId) || 0);
  if (nextAllowed > now) return;
  snapshotSyncByGuild.set(guildId, now + SNAPSHOT_SYNC_INTERVAL_MS);
  syncGuildChannelSnapshots(guild).catch(() => {});
}

async function getTopSource(guild?, lookbackDays?) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const cacheKey = buildSourceCacheKey(guild?.id, safeLookback);
  const now = Date.now();
  const cached = topSourceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  scheduleSnapshotSync(guild);

  const stats=await getServerOverviewStats(guild.id,safeLookback,TOP_PAGE_DATA_LIMIT,);
  const channelIds=Array.from(new Set([...(stats.topChannelsText||[]),...(stats.topChannelsVoice||[])].map((item?) => String(item?.id||"").trim()).filter(Boolean),),);
  const snapshotMap = await getChannelSnapshotMap(guild.id, channelIds);

  const [topUsersText, topChannelsText, topUsersVoice, topUsersInvites, topUsersVoteMonth, topChannelsVoice, topUsersExp, topUsersLevel] = await Promise.all([
    resolveTopUserEntriesForCanvas(guild, stats.topUsersText || []),
    resolveTopTextChannelEntries(guild, stats.topChannelsText || [], snapshotMap),
    resolveTopUserEntriesForCanvas(guild, stats.topUsersVoice || []),
    resolveTopInviteEntries(guild, guild.id, TOP_PAGE_DATA_LIMIT),
    resolveTopVoteMonthEntries(guild, guild.id, TOP_PAGE_DATA_LIMIT),
    resolveTopChannelEntries(guild, stats.topChannelsVoice || [], snapshotMap),
    resolveTopExpEntries(guild, guild.id, safeLookback, TOP_PAGE_DATA_LIMIT),
    resolveTopLevelEntries(guild, guild.id, safeLookback, TOP_PAGE_DATA_LIMIT),
  ]);

  const value = {
    topUsersText,
    topChannelsText,
    topUsersVoice,
    topUsersInvites,
    topUsersVoteMonth,
    topChannelsVoice,
    topUsersExp,
    topUsersLevel,
  };
  topSourceCache.set(cacheKey, { expiresAt: now + TOP_SOURCE_CACHE_TTL_MS, value });
  return value;
}

function resolveViewConfig(selectedView?, source?, lookbackDays = 14) {
  const safeView = normalizeTopView(selectedView);
  const periodSuffix = PERIOD_LOOKBACK_DAYS.includes(Number(lookbackDays)) ? ` (${Number(lookbackDays)}d)` : "";
  if (safeView === "message_users") {
    return {
      title: "Top Message Users",
      rows: source.topUsersText,
      unit: "msg",
      mode: "messages",
    };
  }
  if (safeView === "voice_users") {
    return {
      title: "Top Voice Users",
      rows: source.topUsersVoice,
      unit: "h",
      mode: "voice",
    };
  }
  if (safeView === "message_channels") {
    return {
      title: "Top canali messaggi",
      rows: source.topChannelsText,
      unit: "msg",
      mode: "messages",
    };
  }
  if (safeView === "invites_users") {
    return {
      title: "Invites User (all-time)",
      rows: source.topUsersInvites,
      unit: "invites",
      mode: "messages",
    };
  }
  if (safeView === "votes_users") {
    return {
      title: `Top voti (${voteCountMonthKeyRome(new Date())})`,
      rows: source.topUsersVoteMonth || [],
      unit: "voti",
      mode: "messages",
    };
  }
  if (safeView === "exp_users") {
    return {
      title: "Top EXP" + periodSuffix,
      rows: source.topUsersExp || [],
      unit: "EXP",
      mode: "messages",
    };
  }
  if (safeView === "level_users") {
    return {
      title: "Top Livelli (all-time)",
      rows: source.topUsersLevel || [],
      unit: "livello",
      mode: "messages",
    };
  }
  return {
    title: "Top canali vocali",
    rows: source.topChannelsVoice,
    unit: "h",
    mode: "voice",
  };
}

async function buildTopChannelPayload(
  message?,
  lookbackDays = 14,
  controlsView = "main",
  selectedView = "overview",
  page = 1,
  ownerId = null,
) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const safeView = normalizeTopView(selectedView);
  const safeControls = normalizeControlsView(controlsView);
  const effectiveLookback = PERIOD_UI_LOCKED_VIEWS.has(safeView) ? 14 : safeLookback;
  const effectiveControls = PERIOD_UI_LOCKED_VIEWS.has(safeView) ? "main" : safeControls;
  const source = await getTopSource(message.guild, effectiveLookback);

  const isOverview = safeView === "overview";
  const viewConfig = !isOverview ? resolveViewConfig(safeView, source, effectiveLookback) : null;
  const totalItems = viewConfig ? viewConfig.rows.length : 0;
  const totalPages = isOverview ? 1 : Math.max(1, Math.ceil(totalItems / 10));
  const safePage = Math.min(Math.max(1, normalizePage(page, 1)), totalPages);
  const pageRows=isOverview?[]:viewConfig.rows.slice((safePage-1)*10,safePage*10);

  const imageName = `top-channel-${safeView}-${message.guild.id}-${safeLookback}d-p${safePage}-${Date.now()}.png`;

  try {
    let buffer = null;

    if (isOverview) {
      buffer = await getOrBuildStatsCanvasBuffer(`top:overview:${message.guild.id}:${effectiveLookback}`, () =>
        renderTopStatisticsCanvas({
          guildName: message.guild?.name || "Server",
          guildIconUrl: message.guild?.iconURL?.({ extension: "png", size: 256 }),
          lookbackDays: effectiveLookback,
          ...source,
        }),
      );
    } else {
      const monthKey = voteCountMonthKeyRome(new Date());
      const votesFooter =
        safeView === "votes_users"
          ? `Page ${safePage}/${totalPages} | Voti: mese corrente (${monthKey}) · Europe/Rome`
          : null;
      buffer = await getOrBuildStatsCanvasBuffer(
        `top:${safeView}:${message.guild.id}:${effectiveLookback}:p${safePage}`,
        () =>
          renderTopLeaderboardPageCanvas({
            guildName: message.guild?.name || "Server",
            guildIconUrl: message.guild?.iconURL?.({ extension: "png", size: 256 }),
            lookbackDays: effectiveLookback,
            title: viewConfig.title,
            page: safePage,
            totalPages,
            rows: pageRows,
            unit: viewConfig.unit,
            mode: viewConfig.mode,
            allTime: ALL_TIME_TOP_VIEWS.has(safeView),
            customFooterLine: votesFooter,
          }),
      );
    }

    return {
      files: [new AttachmentBuilder(buffer, { name: imageName })],
      embeds: [],
      content: null,
      components: buildTopChannelComponents(
        ownerId,
        effectiveLookback,
        effectiveControls,
        safeView,
        safePage,
        totalPages,
      ),
      meta: {
        lookbackDays: effectiveLookback,
        selectedView: safeView,
        controlsView: effectiveControls,
        page: safePage,
        totalPages,
      },
    };
  } catch (error) {
    global.logger?.warn?.("[TOP] Canvas render failed:", error);
    return {
      embeds: [],
      content:
        "<:vegax:1443934876440068179> Non sono riuscito a generare l'immagine top.",
      components: buildTopChannelComponents(
        ownerId,
        effectiveLookback,
        effectiveControls,
        safeView,
        safePage,
        totalPages,
      ),
      meta: {
        lookbackDays: effectiveLookback,
        selectedView: safeView,
        controlsView: effectiveControls,
        page: safePage,
        totalPages,
      },
    };
  }
}

async function sendTopPayload(message?, payload?) {
  const channel = message.channel;
  const channelId = String(channel?.id || "");
  const parentId = String(channel?.parentId || "");
  const isDirectTopChannel =
    TOP_CHANNEL_DIRECT_CHANNEL_IDS.has(channelId) ||
    (channel?.isThread?.() && TOP_CHANNEL_DIRECT_CHANNEL_IDS.has(parentId));
  if (isDirectTopChannel) {
    await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
    return;
  }

  const targetChannel=message.guild.channels.cache.get(IDs.channels.commands)||(await message.guild.channels.fetch(IDs.channels.commands).catch(() => null));

  if (!targetChannel || !targetChannel.isTextBased()) {
    await safeMessageReply(message, {
      content: `Non riesco a trovare il canale <#${IDs.channels.commands}>.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const sent = await targetChannel.send(payload).catch(() => null);
  if (!sent) {
    await safeMessageReply(message, {
      content: `Non sono riuscito a inviare la classifica in <#${IDs.channels.commands}>.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await safeMessageReply(message, {
    content:
      `Per evitare di intasare la chat, la classifica è stata generata in <#${IDs.channels.commands}>.\n` +
      `[Clicca qui per vederla](${sent.url}).`,
    embeds: [],
    files: [],
    components: [],
    allowedMentions: { repliedUser: false },
  });
}

export = {
  name: "top",
  allowEmptyArgs: true,
  TOP_CHANNEL_REFRESH_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_SET_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PERIOD_BACK_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_VIEW_SELECT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_FIRST_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_PREV_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_OPEN_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_NEXT_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_LAST_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_CUSTOM_ID_PREFIX,
  TOP_CHANNEL_PAGE_MODAL_INPUT_CUSTOM_ID,
  resolveTopChannelEntries,
  resolveTopUserEntriesForCanvas,
  buildTopChannelPayload,
  buildTopChannelComponents,
  buildTopPageJumpModal,
  normalizeLookbackDays,
  normalizeTopView,
  normalizeControlsView,
  normalizePage,

  async execute(message?, args = []) {
    const dayToken=Array.isArray(args)?args.find((x?) => /^\d+d?$/i.test(String(x||"").trim())):null;
    const lookbackDays = normalizeLookbackDays(dayToken || "14");
    const payload = await buildTopChannelPayload(message, lookbackDays, "main", "overview", 1, message.author?.id);
    await sendTopPayload(message, payload);
  },
};
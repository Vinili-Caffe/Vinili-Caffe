const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { getUserOverviewStats } = require("../../../Community/services/activityService") as typeof import("../../../Community/services/activityService");
const { resolveTopChannelEntries } = require("../prefix/top") as typeof import("../prefix/top");
const { renderUserActivityCanvas } = require("../../../Community/utils/Render/activityCanvas") as typeof import("../../../Community/utils/Render/activityCanvas");
const { memberDisplayName, userAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { getEffectiveJoinedAt } = require("../../../Community/services/effectiveMemberJoinService") as typeof import("../../../Community/services/effectiveMemberJoinService");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const USER_REFRESH_CUSTOM_ID_PREFIX = "user_refresh";
const USER_PERIOD_OPEN_CUSTOM_ID_PREFIX = "user_period_open";
const USER_PERIOD_SET_CUSTOM_ID_PREFIX = "user_period_set";
const USER_PERIOD_BACK_CUSTOM_ID_PREFIX = "user_period_back";
const ALLOWED_LOOKBACK = [1, 7, 14, 21, 30];

function normalizeLookbackDays(x?) {
  if (x == null || x === "") return 14;
  const s = String(x).replace(/d$/i, "").trim();
  const n = Number.parseInt(s, 10);
  return ALLOWED_LOOKBACK.includes(n) ? n : 14;
}

function match(interaction?) {
  const id = interaction?.customId || "";
  const prefixes = [USER_REFRESH_CUSTOM_ID_PREFIX, USER_PERIOD_OPEN_CUSTOM_ID_PREFIX, USER_PERIOD_SET_CUSTOM_ID_PREFIX, USER_PERIOD_BACK_CUSTOM_ID_PREFIX];
  return interaction.isButton() && prefixes.some((p?) => id === p || id.startsWith(`${p}:`));
}

async function execute(interaction?, client?) {
  const { parseUserCustomId, denyIfNotOwner, sendControlErrorFallback } = require("./buttonParsers") as typeof import("./buttonParsers");
  const parsed = parseUserCustomId(interaction.customId);
  if (!parsed) return false;
  const denied = await denyIfNotOwner(interaction, parsed.ownerId);
  if (denied) return true;

  const guild = interaction.guild;
  const targetUserId = parsed.targetUserId || parsed.ownerId;
  if (!guild || !targetUserId) {
    await sendControlErrorFallback(interaction);
    return true;
  }

  let view = "main";
  let lookbackDays = parsed.lookbackDays;
  if (parsed.prefix === USER_PERIOD_OPEN_CUSTOM_ID_PREFIX) view = "period";
  else if (parsed.prefix === USER_PERIOD_SET_CUSTOM_ID_PREFIX) lookbackDays = parsed.lookbackDays;
  else if (parsed.prefix === USER_PERIOD_BACK_CUSTOM_ID_PREFIX) view = "main";

  try {
    await interaction.deferUpdate().catch(() => {});
    const payload = await buildUserOverviewPayload(guild, targetUserId, lookbackDays, view, client);
    const payloadWithComponents: Record<string, any> = {...payload, components: buildUserComponents(parsed.ownerId || interaction.user?.id, targetUserId, lookbackDays, view)};
    const msg = interaction.message;
    if (!msg?.edit) {
      await sendControlErrorFallback(interaction);
      return true;
    }
    await msg.edit({ files: payloadWithComponents.files || [], components: payloadWithComponents.components || [], embeds: Array.isArray(payloadWithComponents.embeds) ? payloadWithComponents.embeds : [], content: typeof payloadWithComponents.content === "string" ? payloadWithComponents.content : null });
    return true;
  } catch (err) {
    global.logger?.error?.("[Buttons/user] execute", err);
    await sendControlErrorFallback(interaction);
    return true;
  }
}

async function buildUserOverviewPayload(guild?, targetId?, lookbackDays?, view?, client?) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  if (!guild?.id || !targetId) return { embeds: [], components: [], files: [] };
  const stats = await getUserOverviewStats(guild.id, targetId, safeLookback);
  let user = null;
  let member = null;
  try { member = await guild.members.fetch(targetId).catch(() => null); user = member?.user ?? null; } catch (_) { }
  if (!user && (client?.users?.fetch || guild.client?.users?.fetch)) {
    const c = client || guild.client;
    user = await c.users.fetch(targetId).catch(() => null);
  }
  const displayName = memberDisplayName(member || user);
  const userTag = user?.tag ?? user?.username ?? "User";
  const avatarUrl = userAvatarUrlDynamic(member || user, { size: 512 });
  const createdOn = user?.createdAt ?? new Date(0);
  const effectiveJoined = member ? await getEffectiveJoinedAt(member).catch(() => null) : null;
  const joinedOn =
    effectiveJoined ||
    (member?.joinedAt && member.joinedAt instanceof Date ? member.joinedAt : member?.joinedTimestamp ? new Date(member.joinedTimestamp) : createdOn);
  const emptySnapshot = new Map();
  const [topChannelsText, topChannelsVoice] = await Promise.all([
    resolveTopChannelEntries(guild, stats.topChannelsText || [], emptySnapshot),
    resolveTopChannelEntries(guild, stats.topChannelsVoice || [], emptySnapshot),
  ]);
  const buffer = await renderUserActivityCanvas({ guildName: guild.name || "Server", userTag, displayName, avatarUrl, createdOn, joinedOn, lookbackDays: safeLookback, windows: stats.windows, ranks: stats.ranks, topChannelsText, topChannelsVoice, chart: stats.chart });
  const activityExt = buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 ? "gif" : "png";
  const file = new AttachmentBuilder(buffer, { name: `user-activity.${activityExt}` });
  return { files: [file], components: [] };
}

function buildUserComponents(ownerId?, targetUserId?, lookbackDays?, view?) {
  const safeLookback = normalizeLookbackDays(lookbackDays);
  const o = ownerId || "";
  const base = `${USER_REFRESH_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;
  const periodOpen = `${USER_PERIOD_OPEN_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;
  const row1 = new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId(base).setStyle(ButtonStyle.Secondary).setEmoji(`${E.VC_Refresh} `), new ButtonBuilder().setCustomId(periodOpen).setStyle(ButtonStyle.Secondary).setEmoji(E.VC_Clock));

  if (view === "period") {
    const periodBack = `${USER_PERIOD_BACK_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${safeLookback}:embed`;
    const rowPeriod1 = new ActionRowBuilder().addComponents(...ALLOWED_LOOKBACK.map((d?) => new ButtonBuilder().setCustomId(`${USER_PERIOD_SET_CUSTOM_ID_PREFIX}:${o}:${targetUserId}:${d}:embed`).setStyle(safeLookback === d ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel(`${d}d`)));
    const rowPeriod2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(periodBack).setStyle(ButtonStyle.Secondary).setLabel("Indietro"));
    return [row1, rowPeriod1, rowPeriod2];
  }
  return [row1];
}

async function resolveUserTargetAndLookback(message?, args = []) {
  const tokens = Array.isArray(args) ? args.map((a?) => String(a ?? "").trim()).filter(Boolean) : [];
  let lookbackDays = 14;
  const lookbackToken = tokens.find((t?) => {
    const s = String(t || "").toLowerCase().trim();
    return /^(1d|7d|14d|21d|30d|1|7|14|21|30)$/.test(s);
  });
  if (lookbackToken) lookbackDays = normalizeLookbackDays(lookbackToken);
  const tokensWithoutLookback = lookbackToken ? tokens.filter((t?) => String(t) !== String(lookbackToken)) : tokens;

  const mention = message?.mentions?.users?.first();
  if (mention) {
    return { targetId: mention.id, lookbackDays };
  }

  const first = tokensWithoutLookback[0] || null;
  if (!first) return { targetId: null, lookbackDays };

  const mentionId = first.match(/^<@!?(\d+)>$/)?.[1];
  if (mentionId) return { targetId: mentionId, lookbackDays };

  const numericId = first.replace(/[<@!>]/g, "").trim();
  if (/^\d{17,20}$/.test(numericId)) {
    return { targetId: numericId, lookbackDays };
  }

  const guild = message.guild;
  if (guild) {
    const byUsername = guild.members.cache.find(
      (m?) =>
        (m.user?.username && String(m.user.username).toLowerCase() === first.toLowerCase()) ||
        (m.user?.tag && String(m.user.tag).toLowerCase() === first.toLowerCase()) ||
        (m.displayName && String(m.displayName).toLowerCase() === first.toLowerCase()),
    );
    if (byUsername) return { targetId: byUsername.id, lookbackDays };
    try {
      const members = await guild.members.fetch({ query: first, limit: 10 });
      const found = members.find(
        (m?) =>
          (m.user?.username && String(m.user.username).toLowerCase() === first.toLowerCase()) ||
          (m.displayName && String(m.displayName).toLowerCase() === first.toLowerCase()),
      ) || members.first();
      if (found) return { targetId: found.id, lookbackDays };
    } catch (_) {}
  }

  return { targetId: null, lookbackDays };
}

export = { name: "user", order: 7, match, execute, USER_REFRESH_CUSTOM_ID_PREFIX, USER_PERIOD_OPEN_CUSTOM_ID_PREFIX, USER_PERIOD_SET_CUSTOM_ID_PREFIX, USER_PERIOD_BACK_CUSTOM_ID_PREFIX, buildUserOverviewPayload, buildUserComponents, resolveUserTargetAndLookback };
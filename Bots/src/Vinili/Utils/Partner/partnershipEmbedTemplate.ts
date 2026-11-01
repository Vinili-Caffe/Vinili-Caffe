const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { accountUsername } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { formatPartnershipPingDisplay } = require("./partnershipPingUtils") as typeof import("./partnershipPingUtils");

const TEMPLATE_REPLACEMENTS = [
  ["{user.partnerships.count}", "userPartnershipsCount"],
  ["{user.partnerships.week}", "userPartnershipsWeek"],
  ["{user.partnerships.day}", "userPartnershipsDay"],
  ["{user.points}", "userPoints"],
  ["{user.username}", "userUsername"],
  ["{user.avatar}", "userAvatar"],
  ["{user.icon}", "userAvatar"],
  ["{user.id}", "userId"],
  ["{user.tag}", "userTag"],
  ["{manager.username}", "managerUsername"],
  ["{manager.avatar}", "managerAvatar"],
  ["{manager.icon}", "managerAvatar"],
  ["{manager.id}", "managerId"],
  ["{manager.tag}", "managerTag"],
  ["{manager.badges}", "managerBadges"],
  ["{guild.link}", "guildLink"],
  ["{server.link}", "guildLink"],
  ["{guild.icon}", "guildIcon"],
  ["{server.icon}", "guildIcon"],
  ["{guild.id}", "guildId"],
  ["{server.id}", "guildId"],
  ["{guild.name}", "guildName"],
  ["{server.name}", "guildName"],
  ["{partner.icon}", "partnerIcon"],
  ["{partner.avatar}", "partnerIcon"],
  ["{partner.name}", "partnerServerName"],
  ["{partner}", "partnerServerName"],
  ["{guild}", "guildName"],
  ["{server}", "guildName"],
  ["{user}", "userMention"],
  ["{manager}", "managerMention"],
  ["{ping}", "ping"],
  ["{pings}", "pings"],
  ["{timestamp}", "timestamp"],
  ["{points}", "userPoints"],
  ["{user.points.spendable}", "userPoints"],
  ["{user.partnerships.total}", "userPartnershipsCount"],
  ["{rewards.inChannel}", "rewardsInChannel"],
];

function resolveRewardsInChannelSuffix(partnershipCfg?) {
  let channelId = "";
  if (partnershipCfg?.legacy) {
    channelId = String(IDs.channels?.partnerRewards || "").trim();
  } else {
    channelId = String(partnershipCfg?.partnersChatChannelId || "").trim();
  }
  return channelId ? ` in <#${channelId}>` : "!";
}

function countPartnerCreatesInRange(actions?, rangeMs?) {
  const since = Date.now() - Math.max(0, Number(rangeMs) || 0);
  return (Array.isArray(actions) ? actions : []).filter((entry?) => {
    if (String(entry?.action || "") !== "create") return false;
    const at = new Date(entry?.date || 0).getTime();
    return Number.isFinite(at) && at >= since;
  }).length;
}

function buildThankYouTemplateVars({
  guild = null,
  actorMember = null,
  managerId = null,
  managerMember = null,
  managerBadgeEmojis = null,
  partnershipCfg = null,
  partnerServerName = "",
  partnerIcon = "",
  shownPartnerPoints = 0,
  totalPartnerEarned = null,
  staffPartnerActions = [],
  pingPlan = null,
} = {}) {
  const { guildIconUrl, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
  const { formatManagerBadgeSuffix } = require("./partnershipMessageUtils") as typeof import("./partnershipMessageUtils");
  const actorUser = actorMember?.user || actorMember;
  const managerUser = managerMember?.user || managerMember;
  const guildInviteUrl = String(partnershipCfg?.invite?.url || "").trim();
  const pingRoleId = pingPlan?.customRoleId || null;
  const pingsText =
    pingPlan && (pingPlan.pingHere || pingPlan.pingEveryone || pingRoleId)
      ? formatPartnershipPingDisplay({
          pingHere: pingPlan.pingHere,
          pingEveryone: pingPlan.pingEveryone,
          pingRoleId,
        })
      : "`null`";
  const pingSingle = pingRoleId
    ? `<@&${pingRoleId}>`
    : pingPlan?.pingHere
      ? "@here"
      : pingPlan?.pingEveryone
        ? "@everyone"
        : "`null`";
  const nowSec = Math.floor(Date.now() / 1000);
  const badgeSuffix = formatManagerBadgeSuffix(managerBadgeEmojis);
  const managerBadges = badgeSuffix.trim();
  const managerMentionBase = managerUser?.id ? `<@${managerUser.id}>` : "Gestore non specificato";
  const managerMention =
    managerUser?.id && managerBadges
      ? `${managerMentionBase} ${managerBadges}`
      : managerMentionBase;

  return {
    guildName: String(guild?.name || ""),
    guildId: String(guild?.id || ""),
    guildLink: guildInviteUrl || "`null`",
    guildIcon: guildIconUrl(guild, { size: 256 }) || "",
    partnerServerName: String(partnerServerName || ""),
    partnerIcon: String(partnerIcon || ""),
    userMention: actorUser?.id ? `<@${actorUser.id}>` : "`null`",
    userUsername: accountUsername(actorMember) || "`null`",
    userId: String(actorUser?.id || ""),
    userTag: String(actorUser?.username || accountUsername(actorMember) || ""),
    userAvatar: guildMemberDisplayAvatarUrlDynamic(actorMember) || "",
    /* thankYouSpendableOnly1: points=spendibile; partnerships.count resta totale fatti (token esplicito) */
    userPoints: String(shownPartnerPoints ?? 0),
    userPartnershipsCount: String(
      totalPartnerEarned != null && totalPartnerEarned !== ""
        ? totalPartnerEarned
        : shownPartnerPoints ?? 0,
    ),
    userPartnershipsWeek: String(countPartnerCreatesInRange(staffPartnerActions, 7 * 86_400_000)),
    userPartnershipsDay: String(countPartnerCreatesInRange(staffPartnerActions, 86_400_000)),
    managerMention,
    managerBadges,
    managerId: String(managerId || managerUser?.id || ""),
    managerUsername: managerUser?.username || "Gestore non specificato",
    managerTag: managerUser?.username || "Gestore non specificato",
    managerAvatar: guildMemberDisplayAvatarUrlDynamic(managerMember) || "",
    ping: pingSingle,
    pings: pingsText,
    timestamp: `<t:${nowSec}:R>`,
    actorLabel: accountUsername(actorMember) || "",
    rewardsInChannel: resolveRewardsInChannelSuffix(partnershipCfg),
  };
}

function applyPartnershipEmbedTemplate(template?, vars?) {
  let text = String(template || "");
  for (const [token, key] of TEMPLATE_REPLACEMENTS) {
    text = text.split(token).join(String(vars?.[key] ?? ""));
  }
  return text;
}

function parseEmbedColorInput(raw?) {
  const text = String(raw || "").trim();
  if (!text || /^default$/i.test(text)) return null;
  if (/^#?[0-9a-f]{6}$/i.test(text)) {
    return text.startsWith("#") ? text : `#${text}`;
  }
  return text;
}

function parseEmbedTimestampInput(raw?) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text || text === "false" || text === "0" || text === "no") return false;
  return text === "true" || text === "1" || text === "si" || text === "sì" || text === "yes";
}

function normalizeOptionalUrl(value?) {
  const text = String(value || "").trim();
  return text || null;
}

function truncateExample(value?, max = 72) {
  const text = String(value ?? "—").replace(/\s+/g, " ").trim() || "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatVariableHelpLine(token?, example?, hint?) {
  return [`\`${token}\` **${truncateExample(example)}**`, `> ${hint}`].join("\n");
}

function buildVariableHelpSectionBlock(section?, vars?) {
  const lines = section.items.map((item?) => {
    const example =
      item.example !== undefined ? item.example : vars?.[item.key] ?? "—";
    return formatVariableHelpLine(item.token, example, item.hint);
  });
  return [`**${section.title}**`, ...lines].join("\n\n");
}

async function buildThankYouVariablesHelpPayload(interaction?, lang = "en") {
  const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
  const { resolvePartnershipConfigSync } = require("./partnershipConfigResolver") as typeof import("./partnershipConfigResolver");
  const { getOrCreateStaffDoc } = require("../Staff/staffDocUtils") as typeof import("../Staff/staffDocUtils");
  const { resolvePartnerTotalEarned } = require("../Staff/partnerPointsDisplayUtils") as typeof import("../Staff/partnerPointsDisplayUtils");
  const { t } = require("../../MultiGuild/utils/Partner/tenantPartnershipI18n/index") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipI18n/index");
  const { buildLocalizedVariableHelpSections } = require("../../MultiGuild/utils/Partner/tenantPartnershipI18n/embedVarHelpPacks") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipI18n/embedVarHelpPacks");
  const { normalizeTenantLanguage } = require("../../MultiGuild/utils/Partner/tenantPartnershipI18n/languages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipI18n/languages");
  const code = normalizeTenantLanguage(lang);
  const tLang = (key?) => t(code, key);
  const guild = interaction?.guild || null;
  const member = interaction?.member || null;
  const partnershipCfg = guild?.id ? resolvePartnershipConfigSync(guild.id) : null;

  let shownPartnerPoints = 0;
  let staffPartnerActions = [];
  if (guild?.id && interaction?.user?.id) {
    const staffDoc = await getOrCreateStaffDoc(guild.id, interaction.user.id).catch(() => null);
    if (staffDoc?.staff) {
      shownPartnerPoints = resolvePartnerTotalEarned(staffDoc.staff);
      staffPartnerActions = Array.isArray(staffDoc.staff.partnerActions) ? staffDoc.staff.partnerActions : [];
    }
  }

  const pings = partnershipCfg?.pings || {};
  const isLegacy = Boolean(partnershipCfg?.legacy);
  const pingPlan = {
    pingHere: !isLegacy && pings.hereMembers !== null && pings.hereMembers !== undefined,
    pingEveryone: !isLegacy && pings.everyoneMembers !== null && pings.everyoneMembers !== undefined,
    customRoleId:
      !isLegacy &&
      pings.customRoleId &&
      pings.customRoleMembers !== null &&
      pings.customRoleMembers !== undefined
        ? pings.customRoleId
        : null,
  };

  const vars = buildThankYouTemplateVars({
    guild,
    actorMember: member,
    managerId: null,
    partnershipCfg,
    partnerServerName: "Server Partner",
    shownPartnerPoints,
    staffPartnerActions,
    pingPlan,
  });

  const sectionBlocks = buildLocalizedVariableHelpSections(tLang).map((section?) =>
    buildVariableHelpSectionBlock(section, vars),
  );

  const embeds = [];
  for (const block of sectionBlocks) {
    embeds.push(new EmbedBuilder().setColor("#826bc2").setDescription(block));
  }

  return { embeds: embeds.slice(0, 10), flags: 1 << 6 };
}

export = { buildThankYouTemplateVars, applyPartnershipEmbedTemplate, parseEmbedColorInput, parseEmbedTimestampInput, normalizeOptionalUrl, buildThankYouVariablesHelpPayload };
const IDs = require("../Config/ids");
const { accountUsername } = require("../Discord/guildDiscordIdentity");
const { formatPartnershipPingDisplay } = require("./partnershipPingUtils");

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
  ["{rewards.inChannel}", "rewardsInChannel"],
];

function resolveRewardsInChannelSuffix(partnershipCfg) {
  let channelId = "";
  if (partnershipCfg?.legacy) {
    channelId = String(IDs.channels?.partnerRewards || "").trim();
  } else {
    channelId = String(partnershipCfg?.partnersChatChannelId || "").trim();
  }
  return channelId ? ` in <#${channelId}>` : "!";
}

function countPartnerCreatesInRange(actions, rangeMs) {
  const since = Date.now() - Math.max(0, Number(rangeMs) || 0);
  return (Array.isArray(actions) ? actions : []).filter((entry) => {
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
  staffPartnerActions = [],
  pingPlan = null,
} = {}) {
  const { guildIconUrl, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
  const { formatManagerBadgeSuffix } = require("./partnershipMessageUtils");
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
    userPoints: String(shownPartnerPoints ?? 0),
    userPartnershipsCount: String(shownPartnerPoints ?? 0),
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

function applyPartnershipEmbedTemplate(template, vars) {
  let text = String(template || "");
  for (const [token, key] of TEMPLATE_REPLACEMENTS) {
    text = text.split(token).join(String(vars?.[key] ?? ""));
  }
  return text;
}

function parseEmbedColorInput(raw) {
  const text = String(raw || "").trim();
  if (!text || /^default$/i.test(text)) return null;
  if (/^#?[0-9a-f]{6}$/i.test(text)) {
    return text.startsWith("#") ? text : `#${text}`;
  }
  return text;
}

function parseEmbedTimestampInput(raw) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text || text === "false" || text === "0" || text === "no") return false;
  return text === "true" || text === "1" || text === "si" || text === "sì" || text === "yes";
}

function normalizeOptionalUrl(value) {
  const text = String(value || "").trim();
  return text || null;
}

function truncateExample(value, max = 72) {
  const text = String(value ?? "—").replace(/\s+/g, " ").trim() || "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

const VARIABLE_HELP_SECTIONS = [
  {
    title: "Server",
    items: [
      { token: "{guild}", key: "guildName", hint: "Name of the server where you publish the partnership." },
      { token: "{server}", key: "guildName", hint: "Alias of {guild}." },
      { token: "{guild.name}", key: "guildName", hint: "Text name of the server." },
      { token: "{server.name}", key: "guildName", hint: "Alias of {guild.name}." },
      { token: "{guild.id}", key: "guildId", hint: "Numeric ID of the server." },
      { token: "{server.id}", key: "guildId", hint: "Alias of {guild.id}." },
      { token: "{guild.link}", key: "guildLink", hint: "Permanent invite of the partnership channel." },
      { token: "{server.link}", key: "guildLink", hint: "Alias of {guild.link}." },
    ],
  },
  {
    title: "Partner server",
    items: [
      { token: "{partner}", key: "partnerServerName", hint: "Name of the server you partner with." },
      { token: "{partner.name}", key: "partnerServerName", hint: "Alias of {partner}." },
    ],
  },
  {
    title: "User",
    items: [
      { token: "{user}", key: "userMention", hint: "Mention of the user who executed the partnership." },
      { token: "{user.id}", key: "userId", hint: "Discord ID of the user." },
      { token: "{user.username}", key: "userUsername", hint: "Display name of the user." },
      { token: "{user.tag}", key: "userTag", hint: "Discord username of the user." },
      { token: "{user.points}", key: "userPoints", hint: "Total partner points of the user." },
      { token: "{user.partnerships.count}", key: "userPartnershipsCount", hint: "Total partnerships completed." },
      { token: "{user.partnerships.week}", key: "userPartnershipsWeek", hint: "Partnerships in the last 7 days." },
      { token: "{user.partnerships.day}", key: "userPartnershipsDay", hint: "Partnerships in the last 24 hours." },
    ],
  },
  {
    title: "Manager",
    items: [
      { token: "{manager}", key: "managerMention", hint: "Mention of the partnership manager (with selected badges)." },
      { token: "{manager.id}", key: "managerId", hint: "Manager ID, if present." },
      { token: "{manager.username}", key: "managerUsername", hint: "Username of the manager." },
      { token: "{manager.tag}", key: "managerTag", hint: "Alias of the manager name." },
      { token: "{manager.badges}", key: "managerBadges", hint: "Selected profile badges of the manager." },
    ],
  },
  {
    title: "Images and icons",
    items: [
      { token: "{user.avatar}", key: "userAvatar", hint: "Avatar URL of the user who ran the partnership." },
      { token: "{guild.icon}", key: "guildIcon", hint: "Icon URL of your server." },
      { token: "{server.icon}", key: "guildIcon", hint: "Alias of {guild.icon}." },
      { token: "{partner.icon}", key: "partnerIcon", hint: "Icon URL of the partner server." },
      { token: "{manager.avatar}", key: "managerAvatar", hint: "Avatar URL of the partnership manager." },
    ],
  },
  {
    title: "Ping and more",
    items: [
      { token: "{ping}", key: "ping", hint: "Main ping applied (role, @here or @everyone)." },
      { token: "{pings}", key: "pings", hint: "All pings applied together." },
      { token: "{timestamp}", key: "timestamp", hint: "Relative Discord timestamp." },
      { token: "{points}", key: "userPoints", hint: "Alias of {user.points}." },
    ],
  },
];

function formatVariableHelpLine(token, example, hint) {
  return [`\`${token}\` **${truncateExample(example)}**`, `> ${hint}`].join("\n");
}

function buildVariableHelpSectionBlock(section, vars) {
  const lines = section.items.map((item) => {
    const example =
      item.example !== undefined ? item.example : vars?.[item.key] ?? "—";
    return formatVariableHelpLine(item.token, example, item.hint);
  });
  return [`**${section.title}**`, ...lines].join("\n\n");
}

async function buildThankYouVariablesHelpPayload(interaction, lang = "en") {
  const { EmbedBuilder } = require("discord.js");
  const { resolvePartnershipConfigSync } = require("./partnershipConfigResolver");
  const { getOrCreateStaffDoc } = require("../Staff/staffDocUtils");
  const { resolvePartnerTotalEarned } = require("../Staff/partnerPointsDisplayUtils");
  const { t } = require("./tenantPartnershipI18n");
  const { buildLocalizedVariableHelpSections } = require("./tenantPartnershipI18n/embedVarHelpPacks");
  const { normalizeTenantLanguage } = require("./tenantPartnershipI18n/languages");
  const code = normalizeTenantLanguage(lang);
  const tLang = (key) => t(code, key);
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

  const sectionBlocks = buildLocalizedVariableHelpSections(tLang).map((section) =>
    buildVariableHelpSectionBlock(section, vars),
  );

  const embeds = [];
  for (const block of sectionBlocks) {
    embeds.push(new EmbedBuilder().setColor("#826bc2").setDescription(block));
  }

  return { embeds: embeds.slice(0, 10), flags: 1 << 6 };
}

function buildThankYouVariablesHelpText(lang = "en") {
  const { t } = require("./tenantPartnershipI18n");
  const { normalizeTenantLanguage } = require("./tenantPartnershipI18n/languages");
  return t(normalizeTenantLanguage(lang), "varHelp_openHint");
}

module.exports = { buildThankYouTemplateVars, applyPartnershipEmbedTemplate, parseEmbedColorInput, parseEmbedTimestampInput, normalizeOptionalUrl, buildThankYouVariablesHelpPayload, buildThankYouVariablesHelpText };
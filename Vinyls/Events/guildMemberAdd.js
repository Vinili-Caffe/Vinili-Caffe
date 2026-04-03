const { EmbedBuilder, PermissionsBitField, AuditLogEvent, UserFlagsBitField, } = require("discord.js");
const { DIVIDER_URL } = require("../../shared/discord/constants");
const { ActivityUserProfile, InviteReminderState, CustomRole, } = require("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids");
const { shouldBlockDm } = require("../Utils/noDmList");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { scheduleStaffListRefresh, memberHasStaffRole } = require("../Utils/Community/staffListUtils");
const { processJoinRaidForMember, registerJoinRaidSecuritySignal, } = require("../Services/Moderation/joinRaidService");
const { getJoinGateConfigSnapshot, } = require("../Services/Moderation/joinGateService");
const { resolveJoinGateConfiguredExempt, } = require("../Services/Moderation/joinGateExemptUtils");
const { getSecurityLockState } = require("../Services/Moderation/securityOrchestratorService");
const { markJoinGateKick } = require("../Utils/Moderation/joinGateKickCache");
const { createModCase, getModConfig, logModCase } = require("../Utils/Moderation/moderation");
const { markJoinGateSuspiciousAccount, } = require("../Services/Moderation/joinGateSuspiciousService");
const { hasEventWeekWinnerGrant } = require("../Services/Community/weekWinnerGrantsService");
const { addRolesAndGetMember, getClientGuildCached, getGuildChannelCached, getGuildMemberCached, getGuildRoleCached } = require("../Utils/Interaction/interactionEntityCache");
const { applyDefaultFooterToEmbeds } = require("../Utils/Embeds/defaultFooter");
const { setWelcomeContextActive } = require("../Utils/Message/officialMessageCommunityHandlers");
const { restoreUserOnJoin } = require("../Services/Community/userLeaveBackupService");

const INVITE_LOG_CHANNEL_ID = IDs.channels.chat;
const THANKS_CHANNEL_ID = IDs.channels.supporters;
const INFO_PERKS_CHANNEL_ID = IDs.channels.info;
const VOTE_ROLE_ID = IDs.roles.Voter;
const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const VOTE_ROLE_EXPIRES_AT_PATH = `${DISCADIA_VOTE_ROOT}.voteRole.expiresAt`;
const VOTE_RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUSTOM_ROLE_REQUIRED_ROLE_IDS = [
  IDs.roles.VIP,
  IDs.roles.ServerBooster,
  IDs.roles.Level50,
].filter(Boolean);
const INVITE_REWARD_TIERS = [{ target: 5, roleIds: [IDs.roles.Promoter, IDs.roles.PicPerms || "1468938195348754515",].filter(Boolean), }, { target: 25, roleIds: [IDs.roles.Propulsor].filter(Boolean), }, { target: 100, roleIds: [IDs.roles.Catalyst].filter(Boolean), },];
const INVITE_MILESTONE_EMBED_COLOR = 0x9b59b6;

function shortInviteLinkForFooter() {
  const raw = String(IDs.links?.invite || "").trim();
  if (!raw) return "Vinili & Caffè";
  try {
    const u = raw.startsWith("http") ? raw : `https://${raw}`;
    const host = new URL(u).host.replace(/^www\./, "");
    const path = new URL(u).pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function getInviteMilestoneTitle(target) {
  if (target === 5) return "🎀✦ Nuovx Promoter!";
  if (target === 25) return "✨ Nuovx Propulsor!";
  if (target === 100) return "🏆 Nuovx Catalyst!";
  return "🎉 Nuovo traguardo inviti!";
}

function getInviteTierDisplayName(target) {
  if (target === 5) return "Promoter";
  if (target === 25) return "Propulsor";
  if (target === 100) return "Catalyst";
  return "Reward inviti";
}

function nextInviteTierTargetAfter(currentTarget) {
  const sorted = INVITE_REWARD_TIERS.map((t) => Number(t.target || 0)).filter((n) => n > 0).sort((a, b) => a - b);
  const idx = sorted.indexOf(Number(currentTarget));
  if (idx < 0 || idx >= sorted.length - 1) return null;
  return sorted[idx + 1];
}

function splitAwardedRolesByTier(roleIdsAwarded) {
  const added = new Set(roleIdsAwarded || []);
  const out = [];
  for (const tier of INVITE_REWARD_TIERS) {
    const t = Number(tier.target || 0);
    const roleIds = (tier.roleIds || []).filter((rid) => added.has(String(rid)));
    if (roleIds.length) out.push({ target: t, roleIds });
  }
  return out.sort((a, b) => a.target - b.target);
}

function buildInviteMilestoneEmbeds(inviterMember, totalInvites, tierChunks) {
  const list = Array.isArray(tierChunks) ? tierChunks : [];
  if (!inviterMember || !list.length) return [];
  const safeTotal = Math.max(0, Number(totalInvites || 0));
  return list.map(({ target, roleIds }) => {
    const rolesText = roleIds.map((id) => `<@&${id}>`).join(" ");
    const tierName = getInviteTierDisplayName(target);
    const nextT = nextInviteTierTargetAfter(target);
    const body = [
      `» <@${inviterMember.id}>`,
      "",
      `Hai ricevuto ${rolesText} — **${tierName}** 🎀 🔮`,
      "",
      nextT
        ? `Per il prossimo ruolo raggiungi **${nextT} inviti** con il tuo link personalizzato 🌙`
        : "Hai raggiunto la soglia massima degli inviti reward! 💞",
      "",
      `Ora hai **${safeTotal} inviti** registrati.`,
      INFO_PERKS_CHANNEL_ID ? `\n<a:VC_Arrow:1482706699365257397> Dettagli perk: <#${INFO_PERKS_CHANNEL_ID}>` : "",
    ].join("\n");
    return new EmbedBuilder()
      .setColor(INVITE_MILESTONE_EMBED_COLOR)
      .setTitle(getInviteMilestoneTitle(target))
      .setThumbnail(inviterMember.displayAvatarURL({ size: 256 }))
      .setDescription(body)
      .setFooter({ text: `${shortInviteLinkForFooter()} • Grazie! 💞` })
      .setTimestamp();
  });
}
const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;
const ARROW = "<:VC_right_arrow:1482459908245815296>";
const JOIN_GATE_WHITELIST_ROLE_IDS = new Set([IDs.roles.Founder, IDs.roles.CoFounder,].filter(Boolean).map(String),);
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const SUSPICIOUS_JOIN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const recentJoinSignalsByGuild = new Map();

function formatActor(actor) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function formatAccountAge(createdAt) {
  const now = Date.now();
  const ageMs = now - createdAt.getTime();
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = days % 30;

  const parts = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(`${remainingDays} day${remainingDays !== 1 ? "s" : ""}`);
  }
  return parts.join(", ");
}

async function resolveGuildChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  return getGuildChannelCached(guild, channelId);
}

function ensureInviteCache(client) {
  if (!client.inviteCache) {
    client.inviteCache = new Map();
  }
}

async function resolveInviteInfo(member) {
  const guild = member.guild;
  ensureInviteCache(member.client);

  const invites = await guild.invites.fetch().catch(() => null);
  const cache = member.client.inviteCache.get(guild.id);
  let usedInvite = null;

  if (invites && cache) {
    for (const invite of invites.values()) {
      const cached = cache.get(invite.code);
      if (
        cached &&
        typeof invite.uses === "number" &&
        invite.uses > (cached.uses || 0)
      ) {
        usedInvite = invite;
        break;
      }
    }
  }

  if (invites) {
    const map = new Map();
    for (const invite of invites.values()) {
      map.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null,
      });
    }
    member.client.inviteCache.set(guild.id, map);
  }

  let vanityCode = guild.vanityURLCode || null;
  if (!usedInvite && !vanityCode && guild.features?.includes("VANITY_URL")) {
    const vanityData = await guild.fetchVanityData().catch(() => null);
    vanityCode = vanityData?.code || null;
  }
  if (!usedInvite && vanityCode) {
    return {
      link: `https://discord.gg/${vanityCode}`,
      inviterTag: "Vanity URL",
      totalInvites: 0,
      isVanity: true,
      inviterId: null,
    };
  }

  const link = usedInvite ? `https://discord.gg/${usedInvite.code}`
    : "Link non disponibile";
  const inviterId = usedInvite?.inviter?.id || null;
  const inviterTag = inviterId ? `<@${inviterId}>` : "Sconosciuto";

  let totalInvites = 0;
  if (invites && inviterId) {
    totalInvites = invites
      .filter((invite) => invite.inviter?.id === inviterId)
      .reduce((sum, invite) => sum + (invite.uses || 0), 0);
  }

  return { link, inviterTag, totalInvites, isVanity: false, inviterId };
}

async function trackInviteJoin(member, inviterId) {
  if (!inviterId || inviterId === member.id) return;

  const inviterMember = await getGuildMemberCached(member.guild, inviterId);
  if (!inviterMember || inviterMember.user?.bot) return;

  await ActivityUserProfile.findOneAndUpdate(
    { guildId: member.guild.id, userId: member.id },
    {
      $setOnInsert: { guildId: member.guild.id, userId: member.id },
      $set: {
        "profile.inviteTrack.inviterId": inviterId,
        "profile.inviteTrack.active": true,
        "profile.inviteTrack.leftAt": null,
        "profile.inviteTrack.joinedAt": new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function tryAwardInviteRole(member, inviteInfo) {
  if (!inviteInfo || inviteInfo.isVanity || !inviteInfo.inviterId) {
    return { awarded: false, roleIds: [], targets: [] };
  }
  const totalInvites = Number(inviteInfo.totalInvites || 0);
  if (!Number.isFinite(totalInvites) || totalInvites < INVITE_REWARD_TIERS[0].target) {
    return { awarded: false, roleIds: [], targets: [] };
  }

  const guild = member.guild;
  const inviterMember = await getGuildMemberCached(guild, inviteInfo.inviterId);
  if (!inviterMember || inviterMember.user?.bot) return { awarded: false, roleIds: [], targets: [] };

  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles))
    return { awarded: false, roleIds: [], targets: [] };

  const rolesToAdd = [];
  const reachedTargets = [];
  for (const tier of INVITE_REWARD_TIERS) {
    if (totalInvites < Number(tier.target || 0)) continue;
    reachedTargets.push(Number(tier.target || 0));
    for (const roleId of Array.isArray(tier.roleIds) ? tier.roleIds : []) {
      const role = await getGuildRoleCached(guild, roleId);
      if (!role) continue;
      if (inviterMember.roles.cache.has(role.id)) continue;
      if (role.position >= me.roles.highest.position) continue;
      rolesToAdd.push(role.id);
    }
  }
  if (!rolesToAdd.length) {
    return { awarded: false, roleIds: [], targets: reachedTargets };
  }

  const inviterAfter = await addRolesAndGetMember(guild, inviterMember.id, rolesToAdd);
  if (!inviterAfter) {
    return { awarded: false, roleIds: [], targets: reachedTargets };
  }
  const missingRoleIds = rolesToAdd.filter((roleId) => !inviterAfter.roles.cache.has(roleId));
  if (missingRoleIds.length > 0) {
    return { awarded: false, roleIds: [], targets: reachedTargets };
  }
  return { awarded: true, roleIds: rolesToAdd, targets: reachedTargets };
}

function getNextInviteRewardTier(totalInvites) {
  const safeInvites = Math.max(0, Number(totalInvites || 0));
  return INVITE_REWARD_TIERS.find((tier) => safeInvites < Number(tier.target || 0)) || null;
}

async function addBotRoles(member) {
  const roleIds = [IDs.roles.Bots].filter(Boolean);
  if (!roleIds.length) return;
  const me = member.guild.members.me;

  if (!me) {
    global.logger.warn(
      "[guildMemberAdd] Bot member not cached; cannot add bot roles.",
    );
    return;
  }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    global.logger.warn(
      "[guildMemberAdd] Missing Manage Roles permission; cannot add bot roles.",
    );
    return;
  }

  const roles = roleIds.map((id) => member.guild.roles.cache.get(id)).filter(Boolean);

  const missingRoles = roleIds.filter((id) => !member.guild.roles.cache.has(id),);
  if (missingRoles.length) {
    global.logger.warn(
      "[guildMemberAdd] Some bot roles not found:",
      missingRoles,
    );
  }
  if (!roles.length) return;

  const blocked = roles.filter((role) => role.position >= me.roles.highest.position,);
  if (blocked.length) {
    global.logger.warn(
      "[guildMemberAdd] Bot role hierarchy prevents adding roles:",
      blocked.map((role) => role.id),
    );
    return;
  }

  const idsToAdd = roles.map((r) => r.id);
  const memberAfter = await addRolesAndGetMember(member.guild, member.id, idsToAdd);
  if (!memberAfter) return;
  const unappliedRoleIds = idsToAdd.filter((id) => !memberAfter.roles.cache.has(id));
  if (unappliedRoleIds.length) {
    global.logger.warn(
      "[guildMemberAdd] Failed to add bot roles:",
      unappliedRoleIds,
    );
  }
}

function buildWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setAuthor({
      name: member.user.username,
      iconURL: member.displayAvatarURL({ size: 128 }),
    })
    .setTitle(
      "<a:VC_HeartsPink:1468685897389052008> Benvenuto/a su Vinili & Caffè <a:VC_HeartsPink:1468685897389052008>",
    )
    .setDescription(
      `__${member.displayName}__ benvenuto/a nella nostra community <a:VC_Sparkles:1468546911936974889>\n` +
      "Passa su <#1469429150669602961> per **abbellire il tuo profilo** con i ruoli & colori.",
    )
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .setImage(DIVIDER_URL)
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo in ${member.guild.memberCount} membri` });
}

function buildDmWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_RightWing:1448672889845973214> Welcome to Vinili & Caffè!")
    .setDescription(
      [
        `Ei **${member.displayName}** welcome, glad to have you here!`,
        "",
        "Joining the server you automatically accept the rules.",
        "Entrando nel server accetti automaticamente le nostre regole.",
        "<a:VC_Arrow:1482706699365257397> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102236527853661>",
        "------------------------------",
        "<:VC_Dot:1482532364222595303> Check out our GUILD TAGS",
        "<a:VC_Moon:1482724651430838406>[⭑.ᐟ](<https://discord.gg/E6vrm5zE6B>)<:VC_Luna1:1482497618289496117><:VC_Luna2:1482497653387427902> & <a:VC_Money:1482724694699278487>[⭑.ᐟ](<https://discord.gg/QnTN5P578g>)<:VC_Cash1:1482460724302184450><:VC_Cash2:1482460763346960434>",
        "<:VC_Firework:1470796227913322658>[⭑.ᐟ](<https://discord.gg/WMuZ4EMAkc>)<:VC_Porn1:1482497744513011944><:VC_Porn2:1482497774892089547> & <a:VC_PepeEggPlant:1331622686014570588>[⭑.ᐟ](<https://discord.gg/uqUNS9f5m5>)<:VC_SixNine1:1482497833578922065><:VC_SixNine2:1482497868328865813>",
        "<a:VC_PepeSmoke:1331590685673132103>[⭑.ᐟ](<https://discord.gg/SzBwnxHXNv>)<:VC_Weed1:1482497951686201534><:VC_Weed2:1482497986910097592> & <a:VC_PepeExcited:1331621719093284956>[⭑.ᐟ](<https://discord.gg/z3EXtJwvQH>)<:VC_Figa1:1482495980275499169><:VC_Figa2:1482496046222544937>",
        "<a:VC_Arrow:1482706699365257397> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102239094767699>",
        "------------------------------",
        "<a:VC_Exclamation:1482534702077444217> Verify Yourself: <https://discord.com/channels/1329080093599076474/1442569059983163403>",
      ].join("\n"),
    )
    .setThumbnail(member.guild.iconURL({ size: 256 }))
    .setFooter({
      text: `${member.guild.name} • Ora siamo in ${member.guild.memberCount}`,
      iconURL: member.guild.iconURL(),
    })
    .setTimestamp();
}

async function sendBotAddLog(member) {
  const guild = member?.guild;
  if (!guild || !member?.user?.bot) return;

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(guild, modLogId) : null;
  if (!logChannel?.isTextBased?.()) return;

  let executor = null;
  const entry = await fetchRecentBotAddEntry(guild, member.user.id);
  if (entry && !entry.__noAuditPermission && !entry.__auditNotFound && entry.executor) {
    executor = entry.executor;
  }

  const responsible = formatActor(executor);
  const createdTs = Math.floor(new Date(member.user.createdAt).getTime() / 1000);
  const nowTs = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("Bot Add")
    .setDescription(
      [
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} **Target:** ${member.user} \`${member.user.id}\``,
        `${ARROW} <t:${nowTs}:F>`,
        "",
        "**Additional Information**",
        `${ARROW} **Id:** \`${member.user.id}\``,
        `${ARROW} **Username:** ${member.user.username}`,
        `${ARROW} **Creation:** <t:${createdTs}:R>`,
      ].join("\n"),
    );

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}
async function handleBotJoin(member, joinGateConfig) {
  queueIdsCatalogSync(member.client, member.guild.id, "botJoin");
  await sendBotAddLog(member).catch(() => { });
  await sendJoinGateNoAvatarLog(member).catch(() => { });

  const botAddEntry = await fetchRecentBotAddEntry(member.guild, member.user.id);
  const noAuditPerm = Boolean(botAddEntry?.__noAuditPermission);
  const auditNotFound = Boolean(botAddEntry?.__auditNotFound);
  const executorId =
    !noAuditPerm && !auditNotFound
      ? botAddEntry?.executorId || botAddEntry?.executor?.id || null
      : null;
  const executorText =
    botAddEntry?.executor && !noAuditPerm && !auditNotFound
      ? formatActor(botAddEntry.executor)
      : "sconosciuto";
  const verifiedBot = await isVerifiedBot(member.user);

  if (
    joinGateConfig?.enabled &&
    joinGateConfig?.unverifiedBotAdditions?.enabled &&
    !verifiedBot
  ) {
    const result = await kickForJoinGate(member, "Unverified bot addition.", [
      `${ARROW} **Rule:** Unverified Bot Additions`,
      `${ARROW} **Responsible:** ${executorText}`,
    ], joinGateConfig?.unverifiedBotAdditions?.action || "kick");
    if (result?.blocked) return;
  }

  if (joinGateConfig?.enabled && joinGateConfig?.botAdditions?.enabled) {
    if (noAuditPerm) {
      global.logger?.warn?.(
        `[JoinGate] botAdditions skipped (no ViewAuditLog) target=${member.user?.id || "unknown"}`,
      );
    } else if (!executorId && auditNotFound) {
      global.logger?.warn?.(
        `[JoinGate] botAdditions: no BotAdd row after retries — fail-closed kick target=${member.user?.id || "unknown"}`,
      );
      const result = await kickForJoinGate(
        member,
        "Bot added by unauthorized member (no audit match — fail-closed).",
        [
          `${ARROW} **Rule:** Bot Additions`,
          `${ARROW} **Responsible:** unknown`,
        ],
        joinGateConfig?.botAdditions?.action || "kick",
      );
      if (result?.blocked) return;
    } else if (executorId) {
      const authorized = await isAuthorizedBotAdder(member.guild, executorId);
      if (!authorized) {
        const result = await kickForJoinGate(member, "Bot added by unauthorized member.", [
          `${ARROW} **Rule:** Bot Additions`,
          `${ARROW} **Responsible:** ${executorText}`,
        ], joinGateConfig?.botAdditions?.action || "kick");
        if (result?.blocked) return;
      }
    }
  }

  try {
    await addBotRoles(member);
  } catch (error) {
    global.logger.error("[guildMemberAdd] Failed to add bot roles:", error);
  }

  const welcomeChannel = await resolveGuildChannel(member.guild, IDs.channels.chat,);
  if (welcomeChannel) {
    await welcomeChannel
      .send(applyDefaultFooterToEmbeds({
        content: `Ciao ${member.user}, benvenuto/a! <@&${IDs.roles.Staff}> <a:VC_HeartOrange:1448673443762405386>`,
        embeds: [buildWelcomeEmbed(member)],
      }, member.guild))
      .catch(() => { });
  }

  const inviteChannel = await resolveGuildChannel(member.guild, INVITE_LOG_CHANNEL_ID,);
  if (!inviteChannel) return;

  try {
    const info = await resolveInviteInfo(member);
    if (info.isVanity) {
      await inviteChannel
        .send({
          content:
            "<:VC_Reply:1482532158080942191> Bot entrato tramite vanity **.gg/viniliecaffe**",
        })
        .catch(() => { });
    } else {
      await inviteChannel
        .send({
          content: `<:VC_Reply:1482532158080942191> Bot entrato con il link <${info.link}>,\n-# -> invitato da ${info.inviterTag} che ora ha **${info.totalInvites} inviti**.`,
        })
        .catch(() => { });
    }
  } catch (err) {
    global.logger?.warn?.("[guildMemberAdd] ", err?.message || err);
  }
}

function isTooYoungAccount(member, minAgeDays = 3) {
  const safeMinDays = Math.max(0, Number(minAgeDays || 0));
  const minAgeMs = safeMinDays * 24 * 60 * 60 * 1000;
  const accountAgeMs = Date.now() - member.user.createdAt.getTime();
  return accountAgeMs < minAgeMs;
}

function hasNoAvatar(member) {
  if (!member?.user) return false;
  return !member.user.avatar;
}

function getJoinGateNameCandidate(member) {
  return String(
    member?.user?.globalName ||
    member?.displayName ||
    member?.nickname ||
    member?.user?.username ||
    "",
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inviteLikeInName(text) {
  const normalized = normalizeText(text);
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|invite\.gg\/|dsc\.gg\/)/i.test(
    normalized,
  );
}

function wildcardToRegex(pattern) {
  const escaped = String(pattern || "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchUsernameFilters(candidate, rules) {
  if (!rules?.enabled) return null;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  const strictWords = Array.isArray(rules.strictWords) ? rules.strictWords : [];
  for (const word of strictWords) {
    const normalizedWord = normalizeText(word);
    if (normalizedWord && normalized.includes(normalizedWord)) {
      return { type: "strict", value: word };
    }
  }

  const wildcardWords = Array.isArray(rules.wildcardWords) ? rules.wildcardWords : [];
  for (const wildcard of wildcardWords) {
    const regex = wildcardToRegex(normalizeText(wildcard));
    if (regex.test(normalized)) {
      return { type: "wildcard", value: wildcard };
    }
  }
  return null;
}

function toAccountNameSkeleton(input) {
  return normalizeText(input)
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b");
}

function hasMixedScripts(input) {
  const value = String(input || "");
  if (!value) return false;
  const hasLatin = /[A-Za-z]/.test(value);
  const hasCyrillic = /[\u0400-\u04FF]/.test(value);
  const hasGreek = /[\u0370-\u03FF]/.test(value);
  const nonLatinScripts = Number(hasCyrillic) + Number(hasGreek);
  return hasLatin && nonLatinScripts > 0;
}

function normalizeCompact(input) {
  return normalizeText(input).replace(/\s+/g, "");
}

function countVowels(input) {
  return (String(input || "").match(/[aeiou]/gi) || []).length;
}

function looksRandomName(input) {
  const raw = String(input || "").trim();
  if (!raw) return false;

  const compact = normalizeCompact(raw);
  if (compact.length < 6 || compact.length > 18) return false;
  if (!/^[a-z0-9._-]+$/i.test(raw)) return false;

  const alnum = compact.replace(/[^a-z0-9]/g, "");
  const letterOnly = alnum.replace(/\d/g, "");
  const vowelCount = countVowels(letterOnly);
  const vowelRatio = letterOnly.length > 0 ? vowelCount / letterOnly.length : 0;
  const digitCount = (alnum.match(/\d/g) || []).length;
  const uniqueRatio = alnum.length > 0 ? new Set(alnum.split("")).size / alnum.length : 0;
  const longConsonantRun = /[bcdfghjklmnpqrstvwxyz]{4,}/i.test(letterOnly);

  return (
    (digitCount >= 2 && vowelRatio <= 0.25 && uniqueRatio >= 0.68) ||
    (longConsonantRun && vowelRatio <= 0.3) ||
    (vowelCount === 0 && letterOnly.length >= 6)
  );
}

function pruneJoinSignals(records) {
  const now = Date.now();
  return records.filter((item) => now - Number(item?.joinedAt || 0) <= SUSPICIOUS_JOIN_WINDOW_MS);
}

function trackRecentJoinSignal(member) {
  const guildId = String(member?.guild?.id || "");
  const userId = String(member?.user?.id || "");
  if (!guildId || !userId) return;

  const avatarHash = String(member?.user?.avatar || "");
  const nameSkeleton = toAccountNameSkeleton(`${member?.user?.username || ""}${member?.user?.globalName || ""}`.trim(),
  );
  const existing = pruneJoinSignals(recentJoinSignalsByGuild.get(guildId) || []);
  existing.push({
    userId,
    joinedAt: Date.now(),
    avatarHash: avatarHash || null,
    nameSkeleton: nameSkeleton || null,
  });
  if (existing.length > 2500) {
    existing.splice(0, existing.length - 2500);
  }
  recentJoinSignalsByGuild.set(guildId, existing);
}

function getJoinSignalStats(member) {
  const guildId = String(member?.guild?.id || "");
  const userId = String(member?.user?.id || "");
  const avatarHash = String(member?.user?.avatar || "");
  if (!guildId || !userId) {
    return { reusedAvatarCount: 0, similarNameCount: 0 };
  }

  const records = pruneJoinSignals(recentJoinSignalsByGuild.get(guildId) || []);
  recentJoinSignalsByGuild.set(guildId, records);
  const normalizedName = toAccountNameSkeleton(`${member?.user?.username || ""}${member?.user?.globalName || ""}`.trim(),
  );

  const reusedAvatarCount = avatarHash ? records.filter((item) => item?.userId !== userId && item?.avatarHash && String(item.avatarHash) === avatarHash,).length : 0;

  const similarNameCount = normalizedName ? records.filter((item) => item?.userId !== userId && item?.nameSkeleton && String(item.nameSkeleton) === normalizedName,).length : 0;

  return { reusedAvatarCount, similarNameCount };
}

function detectSuspiciousAccount(member) {
  const usernameRaw = String(member?.user?.username || "");
  const globalNameRaw = String(member?.user?.globalName || "");
  const displayNameRaw = String(member?.displayName || "");
  const combinedRaw = `${usernameRaw} ${globalNameRaw} ${displayNameRaw}`.trim();
  const combinedSkeleton = toAccountNameSkeleton(combinedRaw);
  const accountAgeMs = Date.now() - new Date(member.user.createdAt).getTime();
  const ageHours = accountAgeMs / (60 * 60 * 1000);
  const ageDays = ageHours / 24;

  const suspiciousKeywords = ["support", "moderator", "admin", "staff", "official", "nitro", "airdrop", "crypto", "steam", "gift", "discord", "giveaway",];

  const signalLabels = [];
  let score = 0;
  let strongSignals = 0;

  if (inviteLikeInName(combinedRaw)) {
    score += 80;
    strongSignals += 1;
    signalLabels.push("invite-link");
  }

  const keywordHits = suspiciousKeywords.filter((kw) => combinedSkeleton.includes(kw),);
  if (keywordHits.length > 0) {
    const keywordScore = Math.min(45, 18 + keywordHits.length * 9);
    score += keywordScore;
    if (keywordHits.some((kw) => ["nitro", "airdrop", "crypto", "gift", "giveaway"].includes(kw))) {
      strongSignals += 1;
    }
    signalLabels.push(`keywords:${keywordHits.slice(0, 3).join(",")}`);
  }

  const digitCount = (combinedRaw.match(/\d/g) || []).length;
  const separatorCount = (combinedRaw.match(/[._-]/g) || []).length;
  if (digitCount >= 6) {
    score += 20;
    signalLabels.push(`digits:${digitCount}`);
  }
  if (separatorCount >= 4) {
    score += 12;
    signalLabels.push(`separators:${separatorCount}`);
  }
  if (/(.)\1{4,}/i.test(combinedRaw)) {
    score += 10;
    signalLabels.push("repeated-chars");
  }
  if (hasMixedScripts(combinedRaw)) {
    score += 30;
    strongSignals += 1;
    signalLabels.push("mixed-scripts");
  }

  if (looksRandomName(usernameRaw) || looksRandomName(globalNameRaw)) {
    score += 24;
    strongSignals += 1;
    signalLabels.push("random-name");
  }

  if (ageHours <= 24) {
    score += 32;
    signalLabels.push("age<=24h");
  } else if (ageHours <= 72) {
    score += 24;
    signalLabels.push("age<=72h");
  } else if (ageDays <= 7) {
    score += 12;
    signalLabels.push("age<=7d");
  } else if (ageDays <= 30) {
    score += 6;
    signalLabels.push("age<=30d");
  }

  if (hasNoAvatar(member) && ageDays <= 30) {
    score += 24;
    signalLabels.push("no-avatar+young");
  }

  const { reusedAvatarCount, similarNameCount } = getJoinSignalStats(member);
  if (reusedAvatarCount >= 2) {
    score += 36;
    strongSignals += 1;
    signalLabels.push(`avatar-reused:${reusedAvatarCount + 1}`);
  } else if (reusedAvatarCount === 1) {
    score += 16;
    signalLabels.push("avatar-reused:2");
  }
  if (similarNameCount >= 2) {
    score += 18;
    signalLabels.push(`name-clone:${similarNameCount + 1}`);
  }

  const suspicious = score >= 75 || (strongSignals >= 2 && score >= 58);
  if (suspicious) {
    return `score ${Math.min(100, score)}/100 | segnali: ${signalLabels.slice(0, 5).join(" | ")}`;
  }
  return null;
}

async function fetchRecentBotAddEntry(guild, botId) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return { __noAuditPermission: true };
  }
  const delays = [0, 450, 900, 1400, 2200];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delays[attempt] - delays[attempt - 1]);
        timer.unref?.();
      });
    }
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const found =
        logs.entries.find((entry) => {
          const createdTs = Number(entry?.createdTimestamp || 0);
          return (
            createdTs > 0 &&
            now - createdTs <= AUDIT_LOOKBACK_MS &&
            String(entry?.target?.id || "") === String(botId || "")
          );
        }) || null;
      if (found) return found;
    }
  }
  return { __auditNotFound: true };
}

async function isVerifiedBot(user) {
  if (!user?.bot) return false;
  let flags = user.flags || null;
  if (!flags && typeof user.fetchFlags === "function") {
    flags = await user.fetchFlags().catch(() => null);
  }
  return Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
}

async function isAuthorizedBotAdder(guild, executorId) {
  if (!guild || !executorId) return false;
  const executorMember = await getGuildMemberCached(guild, String(executorId || ""));
  if (await resolveJoinGateConfiguredExempt(guild, executorId, executorMember)) return true;
  const executor = executorMember;
  if (!executor) return false;
  if (
    executor.permissions.has(PermissionsBitField.Flags.Administrator) ||
    executor.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) {
    return true;
  }
  return [...JOIN_GATE_WHITELIST_ROLE_IDS].some((roleId) =>
    executor.roles.cache.has(roleId),
  );
}

async function sendJoinGatePunishDm(member, reason, extraLines = []) {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`JoinGate action in ${member.guild.name}`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
        ...extraLines.filter(Boolean),
      ].join("\n"),
    );
  try {
    const dmChannel = member.user.dmChannel || (await member.user.createDM().catch(() => null));
    if (!dmChannel) return false;
    await dmChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}

function buildJoinGateTriggeredEmbed(member, reason) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${member.user.username} has triggered the joingate!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
      ].join("\n"),
    )
    .setThumbnail(member.displayAvatarURL({ size: 256 }));
}

async function kickForJoinGate(member, reason, extraLines = [], action = "kick") {
  const me = member.guild.members.me;
  const normalizedAction = ["kick", "ban", "timeout", "log"].includes(String(action || "").toLowerCase(),) ? String(action || "").toLowerCase() : "log";
  const canKick = Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) && Boolean(member?.kickable);
  const canBan = Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) && Boolean(member?.bannable);
  const canTimeout = Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) && Boolean(member?.moderatable);
  const joinGateCfg = getJoinGateConfigSnapshot();
  const dmPunishedMembers = typeof joinGateCfg?.dmPunishedMembers === "boolean" ? joinGateCfg.dmPunishedMembers : true;
  let dmSent = false;
  if (normalizedAction !== "log" && dmPunishedMembers) {
    dmSent = await sendJoinGatePunishDm(member, reason, extraLines);
  }

  let punished = false;
  let appliedAction = normalizedAction;
  if (normalizedAction === "kick" && canKick) {
    punished = await member
      .kick(reason)
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] kick failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  } else if (normalizedAction === "ban" && canBan) {
    punished = await member.guild.members
      .ban(member.id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] ban failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  } else if (normalizedAction === "ban" && !canBan && canKick) {
    punished = await member
      .kick(reason)
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] kick (ban fallback) failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
    if (punished) appliedAction = "kick";
  } else if (normalizedAction === "timeout" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate timeout: ${reason}`)
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] timeout failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  }
  if (!punished && normalizedAction !== "log" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate fallback timeout: ${reason}`)
      .then(() => true)
      .catch((err) => {
        global.logger?.warn?.("[JoinGate] fallback timeout failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
    if (punished) appliedAction = "timeout";
  }
  if (!punished && normalizedAction !== "log") {
    appliedAction = "log";
  }
  if (!dmSent && appliedAction !== "log" && punished && dmPunishedMembers) {
    dmSent = await sendJoinGatePunishDm(member, reason, extraLines);
  }
  const blocked = appliedAction === "log" ? false : punished;
  if (punished) {
    if (appliedAction === "kick") {
      markJoinGateKick(member.guild.id, member.id, reason);
    }
    if (joinGateCfg.escalateRaidOnJoinGatePunish) {
      await registerJoinRaidSecuritySignal(member, {
        reason: `Join Gate action: ${reason}`,
        enableAntiNuke: false,
        antiNukeHeat: 0,
        enableAutoMod: false,
        raidBoost: 0,
      }).catch(() => null);
    }

    if (member.guild?.client && appliedAction !== "log") {
      const modAction = appliedAction === "timeout" ? "MUTE" : appliedAction === "ban" ? "BAN" : "KICK";
      const durationMs = appliedAction === "timeout" ? 6 * 60 * 60_000 : null;
      try {
        const config = await getModConfig(member.guild.id);
        const { doc, created } = await createModCase({
          guildId: member.guild.id, action: modAction, userId: member.id, modId: member.client.user.id, reason: `JoinGate: ${reason}`,
          durationMs,
          context: {},
          dedupe: { enabled: true, windowMs: 15_000, matchReason: true },
        });
        if (created) {
          await logModCase({ client: member.client, guild: member.guild, modCase: doc, config });
        }
      } catch (e) {
        global.logger?.warn?.("[JoinGate] ModCase creation failed:", member.guild.id, member.id, e?.message || e);
      }
    }
  }
  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(member.guild, modLogId) : null;
  if (logChannel?.isTextBased?.()) {
    const actionLabel = appliedAction === "ban" ? "banned" : appliedAction === "timeout" ? "timed out" : appliedAction === "kick" ? "kicked" : "flagged";
    const embed = punished
      ? new EmbedBuilder()
        .setColor("#A97142")
        .setTitle(`${member.user.username} has been ${actionLabel}!!`)
        .setDescription(
          [
            `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
            `${ARROW} **Reason:** ${reason}`,
            ...extraLines.filter(Boolean),
            "",
            "**More Details:**",
            `${ARROW} **Member Direct Messaged?** ${dmSent ? "✅" : "❌"}`,
            `${ARROW} **Member Punished?** ${punished ? "✅" : "❌"}`,
          ].join("\n"),
        )
        .setFooter({ text: "© 2025 Vinili & Caffè. Tutti i diritti riservati." })
        .setThumbnail(member.displayAvatarURL({ size: 256 }))
      : buildJoinGateTriggeredEmbed(member, reason);
    await logChannel.send({ embeds: [embed] }).catch(() => { });
  }
  return {
    blocked,
    attempted:
      appliedAction === "log"
        ? false
        : appliedAction === "ban"
          ? canBan
          : appliedAction === "kick"
            ? canKick
            : appliedAction === "timeout"
              ? canTimeout
              : false,
    punished,
    dmSent,
    canKick,
    canBan,
    canTimeout,
    action: appliedAction,
  };
}

async function sendJoinGateNoAvatarLog(member) {
  if (!member?.guild || !member?.user) return;
  if (!hasNoAvatar(member)) return;

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(member.guild, modLogId) : null;
  if (!logChannel?.isTextBased?.()) return;

  const embed = buildJoinGateTriggeredEmbed(member, "Account has no avatar.");

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

async function sendSuspiciousAccountLog(member, reason) {
  if (!member?.guild || !reason) return;
  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(member.guild, modLogId) : null;
  if (!logChannel?.isTextBased?.()) return;
  const embed = buildJoinGateTriggeredEmbed(member, reason);
  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

async function handleTooYoungAccount(member, joinGateConfig = null) {
  const createdTs = toUnix(member.user.createdAt);
  const cfg = joinGateConfig || getJoinGateConfigSnapshot();
  const minAgeDays = Number(cfg?.newAccounts?.minAgeDays || 3);
  await kickForJoinGate(member, "Account is too young to be allowed.", [
    `${ARROW} **Rule:** Minimum Account Age`,
    `${ARROW} **Account Age:** <t:${createdTs}:R>`,
    `${ARROW} **Minimum Age:** ${minAgeDays} days`,
  ], cfg?.newAccounts?.action || "kick");
}

async function sendJoinLog(member) {
  const joinLeaveLogChannel = await resolveGuildChannel(member.guild, JOIN_LEAVE_LOG_CHANNEL_ID,);
  if (!joinLeaveLogChannel) return;

  const accountAge = formatAccountAge(member.user.createdAt);
  const joinLogEmbed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("Member Joined")
    .setDescription(
      [
        `${member.user} ${member.user.tag}.`,
        "",
        "**Account Age**",
        accountAge,
      ].join("\n"),
    )
    .setFooter({ text: `ID: ${member.user.id}` })
    .setTimestamp()
    .setThumbnail(member.displayAvatarURL({ extension: "png", size: 256 }));

  await joinLeaveLogChannel.send({ embeds: [joinLogEmbed] }).catch((err) => {
    global.logger.error("[guildMemberAdd] Failed to send join log:", err);
  });
}

function isUserDmUnavailableError(err) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  if ([50007, 50278].includes(code)) return true;
  const msg = String(err?.message || err?.rawError?.message || "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("cannot send messages")) return true;
  if (msg.includes("no mutual guild")) return true;
  return false;
}

async function sendDmWelcome(member) {
  const dmEmbed = buildDmWelcomeEmbed(member);
  const payload = { embeds: [dmEmbed] };

  try {
    await member.send(payload);
    return;
  } catch (err) {
    if (isUserDmUnavailableError(err)) return;
  }

  await new Promise((resolve) => {
    const t = setTimeout(resolve, 2000);
    t.unref?.();
  });

  try {
    await member.send(payload);
  } catch (err) {
    if (isUserDmUnavailableError(err)) return;
    global.logger.warn(
      `[guildMemberAdd] Could not send DM to ${member.user.tag}:`,
      err.message,
    );
  }
}

function isCustomRoleDocActive(doc) {
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() > Date.now();
}

async function restoreDiscadiaVoteRoleOnRejoin(member) {
  if (!member?.guild || !member?.id || !VOTE_ROLE_ID) return;
  const guildId = String(member.guild.id);
  if (String(guildId) !== String(IDs.guilds.main || "")) return;

  const doc = await ActivityUserProfile.findOne({ guildId, userId: String(member.id) })
    .select(VOTE_ROLE_EXPIRES_AT_PATH)
    .lean()
    .catch(() => null);
  const expiresAtRaw = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.voteRole?.expiresAt || null;
  if (!expiresAtRaw) return;

  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime())) return;
  const now = Date.now();
  const expiresAtMs = expiresAt.getTime();
  if (expiresAtMs <= now) return;
  if (expiresAtMs - now > VOTE_RESTORE_WINDOW_MS) return;
  if (member.roles.cache.has(VOTE_ROLE_ID)) return;

  const me = member.guild.members.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) return;
  const role = await getGuildRoleCached(member.guild, VOTE_ROLE_ID);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;

  const refreshed = await addRolesAndGetMember(member.guild, member.id, [VOTE_ROLE_ID]).catch(() => null);
  if (!refreshed?.roles?.cache?.has?.(VOTE_ROLE_ID)) return;
}

async function restoreCustomRoleOnRejoin(member) {
  if (!member?.guild || !member?.id) return;
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  const roleId = String(doc?.roleId || "");
  if (!roleId) return;
  if (!isCustomRoleDocActive(doc)) return;
  if (member.roles.cache.has(roleId)) return;

  const role = await getGuildRoleCached(member.guild, roleId);
  if (!role) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) return;
  if (role.position >= me.roles.highest.position) return;

  const hasRequiredRole = CUSTOM_ROLE_REQUIRED_ROLE_IDS.some((requiredRoleId) => member.roles.cache.has(requiredRoleId));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  if (!hasRequiredRole && !hasEventWeek2Grant && !hasEventWeek3Grant) return;

  const refreshed = await addRolesAndGetMember(member.guild, member.id, [roleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has?.(roleId)) return;
  if (doc?.customRoleEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customRoleEligibilityLostAt: null } },
    ).catch(() => {});
  }
}

async function announceInviteInfo(member, channel, info) {
  if (!channel || !info) return;

  if (info.isVanity) {
    await channel
      .send({
        content:
          "<:VC_Reply:1482532158080942191> L'utente ha usato il link vanity **.gg/viniliecaffe**",
      })
      .catch(() => { });
    return;
  }

  await channel
    .send({
      content: `<:VC_Reply:1482532158080942191> È entratx con il link <${info.link}>,\n-# -> invitato da ${info.inviterTag} che ora ha **${info.totalInvites} inviti**.`,
    })
    .catch(() => { });
}

async function maybeSendInviteReward(member, info) {
  const inviteChannel = await resolveGuildChannel(member.guild, THANKS_CHANNEL_ID,);
  const rewardResult = await tryAwardInviteRole(member, info).catch(() => ({ awarded: false, roleIds: [], targets: [], }));
  if (!inviteChannel || !rewardResult?.awarded || !info?.inviterId) return;

  const inviterMember = await getGuildMemberCached(member.guild, info.inviterId);
  if (!inviterMember) return;

  const tierChunks = splitAwardedRolesByTier(rewardResult.roleIds);
  const milestoneEmbeds = buildInviteMilestoneEmbeds(inviterMember, info.totalInvites, tierChunks);
  if (!milestoneEmbeds.length) return;

  await inviteChannel
    .send(applyDefaultFooterToEmbeds({ embeds: milestoneEmbeds.slice(0, 10) }, member.guild))
    .catch(() => { });
}

async function maybeSendInviteNearRewardReminder(member, info) {
  if (!member?.guild || !info || info.isVanity || !info.inviterId) return;
  const totalInvites = Number(info.totalInvites || 0);
  const nextTier = getNextInviteRewardTier(totalInvites);
  if (!nextTier) return;
  if (Number(nextTier.target || 0) - totalInvites !== 1) return;

  const inviterId = String(info.inviterId);
  const guild = member.guild;
  const inviterMember = await getGuildMemberCached(guild, inviterId);
  if (!inviterMember || inviterMember.user?.bot) return;

  if (await shouldBlockDm(guild.id, inviterId, "invites").catch(() => false)) return;

  const state = await InviteReminderState.findOne({ guildId: guild.id, userId: inviterId, }).lean().catch(() => null);
  const sentTargets = Array.isArray(state?.inviteNearTargets) ? state.inviteNearTargets.map((x) => Number(x)).filter(Number.isFinite) : [];
  if (sentTargets.includes(Number(nextTier.target || 0))) return;

  const rewardRoleText = (Array.isArray(nextTier.roleIds) ? nextTier.roleIds : []).filter(Boolean).map((id) => `<@&${id}>`)
    .join(", ") || "ruolo reward inviti";
  const payload = {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Ci sei quasi con gli inviti!")
        .setDescription(
          [
            `<a:VC_PandaClap:1331620157398712330> Ti manca solo **1 invito** per arrivare a **${nextTier.target}**.`,
            `Quando raggiungi la soglia, ricevi ${rewardRoleText}.`,
            INFO_PERKS_CHANNEL_ID
              ? `Controlla i perks in <#${INFO_PERKS_CHANNEL_ID}>.`
              : "Controlla il canale info del server.",
          ].join("\n"),
        ),
    ],
  };

  const sent = await inviterMember.user.send(payload).then(() => true).catch(() => false);
  if (!sent) return;

  await InviteReminderState.updateOne(
    { guildId: guild.id, userId: inviterId },
    { $addToSet: { inviteNearTargets: Number(nextTier.target || 0) } },
    { upsert: true },
  ).catch(() => null);
}

module.exports = {
  name: "guildMemberAdd",
  kickForJoinGate,
  matchUsernameFilters,
  getJoinGateNameCandidate,
  async execute(member) {
    try {
      if (!member?.guild || !member?.user) return;
      const joinGateConfig = getJoinGateConfigSnapshot();
      const isCoreExempt = await resolveJoinGateConfiguredExempt(member?.guild, member?.id, member);
      if (!isCoreExempt) {
        const lockState = await getSecurityLockState(member.guild);
        if (lockState.joinLockActive) {
          await kickForJoinGate(
            member,
            "Ingresso bloccato: lockdown di sicurezza attivo.",
            [
              `${ARROW} **Rule:** Security Join Lock`,
              `${ARROW} **Sources:** ${lockState.sources.join(", ")}`,
            ],
            "kick",
          );
          return;
        }
      }

      if (member.user?.bot) {
        if (isCoreExempt) {
          await sendJoinLog(member);
          return;
        }
        await sendJoinLog(member);
        await handleBotJoin(member, joinGateConfig);
        return;
      }

      if (!isCoreExempt) {
        trackRecentJoinSignal(member);
        let joinGateMatch = null;
        if (
          joinGateConfig?.enabled &&
          joinGateConfig?.newAccounts?.enabled &&
          isTooYoungAccount(member, joinGateConfig?.newAccounts?.minAgeDays)
        ) {
          joinGateMatch = {
            rule: "tooYoung",
            action: joinGateConfig?.newAccounts?.action || "kick",
          };
        }
        if (!joinGateMatch && joinGateConfig?.enabled && joinGateConfig?.noAvatar?.enabled && hasNoAvatar(member)) {
          joinGateMatch = {
            rule: "noAvatar",
            reason: "Account has no avatar.",
            extraLines: [`${ARROW} **Rule:** No Avatar`],
            action: joinGateConfig?.noAvatar?.action || "log",
          };
        }
        const nameCandidate = getJoinGateNameCandidate(member);
        if (
          !joinGateMatch &&
          joinGateConfig?.enabled &&
          joinGateConfig?.advertisingName?.enabled &&
          inviteLikeInName(nameCandidate)
        ) {
          joinGateMatch = {
            rule: "advertising",
            reason: "Advertising invite link in username.",
            extraLines: [
              `${ARROW} **Rule:** Advertising Name`,
              `${ARROW} **Name:** ${nameCandidate || "N/A"}`,
            ],
            action: joinGateConfig?.advertisingName?.action || "kick",
          };
        }
        const usernameMatch = !joinGateMatch && joinGateConfig?.enabled ? matchUsernameFilters(nameCandidate, joinGateConfig?.usernameFilter) : null;
        if (!joinGateMatch && usernameMatch) {
          joinGateMatch = {
            rule: "usernameFilter",
            reason: "Username matches blocked pattern.",
            extraLines: [
              `${ARROW} **Rule:** Username Filter`,
              `${ARROW} **Match Type:** ${usernameMatch.type}`,
              `${ARROW} **Match:** ${usernameMatch.value}`,
              `${ARROW} **Name:** ${nameCandidate || "N/A"}`,
            ],
            action: joinGateConfig?.usernameFilter?.action || "kick",
          };
        }
        const suspiciousReason = joinGateConfig?.enabled && joinGateConfig?.suspiciousAccount?.enabled ? detectSuspiciousAccount(member) : null;
        if (suspiciousReason) {
          await markJoinGateSuspiciousAccount(member.guild.id, member.id, {
            source: "joingate",
            reason: suspiciousReason,
          }).catch(() => null);
        }
        if (!joinGateMatch && suspiciousReason) {
          joinGateMatch = {
            rule: "suspicious",
            reason: `Suspicious account: ${suspiciousReason}`,
            extraLines: [
              `${ARROW} **Rule:** Suspicious Account`,
              `${ARROW} **Reason:** ${suspiciousReason}`,
            ],
            action: joinGateConfig?.suspiciousAccount?.action || "log",
          };
        }
        const joinGateWillPunish =
          Boolean(joinGateMatch) &&
          String(joinGateMatch?.action || "kick").toLowerCase() !== "log";
        let joinRaidOutcome = { blocked: false };
        try {
          joinRaidOutcome = (await processJoinRaidForMember(member, { joinGateFeedOnly: joinGateWillPunish })) || { blocked: false };
        } catch (err) {
          global.logger?.warn?.("[guildMemberAdd] Join Raid failed:", member.guild.id, member.id, err?.message || err);
        }
        if (joinRaidOutcome?.blocked) return;
        if (joinGateMatch) {
          if (joinGateMatch.rule === "tooYoung") {
            await handleTooYoungAccount(member, joinGateConfig);
            return;
          }
          const kickResult = await kickForJoinGate(member, joinGateMatch.reason, joinGateMatch.extraLines || [], joinGateMatch.action,);
          if (kickResult?.blocked) return;
        }
      }

      await restoreUserOnJoin(member.guild.id, member.id).catch(() => false);

      if (isCoreExempt) {
        await updateMemberCounterNow(member.guild).catch(() => { });
        scheduleMemberCounterRefresh(member.guild, {
          delayMs: 250,
          secondPassMs: 1800,
        });
        await sendJoinLog(member);
        return;
      }

      let info = null;
      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        const welcomeChannelId = IDs.channels.chat;
        let welcomeChannel = await resolveGuildChannel(member.guild, welcomeChannelId);
        if (!welcomeChannel && member.client) {
          const mainGuild = await getClientGuildCached(member.client, IDs.guilds.main);
          welcomeChannel = mainGuild ? await getGuildChannelCached(mainGuild, welcomeChannelId) : null;
        }
        if (!welcomeChannel) {
          const detail = {
            guildId: String(member.guild?.id || ""),
            channelId: String(welcomeChannelId || ""),
            cached: Boolean(member.guild?.channels?.cache?.has?.(String(welcomeChannelId || ""))),
          };
          try {
            const fetched = await member.guild.channels.fetch(String(welcomeChannelId)).catch((err) => {
              const code = err?.code || err?.rawError?.code || null;
              global.logger?.warn?.("[guildMemberAdd] Welcome channel fetch failed:", {
                ...detail,
                code,
                status: err?.status ?? err?.statusCode ?? null,
                message: String(err?.message || ""),
                missingAccess: code === 50001 || code === 50013,
              });
              return null;
            });
            if (fetched?.isTextBased?.()) {
              welcomeChannel = fetched;
            } else {
              global.logger?.warn?.("[guildMemberAdd] Welcome channel not found:", detail);
            }
          } catch (e) {
            global.logger?.warn?.("[guildMemberAdd] Welcome channel not found:", detail, e?.message || e);
          }
        }

        if (welcomeChannel) {
          await welcomeChannel
            .send(applyDefaultFooterToEmbeds({
              content: `Ciao ${member.user}, benvenuto/a! <@&${IDs.roles.Staff}> <a:VC_HeartOrange:1448673443762405386>`,
              embeds: [buildWelcomeEmbed(member)],
            }, member.guild))
            .catch(() => { });

          if (member.client) setWelcomeContextActive(member.guild.id, member.client);

          info = await resolveInviteInfo(member).catch(() => null);
          await announceInviteInfo(member, welcomeChannel, info);
        }
      }

      setImmediate(() => {
        (async () => {
          try {
            await restoreDiscadiaVoteRoleOnRejoin(member).catch(() => {});
            await restoreCustomRoleOnRejoin(member).catch(() => {});
            await sendJoinLog(member);
            await sendDmWelcome(member);

            if (info && !info.isVanity && info.inviterId) {
              await trackInviteJoin(member, info.inviterId).catch(() => { });
            }
            await maybeSendInviteNearRewardReminder(member, info);
            await maybeSendInviteReward(member, info);

            if (member.guild?.id === IDs.guilds.main && member.client && memberHasStaffRole(member)) {
              scheduleStaffListRefresh(member.client, member.guild.id);
            }
          } catch (err) {
            global.logger?.warn?.("[guildMemberAdd] background post-welcome failed:", member.guild?.id, member?.id, err?.message || err);
          }
        })();
      });
    } catch (error) {
      global.logger?.error?.("[guildMemberAdd] failed:", error);
    }
  },
};
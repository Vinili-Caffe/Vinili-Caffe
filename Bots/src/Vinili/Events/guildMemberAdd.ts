const { EmbedBuilder, PermissionsBitField, AuditLogEvent, UserFlagsBitField, MessageFlags, } = require("discord.js") as typeof import("discord.js");
const { DIVIDER_URL } = require("../../shared/discord/constants") as typeof import("../../shared/discord/constants");
const { ActivityUserProfile, InviteReminderState, CustomRole, } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { shouldBlockDm } = require("../Utils/noDmList") as typeof import("../Utils/noDmList");
const { notifyDmPrivacyBlockedInCommands } = require("../../shared/discord/dmPrivacyNotice") as typeof import("../../shared/discord/dmPrivacyNotice");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync") as typeof import("../Utils/Config/idsAutoSync");
const { scheduleMemberCounterRefresh, updateMemberCounterNow } = require("../Utils/Community/memberCounterUtils") as typeof import("../Utils/Community/memberCounterUtils");
const { processJoinRaidForMember, registerJoinRaidSecuritySignal, } = require("../Services/Moderation/joinRaidService") as typeof import("../Services/Moderation/joinRaidService");
const { getJoinGateConfigSnapshot, } = require("../Services/Moderation/joinGateService") as typeof import("../Services/Moderation/joinGateService");
const { resolveJoinGateConfiguredExempt, isSponsorJoinGateGuildId, } = require("../Services/Moderation/joinGateExemptUtils") as typeof import("../Services/Moderation/joinGateExemptUtils");
const { shouldSendPublicMemberAnnouncement } = require("../Utils/Community/memberPublicAnnouncementGate") as typeof import("../Utils/Community/memberPublicAnnouncementGate");
const { getSecurityLockState } = require("../Services/Moderation/securityOrchestratorService") as typeof import("../Services/Moderation/securityOrchestratorService");
const { markJoinGateKick } = require("../Utils/Moderation/joinGateKickCache") as typeof import("../Utils/Moderation/joinGateKickCache");
const { createModCase, getModConfig, logModCase } = require("../Utils/Moderation/moderation") as typeof import("../Utils/Moderation/moderation");
const { buildUnbanRequestRow } = require("../Utils/Moderation/unbanRequestButton") as typeof import("../Utils/Moderation/unbanRequestButton");
const { markJoinGateSuspiciousAccount, } = require("../Services/Moderation/joinGateSuspiciousService") as typeof import("../Services/Moderation/joinGateSuspiciousService");
const {
  enforceUntrustedBotMember,
  punishMemberForBotAbuse,
  buildTrustedBotIdSet,
  isDiscordOfficialActor,
} = require("../Services/Moderation/trustedBotGuardService") as typeof import("../Services/Moderation/trustedBotGuardService");
const { hasEventWeekWinnerGrant } = require("../Services/Community/weekWinnerGrantsService") as typeof import("../Services/Community/weekWinnerGrantsService");
const { hasExtraCustomPerksUnlock } = require("../Utils/Community/customPerksUnlock") as typeof import("../Utils/Community/customPerksUnlock");
const { addRolesAndGetMember, getClientGuildCached, getGuildChannelCached, getGuildMemberCached, getGuildRoleCached, isUnknownDiscordMemberError } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { applyDefaultFooterToEmbeds } = require("../Utils/Embeds/defaultFooter") as typeof import("../Utils/Embeds/defaultFooter");
const { activateWelcomeContextForGuild, refreshWelcomeContextForGuild } = require("../Utils/Message/officialMessageCommunityHandlers") as typeof import("../Utils/Message/officialMessageCommunityHandlers");
const { restoreUserOnJoin } = require("../Services/Community/userLeaveBackupService") as typeof import("../Services/Community/userLeaveBackupService");
const { syncMutedMirrorOnMemberJoin } = require("../Services/Moderation/mutedMirrorRoleService") as typeof import("../Services/Moderation/mutedMirrorRoleService");
const { cancelCustomPerksDiscordCleanupQueue } = require("../Services/Community/customPerksDiscordCleanupQueueService") as typeof import("../Services/Community/customPerksDiscordCleanupQueueService");
const { handleTenantPartnerManagerRejoin } = require("../Services/Partner/partnerManagerLeaveService") as typeof import("../Services/Partner/partnerManagerLeaveService");
const { shouldApplyMainPartnershipFilters } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
const { getPartnershipConfigSync } = require("../MultiGuild/core/tenantPartnershipSettings") as typeof import("../MultiGuild/core/tenantPartnershipSettings");
const { recordPartnershipInviteJoin } = require("../MultiGuild/services/Partner/tenantPartnershipJoinStatsService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipJoinStatsService");
const sponsorVerifiedRequiresMain = require("../Services/Community/sponsorVerifiedRequiresMainService") as typeof import("../Services/Community/sponsorVerifiedRequiresMainService");
const { handleAccessGuildMemberAdd } = require("../Services/Staff/staffAccessMirrorService") as typeof import("../Services/Staff/staffAccessMirrorService");
const { guildIconUrl, guildMemberDisplayAvatarUrlDynamic, accountUsername } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { isAlreadyVerifiedInThisGuild, isSponsorGuildVerify } = require("../Utils/Interaction/verifyUtils") as typeof import("../Utils/Interaction/verifyUtils");
const { syncPreMemberRoleForMember } = require("../Utils/Community/preMemberRoleService") as typeof import("../Utils/Community/preMemberRoleService");
const { applyPronounGenderToEmbedForMember } = require("../Utils/Community/pronounGenderUtils") as typeof import("../Utils/Community/pronounGenderUtils");
const { upsertVerifiedMember, applyTenureForMember, applySponsorGuildAutoVerificato } = require("../Services/Community/communityOpsService") as typeof import("../Services/Community/communityOpsService");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../shared/recovery/snapshotStore") as typeof import("../../shared/recovery/snapshotStore");
const { ghostPingNewMemberOnJoin } = require("../Utils/Message/ghostPingOnChannelEnter") as typeof import("../Utils/Message/ghostPingOnChannelEnter");
const { trackMemberJoin } = require("../Services/Community/dailyMemberStatsService") as typeof import("../Services/Community/dailyMemberStatsService");
const { buildMemberWelcomePhrase } = require("../Utils/Community/pronounWelcomeUtils") as typeof import("../Utils/Community/pronounWelcomeUtils");
const { isMongoReady } = require("../Utils/Database/mongoConnect") as typeof import("../Utils/Database/mongoConnect");

function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

const INVITE_LOG_CHANNEL_ID = IDs.channels.chat;
const THANKS_CHANNEL_ID = IDs.channels.supporters;
const INFO_PERKS_CHANNEL_ID = IDs.channels.info;
const VOTE_ROLE_ID = IDs.roles.Voter;
const { resolveVoteRoleIdForGuild } = require("../Utils/Community/resolveVoteRoleId") as typeof import("../Utils/Community/resolveVoteRoleId");
const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const VOTE_ROLE_EXPIRES_AT_PATH = `${DISCADIA_VOTE_ROOT}.voteRole.expiresAt`;
const VOTE_RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUSTOM_ROLE_REQUIRED_ROLE_IDS = [IDs.roles.VIP, IDs.roles.ServerBooster, IDs.roles.DoubleBooster, IDs.roles.Level50].filter(Boolean);
const INVITE_REWARD_TIERS = [{ target: 5, roleIds: [IDs.roles.Promoter, IDs.roles.PicPerms || "1544830789760454759",].filter(Boolean), }, { target: 25, roleIds: [IDs.roles.Propulsor].filter(Boolean), }, { target: 100, roleIds: [IDs.roles.Catalyst].filter(Boolean), },];
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

function formatInviteCountIt(count?) {
  const n = Math.max(0, Number(count || 0));
  return n === 1 ? "1 invito" : `${n} inviti`;
}

function extractInviteCodeFromLink(link?) {
  const raw = String(link || "").trim();
  if (!raw || /^link non disponibile/i.test(raw)) return null;
  const m = raw.match(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]+)/i);
  if (m?.[1]) return m[1];
  const tail = raw.split("/").pop();
  return tail && /^[A-Za-z0-9-]+$/.test(tail) ? tail : null;
}

function formatInviteLinkForJoinMessage(link?) {
  const code = extractInviteCodeFromLink(link);
  return code ? `\`${code}\`` : "`—`";
}

function getInviteMilestoneTitle(target?) {
  if (target === 5) return "🎀✦ Nuovx Promoter!";
  if (target === 25) return "✨ Nuovx Propulsor!";
  if (target === 100) return "🏆 Nuovx Catalyst!";
  return "🎉 Nuovo traguardo inviti!";
}

function getInviteTierDisplayName(target?) {
  if (target === 5) return "Promoter";
  if (target === 25) return "Propulsor";
  if (target === 100) return "Catalyst";
  return "Reward inviti";
}

function nextInviteTierTargetAfter(currentTarget?) {
  const sorted = INVITE_REWARD_TIERS.map((t?) => Number(t.target || 0)).filter((n?) => n > 0).sort((a?, b?) => a - b);
  const idx = sorted.indexOf(Number(currentTarget));
  if (idx < 0 || idx >= sorted.length - 1) return null;
  return sorted[idx + 1];
}

function splitAwardedRolesByTier(roleIdsAwarded?) {
  const added = new Set(roleIdsAwarded || []);
  const out = [];
  for (const tier of INVITE_REWARD_TIERS) {
    const t = Number(tier.target || 0);
    const roleIds = (tier.roleIds || []).filter((rid?) => added.has(String(rid)));
    if (roleIds.length) out.push({ target: t, roleIds });
  }
  return out.sort((a?, b?) => a.target - b.target);
}

function buildInviteMilestoneEmbeds(inviterMember?, totalInvites?, tierChunks?) {
  const list = Array.isArray(tierChunks) ? tierChunks : [];
  if (!inviterMember || !list.length) return [];
  const safeTotal = Math.max(0, Number(totalInvites || 0));
  return list.map(({ target, roleIds }) => {
    const rolesText = roleIds.map((id?) => `<@&${id}>`).join(" ");
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
      `Ora hai **${formatInviteCountIt(safeTotal)}** registrat${safeTotal === 1 ? "o" : "i"}.`,
      INFO_PERKS_CHANNEL_ID ? `\n<a:VC_Arrow:1482706699365257397> Dettagli perk: <#${INFO_PERKS_CHANNEL_ID}>` : "",
    ].join("\n");
    const embed = new EmbedBuilder()
      .setColor(INVITE_MILESTONE_EMBED_COLOR)
      .setTitle(getInviteMilestoneTitle(target))
      .setThumbnail(guildMemberDisplayAvatarUrlDynamic(inviterMember, { size: 256 }) || undefined)
      .setDescription(body)
      .setFooter({ text: `${shortInviteLinkForFooter()} • Grazie! 💞` })
      .setTimestamp();
    return applyPronounGenderToEmbedForMember(embed, inviterMember);
  });
}
const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;
const JOIN_GATE_WHITELIST_ROLE_IDS = new Set([IDs.roles.Founder].filter(Boolean).map(String),);
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const SUSPICIOUS_JOIN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const recentJoinSignalsByGuild = new Map();
const JOIN_SIGNALS_SNAPSHOT_PATH = path.join(__dirname, "..", "Data", "joinSignalsSnapshot.json");
let joinSignalsLoaded = false;

function persistJoinSignalsNow() {
  const payload: Record<string, any> = {};
  for (const [guildId, rows] of recentJoinSignalsByGuild.entries()) {
    if (!guildId || !Array.isArray(rows) || !rows.length) continue;
    payload[guildId] = rows.slice(-120);
  }
  writeSnapshotWithMeta({ filePath: JOIN_SIGNALS_SNAPSHOT_PATH, walPath: `${JOIN_SIGNALS_SNAPSHOT_PATH}.wal`, key: "vinyls_join_signals", version: 1, payload });
}

function ensureJoinSignalsLoaded() {
  if (joinSignalsLoaded) return;
  joinSignalsLoaded = true;
  const raw = readSnapshotWithMeta({ filePath: JOIN_SIGNALS_SNAPSHOT_PATH, walPath: `${JOIN_SIGNALS_SNAPSHOT_PATH}.wal`, key: "vinyls_join_signals", version: 1, fallback: {} });
  for (const [guildId, rows] of Object.entries(raw || {})) {
    if (!guildId || !Array.isArray(rows)) continue;
    recentJoinSignalsByGuild.set(guildId, rows.slice(-120));
  }
}

function formatActor(actor?) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function toUnix(date?) {
  return Math.floor(date.getTime() / 1000);
}

function formatAccountAge(createdAt?) {
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

async function resolveGuildChannel(guild?, channelId?) {
  if (!guild || !channelId) return null;
  return getGuildChannelCached(guild, channelId);
}

function ensureInviteCache(client?) {
  if (!client.inviteCache) {
    client.inviteCache = new Map();
  }
}

async function resolveInviteInfo(member?) {
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
      .filter((invite?) => invite.inviter?.id === inviterId)
      .reduce((sum?, invite?) => sum + (invite.uses || 0), 0);
  }

  return { link, inviterTag, totalInvites, isVanity: false, inviterId, code: usedInvite?.code || null };
}

function inviteCodeFromInfo(info?) {
  if (info?.code) return String(info.code).trim();
  const link = String(info?.link || "").trim();
  const match = link.match(/discord(?:\.gg|\.com\/invite)\/([A-Za-z0-9-]+)/i);
  return match ? match[1] : null;
}

async function tryRecordTenantPartnershipInviteJoin(member?, inviteInfo?) {
  const guildId = String(member?.guild?.id || "").trim();
  if (!guildId || shouldApplyMainPartnershipFilters(guildId)) return;
  const usedCode = inviteCodeFromInfo(inviteInfo);
  const expectedCode = String(getPartnershipConfigSync(guildId)?.invite?.code || "").trim().toLowerCase();
  if (!usedCode || !expectedCode || usedCode.toLowerCase() !== expectedCode) return;
  await recordPartnershipInviteJoin(guildId).catch(() => {});
}

async function trackInviteJoin(member?, inviterId?, inviteCode = null) {
  if (!inviterId || inviterId === member.id) return;

  const inviterMember = await getGuildMemberCached(member.guild, inviterId);
  if (!inviterMember || inviterMember.user?.bot) return;

  const code = String(inviteCode || "").trim() || null;

  await ActivityUserProfile.findOneAndUpdate(
    { guildId: member.guild.id, userId: member.id },
    {
      $setOnInsert: { guildId: member.guild.id, userId: member.id },
      $set: {
        "profile.inviteTrack.inviterId": inviterId,
        "profile.inviteTrack.inviteCode": code,
        "profile.inviteTrack.active": true,
        "profile.inviteTrack.leftAt": null,
        "profile.inviteTrack.joinedAt": new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function tryAwardInviteRole(member?, inviteInfo?) {
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
  const missingRoleIds = rolesToAdd.filter((roleId?) => !inviterAfter.roles.cache.has(roleId));
  if (missingRoleIds.length > 0) {
    return { awarded: false, roleIds: [], targets: reachedTargets };
  }
  return { awarded: true, roleIds: rolesToAdd, targets: reachedTargets };
}

function getNextInviteRewardTier(totalInvites?) {
  const safeInvites = Math.max(0, Number(totalInvites || 0));
  return INVITE_REWARD_TIERS.find((tier?) => safeInvites < Number(tier.target || 0)) || null;
}

async function addBotRoles(member?) {
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

  const roles = roleIds.map((id?) => member.guild.roles.cache.get(id)).filter(Boolean);

  const missingRoles = roleIds.filter((id?) => !member.guild.roles.cache.has(id),);
  if (missingRoles.length) {
    global.logger.warn(
      "[guildMemberAdd] Some bot roles not found:",
      missingRoles,
    );
  }
  if (!roles.length) return;

  const blocked = roles.filter((role?) => role.position >= me.roles.highest.position,);
  if (blocked.length) {
    global.logger.warn(
      "[guildMemberAdd] Bot role hierarchy prevents adding roles:",
      blocked.map((role?) => role.id),
    );
    return;
  }

  const idsToAdd = roles.map((r?) => r.id);
  const memberAfter = await addRolesAndGetMember(member.guild, member.id, idsToAdd);
  if (!memberAfter) return;
  const unappliedRoleIds = idsToAdd.filter((id?) => !memberAfter.roles.cache.has(id));
  if (unappliedRoleIds.length) {
    global.logger.warn(
      "[guildMemberAdd] Failed to add bot roles:",
      unappliedRoleIds,
    );
  }
}

function buildWelcomeChannelContent(member?) {
  const { word } = buildMemberWelcomePhrase(member);
  const staffId = String(IDs.roles?.Staff || "").trim();
  const staffPing = staffId ? ` <@&${staffId}>` : "";
  return `Ciao <@${member.id}>, ${word}!${staffPing} <a:VC_heartfinger:1504513546782769332>`;
}

async function sendWelcomeChannelAnnouncement(channel?, member?) {
  if (!channel?.send || !member) return null;
  const staffId = String(IDs.roles?.Staff || "").trim();
  const sent = await channel
    .send(
      applyDefaultFooterToEmbeds(
        {
          content: buildWelcomeChannelContent(member),
          embeds: [buildWelcomeEmbed(member)],
          // Ping nuovo membro + Staff (content fuori dall’embed via split V2)
          allowedMentions: {
            users: [String(member.id)],
            roles: staffId ? [staffId] : [],
            parse: [],
          },
        },
        member.guild,
      ),
    )
    .catch(() => null);
  if (sent && member.guild?.id) {
    refreshWelcomeContextForGuild(member.guild.id, member.id);
    await markJoinAnnounceSent(member);
  }
  return sent;
}

function buildWelcomeEmbed(member?) {
  const visibleCount = getVerifiedPlusBotsCount(member.guild);
  const uname = accountUsername(member);
  const { word, capitalized } = buildMemberWelcomePhrase(member);
  return new EmbedBuilder()
    .setAuthor({
      name: uname,
      iconURL: guildMemberDisplayAvatarUrlDynamic(member, { size: 128 }) || undefined,
    })
    .setTitle(
      `<a:VC_HeartsPink:1468685897389052008> ${capitalized} su Vinili & Caffè <a:VC_HeartsPink:1468685897389052008>`,
    )
    .setDescription(
      `__${uname}__ ${word} nella nostra community <a:VC_Sparkles:1468546911936974889>\n` +
      "<:VC_addperson:1485419347068588073> [Vai sul sito](https://www.viniliecaffe.it/personalizza/) per **personalizzare il tuo profilo**\n",
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || undefined)
    .setImage(DIVIDER_URL)
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo in ${visibleCount} membri` });
}

function buildDmWelcomeEmbed(member?) {
  const visibleCount = getVerifiedPlusBotsCount(member.guild);
  const dmGuildIcon = guildIconUrl(member.guild, { size: 256 });
  const dmFooterIcon = guildIconUrl(member.guild, { size: 64 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_RightWing:1448672889845973214> Benvento in Vinili & Caffè!")
    .setDescription(
      [
        `Ciao **${accountUsername(member)}**, grazie per esserti unito a noi!`,
        "",
        "Entrando nel server accetti automaticamente le nostre regole.",
        "<a:VC_Arrow:1482706699365257397> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102236527853661>",
        "------------------------------",
        "<:VC_Dot:1482532364222595303> Controlla le nostre GUILD TAGS",
        "<a:VC_Moon:1482724651430838406>[⭑.ᐟ](<https://discord.gg/E6vrm5zE6B>)<:VC_Femboy1:1528177995095867515><:VC_Femboy2:1528178060581671084> & [⭑.ᐟ](<https://discord.gg/QnTN5P578g>)<:VC_666_1:1528177848890691684><:VC_666_2:1528177905404870828>",
        "<:VC_Firework:1470796227913322658>[⭑.ᐟ](<https://discord.gg/WMuZ4EMAkc>)<:VC_Porn1:1482497744513011944><:VC_Porn2:1482497774892089547> & <a:VC_PepeEggPlant:1331622686014570588>[⭑.ᐟ](<https://discord.gg/uqUNS9f5m5>)<:VC_Cat1:1528177482807640125><:VC_Cat2:1528177684843073546>",
        "<a:VC_PepeSmoke:1331590685673132103>[⭑.ᐟ](<https://discord.gg/SzBwnxHXNv>)<:VC_Weed1:1482497951686201534><:VC_Weed2:1482497986910097592> & <a:VC_PepeExcited:1331621719093284956>[⭑.ᐟ](<https://discord.gg/z3EXtJwvQH>)<:VC_Figa1:1482495980275499169><:VC_Figa2:1482496046222544937>",
        "<a:VC_Arrow:1482706699365257397> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102239094767699>",
                      ].join("\n"),
    )
    .setThumbnail(dmGuildIcon || undefined)
    .setFooter({
      text: `${member.guild.name} • Ora siamo in ${visibleCount} membri`,
      iconURL: dmFooterIcon || undefined,
    })
    .setTimestamp();
}

function getVerifiedPlusBotsCount(guild?) {
      const reported = Math.max(0, Number(guild?.memberCount || 0));
  if (reported > 0) return reported;
  if (!guild?.members?.cache?.size) return 0;
  return guild.members.cache.size;
}

async function sendBotAddLog(member?) {
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
    .setTitle("<:VC_User:1482527453586002103> Bot Add")
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
        `<:VC_User:1482527453586002103> **Target:** ${member.user} \`${member.user.id}\``,
        `<:VC_Clock:1473359204189474886> <t:${nowTs}:F>`,
        "",
        "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
        `<:VC_Id:1482527453586002103> **Id:** \`${member.user.id}\``,
        `<:VC_Modifica:1478859646587633717> **Username:** ${member.user.username}`,
        `<:VC_Clock:1473359204189474886> **Creation:** <t:${createdTs}:R>`,
      ].join("\n"),
    );

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}
async function handleBotJoin(member?, joinGateConfig?) {
  queueIdsCatalogSync(member.client, member.guild.id, "botJoin");
  await sendBotAddLog(member).catch(() => { });
  if (isSponsorJoinGateGuildId(member.guild.id)) {
    try {
      await addBotRoles(member);
    } catch (error) {
      global.logger.error("[guildMemberAdd] Failed to add bot roles:", error);
    }
    const welcomeChannelSponsor = await resolveGuildChannel(member.guild, IDs.channels.chat,);
    if (welcomeChannelSponsor) {
      await sendWelcomeChannelAnnouncement(welcomeChannelSponsor, member);
    }
    return;
  }
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
  /* allowlistedBotSkipUnverified1: IDs.bots + trustedBotOnly.extraBotIds contano come autorizzati anche senza VerifiedBot. */
  const allowlistedBot =
    isDiscordOfficialActor(member.user) ||
    buildTrustedBotIdSet(member.client).has(String(member.user.id || ""));
  const verifiedBot = allowlistedBot || (await isVerifiedBot(member.user));

  if ( joinGateConfig?.enabled && joinGateConfig?.unverifiedBotAdditions?.enabled && !verifiedBot) {
    const result = await kickForJoinGate(member, "Aggiunta di bot non verificato.", [
      `<:VC_Rules:1482527309868040393> **Regola:** Aggiunta di bot non verificato`,
      `<:VC_Staff:1494286904089247754> **Responsabile:** ${executorText}`,
    ], joinGateConfig?.unverifiedBotAdditions?.action || "kick");
    if (result?.blocked) return;
  }

  if (joinGateConfig?.enabled && joinGateConfig?.botAdditions?.enabled) {
    if (noAuditPerm) {
      global.logger?.warn?.(
        `[JoinGate] botAdditions skipped (no ViewAuditLog) target=${member.user?.id || "sconosciuto"}`,
      );
    } else if (!executorId && auditNotFound) {
      global.logger?.warn?.(
        `[JoinGate] botAdditions: no BotAdd row after retries — kick fallito target=${member.user?.id || "sconosciuto"}`,
      );
      const result = await kickForJoinGate(
        member,
        "Aggiunta di bot da membro non autorizzato (no audit match — kick fallito).",
        [
          `<:VC_Rules:1482527309868040393> **Regola:** Aggiunta di bot`,
          `<:VC_Staff:1494286904089247754> **Responsabile:** ${executorText}`,
        ],
        joinGateConfig?.botAdditions?.action || "kick",
      );
      if (result?.blocked) return;
    } else if (executorId) {
      const authorized = await isAuthorizedBotAdder(member.guild, executorId);
      if (!authorized) {
        const result = await kickForJoinGate(member, "Aggiunta di bot da membro non autorizzato.", [
          `<:VC_Rules:1482527309868040393> **Regola:** Aggiunta di bot`,
          `<:VC_Staff:1494286904089247754> **Responsabile:** ${executorText}`,
        ], joinGateConfig?.botAdditions?.action || "kick");
        if (result?.blocked && executorId) {
          await punishMemberForBotAbuse(
            member.guild,
            executorId,
            `Ha aggiunto un bot non autorizzato: ${member.user?.tag || member.user?.id || "sconosciuto"}`,
            "ban",
          );
        }
        if (result?.blocked) return;
      }
    }
  }

  const trustedOnly = await enforceUntrustedBotMember(member, { executorId });
  if (trustedOnly?.blocked) return;

  try {
    await addBotRoles(member);
  } catch (error) {
    global.logger.error("[guildMemberAdd] Failed to add bot roles:", error);
  }

  const welcomeChannel = await resolveGuildChannel(member.guild, IDs.channels.chat,);
  if (welcomeChannel) {
    await sendWelcomeChannelAnnouncement(welcomeChannel, member);
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
          content: `<:VC_Reply:1482532158080942191> Bot entrato con il link ${formatInviteLinkForJoinMessage(info.link)},\n-# -> invitato da ${info.inviterTag} che ora ha **${formatInviteCountIt(info.totalInvites)}**.`,
          flags: MessageFlags.SuppressEmbeds,
        })
        .catch(() => { });
    }
  } catch (err) {
    global.logger?.warn?.("[guildMemberAdd] ", err?.message || err);
  }
}

function isTooYoungAccount(member?, minAgeDays = 3) {
  const safeMinDays = Math.max(0, Number(minAgeDays || 0));
  const minAgeMs = safeMinDays * 24 * 60 * 60 * 1000;
  const accountAgeMs = Date.now() - member.user.createdAt.getTime();
  return accountAgeMs < minAgeMs;
}

function hasNoAvatar(member?) {
  if (!member?.user) return false;
  return !member.user.avatar;
}

function getJoinGateNameCandidate(member?) {
  return String(member?.user?.globalName || member?.displayName || member?.nickname || member?.user?.username || "");
}

function normalizeText(value?) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inviteLikeInName(text?) {
  const normalized = normalizeText(text);
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|invite\.gg\/|dsc\.gg\/)/i.test(
    normalized,
  );
}

function wildcardToRegex(pattern?) {
  const escaped = String(pattern || "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchUsernameFilters(candidate?, rules?) {
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

function toAccountNameSkeleton(input?) {
  return normalizeText(input)
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b");
}

function hasMixedScripts(input?) {
  const value = String(input || "");
  if (!value) return false;
  const hasLatin = /[A-Za-z]/.test(value);
  const hasCyrillic = /[\u0400-\u04FF]/.test(value);
  const hasGreek = /[\u0370-\u03FF]/.test(value);
  const nonLatinScripts = Number(hasCyrillic) + Number(hasGreek);
  return hasLatin && nonLatinScripts > 0;
}

function normalizeCompact(input?) {
  return normalizeText(input).replace(/\s+/g, "");
}

function countVowels(input?) {
  return (String(input || "").match(/[aeiou]/gi) || []).length;
}

function looksRandomName(input?) {
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

function pruneJoinSignals(records?) {
  const now = Date.now();
  return records.filter((item?) => now - Number(item?.joinedAt || 0) <= SUSPICIOUS_JOIN_WINDOW_MS);
}

function trackRecentJoinSignal(member?) {
  const guildId = String(member?.guild?.id || "");
  const userId = String(member?.user?.id || "");
  if (!guildId || !userId) return;

  const avatarHash = String(member?.user?.avatar || "");
  const nameSkeleton = toAccountNameSkeleton(`${member?.user?.username || ""}${member?.user?.globalName || ""}`.trim(),
  );
  ensureJoinSignalsLoaded();
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
  persistJoinSignalsNow();
}

function getJoinSignalStats(member?) {
  const guildId = String(member?.guild?.id || "");
  const userId = String(member?.user?.id || "");
  const avatarHash = String(member?.user?.avatar || "");
  if (!guildId || !userId) {
    return { reusedAvatarCount: 0, similarNameCount: 0 };
  }

  ensureJoinSignalsLoaded();
  const records = pruneJoinSignals(recentJoinSignalsByGuild.get(guildId) || []);
  recentJoinSignalsByGuild.set(guildId, records);
  persistJoinSignalsNow();
  const normalizedName = toAccountNameSkeleton(`${member?.user?.username || ""}${member?.user?.globalName || ""}`.trim(),
  );

  const reusedAvatarCount = avatarHash ? records.filter((item?) => item?.userId !== userId && item?.avatarHash && String(item.avatarHash) === avatarHash,).length : 0;

  const similarNameCount = normalizedName ? records.filter((item?) => item?.userId !== userId && item?.nameSkeleton && String(item.nameSkeleton) === normalizedName,).length : 0;

  return { reusedAvatarCount, similarNameCount };
}

function detectSuspiciousAccount(member?) {
  const usernameRaw = String(member?.user?.username || "");
  const globalNameRaw = String(member?.user?.globalName || "");
  const displayNameRaw = String(member?.displayName || "");
  const combinedRaw = `${usernameRaw} ${globalNameRaw} ${displayNameRaw}`.trim();
  const combinedSkeleton = toAccountNameSkeleton(combinedRaw);
  const accountAgeMs = Date.now() - new Date(member.user.createdAt).getTime();
  const ageHours = accountAgeMs / (60 * 60 * 1000);
  const ageDays = ageHours / 24;

  const scamKeywords = ["nitro", "airdrop", "crypto", "steam", "gift", "giveaway", "freegift", "steamgift"];
  const impersonationKeywords = ["support", "moderator", "admin", "staff", "discordstaff", "discordsupport"];

  const signalLabels = [];
  let score = 0;
  let strongSignals = 0;

  if (inviteLikeInName(combinedRaw)) {
    score += 80;
    strongSignals += 1;
    signalLabels.push("invite-link");
  }

  const scamHits = scamKeywords.filter((kw?) => combinedSkeleton.includes(kw));
  if (scamHits.length > 0) {
    score += Math.min(50, 22 + scamHits.length * 10);
    strongSignals += 1;
    signalLabels.push(`scam:${scamHits.slice(0, 3).join(",")}`);
  }
  const impersonationHits = impersonationKeywords.filter((kw?) => combinedSkeleton.includes(kw));
  if (impersonationHits.length >= 2) {
    score += 28;
    strongSignals += 1;
    signalLabels.push(`impersonation:${impersonationHits.slice(0, 3).join(",")}`);
  } else if (impersonationHits.length === 1) {
    score += 10;
    signalLabels.push(`impersonation:${impersonationHits[0]}`);
  }

  const digitCount = (combinedRaw.match(/\d/g) || []).length;
  const separatorCount = (combinedRaw.match(/[._-]/g) || []).length;
  if (digitCount >= 8) {
    score += 16;
    signalLabels.push(`digits:${digitCount}`);
  }
  if (separatorCount >= 5) {
    score += 10;
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
    score += 28;
    signalLabels.push("age<=24h");
  } else if (ageHours <= 72) {
    score += 18;
    signalLabels.push("age<=72h");
  } else if (ageDays <= 7) {
    score += 8;
    signalLabels.push("age<=7d");
  }

  if (hasNoAvatar(member) && ageDays <= 7) {
    score += 22;
    signalLabels.push("no-avatar+young");
  }

  const { reusedAvatarCount, similarNameCount } = getJoinSignalStats(member);
  if (reusedAvatarCount >= 3) {
    score += 36;
    strongSignals += 1;
    signalLabels.push(`avatar-reused:${reusedAvatarCount + 1}`);
  } else if (reusedAvatarCount === 2) {
    score += 14;
    signalLabels.push("avatar-reused:3");
  }
  if (similarNameCount >= 3) {
    score += 18;
    signalLabels.push(`name-clone:${similarNameCount + 1}`);
  }

  const suspicious = score >= 90 || (strongSignals >= 2 && score >= 78);
  if (suspicious) {
    return `score ${Math.min(100, score)}/100 | segnali: ${signalLabels.slice(0, 5).join(" | ")}`;
  }
  return null;
}

async function fetchRecentBotAddEntry(guild?, botId?) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return { __noAuditPermission: true };
  }
  const delays = [0, 450, 900, 1400, 2200];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve?) => {
        const timer = setTimeout(resolve, delays[attempt] - delays[attempt - 1]);
        timer.unref?.();
      });
    }
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: AUDIT_FETCH_LIMIT }).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const found =
        logs.entries.find((entry?) => {
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

async function isVerifiedBot(user?) {
  if (!user?.bot) return false;
  let flags = user.flags || null;
  if (!flags && typeof user.fetchFlags === "function") {
    flags = await user.fetchFlags().catch(() => null);
  }
  return Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
}

async function isAuthorizedBotAdder(guild?, executorId?) {
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
  return [...JOIN_GATE_WHITELIST_ROLE_IDS].some((roleId?) =>
    executor.roles.cache.has(roleId),
  );
}

async function sendJoinGatePunishDm(member?, reason?, extraLines = [], action = "") {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Azione JoinGate in ${member.guild.name}`)
    .setDescription(
      [
        `<:VC_User:1482527453586002103> **Membro:** ${member.user} [\`${member.user.id}\`]`,
        `<:VC_Reason:1478517122929004544> **Motivo:** ${reason}`,
        ...extraLines.filter(Boolean),
      ].join("\n"),
    );
  try {
    const dmChannel = member.user.dmChannel || (await member.user.createDM().catch(() => null));
    if (!dmChannel) return false;
    const components = String(action || "").toLowerCase() === "ban" ? [buildUnbanRequestRow()] : [];
    await dmChannel.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}

function buildJoinGateTriggeredEmbed(member?, reason?) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${member.user.username} ha attivato il join gate!`)
    .setDescription(
      [
        `<:VC_User:1482527453586002103> **Membro:** ${member.user.username} [\`${member.user.id}\`]`,
        `<:VC_Reason:1478517122929004544> **Motivo:** ${reason}`,
      ].join("\n"),
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || undefined);
}

async function kickForJoinGate(member?, reason?, extraLines = [], action = "kick") {
  const me = member.guild.members.me;
  const normalizedAction = ["kick", "ban", "timeout", "log"].includes(String(action || "").toLowerCase(),) ? String(action || "").toLowerCase() : "log";
  const canKick = Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) && Boolean(member?.kickable);
  const canBan = Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) && Boolean(member?.bannable);
  const canTimeout = Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) && Boolean(member?.moderatable);
  const joinGateCfg = getJoinGateConfigSnapshot();
  const dmPunishedMembers = typeof joinGateCfg?.dmPunishedMembers === "boolean" ? joinGateCfg.dmPunishedMembers : true;
  let dmSent = false;
  if (normalizedAction !== "log" && dmPunishedMembers) {
    dmSent = await sendJoinGatePunishDm(member, reason, extraLines, normalizedAction);
  }

  let punished = false;
  let appliedAction = normalizedAction;
  if (normalizedAction === "kick" && canKick) {
    punished = await member
      .kick(reason)
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] kick failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  } else if (normalizedAction === "ban" && canBan) {
    punished = await member.guild.members
      .ban(member.id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] ban failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  } else if (normalizedAction === "ban" && !canBan && canKick) {
    punished = await member
      .kick(reason)
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] kick (ban fallback) failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
    if (punished) appliedAction = "kick";
  } else if (normalizedAction === "timeout" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate timeout: ${reason}`)
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[JoinGate] timeout failed:", member.guild.id, member.id, err?.message || err);
        return false;
      });
  }
  if (!punished && normalizedAction !== "log" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate fallback timeout: ${reason}`)
      .then(() => true)
      .catch((err?) => {
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
        .setTitle(`${member.user.username} è stato ${actionLabel}!!`)
        .setDescription(
          [
            `<:VC_User:1482527453586002103> **Membro:** ${member.user.username} [\`${member.user.id}\`]`,
            `<:VC_Reason:1478517122929004544> **Motivo:** ${reason}`,
            ...extraLines.filter(Boolean),
            "",
            "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
            `<:VC_Info:1482526956703580372> **Membro messaggio diretto?** ${dmSent ? "<a:VC_Verified:1482532479637127188>" : "<a:VC_Cross:1482532424570376253>"}`,
            `<:VC_Info:1482526956703580372> **Membro punito?** ${punished ? "<a:VC_Verified:1482532479637127188>" : "<a:VC_Cross:1482532424570376253>"}`,
          ].join("\n"),
        )
        .setFooter({ text: "© 2026 Vinili & Caffè. Tutti i diritti riservati." })
        .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || undefined)
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

async function sendJoinGateNoAvatarLog(member?) {
  if (!member?.guild || !member?.user) return;
  if (!hasNoAvatar(member)) return;

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(member.guild, modLogId) : null;
  if (!logChannel?.isTextBased?.()) return;

  const embed = buildJoinGateTriggeredEmbed(member, "Account has no avatar.");

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

async function sendSuspiciousAccountLog(member?, reason?) {
  if (!member?.guild || !reason) return;
  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? await getGuildChannelCached(member.guild, modLogId) : null;
  if (!logChannel?.isTextBased?.()) return;
  const embed = buildJoinGateTriggeredEmbed(member, reason);
  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

async function handleTooYoungAccount(member?, joinGateConfig = null) {
  const createdTs = toUnix(member.user.createdAt);
  const cfg = joinGateConfig || getJoinGateConfigSnapshot();
  const minAgeDays = Number(cfg?.newAccounts?.minAgeDays || 3);
  await kickForJoinGate(member, "Account troppo giovane per essere permesso.", [
    `<:VC_Rules:1482527309868040393> **Regola:** Account troppo giovane`,
    `<:VC_Clock:1473359204189474886> **Età account:** <t:${createdTs}:R>`,
    `<:VC_Info:1482526956703580372> **Età minima:** ${minAgeDays} giorni`,
  ], cfg?.newAccounts?.action || "kick");
}

async function sendJoinLog(member?) {
  const joinLeaveLogChannel = await resolveGuildChannel(member.guild, JOIN_LEAVE_LOG_CHANNEL_ID,);
  if (!joinLeaveLogChannel) return;

  const createdTs = toUnix(member.user.createdAt);
  const accountAge = formatAccountAge(member.user.createdAt);
  const joinLogEmbed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("<:VC_User:1482527453586002103> Membro Entrato")
    .setDescription(
      [
        `<:VC_User:1482527453586002103> **Membro:** ${member.user} ${member.user.tag}.`,
        "",
        "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
        `<:VC_Id:1482527453586002103> **Id:** \`${member.user.id}\``,
        `<:VC_Modifica:1478859646587633717> **Username:** ${member.user.username}`,
        `<:VC_Clock:1473359204189474886> **Creation:** <t:${createdTs}:R>`,
        accountAge,
      ].join("\n"),
    )
    .setFooter({ text: `ID: ${member.user.id}` })
    .setTimestamp()
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || undefined);

  await joinLeaveLogChannel.send({ embeds: [joinLogEmbed] }).catch((err?) => {
    global.logger.error("[guildMemberAdd] Failed to send join log:", err);
  });
}

function isUserDmUnavailableError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  if ([50007, 50278].includes(code)) return true;
  const msg = String(err?.message || err?.rawError?.message || "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("cannot send messages")) return true;
  if (msg.includes("no mutual guild")) return true;
  return false;
}

function isMainGuildJoin(guildId?) {
  const gid = String(guildId || "");
  const mainId = String(IDs.guilds?.main || "");
  return Boolean(gid && mainId && gid === mainId);
}

async function maybeNotifyDiscordPrivacyBlockForMember(member?) {
  if (!member?.guild?.id || !member?.id) return;
  const optedOut = await shouldBlockDm(member.guild.id, member.id, null).catch(() => false);
  if (optedOut) return;
  await notifyDmPrivacyBlockedInCommands({
    guildId: member.guild.id,
    userId: member.id,
    commandsChannelId: IDs.channels.commands,
    client: member.client,
  }).catch(() => false);
}

async function sendDmWelcome(member?) {
  if (!isMainGuildJoin(member?.guild?.id)) return;
  const dmEmbed = buildDmWelcomeEmbed(member);
  const payload = { embeds: [dmEmbed] };

  try {
    await member.send(payload);
    return;
  } catch (err) {
    if (isUserDmUnavailableError(err)) {
      await maybeNotifyDiscordPrivacyBlockForMember(member);
      return;
    }
  }

  await new Promise((resolve?) => {
    const t = setTimeout(resolve, 2000);
    t.unref?.();
  });

  try {
    await member.send(payload);
  } catch (err) {
    if (isUserDmUnavailableError(err)) {
      await maybeNotifyDiscordPrivacyBlockForMember(member);
      return;
    }
    global.logger.warn(
      `[guildMemberAdd] Could not send DM to ${member.user.tag}: ${err?.message || err}${err?.code != null ? ` [${err.code}]` : ""}`,
    );
  }
}

function isCustomRoleDocActive(doc?) {
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() > Date.now();
}

async function restoreDiscadiaVoteRoleOnRejoin(member?) {
  if (!member?.guild || !member?.id) return;
  const guildId = String(member.guild.id);
  if (String(guildId) !== String(IDs.guilds.main || "")) return;
  try {
    const { memberIsInMuteMirrorState, shouldDeferRoleRestoreForMuteMirror } = require("../Services/Moderation/mutedMirrorRoleService") as typeof import("../Services/Moderation/mutedMirrorRoleService");
    if (memberIsInMuteMirrorState(member)) return;
    if (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => false)) return;
  } catch (_) {}

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
  const resolvedVoteRoleId = (await resolveVoteRoleIdForGuild(member.guild).catch(() => "")) || VOTE_ROLE_ID;
  if (!resolvedVoteRoleId) return;
  if (member.roles.cache.has(resolvedVoteRoleId)) return;

  const me = member.guild.members.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) return;
  const role = await getGuildRoleCached(member.guild, resolvedVoteRoleId);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;

  const refreshed = await addRolesAndGetMember(member.guild, member.id, [resolvedVoteRoleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has?.(resolvedVoteRoleId)) return;
}

async function restoreCustomRoleOnRejoin(member?) {
  if (!member?.guild || !member?.id) return;
  try {
    const { memberIsInMuteMirrorState, shouldDeferRoleRestoreForMuteMirror } = require("../Services/Moderation/mutedMirrorRoleService") as typeof import("../Services/Moderation/mutedMirrorRoleService");
    if (memberIsInMuteMirrorState(member)) return;
    if (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => false)) return;
  } catch (_) {}
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

  const hasRequiredRole = CUSTOM_ROLE_REQUIRED_ROLE_IDS.some((requiredRoleId?) => member.roles.cache.has(requiredRoleId));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  if (!hasRequiredRole && !hasEventWeek2Grant && !hasEventWeek3Grant && !hasContestExtraUnlock) return;

  const refreshed = await addRolesAndGetMember(member.guild, member.id, [roleId]).catch(() => null);
  if (!refreshed?.roles?.cache?.has?.(roleId)) return;
  if (doc?.customRoleEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customRoleEligibilityLostAt: null } },
    ).catch(() => {});
  }
}

async function announceInviteInfo(member?, channel?, info?) {
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
      content: `<:VC_Reply:1482532158080942191> È entratx con il link ${formatInviteLinkForJoinMessage(info.link)},\n-# -> invitato da ${info.inviterTag} che ora ha **${formatInviteCountIt(info.totalInvites)}**.`,
      flags: MessageFlags.SuppressEmbeds,
    })
    .catch(() => { });
}

async function maybeSendInviteReward(member?, info?) {
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

async function maybeSendInviteNearRewardReminder(member?, info?) {
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
  const sentTargets = Array.isArray(state?.inviteNearTargets) ? state.inviteNearTargets.map((x?) => Number(x)).filter(Number.isFinite) : [];
  if (sentTargets.includes(Number(nextTier.target || 0))) return;

  const rewardRoleText = (Array.isArray(nextTier.roleIds) ? nextTier.roleIds : []).filter(Boolean).map((id?) => `<@&${id}>`)
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

async function markJoinAnnouncePending(member?) {
  if (!member?.guild?.id || String(member.guild.id) !== String(IDs.guilds?.main || "")) return;
  if (member.user?.bot) return;
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  await ActivityUserProfile.updateOne(
    { guildId, userId },
    { $setOnInsert: { guildId, userId }, $set: { "profile.joinAnnouncePending": true } },
    { upsert: true },
  ).catch(() => null);
}

async function markJoinAnnounceSent(member?) {
  if (!member?.guild?.id || !member?.id) return;
  await ActivityUserProfile.updateOne(
    { guildId: String(member.guild.id), userId: String(member.id) },
    { $set: { "profile.joinAnnounceSentAt": new Date() }, $unset: { "profile.joinAnnouncePending": "" } },
  ).catch(() => null);
}

async function clearJoinAnnouncePending(member?) {
  if (!member?.guild?.id || !member?.id) return;
  await ActivityUserProfile.updateOne(
    { guildId: String(member.guild.id), userId: String(member.id) },
    { $unset: { "profile.joinAnnouncePending": "" } },
  ).catch(() => null);
}

async function resolveWelcomeChannelForMember(member?) {
  const welcomeChannelId = IDs.channels.chat;
  let welcomeChannel = await resolveGuildChannel(member.guild, welcomeChannelId);
  if (!welcomeChannel && member.client) {
    const mainGuild = await getClientGuildCached(member.client, IDs.guilds.main);
    welcomeChannel = mainGuild ? await getGuildChannelCached(mainGuild, welcomeChannelId) : null;
  }
  if (!welcomeChannel) {
    try {
      const fetched = await member.guild.channels.fetch(String(welcomeChannelId)).catch(() => null);
      if (fetched?.isTextBased?.()) welcomeChannel = fetched;
    } catch (_) {}
  }
  return welcomeChannel;
}

async function welcomeAnnounceExistsForUser(channel?, memberOrUserId?, botId?, sinceMs?) {
  if (!channel?.messages?.fetch) return false;
  const userId = String(typeof memberOrUserId === "object" ? memberOrUserId?.id : memberOrUserId || "");
  if (!userId) return false;
  const uname = typeof memberOrUserId === "object" ? accountUsername(memberOrUserId) : "";
  const needle = `<@${userId}>`;
  const minTs = Math.max(0, Number(sinceMs || 0) - 60_000);
  const welcomeRe = /Vinili & Caff[eèé]|Benvento|Benvenuto|nella nostra community/i;
  let before = undefined;
  for (let page = 0; page < 4; page += 1) {
    const recent = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!recent?.size) break;
    let oldestTs = Infinity;
    for (const m of recent.values()) {
      const ts = Number(m.createdTimestamp || 0);
      if (ts && ts < oldestTs) oldestTs = ts;
      if (ts && ts < minTs) continue;
      if (botId && String(m.author?.id || "") !== botId) continue;
      const embeds = Array.isArray(m.embeds) ? m.embeds : [];
      const parts = [String(m.content || "")];
      for (const e of embeds) {
        parts.push(String(e?.title || ""), String(e?.description || ""), String(e?.author?.name || ""));
      }
      const blob = parts.join("\n");
      const mentionsUser = blob.includes(needle) || blob.includes(`<@!${userId}>`);
      const authorMatches = uname && embeds.some((e?) => String(e?.author?.name || "").trim() === uname);
      if (!mentionsUser && !authorMatches) continue;
      if (welcomeRe.test(blob)) return true;
    }
    if (oldestTs <= minTs) break;
    const oldest = [...recent.values()].sort((a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0))[0];
    if (!oldest?.id) break;
    before = oldest.id;
  }
  return false;
}

async function joinWelcomeAlreadySent(channel?, member?, botId?) {
  if (!member?.id) return false;
  const guildId = String(member.guild?.id || "");
  const userId = String(member.id);
  const joined = Number(member.joinedTimestamp || 0);
  if (isMongoReady()) {
    const doc = await ActivityUserProfile.findOne({ guildId, userId })
      .select("profile.joinAnnounceSentAt")
      .lean()
      .catch(() => null);
    const sentRaw = doc?.profile?.joinAnnounceSentAt;
    if (sentRaw) {
      const sentAt = new Date(sentRaw).getTime();
            if (Number.isFinite(sentAt) && sentAt > 0 && (!joined || sentAt >= joined - 5_000)) {
        return true;
      }
    }
  }
  const sinceMs = joined || Date.now() - 7 * 24 * 60 * 60 * 1000;
  const inChannel = await welcomeAnnounceExistsForUser(channel, member, botId, sinceMs);
  if (inChannel) {
    await markJoinAnnounceSent(member);
    return true;
  }
  return false;
}

function joinRecoverySleep(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, ms));
}

function isJoinRecoveryPrimaryShard(client?) {
  return !client?.shard || client.shard.ids?.[0] === 0;
}

async function dispatchPublicJoinAnnouncements(member?) {
  if (!member?.guild?.id || String(member.guild.id) !== String(IDs.guilds?.main || "")) {
    return { ok: false, reason: "wrong_guild" };
  }
  const fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => member);
  if (!fresh?.user) return { ok: false, reason: "no_member" };
  if (!(await shouldSendPublicMemberAnnouncement(fresh))) {
    return { ok: false, reason: "gate_blocked" };
  }

  const welcomeChannel = await resolveWelcomeChannelForMember(fresh);
  const info = await resolveInviteInfo(fresh).catch(() => null);
  const botId = String(fresh.client?.user?.id || "");
  const welcomeAlreadySent = welcomeChannel ? await joinWelcomeAlreadySent(welcomeChannel, fresh, botId) : false;

  if (fresh.client) await activateWelcomeContextForGuild(fresh.guild.id, fresh.id);
  if (welcomeChannel && !welcomeAlreadySent) {
    await sendWelcomeChannelAnnouncement(welcomeChannel, fresh);
    await announceInviteInfo(fresh, welcomeChannel, info);
  } else if (welcomeAlreadySent) {
    await clearJoinAnnouncePending(fresh);
  }

  if (info && !info.isVanity && info.inviterId) {
    await trackInviteJoin(fresh, info.inviterId, inviteCodeFromInfo(info)).catch(() => { });
  }
  await maybeSendInviteNearRewardReminder(fresh, info);
  await maybeSendInviteReward(fresh, info);

  return { ok: true, announced: Boolean(welcomeChannel) };
}

async function recoverJoinAnnouncementsOnStartup(client?, opts: Record<string, any> = {}) {
  if (!isJoinRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const limit = Math.max(1, Math.min(80, Number(opts.limit || 40)));
  const lookbackMs = Math.max(
    5 * 60 * 1000,
    Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs || 24 * 60 * 60 * 1000)),
  );
  const minJoinedMs = Date.now() - lookbackMs;
  const botId = String(client.user?.id || "");
  const welcomeChannel = await resolveGuildChannel(guild, IDs.channels.chat);
  if (!welcomeChannel?.isTextBased?.()) return { ok: false, reason: "no_welcome_channel" };

  let recovered = 0;
  let pendingProcessed = 0;
  let pendingWaitingVerify = 0;
  let pendingClearedGone = 0;
  let pendingStaleCleared = 0;
  let pendingReady = 0;
  let missedScanned = 0;
  let missedRecovered = 0;
  let missedSkippedOk = 0;
  let rolesFixed = 0;

  /* joinRecoverPendingDrain1: non limitare ai primi N (erano tutti unverified e bloccavano i ready) */
  const pendingLimit = Math.max(20, Math.min(120, Math.max(limit * 3, 80)));
  const missedLimit = Math.max(1, Math.min(50, limit));

  const pendingRows = await ActivityUserProfile.find({
    guildId,
    "profile.joinAnnouncePending": true,
  })
    .select("userId")
    .limit(pendingLimit)
    .lean()
    .catch(() => []);

  for (const row of pendingRows) {
    const userId = String(row?.userId || "");
    if (!userId) continue;
    pendingProcessed += 1;

    let member = null;
    try {
      member = await guild.members.fetch({ user: userId, force: true });
    } catch (err) {
      if (!isUnknownDiscordMemberError(err)) {
        member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
      }
    }
    if (!member || member.user?.bot) {
      const cleared = await ActivityUserProfile.updateOne(
        { guildId, userId },
        { $unset: { "profile.joinAnnouncePending": "" } },
      ).catch(() => null);
      if (Number(cleared?.modifiedCount || cleared?.nModified || 0) > 0 || !member) {
        pendingClearedGone += 1;
      }
      continue;
    }

    /* joinRecoverPendingSkip1: ancora senza Member+separatore → lascia pending per deferred verify */
    const canAnnounce = await shouldSendPublicMemberAnnouncement(member).catch(() => false);
    if (!canAnnounce) {
      pendingWaitingVerify += 1;
      continue;
    }

    const joinedMs = Number(member.joinedTimestamp || 0);
    const withinLookback = !joinedMs || joinedMs >= minJoinedMs;
    if (!withinLookback) {
      /* già verificato ma join fuori lookback: niente welcome spam, sblocca la coda */
      await maybeApplyVerificationTenureOnJoin(member).catch(() => {});
      const cleared = await ActivityUserProfile.updateOne(
        { guildId, userId },
        {
          $set: { "profile.joinAnnounceSentAt": new Date() },
          $unset: { "profile.joinAnnouncePending": "" },
        },
      ).catch((err?) => {
        global.logger?.warn?.("[JOIN RECOVER] stale clear failed:", userId, err?.message || err);
        return null;
      });
      if (Number(cleared?.modifiedCount || cleared?.nModified || 0) > 0) {
        pendingStaleCleared += 1;
      }
      continue;
    }

    pendingReady += 1;
    const out = await processMissedJoinMember(member, { sendDm: false }).catch((err?) => {
      global.logger?.warn?.("[JOIN RECOVER] pending member failed:", userId, err?.message || err);
      return null;
    });
    if (out?.roles) rolesFixed += 1;
    if (out?.announced || out?.already) recovered += 1;
    await joinRecoverySleep(450);
  }

  /* missedJoinCatchup1: join avvenuti a bot offline (nessun guildMemberAdd) */
  const candidateIds = await collectRecentMissedJoinCandidateIds(guild, {
    minJoinedMs,
    limit: Math.max(missedLimit, 50),
  }).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] collect missed joins failed:", err?.message || err);
    return [];
  });

  for (const userId of candidateIds) {
    if (missedRecovered >= missedLimit) break;
    missedScanned += 1;
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (!member || member.user?.bot) {
      missedSkippedOk += 1;
      continue;
    }

    const profile = isMongoReady()
      ? await ActivityUserProfile.findOne({ guildId, userId })
          .select("profile.joinAnnounceSentAt profile.joinAnnouncePending")
          .lean()
          .catch(() => null)
      : null;

    if (!memberNeedsMissedJoinCatchup(member, profile)) {
      missedSkippedOk += 1;
      continue;
    }

    /* joinRecoverPendingDrain1: waitingVerify già in coda → skip; altrimenti processa ruoli senza contare recover */
    const canAnnounce = await shouldSendPublicMemberAnnouncement(member).catch(() => false);
    if (!canAnnounce) {
      if (profile?.profile?.joinAnnouncePending === true) {
        missedSkippedOk += 1;
        continue;
      }
      const outPending = await processMissedJoinMember(member, { sendDm: false }).catch((err?) => {
        global.logger?.warn?.("[JOIN RECOVER] missed pending-setup failed:", userId, err?.message || err);
        return null;
      });
      if (outPending?.pending || outPending?.ok) pendingWaitingVerify += 1;
      missedSkippedOk += 1;
      await joinRecoverySleep(350);
      continue;
    }

    const out = await processMissedJoinMember(member, {
      sendDm: Number(member.joinedTimestamp || 0) >= Date.now() - 6 * 60 * 60 * 1000,
    }).catch((err?) => {
      global.logger?.warn?.("[JOIN RECOVER] missed join failed:", userId, err?.message || err);
      return null;
    });
    if (!out?.ok) continue;
    if (out.pending) {
      pendingWaitingVerify += 1;
      missedSkippedOk += 1;
      continue;
    }
    missedRecovered += 1;
    if (out.roles) rolesFixed += 1;
    if (out.announced) recovered += 1;
    await joinRecoverySleep(500);
  }

  const actionable =
    recovered > 0 ||
    rolesFixed > 0 ||
    missedRecovered > 0 ||
    pendingClearedGone > 0 ||
    pendingStaleCleared > 0 ||
    pendingReady > 0;
  /* Idle (solo waitingVerify / scan senza azioni) → silenzio a ogni boot. */
  if (actionable) {
    global.logger?.warn?.(
      `[JOIN RECOVER] pending=${pendingProcessed} ready=${pendingReady} waitingVerify=${pendingWaitingVerify} clearedGone=${pendingClearedGone} staleCleared=${pendingStaleCleared} missedScanned=${missedScanned} missedSkippedOk=${missedSkippedOk} missedRecovered=${missedRecovered} welcomes=${recovered} rolesFixed=${rolesFixed} lookbackMs=${lookbackMs}`,
    );
  }

  return {
    ok: true,
    recovered,
    pendingProcessed,
    pendingReady,
    pendingWaitingVerify,
    pendingClearedGone,
    pendingStaleCleared,
    missedScanned,
    missedSkippedOk,
    missedRecovered,
    rolesFixed,
    lookbackMs,
  };
}

function memberHasAnyTenureRole(member?) {
  const ids = [IDs.roles?.NuovoUtente, IDs.roles?.Veterano, IDs.roles?.OG].filter(Boolean);
  return ids.some((id?) => Boolean(id && member?.roles?.cache?.has?.(String(id))));
}

function memberNeedsMissedJoinCatchup(member?, profileDoc?) {
  if (!member?.id || member.user?.bot) return false;
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  const preRoleId = String(IDs.roles?.preMember || "").trim();
  const hasMember = Boolean(memberRoleId && member.roles?.cache?.has?.(memberRoleId));
  const hasPre = Boolean(preRoleId && member.roles?.cache?.has?.(preRoleId));
  const hasTenure = memberHasAnyTenureRole(member);
  if (!hasMember && !hasPre) return true;
  if (hasMember && !hasTenure) return true;
  /* pending gestito dal drain dedicato — non forzare re-entry nel missed loop */
  const joined = Number(member.joinedTimestamp || 0);
  const sentRaw = profileDoc?.profile?.joinAnnounceSentAt;
  const sentMs = sentRaw ? new Date(sentRaw).getTime() : 0;
  if (joined > 0 && (!Number.isFinite(sentMs) || sentMs <= 0 || sentMs < joined - 5_000)) {
    return true;
  }
  return false;
}

async function collectRecentMissedJoinCandidateIds(guild?, opts: Record<string, any> = {}) {
  const minJoinedMs = Number(opts.minJoinedMs || 0);
  const limit = Math.max(1, Math.min(100, Number(opts.limit || 50)));
  const byId = new Map();

  /* missedJoinCatchup1: Discord non emette audit MemberAdd per join utenti.
     Serve lo sweep su joinedTimestamp (fetch membri se la cache è incompleta). */
  try {
    const cached = Number(guild.members?.cache?.size || 0);
    const total = Number(guild.memberCount || 0);
    const needFetch =
      typeof guild.members?.fetch === "function" &&
      (cached < 50 || (total > 0 && cached < Math.min(total, Math.max(80, Math.floor(total * 0.35)))));
    if (needFetch) {
      await guild.members.fetch({ withPresences: false }).catch((err?) => {
        global.logger?.warn?.("[JOIN RECOVER] members.fetch failed:", err?.message || err);
      });
    }
  } catch (errFetch) {
    global.logger?.warn?.("[JOIN RECOVER] members hydrate failed:", errFetch?.message || errFetch);
  }

  try {
    for (const m of guild.members.cache.values()) {
      if (!m || m.user?.bot) continue;
      const joined = Number(m.joinedTimestamp || 0);
      if (!joined || joined < minJoinedMs) continue;
      byId.set(String(m.id), joined);
    }
  } catch (_) {}

  return [...byId.entries()]
    .sort((a?, b?) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([id]) => id);
}

async function processMissedJoinMember(member?, opts: Record<string, any> = {}) {
  if (!member?.guild?.id || !member?.id || member.user?.bot) {
    return { ok: false, reason: "invalid" };
  }
  if (String(member.guild.id) !== String(IDs.guilds?.main || "")) {
    return { ok: false, reason: "wrong_guild" };
  }

  let current = member;
  await syncMutedMirrorOnMemberJoin(current).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] muted mirror:", current.id, err?.message || err);
  });
  await restoreUserOnJoin(current.guild.id, current.id, current).catch(() => false);
  await cancelCustomPerksDiscordCleanupQueue(current.guild.id, current.id).catch(() => {});

  current =
    (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => null)) || current;

  await maybeApplyVerificationTenureOnJoin(current).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] tenure:", current.id, err?.message || err);
  });
  current =
    (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => null)) || current;

  await syncPreMemberRoleForMember(current).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] preMember:", current.id, err?.message || err);
  });
  current =
    (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => null)) || current;

  const rolesOk = true;
  const canAnnounce = await shouldSendPublicMemberAnnouncement(current);
  if (!canAnnounce) {
    await markJoinAnnouncePending(current);
    return { ok: true, announced: false, pending: true, roles: rolesOk };
  }

  const welcomeChannel = await resolveWelcomeChannelForMember(current);
  const botId = String(current.client?.user?.id || "");
  if (welcomeChannel && (await joinWelcomeAlreadySent(welcomeChannel, current, botId))) {
    await clearJoinAnnouncePending(current);
    return { ok: true, announced: false, already: true, roles: rolesOk };
  }

  await clearJoinAnnouncePending(current);
  if (current.client) {
    await activateWelcomeContextForGuild(current.guild.id, current.id).catch(() => {});
  }
  const out: any = await dispatchPublicJoinAnnouncements(current).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] welcome dispatch:", current.id, err?.message || err);
    return { ok: false };
  });

  if (opts.sendDm) {
    await sendDmWelcome(current).catch(() => {});
  }

  return {
    ok: true,
    announced: Boolean(out?.announced || out?.ok),
    roles: rolesOk,
  };
}

async function runDeferredJoinAnnouncements(member?) {
  if (!member?.guild?.id || String(member.guild.id) !== String(IDs.guilds?.main || "")) return;
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const welcomeChannel = await resolveWelcomeChannelForMember(member);
  const botId = String(member.client?.user?.id || "");
  if (welcomeChannel && (await joinWelcomeAlreadySent(welcomeChannel, member, botId))) {
    await clearJoinAnnouncePending(member);
    return;
  }
  const cleared: any = await ActivityUserProfile.updateOne(
    { guildId, userId, "profile.joinAnnouncePending": true },
    { $unset: { "profile.joinAnnouncePending": "" } },
  ).catch(() => ({ modifiedCount: 0 }));
  const clearedCount = Number(cleared?.modifiedCount ?? cleared?.nModified ?? 0);
  if (!clearedCount) return;
  await dispatchPublicJoinAnnouncements(member);
}

async function maybeApplyVerificationTenureOnJoin(member?) {
  if (!member?.guild || member.user?.bot) return;
  const guild = member.guild;
  if (!isAlreadyVerifiedInThisGuild(member, guild.id)) return;
  try {
    const { shouldDeferRoleRestoreForMuteMirror, memberIsInMuteMirrorState } = require("../Services/Moderation/mutedMirrorRoleService") as typeof import("../Services/Moderation/mutedMirrorRoleService");
    if (memberIsInMuteMirrorState(member)) return;
    if (await shouldDeferRoleRestoreForMuteMirror(member).catch(() => false)) return;
    const record = await upsertVerifiedMember(guild.id, member.id, new Date());
    await applyTenureForMember(member, record);
  } catch (err) {
    global.logger?.warn?.("[guildMemberAdd] verification tenure on join:", err?.message || err);
  }
}

export = {
  name: "guildMemberAdd",
  kickForJoinGate,
  runDeferredJoinAnnouncements,
  recoverJoinAnnouncementsOnStartup,
  processMissedJoinMember,
  matchUsernameFilters,
  getJoinGateNameCandidate,
  async execute(member?) {
    try {
      if (!member?.guild || !member?.user) return;
      if (await handleAccessGuildMemberAdd(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] staff access mirror:", member.guild?.id, member.id, err?.message || err);
        return false;
      })) {
        return;
      }

      /* test join → sync ruoli dal main subito */
      try {
        const { isTestMirrorGuild } = require("../Utils/Config/testGuildMirrorRemap") as typeof import("../Utils/Config/testGuildMirrorRemap");
        if (isTestMirrorGuild(member.guild.id) && !member.user.bot) {
          const { syncTestMemberRolesFromMain } = require("../Services/Partner/testGuildMirrorSyncService") as typeof import("../Services/Partner/testGuildMirrorSyncService");
          void syncTestMemberRolesFromMain(member)
            .then((out?) => {
              if (out?.ok && out.changed) {
                global.logger?.info?.(
                  `[TEST MIRROR] join role sync ${member.id}: ${out.roles} roles`,
                );
              } else if (out && !out.ok && out.reason && out.reason !== "not_on_main" && out.reason !== "in_flight") {
                global.logger?.warn?.(
                  `[TEST MIRROR] join role sync skip ${member.id}: ${out.reason}`,
                );
              }
            })
            .catch((err?) => {
              global.logger?.warn?.(
                "[guildMemberAdd] test mirror join roles:",
                member.id,
                err?.message || err,
              );
            });
        }
      } catch (eMirrorJoin) {
        global.logger?.warn?.(
          "[guildMemberAdd] test mirror join hook:",
          eMirrorJoin?.message || eMirrorJoin,
        );
      }

      if (member.guild?.id && !isViniliFullFeatureGuild(member.guild.id)) {
        await handleTenantPartnerManagerRejoin(member, member.client).catch((err?) => {
          global.logger?.warn?.("[guildMemberAdd] handleTenantPartnerManagerRejoin:", err?.message || err);
        });
        const tenantInviteInfo = await resolveInviteInfo(member).catch(() => null);
        await tryRecordTenantPartnershipInviteJoin(member, tenantInviteInfo).catch(() => {});
        return;
      }

      await trackMemberJoin(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] daily member stats:", err?.message || err);
      });
      try {
        const { broadcastSiteLiveStatsChangedDebounced } = require("../features/suggestions/siteSuggestionsBroadcast") as typeof import("../features/suggestions/siteSuggestionsBroadcast");
        broadcastSiteLiveStatsChangedDebounced();
      } catch (_) {}
      const joinGateConfig = getJoinGateConfigSnapshot();
      const isCoreExempt = await resolveJoinGateConfiguredExempt(member?.guild, member?.id, member);
      const sponsorNoJoinGate = isSponsorJoinGateGuildId(member.guild.id);
      if (!isCoreExempt && !sponsorNoJoinGate) {
        const lockState = await getSecurityLockState(member.guild);
        if (lockState.joinLockActive) {
          await kickForJoinGate(
            member,
            "Ingresso bloccato: lockdown di sicurezza attivo.",
            [
              `<:VC_Rules:1482527309868040393> **Regola:** Blocco di sicurezza di ingresso`,
              `<:VC_Info:1482526956703580372> **Fonti:** ${lockState.sources.join(", ")}`,
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

      if (!isCoreExempt && !sponsorNoJoinGate) {
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
            reason: "Account senza avatar.",
            extraLines: [
              `<:VC_Rules:1482527309868040393> **Regola:** Account senza avatar`,
            ],
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
            reason: "Nome pubblicitario nel username.",
            extraLines: [
              `<:VC_Rules:1482527309868040393> **Regola:** Nome pubblicitario`,
              `<:VC_Modifica:1478859646587633717> **Nome:** ${nameCandidate || "N/A"}`,
            ],
            action: joinGateConfig?.advertisingName?.action || "kick",
          };
        }
        const usernameMatch = !joinGateMatch && joinGateConfig?.enabled ? matchUsernameFilters(nameCandidate, joinGateConfig?.usernameFilter) : null;
        if (!joinGateMatch && usernameMatch) {
          joinGateMatch = {
            rule: "usernameFilter",
            reason: "Username corrisponde al pattern bloccato.",
            extraLines: [
              `<:VC_Rules:1482527309868040393> **Regola:** Filtro username`,
              `<:VC_Info:1482526956703580372> **Tipo di match:** ${usernameMatch.type}`,
              `<:VC_Modifica:1478859646587633717> **Match:** ${usernameMatch.value}`,
              `<:VC_Modifica:1478859646587633717> **Nome:** ${nameCandidate || "N/A"}`,
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
            reason: `Account sospetto: ${suspiciousReason}`,
            extraLines: [
              `<:VC_Rules:1482527309868040393> **Regola:** Account sospetto`,
              `<:VC_Reason:1478517122929004544> **Motivo:** ${suspiciousReason}`,
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

      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        void ghostPingNewMemberOnJoin(member.client, member).catch(() => {});
        if (member.client) {
          await activateWelcomeContextForGuild(member.guild.id, member.id).catch(() => {});
        }
      }

      await sendDmWelcome(member).catch(() => {});

      await handleTenantPartnerManagerRejoin(member, member.client).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] handleTenantPartnerManagerRejoin:", err?.message || err);
      });

      if (member.guild?.id && !shouldApplyMainPartnershipFilters(member.guild.id)) {
        const tenantInviteInfo = await resolveInviteInfo(member).catch(() => null);
        await tryRecordTenantPartnershipInviteJoin(member, tenantInviteInfo).catch(() => {});
      }

      await syncMutedMirrorOnMemberJoin(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] muted mirror rejoin:", member.id, err?.message || err);
      });
      await restoreUserOnJoin(member.guild.id, member.id, member).catch(() => false);
      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        await cancelCustomPerksDiscordCleanupQueue(member.guild.id, member.id).catch(() => {});
      }

      await applySponsorGuildAutoVerificato(member).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] applySponsorGuildAutoVerificato:", err?.message || err);
      });

      const sponsorJoinGid = String(member.guild?.id || "");
      const memberForTenure =
        isSponsorGuildVerify(sponsorJoinGid)
          ? (await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => null)) || member
          : member;

      await sponsorVerifiedRequiresMain.handleGuildMemberAdd(memberForTenure).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] sponsorVerifiedRequiresMain:", err?.message || err);
      });

      const hadVerifyRole = isAlreadyVerifiedInThisGuild(memberForTenure, member.guild.id);
      await maybeApplyVerificationTenureOnJoin(memberForTenure).catch((err?) => {
        global.logger?.warn?.("[guildMemberAdd] verificationTenureOnJoin:", err?.message || err);
      });
                  const preferFreshAfterRestore =
        hadVerifyRole || String(member.guild?.id || "") === String(IDs.guilds?.main || "");
      const memberAfterVerifyJoin =
        (preferFreshAfterRestore
          ? await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => null)
          : null) ||
        memberForTenure ||
        member;
      if (!memberAfterVerifyJoin?.guild) return;

      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        await syncPreMemberRoleForMember(memberAfterVerifyJoin).catch((err?) => {
          global.logger?.warn?.("[guildMemberAdd] preMember role:", member.id, err?.message || err);
        });
      }

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
      let canAnnounce = true;
      if (String(member.guild?.id || "") === String(IDs.guilds?.main || "")) {
        canAnnounce = await shouldSendPublicMemberAnnouncement(memberAfterVerifyJoin);
        if (!canAnnounce) await markJoinAnnouncePending(memberAfterVerifyJoin);
        else await clearJoinAnnouncePending(memberAfterVerifyJoin);

        const welcomeChannelId = IDs.channels.chat;
        let welcomeChannel = await resolveGuildChannel(memberAfterVerifyJoin.guild, welcomeChannelId);
        if (!welcomeChannel && memberAfterVerifyJoin.client) {
          const mainGuild = await getClientGuildCached(memberAfterVerifyJoin.client, IDs.guilds.main);
          welcomeChannel = mainGuild ? await getGuildChannelCached(mainGuild, welcomeChannelId) : null;
        }
        if (!welcomeChannel) {
          const detail = {
            guildId: String(memberAfterVerifyJoin.guild?.id || ""),
            channelId: String(welcomeChannelId || ""),
            cached: Boolean(memberAfterVerifyJoin.guild?.channels?.cache?.has?.(String(welcomeChannelId || ""))),
          };
          try {
            const fetched = await memberAfterVerifyJoin.guild.channels.fetch(String(welcomeChannelId)).catch((err?) => {
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

        if (canAnnounce && memberAfterVerifyJoin.client) {
          await refreshWelcomeContextForGuild(memberAfterVerifyJoin.guild.id, memberAfterVerifyJoin.id);
        }
        if (welcomeChannel && canAnnounce) {
          await sendWelcomeChannelAnnouncement(welcomeChannel, memberAfterVerifyJoin);
          info = await resolveInviteInfo(memberAfterVerifyJoin).catch(() => null);
          await announceInviteInfo(memberAfterVerifyJoin, welcomeChannel, info);
        }
      }

      setImmediate(() => {
        (async () => {
          try {
            await restoreDiscadiaVoteRoleOnRejoin(member).catch(() => {});
            await restoreCustomRoleOnRejoin(member).catch(() => {});
            await sendJoinLog(memberAfterVerifyJoin).catch(() => {});

            if (canAnnounce) {
              if (info && !info.isVanity && info.inviterId) {
                await trackInviteJoin(member, info.inviterId, inviteCodeFromInfo(info)).catch(() => { });
              }
              await maybeSendInviteNearRewardReminder(member, info);
              await maybeSendInviteReward(member, info);
            }

            scheduleMemberCounterRefresh(member.guild, { delayMs: 250, secondPassMs: 1800 });
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
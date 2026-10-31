/** Ingresso membri: inviti (chi ha invitato, traguardi e premi). */
const { EmbedBuilder, PermissionsBitField, MessageFlags } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile, InviteReminderState } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { shouldBlockDm } = require("../Utils/noDmList") as typeof import("../Utils/noDmList");
const { addRolesAndGetMember, getGuildChannelCached, getGuildMemberCached, getGuildRoleCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { applyDefaultFooterToEmbeds } = require("../Utils/Embeds/defaultFooter") as typeof import("../Utils/Embeds/defaultFooter");
const { shouldApplyMainPartnershipFilters } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
const { getPartnershipConfigSync } = require("../MultiGuild/core/tenantPartnershipSettings") as typeof import("../MultiGuild/core/tenantPartnershipSettings");
const { recordPartnershipInviteJoin } = require("../MultiGuild/services/Partner/tenantPartnershipJoinStatsService") as typeof import("../MultiGuild/services/Partner/tenantPartnershipJoinStatsService");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { applyPronounGenderToEmbedForMember } = require("../Utils/Community/pronounGenderUtils") as typeof import("../Utils/Community/pronounGenderUtils");

const THANKS_CHANNEL_ID = IDs.channels.supporters;
const INFO_PERKS_CHANNEL_ID = IDs.channels.info;
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

export = { formatInviteCountIt, formatInviteLinkForJoinMessage, resolveGuildChannel, resolveInviteInfo, inviteCodeFromInfo, tryRecordTenantPartnershipInviteJoin, trackInviteJoin, announceInviteInfo, maybeSendInviteReward, maybeSendInviteNearRewardReminder };

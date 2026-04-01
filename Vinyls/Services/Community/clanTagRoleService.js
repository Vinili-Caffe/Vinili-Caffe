const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildMemberCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const GLOBAL_GUILDED_ROLE_ID = IDs.roles.Guilded;
const MAIN_GUILD_ID = IDs.guilds.main;
const ANNOUNCE_CHANNEL_ID = IDs.channels.supporters;
const MAIN_SERVER_TAG = "V&C";
const MAIN_BOT_ID = IDs.bots.ViniliCaffeBot || "1329118940110127204";

function normalizeForMatch(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ʟ/g, "l").replace(/ᴜ/g, "u").replace(/ɴ/g, "n").replace(/ᴀ/g, "a")
    .replace(/ᴄ/g, "c").replace(/ꜱ/g, "s").replace(/ʜ/g, "h").replace(/ᴘ/g, "p")
    .replace(/ᴡ/g, "w").replace(/ᴇ/g, "e").replace(/ᴅ/g, "d").replace(/ꜰ/g, "f")
    .replace(/ɪ/g, "i").replace(/ɢ/g, "g").replace(/ღ/g, "o")
    .replace(/𝟨/g, "6").replace(/𝟫/g, "9")
    .replace(/[^a-z0-9]/g, "");
}

async function hasMatchingTag(member, client, userForClan = null, options = {}) {
  const user = userForClan || member?.user;
  if (!user) return null;

  const guildTagConfig = IDs.sponsorGuildTagConfig || {};
  const mainTagNorm = normalizeForMatch(MAIN_SERVER_TAG);

  let clan = null;
  if (userForClan) {
    clan = userForClan.clan ?? null;
    // In alcuni userUpdate il campo clan non arriva: fallback REST per sync live.
    if (!clan && client && member?.guild?.id) {
      try {
        const raw = await client.rest.get(`/guilds/${member.guild.id}/members/${member.id}`);
        clan = raw.user?.clan ?? null;
      } catch (_) { }
    }
  } else if (options.refreshFromApi === true && client && member?.guild?.id) {
    try {
      const raw = await client.rest.get(`/guilds/${member.guild.id}/members/${member.id}`);
      clan = raw.user?.clan ?? null;
    } catch (e) {
      clan = user.clan ?? null;
    }
  } else {
    clan = user.clan ?? null;
    if (!clan && client && member?.guild?.id) {
      try {
        const raw = await client.rest.get(`/guilds/${member.guild.id}/members/${member.id}`);
        clan = raw.user?.clan ?? null;
      } catch (e) { }
    }
  }

  if (clan?.tag) {
    const tagNorm = normalizeForMatch(clan.tag);
    const clanGuildId = clan.identity_guild_id || clan.identityGuildId;

    const isMainGuild = String(clanGuildId || "") === String(MAIN_GUILD_ID);
    const sponsorGuild = clanGuildId ? guildTagConfig[clanGuildId] || guildTagConfig[String(clanGuildId)] : null;

    if (isMainGuild && tagNorm === mainTagNorm) {
      return { type: "native", tag: clan.tag, identityGuildId: MAIN_GUILD_ID };
    }

    if (sponsorGuild && normalizeForMatch(sponsorGuild.tagName) === tagNorm) {
      return { type: "native", tag: clan.tag, identityGuildId: String(clanGuildId || "") };
    }
  }

  return null;
}

function guildHasSponsorGuildedExtra(guildId, client) {
  const g = String(guildId || "");
  if (!g) return false;
  const map = client?.config?.guildedRoleIds;
  return Boolean(map && typeof map === "object" && map[g]);
}

function getAllGuildedRoleIdsFromConfig(client) {
  const map = client?.config?.guildedRoleIds;
  if (!map || typeof map !== "object") return [];
  return [...new Set(Object.values(map).map((rid) => String(rid || "")).filter(Boolean))];
}

async function fetchUserClanViaMemberApi(client, userId) {
  const uid = String(userId || "");
  if (!uid || !client?.rest) return { clan: null, ok: false };
  const order = [String(MAIN_GUILD_ID), ...Object.keys(client?.config?.guildedRoleIds || {})];
  const seen = new Set();
  for (const gid of order) {
    const g = String(gid || "");
    if (!g || seen.has(g)) continue;
    seen.add(g);
    try {
      const raw = await client.rest.get(`/guilds/${g}/members/${uid}`);
      return { clan: raw?.user?.clan ?? null, ok: true };
    } catch (_) { }
  }
  return { clan: null, ok: false };
}

const MEMBER_EVENT_CLAN_SYNC_THROTTLE_MS = 8000;
const lastClanSyncAfterMemberEventByUser = new Map();

async function syncClanTagRolesForUserEverywhereAfterMemberEvent(client, user) {
  const uid = String(user?.id || "");
  if (!uid) return;
  const now = Date.now();
  const last = Number(lastClanSyncAfterMemberEventByUser.get(uid) || 0);
  if (now - last < MEMBER_EVENT_CLAN_SYNC_THROTTLE_MS) return;
  lastClanSyncAfterMemberEventByUser.set(uid, now);
  await syncClanTagRolesForUserEverywhere(client, user, {});
}

async function removeRolesFromMember(member, roleIds, label) {
  for (const rid of roleIds) {
    if (!member.roles.cache.has(rid)) continue;
    await member.roles.remove(rid).catch((err) => {
      global.logger?.warn?.(
        `[ClanTagService] ${label} rimozione fallita`,
        member.id,
        rid,
        String(err?.message || err || "").slice(0, 120),
      );
    });
  }
}

async function applyClanTagGuildedRoles(member, client, options = {}) {
  if (!member || member.user?.bot || !client) return { added: false, addedMain: false, addedSponsor: false };

  const userForClan = options.userForClan || null;
  const refreshFromApi = options.refreshFromApi !== undefined ? options.refreshFromApi : !userForClan;
  const match = await hasMatchingTag(member, client, userForClan, { refreshFromApi });

  const g = String(member.guild.id);
  const onMain = g === String(MAIN_GUILD_ID);
  let addedMain = false;
  let addedSponsor = false;

  if (onMain) {
    if (match && GLOBAL_GUILDED_ROLE_ID) {
      if (!member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
        const ok = await member.roles.add(GLOBAL_GUILDED_ROLE_ID).then(() => true).catch(() => false);
        if (ok) {
          addedMain = true;
          await announceNewGuildedMember(member, match.tag, GLOBAL_GUILDED_ROLE_ID);
        }
      }
    } else if (GLOBAL_GUILDED_ROLE_ID) {
      await removeRolesFromMember(member, [GLOBAL_GUILDED_ROLE_ID], "Ruolo Guilded");
    }
    return { added: addedMain, addedMain, addedSponsor };
  }

  if (guildHasSponsorGuildedExtra(g, client)) {
    const map = client.config.guildedRoleIds;
    const extraRoleId = String(map[g] || "");
    const configuredIds = getAllGuildedRoleIdsFromConfig(client);
    const presentConfigured = configuredIds.filter((rid) => member.roles.cache.has(rid));
    if (presentConfigured.length) {
      await removeRolesFromMember(member, presentConfigured, "Ruolo Guilded sponsor reset");
    }
    const shouldHaveSponsorRole = Boolean(
      match &&
      extraRoleId &&
      String(match.identityGuildId) === g,
    );
    if (shouldHaveSponsorRole) {
      if (!member.roles.cache.has(extraRoleId)) {
        const ok = await member.roles.add(extraRoleId).then(() => true).catch(() => false);
        if (ok) addedSponsor = true;
      }
    }
    return { added: addedMain || addedSponsor, addedMain, addedSponsor };
  }

  return { added: false, addedMain: false, addedSponsor: false };
}

async function syncClanTagRoles(member, options = {}) {
  if (!member || member.user?.bot) return;
  const g = String(member.guild?.id || "");
  if (g !== String(MAIN_GUILD_ID) && !guildHasSponsorGuildedExtra(g, member.client)) return;

  await applyClanTagGuildedRoles(member, member.client, options);
}

async function syncClanTagRolesForUserEverywhere(client, user, options = {}) {
  const uid = String(user?.id || "");
  if (!uid || user?.bot || !client) return;
  const mergeOpts = {
    ...options,
    userForClan: options.userForClan !== undefined ? options.userForClan : user,
  };
  const mainGuild =
    client.guilds.cache.get(String(MAIN_GUILD_ID)) ||
    (await client.guilds.fetch(String(MAIN_GUILD_ID)).catch(() => null));
  if (mainGuild) {
    const m =
      mainGuild.members.cache.get(uid) ||
      (await getGuildMemberCached(mainGuild, uid, { preferFresh: true }));
    if (m) await syncClanTagRoles(m, mergeOpts);
  }
  const map = client.config?.guildedRoleIds;
  if (!map || typeof map !== "object") return;
  for (const sponsorGid of Object.keys(map)) {
    const sg =
      client.guilds.cache.get(sponsorGid) ||
      (await client.guilds.fetch(sponsorGid).catch(() => null));
    if (!sg) continue;
    const m =
      sg.members.cache.get(uid) ||
      (await getGuildMemberCached(sg, uid, { preferFresh: true }));
    if (m) await syncClanTagRoles(m, mergeOpts);
  }
}

async function announceNewGuildedMember(member, tag, roleIdAssigned = null) {
  const channelId = ANNOUNCE_CHANNEL_ID;
  const channel = channelId ? (member.guild.channels.cache.get(channelId) || (await getGuildChannelCached(member.guild, channelId))) : null;
  if (!channel?.isTextBased?.()) return;

  const mentionRoleId = roleIdAssigned || GLOBAL_GUILDED_ROLE_ID;
  const avatarUrl = member.displayAvatarURL({ extension: "png", size: 256, forceStatic: false });
  const roleLine = mentionRoleId
    ? `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo <@&${mentionRoleId}>!`
    : `<:VC_Reply:1482532158080942191> Ti è stato assegnato un ruolo Guilded!`;
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: member.user.username,
      iconURL: avatarUrl,
    })
    .setTitle("Nuovx Guilded <a:VC_StarPink:1330194976440848500>")
    .setThumbnail(avatarUrl)
    .setDescription(
      [
        `<a:VC_Arrow:1482706699365257397><@${member.id}>`,
        "",
        roleLine,
        `Mettendo una delle nostre **Guild-TAGs**`,
        "<:VC_Luna1:1482497618289496117><:VC_Luna2:1482497653387427902><a:VC_Arrow:1482706699365257397> <https://discord.gg/E6vrm5zE6B>",
        "<:VC_Cash1:1482460724302184450><:VC_Cash2:1482460763346960434><a:VC_Arrow:1482706699365257397> <https://discord.gg/QnTN5P578g>",
        "<:VC_Porn1:1482497744513011944><:VC_Porn2:1482497774892089547><a:VC_Arrow:1482706699365257397> <https://discord.gg/WMuZ4EMAkc>",
        "<:VC_SixNine1:1482497833578922065><:VC_SixNine2:1482497868328865813><a:VC_Arrow:1482706699365257397> <https://discord.gg/uqUNS9f5m5>",
        "<:VC_Weed1:1482497951686201534><:VC_Weed2:1482497986910097592><a:VC_Arrow:1482706699365257397> <https://discord.gg/SzBwnxHXNv>",
        "<:VC_Figa1:1482495980275499169><:VC_Figa2:1482496046222544937><a:VC_Arrow:1482706699365257397> <https://discord.gg/z3EXtJwvQH>",
        "",
        "<a:VC_Arrow:1482706699365257397> Grazie per aver scelto la nostra tag!",
      ].join("\n"),
    )
    .setFooter({ text: "Grazie per il tuo supporto!" });

  await channel.send({
    content: `<@${member.id}>`,
    embeds: [embed],
  }).catch(() => { });
}

async function syncAllMembersClanTags(client) {
  if (!client?.user) return;

  const mainBotId = "1329118940110127204"; // ID di Vinili & Caffè Bot
  if (client.user.id !== mainBotId) return;

  const mainGuildId = String(IDs.guilds.main || "");
  const guild = client.guilds.cache.get(mainGuildId) || (await client.guilds.fetch(mainGuildId).catch(() => null));
  if (!guild) return;

  try {
    const members = await guild.members.fetch({ withPresences: true, force: true }).catch(() => guild.members.cache);

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const { addedMain } = await applyClanTagGuildedRoles(member, client, { refreshFromApi: true });
      if (addedMain) await new Promise((resolve) => setTimeout(resolve, 750));
    }

    const roleMap = client.config?.guildedRoleIds;
    if (roleMap && typeof roleMap === "object") {
      for (const sponsorGid of Object.keys(roleMap)) {
        const sg = client.guilds.cache.get(sponsorGid) || (await client.guilds.fetch(sponsorGid).catch(() => null));
        if (!sg) continue;
        const smembers = await sg.members.fetch({ withPresences: true, force: true }).catch(() => sg.members.cache);
        for (const member of smembers.values()) {
          if (member.user.bot) continue;
          const { addedSponsor } = await applyClanTagGuildedRoles(member, client, { refreshFromApi: true });
          if (addedSponsor) await new Promise((resolve) => setTimeout(resolve, 750));
        }
      }
    }
  } catch (error) {
    global.logger?.error?.("[ClanTagService] Startup sync failed:", error);
  }
}

module.exports = {
  syncClanTagRoles,
  syncClanTagRolesForUserEverywhere,
  syncClanTagRolesForUserEverywhereAfterMemberEvent,
  syncAllMembersClanTags,
};
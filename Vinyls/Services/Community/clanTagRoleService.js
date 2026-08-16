const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildMemberCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { wasRoleRestoredByMuteMirror } = require("../../Utils/Moderation/muteRestoreAnnounceSuppress");
const { applyPronounGenderToEmbedForMember } = require("../../Utils/Community/pronounGenderUtils");
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
    .replace(/ɪ/g, "i").replace(/ɢ/g, "g").replace(/ღ/g, "o").replace(/ᴛ/g, "t").replace(/ʀ/g, "r")
    .replace(/𝟨/g, "6").replace(/𝟫/g, "9")
    .replace(/[⁶₆]/g, "6")
    .replace(/[^a-z0-9]/g, "");
}

async function hasMatchingTag(member, client, userForClan = null, options = {}) {
  const resolved = await resolveClanTagMatch(member, client, userForClan, options);
  return resolved.match;
}

/**
 * @returns {{ match: object|null, lookupFailed: boolean }}
 * lookupFailed=true → non rimuovere Guilded (API/cache inaffidabile).
 */
async function resolveClanTagMatch(member, client, userForClan = null, options = {}) {
  const user = userForClan || member?.user;
  if (!user) return { match: null, lookupFailed: true };

  const guildTagConfig = IDs.sponsorGuildTagConfig || {};
  const mainTagNorm = normalizeForMatch(MAIN_SERVER_TAG);

  let clan = null;
  let lookupFailed = false;
  if (userForClan) {
    clan = userForClan.clan ?? null;
    // In alcuni userUpdate il campo clan non arriva: fallback REST per sync live.
    if (!clan && client && member?.guild?.id) {
      try {
        const raw = await client.rest.get(`/guilds/${member.guild.id}/members/${member.id}`);
        clan = raw.user?.clan ?? null;
      } catch (_) {
        lookupFailed = true;
      }
    }
  } else if (options.refreshFromApi === true && client && member?.guild?.id) {
    try {
      const raw = await client.rest.get(`/guilds/${member.guild.id}/members/${member.id}`);
      clan = raw.user?.clan ?? null;
    } catch (e) {
      clan = user.clan ?? null;
      if (!clan) lookupFailed = true;
    }
  } else {
    clan = user.clan ?? null;
    if (!clan && client && member?.guild?.id) {
      try {
        const raw = await client.rest.get(`/guilds/${member.guild.id}/members/${member.id}`);
        clan = raw.user?.clan ?? null;
      } catch (e) {
        lookupFailed = true;
      }
    }
  }

  if (clan?.tag) {
    const tagNorm = normalizeForMatch(clan.tag);
    const clanGuildId = clan.identity_guild_id || clan.identityGuildId;

    const isMainGuild = String(clanGuildId || "") === String(MAIN_GUILD_ID);
    const sponsorGuild = clanGuildId ? guildTagConfig[clanGuildId] || guildTagConfig[String(clanGuildId)] : null;

    if (isMainGuild && tagNorm === mainTagNorm) {
      return { match: { type: "native", tag: clan.tag, identityGuildId: MAIN_GUILD_ID }, lookupFailed: false };
    }

    if (sponsorGuild && normalizeForMatch(sponsorGuild.tagName) === tagNorm) {
      return {
        match: { type: "native", tag: clan.tag, identityGuildId: String(clanGuildId || "") },
        lookupFailed: false,
      };
    }
  }

  return { match: null, lookupFailed };
}

async function hadObtainableGuildTagBefore(member, client, previousUser) {
  if (!previousUser) return false;
  const prev = await hasMatchingTag(member, client, previousUser, { refreshFromApi: false });
  return Boolean(prev && prev.type === "native");
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

const GUILDED_ANNOUNCE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const lastGuildedChannelAnnounceByUserId = new Map();
const lastGuildedAnnouncementMessageByUserId = new Map();
const GUILDED_ANNOUNCE_SCAN_LIMIT = 200;
/** Evita due embed se userUpdate e guildMemberUpdate annunciano in parallelo. */
const guildedAnnounceTailByUserId = new Map();

async function deleteGuildedAnnouncementForUser(member) {
  const uid = String(member?.id || "");
  if (!uid) return false;
  const channelId = ANNOUNCE_CHANNEL_ID;
  const channel = channelId
    ? (member.guild.channels.cache.get(channelId) ||
      (await getGuildChannelCached(member.guild, channelId)))
    : null;
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) return false;
  const known = lastGuildedAnnouncementMessageByUserId.get(uid) || null;
  if (known?.messageId && String(known.channelId || "") === String(channel.id)) {
    const knownMsg = await channel.messages.fetch(String(known.messageId)).catch(() => null);
    if (knownMsg) {
      const ok = await knownMsg.delete().then(() => true).catch(() => false);
      if (ok) return true;
    }
  }
  const recent = await channel.messages.fetch({ limit: GUILDED_ANNOUNCE_SCAN_LIMIT }).catch(() => null);
  if (!recent?.size) return false;
  for (const msg of recent.values()) {
    if (String(msg.author?.id || "") !== String(member.client?.user?.id || "")) continue;
    const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
    const hasGuildedTitle = embeds.some((e) =>
      /nuov\w* guilded/i.test(String(e?.title || e?.data?.title || "")),
    );
    const mentionsUser = String(msg.content || "").includes(`<@${uid}>`) || String(msg.content || "").includes(`<@!${uid}>`);
    if (!hasGuildedTitle && !mentionsUser) continue;
    const ok = await msg.delete().then(() => true).catch(() => false);
    if (ok) return true;
  }
  return false;
}

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

/** Allineato a verifyUtils (ruolo Member): niente ruolo/annuncio Guilded prima della verifica server. */
function memberCanReceiveAutomatedGuildedOnMain(member) {
  if (!member?.roles?.cache) return false;
  if (member.pending === true) return false;
  const verifiedRoleId = IDs.roles?.Member;
  if (!verifiedRoleId) return true;
  return member.roles.cache.has(verifiedRoleId);
}

async function applyClanTagGuildedRoles(member, client, options = {}) {
  if (!member || member.user?.bot || !client) return { added: false, addedMain: false, addedSponsor: false };

  const userForClan = options.userForClan || null;
  const refreshFromApi = options.refreshFromApi !== undefined ? options.refreshFromApi : !userForClan;
  const { match, lookupFailed } = await resolveClanTagMatch(member, client, userForClan, { refreshFromApi });

  const g = String(member.guild.id);
  const onMain = g === String(MAIN_GUILD_ID);
  let addedMain = false;
  let addedSponsor = false;

  if (onMain) {
    if (match && GLOBAL_GUILDED_ROLE_ID) {
      if (!memberCanReceiveAutomatedGuildedOnMain(member)) {
        if (member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
          await removeRolesFromMember(member, [GLOBAL_GUILDED_ROLE_ID], "Ruolo Guilded");
          lastGuildedChannelAnnounceByUserId.delete(String(member.id));
          await deleteGuildedAnnouncementForUser(member).catch(() => false);
          lastGuildedAnnouncementMessageByUserId.delete(String(member.id));
        }
        return { added: false, addedMain: false, addedSponsor: false };
      }
      if (!member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
        const ok = await member.roles.add(GLOBAL_GUILDED_ROLE_ID).then(() => true).catch(() => false);
        if (ok) {
          addedMain = true;
          const swapAmongObtainable =
            match.type === "native" &&
            options.previousUserForClan &&
            (await hadObtainableGuildTagBefore(member, client, options.previousUserForClan));
          if (!swapAmongObtainable) {
            await announceNewGuildedMember(member, match.tag, GLOBAL_GUILDED_ROLE_ID);
          }
        }
      }
    } else if (GLOBAL_GUILDED_ROLE_ID && !lookupFailed) {
      await removeRolesFromMember(member, [GLOBAL_GUILDED_ROLE_ID], "Ruolo Guilded");
      lastGuildedChannelAnnounceByUserId.delete(String(member.id));
      await deleteGuildedAnnouncementForUser(member).catch(() => false);
      lastGuildedAnnouncementMessageByUserId.delete(String(member.id));
    } else if (lookupFailed) {
      global.logger?.warn?.(
        "[ClanTagService] skip rimozione Guilded: lookup clan fallito",
        member.id,
      );
    }
    return { added: addedMain, addedMain, addedSponsor };
  }

  if (guildHasSponsorGuildedExtra(g, client)) {
    if (lookupFailed) {
      global.logger?.warn?.(
        "[ClanTagService] skip sync Guilded sponsor: lookup clan fallito",
        member.guild.id,
        member.id,
      );
      return { added: false, addedMain: false, addedSponsor: false };
    }
    const map = client.config.guildedRoleIds;
    const extraRoleId = String(map[g] || "");
    const configuredIds = getAllGuildedRoleIdsFromConfig(client);
    const shouldHaveSponsorRole = Boolean(
      match &&
      extraRoleId &&
      String(match.identityGuildId) === g,
    );
    if (shouldHaveSponsorRole) {
      const others = configuredIds.filter((rid) => rid !== extraRoleId && member.roles.cache.has(rid));
      if (others.length) {
        await removeRolesFromMember(member, others, "Ruolo Guilded sponsor reset");
      }
      if (!member.roles.cache.has(extraRoleId)) {
        const ok = await member.roles.add(extraRoleId).then(() => true).catch(() => false);
        if (ok) addedSponsor = true;
      }
    } else {
      const presentConfigured = configuredIds.filter((rid) => member.roles.cache.has(rid));
      if (presentConfigured.length) {
        await removeRolesFromMember(member, presentConfigured, "Ruolo Guilded sponsor reset");
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
  const uid = String(member?.id || "");
  if (!uid) return;
  const mentionRoleId = roleIdAssigned || GLOBAL_GUILDED_ROLE_ID;
  if (wasRoleRestoredByMuteMirror(member.guild?.id, member.id, mentionRoleId)) return;

  const prev = guildedAnnounceTailByUserId.get(uid) || Promise.resolve();
  const mine = prev.catch(() => {}).then(async () => {
    const now = Date.now();
    const lastAnn = Number(lastGuildedChannelAnnounceByUserId.get(uid) || 0);
    if (now - lastAnn < GUILDED_ANNOUNCE_COOLDOWN_MS) return;

    const channelId = ANNOUNCE_CHANNEL_ID;
    const channel = channelId
      ? member.guild.channels.cache.get(channelId) || (await getGuildChannelCached(member.guild, channelId))
      : null;
    if (!channel?.isTextBased?.()) return;

    const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setAuthor({
        name: accountUsername(member),
        iconURL: avatarUrl,
      })
      .setTitle("Nuovx Guilded <a:VC_StarPink:1330194976440848500>")
      .setThumbnail(avatarUrl)
      .setDescription(
        [
          `<@${member.id}>, \`hai sbloccato:\``,
          `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo <@&${mentionRoleId}>!`,
          "<a:VC_Infinity:1448687797266288832> - Permesso di allegare immagini e link in chat",
          "<a:VC_HeartWhite:1448673535253024860> - Permesso di cambiare il nickname",
          "",
          "<a:VC_Arrow:1482706699365257397> Grazie per aver scelto la nostra tag! Scopri tutte le nostre tags [qui](https://viniliecaffe.it/perks)",
        ].join("\n"),
      )
      .setFooter({ text: "Grazie per il tuo supporto!" });
    applyPronounGenderToEmbedForMember(embed, member);

    const sent = await channel
      .send({
        content: `<@${member.id}>`,
        embeds: [embed],
      })
      .catch(() => null);
    if (sent) {
      lastGuildedChannelAnnounceByUserId.set(uid, Date.now());
      lastGuildedAnnouncementMessageByUserId.set(uid, {
        channelId: String(channel.id || ""),
        messageId: String(sent.id || ""),
      });
    }
  });
  guildedAnnounceTailByUserId.set(uid, mine);
  try {
    await mine;
  } finally {
    if (guildedAnnounceTailByUserId.get(uid) === mine) guildedAnnounceTailByUserId.delete(uid);
  }
}

async function syncAllMembersClanTags(client) {
  if (!client?.user) return;

  if (client.user.id !== String(MAIN_BOT_ID || "")) return;

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

module.exports = { hasMatchingTag, syncClanTagRoles, syncClanTagRolesForUserEverywhere, syncClanTagRolesForUserEverywhereAfterMemberEvent, syncAllMembersClanTags };
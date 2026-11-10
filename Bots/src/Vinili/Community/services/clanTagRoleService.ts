const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildMemberCached, getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { memberDisplayName, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { wasRoleRestoredByMuteMirror, isSocialRoleAnnounceGloballySuppressed } = require("../../Moderation/utils/muteRestoreAnnounceSuppress") as typeof import("../../Moderation/utils/muteRestoreAnnounceSuppress");
const { applyPronounGenderToEmbedForMember } = require("../utils/pronounGenderUtils") as typeof import("../utils/pronounGenderUtils");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const GLOBAL_GUILDED_ROLE_ID = IDs.roles.Guilded;
const MAIN_GUILD_ID = IDs.guilds.main;
const ANNOUNCE_CHANNEL_ID = IDs.channels.supporters;
const MAIN_SERVER_TAG = "V&C";
const MAIN_BOT_ID = IDs.bots.ViniliCaffeBot || "1329118940110127204";

function normalizeForMatch(text?) {
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

async function hasMatchingTag(member?, client?, userForClan = null, options: Record<string, any> = {}) {
  const resolved = await resolveClanTagMatch(member, client, userForClan, options);
  return resolved.match;
}

async function restGetMemberClan(client?, guildId?, userId?) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!client?.rest || !gid || !uid) return { clan: null, ok: false };
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await client.rest.get(`/guilds/${gid}/members/${uid}`);
      return { clan: raw?.user?.clan ?? null, ok: true };
    } catch (err) {
      lastErr = err;
      const code = String(err?.code || err?.cause?.code || err?.message || "");
      const retryable = /CONNECT_TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNABORTED|UND_ERR|EAI_AGAIN|AbortError|TimeoutError|503|429/i.test(code)
        || Number(err?.status) === 429
        || Number(err?.status) === 503;
      if (!retryable || attempt >= 1) break;
      await new Promise((r?) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  void lastErr;
  return { clan: null, ok: false };
}

async function resolveClanTagMatch(member?, client?, userForClan = null, options: Record<string, any> = {}) {
  const user = userForClan || member?.user;
  if (!user) return { match: null, lookupFailed: true };

  const mainTagNorm = normalizeForMatch(MAIN_SERVER_TAG);
  const memberId = String(member?.id || user?.id || "");
  const guildId = String(member?.guild?.id || "");

  let clan = null;
  let lookupFailed = false;
  if (userForClan) {
    clan = userForClan.clan ?? null;
    if (!clan && client && guildId && memberId) {
      const got = await restGetMemberClan(client, guildId, memberId);
      if (got.ok) clan = got.clan;
      else lookupFailed = true;
    }
  } else if (options.refreshFromApi === true && client && guildId && memberId) {
    const got = await restGetMemberClan(client, guildId, memberId);
    if (got.ok) {
      clan = got.clan;
    } else {
      clan = user.clan ?? null;
      if (!clan) lookupFailed = true;
    }
  } else {
    clan = user.clan ?? null;
    if (!clan && client && guildId && memberId) {
      const got = await restGetMemberClan(client, guildId, memberId);
      if (got.ok) clan = got.clan;
      else lookupFailed = true;
    }
  }

  /* clanLookupRetry1: se il guild corrente fallisce, riprova dal server principale. */
  if (lookupFailed && client && memberId) {
    const alt = await fetchUserClanViaMemberApi(client, memberId);
    if (alt.ok) {
      clan = alt.clan;
      lookupFailed = false;
    }
  }

  if (clan?.tag) {
    const tagNorm = normalizeForMatch(clan.tag);
    const clanGuildId = clan.identity_guild_id || clan.identityGuildId;

    const isMainGuild = String(clanGuildId || "") === String(MAIN_GUILD_ID);

    if (isMainGuild && tagNorm === mainTagNorm) {
      return { match: { type: "native", tag: clan.tag, identityGuildId: MAIN_GUILD_ID }, lookupFailed: false };
    }
  }

  return { match: null, lookupFailed };
}

async function hadObtainableGuildTagBefore(member?, client?, previousUser?) {
  if (!previousUser) return false;
  const prev = await hasMatchingTag(member, client, previousUser, { refreshFromApi: false });
  return Boolean(prev && prev.type === "native");
}

async function fetchUserClanViaMemberApi(client?, userId?) {
  const uid = String(userId || "");
  if (!uid || !client?.rest) return { clan: null, ok: false };
  const order = [String(MAIN_GUILD_ID)];
  const seen = new Set();
  for (const gid of order) {
    const g = String(gid || "");
    if (!g || seen.has(g)) continue;
    seen.add(g);
    const got = await restGetMemberClan(client, g, uid);
    if (got.ok) return got;
  }
  return { clan: null, ok: false };
}

const MEMBER_EVENT_CLAN_SYNC_THROTTLE_MS = 8000;
const lastClanSyncAfterMemberEventByUser = new Map();
const CLAN_LOOKUP_FAIL_LOG_COOLDOWN_MS = 30 * 60 * 1000;
const lastClanLookupFailLogByUser = new Map();

function warnClanLookupFailed(kind?, userId?, guildId = "") {
  const uid = String(userId || "");
  if (!uid) return;
  const now = Date.now();
  const key = `${kind}:${uid}`;
  const last = Number(lastClanLookupFailLogByUser.get(key) || 0);
  if (now - last < CLAN_LOOKUP_FAIL_LOG_COOLDOWN_MS) return;
  lastClanLookupFailLogByUser.set(key, now);
  if (lastClanLookupFailLogByUser.size > 2000) {
    for (const [k, ts] of lastClanLookupFailLogByUser) {
      if (now - Number(ts || 0) > CLAN_LOOKUP_FAIL_LOG_COOLDOWN_MS) lastClanLookupFailLogByUser.delete(k);
    }
  }
  global.logger?.warn?.(
    "[ClanTagService] skip rimozione Guilded: lookup clan fallito",
    uid,
  );
}

const GUILDED_ANNOUNCE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const lastGuildedChannelAnnounceByUserId = new Map();
const lastGuildedAnnouncementMessageByUserId = new Map();
const GUILDED_ANNOUNCE_SCAN_LIMIT = 200;
const guildedAnnounceTailByUserId = new Map();

async function deleteGuildedAnnouncementForUser(member?) {
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
    const hasGuildedTitle = embeds.some((e?) =>
      /nuov\w* guilded/i.test(String(e?.title || e?.data?.title || "")),
    );
    const mentionsUser = String(msg.content || "").includes(`<@${uid}>`) || String(msg.content || "").includes(`<@!${uid}>`);
    if (!hasGuildedTitle && !mentionsUser) continue;
    const ok = await msg.delete().then(() => true).catch(() => false);
    if (ok) return true;
  }
  return false;
}

async function syncClanTagRolesForUserEverywhereAfterMemberEvent(client?, user?) {
  const uid = String(user?.id || "");
  if (!uid) return;
  const now = Date.now();
  const last = Number(lastClanSyncAfterMemberEventByUser.get(uid) || 0);
  if (now - last < MEMBER_EVENT_CLAN_SYNC_THROTTLE_MS) return;
  lastClanSyncAfterMemberEventByUser.set(uid, now);
  await syncClanTagRolesForUserEverywhere(client, user, {});
}

async function removeRolesFromMember(member?, roleIds?, label?) {
  for (const rid of roleIds) {
    if (!member.roles.cache.has(rid)) continue;
    await member.roles.remove(rid).catch((err?) => {
      global.logger?.warn?.(
        `[ClanTagService] ${label} rimozione fallita`,
        member.id,
        rid,
        String(err?.message || err || "").slice(0, 120),
      );
    });
  }
}

function memberCanReceiveAutomatedGuildedOnMain(member?) {
  if (!member?.roles?.cache) return false;
  if (member.pending === true) return false;
  const verifiedRoleId = IDs.roles?.Member;
  if (!verifiedRoleId) return true;
  return member.roles.cache.has(verifiedRoleId);
}

async function applyClanTagGuildedRoles(member?, client?, options: Record<string, any> = {}) {
  if (!member || member.user?.bot || !client) return { added: false, addedMain: false };

  const userForClan = options.userForClan || null;
  const refreshFromApi = options.refreshFromApi !== undefined ? options.refreshFromApi : !userForClan;
  const { match, lookupFailed } = await resolveClanTagMatch(member, client, userForClan, { refreshFromApi });

  const g = String(member.guild.id);
  const onMain = g === String(MAIN_GUILD_ID);
  let addedMain = false;

  if (onMain) {
    if (match && GLOBAL_GUILDED_ROLE_ID) {
      if (!memberCanReceiveAutomatedGuildedOnMain(member)) {
        if (member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
          await removeRolesFromMember(member, [GLOBAL_GUILDED_ROLE_ID], "Ruolo Guilded");
          lastGuildedChannelAnnounceByUserId.delete(String(member.id));
          await deleteGuildedAnnouncementForUser(member).catch(() => false);
          lastGuildedAnnouncementMessageByUserId.delete(String(member.id));
          try {
            const { tryRevokePicPermsIfIneligible } = require("../utils/manualSocialRoleAnnounceAndPicPerms") as typeof import("../utils/manualSocialRoleAnnounceAndPicPerms");
            await tryRevokePicPermsIfIneligible(member);
          } catch (_) {}
        }
        return { added: false, addedMain: false };
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
      try {
        const { tryRevokePicPermsIfIneligible } = require("../utils/manualSocialRoleAnnounceAndPicPerms") as typeof import("../utils/manualSocialRoleAnnounceAndPicPerms");
        await tryRevokePicPermsIfIneligible(member);
      } catch (_) {}
    } else if (lookupFailed) {
      warnClanLookupFailed("main", member.id);
    }
    return { added: addedMain, addedMain };
  }

  return { added: false, addedMain: false };
}

async function syncClanTagRoles(member?, options: Record<string, any> = {}) {
  if (!member || member.user?.bot) return;
  const g = String(member.guild?.id || "");
  if (g !== String(MAIN_GUILD_ID)) return;

  await applyClanTagGuildedRoles(member, member.client, options);
}

async function syncClanTagRolesForUserEverywhere(client?, user?, options: Record<string, any> = {}) {
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
}

async function announceNewGuildedMember(member?, tag?, roleIdAssigned = null) {
  const uid = String(member?.id || "");
  if (!uid) return;
  if (isSocialRoleAnnounceGloballySuppressed()) return;
  const mentionRoleId = roleIdAssigned || GLOBAL_GUILDED_ROLE_ID;
  if (wasRoleRestoredByMuteMirror(member.guild?.id, member.id, mentionRoleId)) return;
  /* annunciRuoli1: regola accesa nella dashboard per questo ruolo → ci pensa lei */
  try {
    const A = require("../../../MultiGuild/services/announcementsRuntime") as typeof import("../../../MultiGuild/services/announcementsRuntime");
    if (await A.roleRuleHandles(member.guild?.id, mentionRoleId)) return;
  } catch (_) {}

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
        name: memberDisplayName(member),
        iconURL: avatarUrl,
      })
      .setTitle(`Nuovx Guilded ${E.VC_StarPink}`)
      .setThumbnail(avatarUrl)
      .setDescription(
        [
          `<@${member.id}>, \`hai sbloccato:\``,
          `${E.VC_Reply} Ti è stato assegnato il ruolo <@&${mentionRoleId}>!`,
          `${E.VC_Infinity} - Permesso di allegare immagini e link in chat`,
          `${E.VC_HeartWhite} - Permesso di cambiare il nickname`,
          "",
          `${E.VC_Arrow} Grazie per aver scelto la nostra tag! Scopri tutti i vantaggi [qui](https://viniliecaffe.it/perks)`,
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

async function syncAllMembersClanTags(client?) {
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
      if (addedMain) await new Promise((resolve?) => setTimeout(resolve, 750));
    }
  } catch (error) {
    global.logger?.error?.("[ClanTagService] Startup sync failed:", error);
  }
}

export = { hasMatchingTag, syncClanTagRolesForUserEverywhere, syncClanTagRolesForUserEverywhereAfterMemberEvent, syncAllMembersClanTags };
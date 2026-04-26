const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { getJoinGateConfigSnapshot } = require("../Services/Moderation/joinGateService");
const { resolveJoinGateConfiguredExempt } = require("../Services/Moderation/joinGateExemptUtils");
const {
  kickForJoinGate,
  matchUsernameFilters,
  getJoinGateNameCandidate,
} = require("./guildMemberAdd");
const { syncClanTagRolesForUserEverywhere } = require("../Services/Community/clanTagRoleService");
const { userAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity");

const ARROW = "<:VC_right_arrow:1482459908245815296>";
const USER_UPDATE_DEDUPE_MS = 15_000;
const recentUserUpdateActions = new Map();
/** USER_UPDATE spesso non include `clan`: sync via REST quando il payload non mostra cambiamenti. */
const CLAN_TAG_USER_UPDATE_THROTTLE_MS = 10_000;
const clanTagUserUpdateLastSync = new Map();

async function maybeThrottledClanTagSyncFromUserUpdate(newUser, resolvedClient) {
  if (!newUser?.id || newUser.bot) return;
  const uid = String(newUser.id);
  const now = Date.now();
  const last = Number(clanTagUserUpdateLastSync.get(uid) || 0);
  if (now - last < CLAN_TAG_USER_UPDATE_THROTTLE_MS) return;
  clanTagUserUpdateLastSync.set(uid, now);
  await syncClanTagRolesForUserEverywhere(resolvedClient, newUser, {});
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
    .setThumbnail(userAvatarUrlDynamic(member, { size: 256 }) || null);
}

function makeUserUpdateDedupeKey(guildId, userId, match) {
  return [String(guildId || ""), String(userId || ""), String(match?.type || ""), String(match?.value || "")].join(":");
}

function shouldSkipRecentUserUpdateAction(guildId, userId, match) {
  const key = makeUserUpdateDedupeKey(guildId, userId, match);
  const now = Date.now();
  const lastAt = Number(recentUserUpdateActions.get(key) || 0);
  if (now - lastAt < USER_UPDATE_DEDUPE_MS) return true;
  recentUserUpdateActions.set(key, now);
  return false;
}

async function punishUsernameMatchPostJoin(member, match, cfg) {
  const reason = "Username matches blocked pattern (post-join filter).";
  const extraLines = [
    `${ARROW} **Rule:** Username Filter (post-join)`,
    `${ARROW} **Match Type:** ${match.type}`,
    `${ARROW} **Match:** ${match.value}`,
  ];
  const action = String(cfg?.usernameFilter?.action || "kick").toLowerCase();
  if (action === "log") {
    const logChannel = IDs.channels.modLogs
      ? member.guild.channels.cache.get(IDs.channels.modLogs) ||
        (await getGuildChannelCached(member.guild, IDs.channels.modLogs)) ||
        (await getClientChannelCached(member.client, IDs.channels.modLogs))
      : null;
    if (logChannel?.isTextBased?.()) {
      await logChannel
        .send({ embeds: [buildJoinGateTriggeredEmbed(member, reason)] })
        .catch(() => {});
    }
    return;
  }
  await kickForJoinGate(member, reason, extraLines, action);
}

module.exports = {
  name: "userUpdate",
  async execute(oldUser, newUser, client) {
    try {
      const resolvedClient = client || newUser?.client || oldUser?.client;
      if (!resolvedClient || !newUser?.id) return;

      const usernameChanged = oldUser?.username !== newUser?.username;
      const globalNameChanged = oldUser?.globalName !== newUser?.globalName;

      if (!newUser?.bot) {
        const oldClan = oldUser?.clan;
        const newClan = newUser?.clan;
        const oldClanGuild = String(oldClan?.identity_guild_id || oldClan?.identityGuildId || "");
        const newClanGuild = String(newClan?.identity_guild_id || newClan?.identityGuildId || "");
        const clanTagChanged = oldClan?.tag !== newClan?.tag;
        const clanGuildChanged = oldClanGuild !== newClanGuild;
        const clanPresenceChanged = Boolean(oldClan) !== Boolean(newClan);
        const clanChanged = clanTagChanged || clanGuildChanged || clanPresenceChanged;
        if (!usernameChanged && !globalNameChanged && !clanChanged) {
          await maybeThrottledClanTagSyncFromUserUpdate(newUser, resolvedClient);
          return;
        }

        if (clanChanged) {
          await syncClanTagRolesForUserEverywhere(resolvedClient, newUser, {
            userForClan: newUser,
            previousUserForClan: oldUser,
          });
        }

        const cfg = getJoinGateConfigSnapshot();
        if (
          !cfg?.enabled ||
          !cfg?.usernameFilter?.enabled ||
          !cfg?.usernameFilter?.postJoinEnabled
        ) {
          return;
        }
        const nameCandidate = getJoinGateNameCandidate({
          user: newUser,
          displayName: newUser.globalName || newUser.username,
        });
        const match = matchUsernameFilters(nameCandidate, cfg.usernameFilter);
        if (!match) return;
        for (const guild of resolvedClient.guilds.cache.values()) {
          const member =
            guild.members.cache.get(newUser.id) || (await getGuildMemberCached(guild, newUser.id));
          if (!member || member.user?.bot) continue;
          if (await resolveJoinGateConfiguredExempt(guild, newUser.id, member)) continue;
          if (shouldSkipRecentUserUpdateAction(guild.id, newUser.id, match)) continue;
          await punishUsernameMatchPostJoin(member, match, cfg);
        }
        return;
      }

      for (const guild of resolvedClient.guilds.cache.values()) {
        queueIdsCatalogSync(resolvedClient, guild.id, "botUserUpdate");
      }
    } catch (error) {
      global.logger?.error?.("[userUpdate] failed:", error);
    }
  },
};
const { queueIdsCatalogSync } = require("../../Config/idsAutoSync") as typeof import("../../Config/idsAutoSync");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getJoinGateConfigSnapshot } = require("../../Moderation/services/joinGateService") as typeof import("../../Moderation/services/joinGateService");
const { resolveJoinGateConfiguredExempt } = require("../../Moderation/services/joinGateExemptUtils") as typeof import("../../Moderation/services/joinGateExemptUtils");
const { kickForJoinGate, matchUsernameFilters, getJoinGateNameCandidate } = require("../../Community/events/guildMemberAdd") as typeof import("../../Community/events/guildMemberAdd");
const { syncClanTagRolesForUserEverywhere } = require("../../Community/services/clanTagRoleService") as typeof import("../../Community/services/clanTagRoleService");
const { syncPersistentAutoValutazioniForMember } = require("../../Staff/services/staffAutoValutazioniService") as typeof import("../../Staff/services/staffAutoValutazioniService");
const { guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const USER_UPDATE_DEDUPE_MS = 15_000;
const recentUserUpdateActions = new Map();
const CLAN_TAG_USER_UPDATE_THROTTLE_MS = 10_000;
const clanTagUserUpdateLastSync = new Map();

async function maybeThrottledClanTagSyncFromUserUpdate(newUser?, resolvedClient?) {
  if (!newUser?.id || newUser.bot) return;
  const uid = String(newUser.id);
  const now = Date.now();
  const last = Number(clanTagUserUpdateLastSync.get(uid) || 0);
  if (now - last < CLAN_TAG_USER_UPDATE_THROTTLE_MS) return;
  clanTagUserUpdateLastSync.set(uid, now);
  await syncClanTagRolesForUserEverywhere(resolvedClient, newUser, {});
}

function buildJoinGateTriggeredEmbed(member?, reason?) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${E.VC_User} ${member.user.username} ha attivato il join gate!`)
    .setDescription(
      [
        `${E.VC_Modifica} **Membro:** ${member.user.username} [\`${member.user.id}\`]`,
        `${E.VC_Modifica} **Motivo:** ${reason}`,
      ].join("\n"),
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || null);
}

function makeUserUpdateDedupeKey(guildId?, userId?, match?) {
  return [String(guildId || ""), String(userId || ""), String(match?.type || ""), String(match?.value || "")].join(":");
}

function shouldSkipRecentUserUpdateAction(guildId?, userId?, match?) {
  const key = makeUserUpdateDedupeKey(guildId, userId, match);
  const now = Date.now();
  const lastAt = Number(recentUserUpdateActions.get(key) || 0);
  if (now - lastAt < USER_UPDATE_DEDUPE_MS) return true;
  recentUserUpdateActions.set(key, now);
  return false;
}

async function punishUsernameMatchPostJoin(member?, match?, cfg?) {
  const reason = "Username matchato con il filtro post-join.";
  const extraLines = [
    `${E.VC_Modifica} **Regola:** Filtro username`,
    `${E.VC_Modifica} **Tipo di match:** ${match.type}`,
    `${E.VC_Modifica} **Match:** ${match.value}`,
  ];
  const action = String(cfg?.usernameFilter?.action || "kick").toLowerCase();
  if (action === "log") {
    const logChannel = IDs.channels.modLogs
      ? member.guild.channels.cache.get(IDs.channels.modLogs) ||
        (await getGuildChannelCached(member.guild, IDs.channels.modLogs))
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

export = {
  name: "userUpdate",
  async execute(oldUser?, newUser?, client?) {
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
          const guild = resolvedClient.guilds.cache.get(String(IDs.guilds?.main || ""));
          const member = guild
            ? guild.members.cache.get(newUser.id) || (await getGuildMemberCached(guild, newUser.id))
            : null;
          if (member) {
            await syncPersistentAutoValutazioniForMember(member).catch((err?) => {
              global.logger?.warn?.("[userUpdate] staff auto valutazioni sync:", newUser.id, err?.message || err);
            });
          }
          return;
        }

        if (clanChanged) {
          await syncClanTagRolesForUserEverywhere(resolvedClient, newUser, {
            userForClan: newUser,
            previousUserForClan: oldUser,
          });
          const guild = resolvedClient.guilds.cache.get(String(IDs.guilds?.main || ""));
          const member = guild
            ? guild.members.cache.get(newUser.id) || (await getGuildMemberCached(guild, newUser.id))
            : null;
          if (member) {
            await syncPersistentAutoValutazioniForMember(member).catch((err?) => {
              global.logger?.warn?.("[userUpdate] staff auto valutazioni sync:", newUser.id, err?.message || err);
            });
          }
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

      const mainGuildId = String(IDs.guilds?.main || "").trim();
      if (mainGuildId) {
        queueIdsCatalogSync(resolvedClient, mainGuildId, "botUserUpdate");
      }
    } catch (error) {
      global.logger?.error?.("[userUpdate] failed:", error);
    }
  },
};
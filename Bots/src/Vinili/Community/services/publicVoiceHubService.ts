const { ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { queueCategoryRenumber } = require("./communityOpsService") as typeof import("./communityOpsService");
const { buildRecoveryVoiceState } = require("../../../shared/discord/voiceStateRecovery") as typeof import("../../../shared/discord/voiceStateRecovery");
const { MIN_SUFFIX_DIGITS, getGameVoiceHubCategoryId, isGameVoiceHubsEnabled, isGameVoiceHubChannel, getHubChannelIds, getPublicVoiceHubCategoryId, isPublicVoiceHubId, stripVoiceSuffix, parseVoiceSuffixIndex, toSuperscriptNumber, isHubCreateDisabledForChannel, resolveHubGroupKey, resolveHubSpawnBaseName, isHubGroupSpawnChannel, botCanManageVoiceHubs } = require("./voiceHubConfig") as typeof import("./voiceHubConfig");
const { placeSpawnAfterHubGroupTail, listHubGroupChannels, nextSpawnSuffixIndex, refreshParentChannelsCache, verifyHubGroupChannelOrder, reorderLimitateCategory, pauseMs, realignPublicVoiceHubGroupsOnStartup } = require("./voiceHubOrder") as typeof import("./voiceHubOrder");
const { ensureSpawnedChannelMemberTextAccess, buildSpawnPermissionOverwrites, ensureHubLobbySpeakDenied } = require("./voiceHubPerms") as typeof import("./voiceHubPerms");
const { rememberSpawnedChannel, isSpawnedHubChannel, countHumanMembersResolved, memberStillInVoiceChannel, isUserDisconnectedVoiceError, resolveGuildMemberVoiceState, cleanupUnusedSpawnedChannel, scheduleSpawnedChannelDelete, handlePublicVoiceHubEmpty, sweepEmptySpawnedHubChannels } = require("./voiceHubMembers") as typeof import("./voiceHubMembers");


const userCreateLocks = new Set();
const hubCreateLocks = new Map();
async function ensurePublicVoiceHubChannelsOnReady(client?) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return;
  for (const hubId of getHubChannelIds(client, guild)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    // Gaming hub: permessi già a posto, non forzare speak-deny da duo.
    if (isGameVoiceHubChannel(hub, client)) continue;
    await ensureHubLobbySpeakDenied(hub, guild);
  }
}

async function recoverPublicVoiceHubOnStartup(client?) {
  if (
    client?.config?.publicVoiceHubs?.enabled === false &&
    client?.config?.gameVoiceHubs?.enabled === false
  ) {
    return { lobbies: 0, spawned: 0 };
  }
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { lobbies: 0, spawned: 0 };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return { lobbies: 0, spawned: 0 };

  await guild.channels.fetch().catch(() => null);
  await guild.members.fetch({ withPresences: false }).catch(() => null);

  let spawned = 0;
  let lobbies = 0;

  for (const hubId of getHubChannelIds(client, guild)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;

    for (const ch of listHubGroupChannels(guild, hub, client)) {
      if (!isHubGroupSpawnChannel(ch, hub, client)) continue;
      rememberSpawnedChannel(ch.id, hubId);
      await ensureSpawnedChannelMemberTextAccess(ch, guild);
      spawned += 1;
      if ((await countHumanMembersResolved(ch)) === 0) {
        scheduleSpawnedChannelDelete(ch, client);
      }
    }

        const lobbyUserIds = [
      ...new Set(
        [...guild.voiceStates.cache.values()]
          .filter((vs?) => String(vs.channelId || "") === String(hubId))
          .map((vs?) => String(vs.id || "").trim())
          .filter(Boolean),
      ),
    ];
    for (const userId of lobbyUserIds) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || member.user?.bot) continue;
      const oldState = buildRecoveryVoiceState(guild, member, null);
      const newState = buildRecoveryVoiceState(guild, member, hubId);
      await handlePublicVoiceHubJoin(oldState, newState, client);
      lobbies += 1;
    }
  }

  return { lobbies, spawned };
}

function startPublicVoiceHubSetup(client?) {
  setImmediate(() => {
    (async () => {
      await ensurePublicVoiceHubChannelsOnReady(client).catch((err?) =>
        global.logger?.warn?.("[publicVoiceHub] hub permission sync failed:", err?.message || err),
      );
      await recoverPublicVoiceHubOnStartup(client).catch((err?) =>
        global.logger?.warn?.("[publicVoiceHub] lobby recovery failed:", err?.message || err),
      );
      await realignPublicVoiceHubGroupsOnStartup(client).catch((err?) =>
        global.logger?.warn?.("[publicVoiceHub] realign failed:", err?.message || err),
      );
      await sweepEmptySpawnedHubChannels(client).catch((err?) =>
        global.logger?.warn?.("[publicVoiceHub] empty sweep failed:", err?.message || err),
      );
    })();
  });

  if (!client.__publicVoiceHubEmptySweep) {
    client.__publicVoiceHubEmptySweep = setInterval(() => {
      sweepEmptySpawnedHubChannels(client).catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] empty sweep failed:", err?.message || err);
      });
    }, 60_000);
    client.__publicVoiceHubEmptySweep.unref?.();
  }
}

async function withHubCreateLock(hubId?, fn?) {
  const key = String(hubId || "");
  if (!key) return fn();
  while (hubCreateLocks.has(key)) {
    await hubCreateLocks.get(key).catch(() => {});
  }
  const job = Promise.resolve().then(fn).finally(() => {
    if (hubCreateLocks.get(key) === job) hubCreateLocks.delete(key);
  });
  hubCreateLocks.set(key, job);
  return job;
}

function scheduleHubSpawnFollowUp(guild?, client?, hubChannel?, createdChannelId?) {
  const guildId = String(guild?.id || "");
  const hubId = String(hubChannel?.id || "");
  const channelId = String(createdChannelId || "");
  if (!guildId || !hubId) return;
  setImmediate(() => {
    (async () => {
      const liveGuild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (!liveGuild) return;
      const hub = liveGuild.channels.cache.get(hubId) || (await liveGuild.channels.fetch(hubId).catch(() => null));
      if (!hub) return;
      const created =
        liveGuild.channels.cache.get(channelId) ||
        (channelId ? await liveGuild.channels.fetch(channelId).catch(() => null) : null);
      if (created) {
        await ensureSpawnedChannelMemberTextAccess(created, liveGuild).catch(() => null);
      }
      await reorderLimitateCategory(liveGuild, client, {
        parentId: getPublicVoiceHubCategoryId(client, hub) || hub.parentId,
        forceFetch: true,
      }).catch(() => null);
      queueCategoryRenumber(client, liveGuild.id, 5000);
    })().catch((err?) => {
      global.logger?.warn?.("[publicVoiceHub] deferred follow-up failed:", err?.message || err);
    });
  });
}

async function handlePublicVoiceHubJoin(oldState?, newState?, client?) {
  const joinedId = String(newState.channelId || "");
  if (!joinedId) return;

  const guild = newState.guild;
  if (!guild) return;
  const uid = String(newState.id || newState.member?.id || "").trim();
  if (!uid) return;

  let member = newState.member || guild.members.cache.get(uid) || null;
  if (!member) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  const hub =
    newState.channel ||
    guild.channels.cache.get(joinedId) ||
    (await guild.channels.fetch(joinedId).catch(() => null));
  if (!member || member.user?.bot || !hub?.isVoiceBased?.()) return;

  const isGameHub = isGameVoiceHubChannel(hub, client);
  if (isGameHub) {
    if (!isGameVoiceHubsEnabled(client)) return;
  } else if (!isPublicVoiceHubId(joinedId, client, guild)) {
    return;
  } else if (client?.config?.publicVoiceHubs?.enabled === false) {
    return;
  }

  if (isHubCreateDisabledForChannel(hub, client)) return;
  if (!(await botCanManageVoiceHubs(guild))) {
    global.logger?.warn?.("[publicVoiceHub] bot missing ManageChannels/MoveMembers");
    return;
  }

  if (userCreateLocks.has(uid)) return;
  userCreateLocks.add(uid);

  try {
    await withHubCreateLock(joinedId, async () => {
      // Fast path: niente force-fetch prima del create (rallentava e abortiva penta–octa).
      const spawnParentId = getPublicVoiceHubCategoryId(client, hub);
      await refreshParentChannelsCache(guild, spawnParentId || hub.parentId, client, { force: false });
      const freshHub = guild.channels.cache.get(joinedId) || hub;
      const groupKey = resolveHubGroupKey(freshHub, client);
      const group = listHubGroupChannels(guild, freshHub, client);
      const nextIndex = nextSpawnSuffixIndex(group, joinedId);
      const spawnName = `${resolveHubSpawnBaseName(freshHub)}${toSuperscriptNumber(nextIndex, MIN_SUFFIX_DIGITS)}`;

      if (!memberStillInVoiceChannel(member, joinedId, guild)) {
        return;
      }

      // Gaming: hub limit 1 (lobby); spawn illimitato. Duo/trio: copia limit hub.
      const spawnUserLimit = isGameVoiceHubChannel(freshHub, client)
        ? Math.max(0, Number(client?.config?.gameVoiceHubs?.spawnUserLimit ?? 0) || 0)
        : Math.max(0, Number(freshHub.userLimit) || 0);

      const createOptions = {
        name: spawnName,
        type: ChannelType.GuildVoice,
        parent: spawnParentId || freshHub.parentId || undefined,
        userLimit: spawnUserLimit,
        bitrate: freshHub.bitrate || undefined,
        rtcRegion: freshHub.rtcRegion || undefined,
        permissionOverwrites: buildSpawnPermissionOverwrites(freshHub, guild),
        reason: `Vocale hub ${freshHub.name}`,
      };
      /* hubSpawnUnderHub3: NON passare position in create — Discord la tratta come slot
         e spesso inserisce SOPRA l'hub; placeSpawnAfterHubGroupTail sistema sotto. */

      const created = await guild.channels.create(createOptions).catch((err?) => {
        global.logger?.warn?.(
          "[publicVoiceHub] create failed:",
          freshHub?.name || joinedId,
          groupKey,
          err?.message || err,
        );
        return null;
      });
      if (!created) return;

      rememberSpawnedChannel(created.id, joinedId);

      // Muovi subito l'utente; posizione/reorder subito dopo (sync).
      let freshMember = await resolveGuildMemberVoiceState(guild, member, uid);
      if (!memberStillInVoiceChannel(freshMember, joinedId, guild)) {
        // Se già finito nello spawn (race), ok; altrimenti cleanup.
        if (!memberStillInVoiceChannel(freshMember, created.id, guild)) {
          await cleanupUnusedSpawnedChannel(created, "Utente non più in lobby hub");
          return;
        }
      } else {
        let moved = false;
        for (let attempt = 0; attempt < 2 && !moved; attempt += 1) {
          freshMember = await resolveGuildMemberVoiceState(guild, freshMember || member, uid);
          if (!memberStillInVoiceChannel(freshMember, joinedId, guild)) break;
          moved = await freshMember.voice
            .setChannel(created)
            .then(() => true)
            .catch((err?) => {
              if (!isUserDisconnectedVoiceError(err)) {
                global.logger?.warn?.(
                  "[publicVoiceHub] move failed:",
                  freshHub?.name || joinedId,
                  attempt,
                  err?.message || err,
                );
              }
              return false;
            });
          if (!moved) await pauseMs(200);
        }
        if (!moved && !memberStillInVoiceChannel(freshMember, created.id, guild)) {
          await cleanupUnusedSpawnedChannel(created, "Move utente fallito");
          return;
        }
      }

      /* hubSpawnUnderHub3: solo place sotto coda gruppo + reorder categoria voice-only.
         applyHubSpawnCreatePosition(position pre-create) riposizionava con raw stale → SOPRA l'hub. */
      await placeSpawnAfterHubGroupTail(
        created,
        freshHub,
        guild,
        client,
        `Vocale hub ${freshHub.name} spawn ${spawnName}`,
      ).catch(() => null);
      await reorderLimitateCategory(guild, client, {
        parentId: spawnParentId || freshHub.parentId,
        forceFetch: true,
        quick: false,
      }).catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] sync reorder failed:", err?.message || err);
      });

      const verify = verifyHubGroupChannelOrder(guild, freshHub, client);
      if (!verify.ok) {
        global.logger?.warn?.(
          "[publicVoiceHub] spawn still misplaced after sync reorder:",
          spawnName,
          verify.misplaced?.map((row?) => `${row.name}@${row.idx}->${row.expectedIdx}`).join("; "),
        );
        await placeSpawnAfterHubGroupTail(created, freshHub, guild, client, "hub spawn retry under group").catch(
          () => null,
        );
        await reorderLimitateCategory(guild, client, {
          parentId: spawnParentId || freshHub.parentId,
          forceFetch: true,
        }).catch(() => null);
      }

      scheduleHubSpawnFollowUp(guild, client, freshHub, created.id);
    });
  } finally {
    userCreateLocks.delete(uid);
  }
}

export = {
  getHubChannelIds,
  getGameVoiceHubCategoryId,
  isGameVoiceHubChannel,
  isGameVoiceHubsEnabled,
  getPublicVoiceHubCategoryId,
  isPublicVoiceHubId,
  isSpawnedHubChannel,
  stripVoiceSuffix,
  resolveHubGroupKey,
  isHubGroupSpawnChannel,
  parseVoiceSuffixIndex,
  toSuperscriptNumber,
  handlePublicVoiceHubJoin,
  handlePublicVoiceHubEmpty,
  startPublicVoiceHubSetup,
  reorderLimitateCategory,
  refreshParentChannelsCache,
  verifyHubGroupChannelOrder,
};
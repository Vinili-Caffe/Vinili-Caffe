const assert = require("assert");
const { ChannelType, PermissionsBitField, OverwriteType } = require("discord.js");
const IDs = require("../Vinyls/Utils/Config/ids");
const {
  resolveInsertSlot,
  stripVoiceSuffix,
  voiceHubGroupKey,
  ensureHubGroupChannelOrder,
  buildSpawnPermissionOverwrites,
  hubLobbyRoleIds,
  refreshParentChannelsCache,
} = require("../Vinyls/Services/Voice/publicVoiceHubService");

async function run() {
  const HUB_IDS = new Set(["hub-duo", "hub-trio", "hub-quad"]);
  const client = {
    config: {
      publicVoiceHubs: {
        channelIds: [...HUB_IDS],
      },
    },
  };

  function voice(id, name, rawPosition, parentId = "cat", overwrites = [], extra = {}) {
    const map = new Map(
      overwrites.map((ow) => [
        String(ow.id),
        {
          id: String(ow.id),
          type: ow.type ?? OverwriteType.Role,
          allow: new PermissionsBitField(ow.allow ?? 0n),
          deny: new PermissionsBitField(ow.deny ?? 0n),
        },
      ]),
    );
    return {
      id,
      name,
      type: ChannelType.GuildVoice,
      rawPosition,
      parentId,
      manageable: true,
      permissionOverwrites: { cache: map },
      setPosition: extra.setPosition || (async () => {}),
    };
  }

  function guildWithChannels(channels) {
    const map = new Map(channels.map((ch) => [ch.id, ch]));
    const everyoneId = "everyone";
    const memberId = String(IDs.roles?.Member || "member");
    return {
      roles: {
        everyone: { id: everyoneId },
      },
      members: {
        me: {
          permissions: {
            has: (perm) =>
              perm === (PermissionsBitField.Flags.ManageChannels | PermissionsBitField.Flags.MoveMembers),
          },
        },
      },
      channels: {
        cache: map,
        fetch: async () => map,
      },
      _memberRoleId: memberId,
    };
  }

  const duoHub = voice("hub-duo", "༄ 🍧 ‧ duo", 5, "cat");
  const trioHub = voice("hub-trio", "༄ 🍉 ‧ trio", 15, "cat");
  const quadHub = voice("hub-quad", "༄ 🥥 ‧ quad", 25, "cat");

  assert.strictEqual(
    resolveInsertSlot(duoHub, guildWithChannels([duoHub, trioHub, quadHub]), client),
    15,
    "spawn duo deve prendere la posizione di trio, non hub+1 con gap",
  );

  assert.strictEqual(
    resolveInsertSlot(duoHub, guildWithChannels([duoHub, quadHub]), client),
    25,
    "cache parziale senza trio punta a quad (motivo dello spawn fuori posto)",
  );

  const duoSpawn = voice("spawn-1", `${stripVoiceSuffix(duoHub.name)}⁰¹`, 12, "cat");
  assert.strictEqual(
    resolveInsertSlot(duoHub, guildWithChannels([duoHub, duoSpawn, trioHub, quadHub]), client),
    15,
    "secondo spawn duo resta prima di trio",
  );

  assert.strictEqual(
    resolveInsertSlot(quadHub, guildWithChannels([duoHub, trioHub, quadHub]), client),
    26,
    "spawn quad va in fondo al gruppo",
  );

  const memberId = String(IDs.roles?.Member || "");
  const hubWithDeny = voice("hub-duo", "༄ 🍧 ‧ duo", 5, "cat", [
    {
      id: memberId,
      allow: PermissionsBitField.Flags.Connect | PermissionsBitField.Flags.ViewChannel,
      deny: PermissionsBitField.Flags.Speak,
    },
  ]);
  const guild = guildWithChannels([hubWithDeny]);
  const spawnOverwrites = buildSpawnPermissionOverwrites(hubWithDeny, guild);
  const memberOw = spawnOverwrites.find((ow) => String(ow.id) === memberId);
  assert.ok(memberOw, "overwrite member presente nello spawn");
  const allow = new PermissionsBitField(memberOw.allow);
  const deny = new PermissionsBitField(memberOw.deny);
  assert.ok(allow.has(PermissionsBitField.Flags.Speak), "spawn deve permettere Speak");
  assert.ok(!deny.has(PermissionsBitField.Flags.Speak), "spawn non deve negare Speak");

  const lobbyRoles = hubLobbyRoleIds(guild);
  assert.ok(lobbyRoles.includes("everyone"), "everyone nei ruoli lobby");
  if (memberId) assert.ok(lobbyRoles.includes(memberId), "member nei ruoli lobby");

  let fetchedAll = false;
  const refreshGuild = {
    roles: { everyone: { id: "everyone" } },
    channels: {
      cache: new Map([
        [duoHub.id, duoHub],
        [quadHub.id, quadHub],
        [trioHub.id, trioHub],
      ]),
      fetch: async () => {
        fetchedAll = true;
        return refreshGuild.channels.cache;
      },
    },
  };
  refreshGuild.channels.cache.delete(trioHub.id);
  refreshGuild.channels.cache.delete(quadHub.id);
  await refreshParentChannelsCache(refreshGuild, "cat", client);
  assert.ok(fetchedAll, "refresh ricarica la categoria se mancano hub in cache");

  assert.strictEqual(voiceHubGroupKey("🔊 ༄🍧 ' duo⁰¹"), "duo", "voiceHubGroupKey riconosce duo");

  let positionUpdates = null;
  const duoSpawnWrong = voice("spawn-1", `${stripVoiceSuffix(duoHub.name)}⁰¹`, 20, "cat");
  const realignGuild = guildWithChannels([duoHub, trioHub, duoSpawnWrong, quadHub]);
  realignGuild.channels.fetch = async () => realignGuild.channels.cache;
  realignGuild.channels.setPositions = async (updates) => {
    positionUpdates = updates;
    for (const row of updates) {
      const ch = realignGuild.channels.cache.get(row.channel);
      if (ch) ch.rawPosition = row.position;
    }
  };
  await ensureHubGroupChannelOrder(realignGuild, duoHub, client, { forceFetch: true });
  assert.ok(Array.isArray(positionUpdates) && positionUpdates.length >= 1, "realign usa setPositions bulk");
  const spawnUpdate = positionUpdates.find((row) => String(row.channel) === "spawn-1");
  assert.strictEqual(spawnUpdate?.position, 6, "realign compatta posizioni: duo spawn subito dopo duo");
  const afterOrder = [...realignGuild.channels.cache.values()]
    .filter((ch) => String(ch.parentId) === "cat")
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((ch) => ch.id);
  assert.deepStrictEqual(afterOrder, ["hub-duo", "spawn-1", "hub-trio", "hub-quad"], "ordine finale duo spawn subito dopo duo");

  const duoSpawnDupPos = voice("spawn-dup", `${stripVoiceSuffix(duoHub.name)}⁰¹`, 15, "cat");
  const trioDupPos = voice("hub-trio-dup", "༄ 🍉 ‧ trio", 15, "cat");
  const quadDup = voice("hub-quad-dup", "༄ 🥥 ‧ quad", 25, "cat");
  const duoHubDup = voice("hub-duo-dup", "༄ 🍧 ‧ duo", 5, "cat");
  const dupGuild = guildWithChannels([duoHubDup, trioDupPos, duoSpawnDupPos, quadDup]);
  dupGuild.channels.fetch = async () => dupGuild.channels.cache;
  dupGuild.channels.setPositions = async (updates) => {
    for (const row of updates) {
      const ch = dupGuild.channels.cache.get(row.channel);
      if (ch) ch.rawPosition = row.position;
    }
  };
  await ensureHubGroupChannelOrder(dupGuild, duoHubDup, client, { forceFetch: true });
  const dupOrder = [...dupGuild.channels.cache.values()]
    .filter((ch) => String(ch.parentId) === "cat")
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((ch) => ch.id);
  assert.deepStrictEqual(dupOrder, ["hub-duo-dup", "spawn-dup", "hub-trio-dup", "hub-quad-dup"], "realign con posizioni duplicate");

  console.log("PUBLIC_VOICE_HUB_TEST_OK");
}

module.exports = run;

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
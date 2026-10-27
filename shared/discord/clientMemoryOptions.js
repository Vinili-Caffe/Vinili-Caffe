/**
 * Opzioni memoria discord.js condivise (Vinyls + Coffee).
 * Sweepers limitano crescita cache gateway; non usare Object.values(intents).
 */
function buildDiscordClientMemoryOptions(discord) {
  const Options = discord?.Options;
  if (!Options?.CacheWithLimits || !Options?.DefaultMakeCacheSettings) {
    return {};
  }
  const sweepers = Options.DefaultSweeperSettings
    ? {
        ...Options.DefaultSweeperSettings,
        messages: {
          interval: 300,
          lifetime: 180,
        },
        users: {
          interval: 3600,
          filter: () => (user) => user?.bot === true && user?.id !== user?.client?.user?.id,
        },
      }
    : {
        messages: { interval: 300, lifetime: 180 },
      };

  return {
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 50,
      PresenceManager: 0,
      ReactionManager: 0,
      GuildEmojiManager: 50,
      GuildStickerManager: 20,
      StageInstanceManager: 5,
      ThreadManager: 25,
      ThreadMemberManager: 10,
      VoiceStateManager: 100,
    }),
    sweepers,
  };
}

function resolveGatewayIntents(discord, { includePresences = true } = {}) {
  const GatewayIntentBits = discord.GatewayIntentBits || discord.IntentsBitField?.Flags || {};
  const pick = (...keys) =>
    keys
      .map((k) => GatewayIntentBits[k])
      .filter((x) => typeof x === "number" && x > 0);

  const list = pick(
    "Guilds",
    "GuildMembers",
    "GuildModeration",
    "GuildEmojisAndStickers",
    "GuildInvites",
    "GuildVoiceStates",
    "GuildMessages",
    "GuildMessageReactions",
    "DirectMessages",
    "DirectMessageReactions",
    "MessageContent",
    "GuildScheduledEvents",
    "AutoModerationConfiguration",
    "AutoModerationExecution",
    "GuildMessagePolls",
  );
  if (includePresences) {
    const p = GatewayIntentBits.GuildPresences;
    if (typeof p === "number" && p > 0) list.push(p);
  }
  const uniq = [...new Set(list)];
  return uniq.length ? uniq : [1];
}

function resolveGatewayPartials(discord) {
  const Partials = discord.Partials || {};
  const pick = (...keys) =>
    keys.map((k) => Partials[k]).filter((x) => typeof x === "number");
  const list = pick("Channel", "Message", "Reaction", "User", "GuildMember");
  return [...new Set(list)];
}

module.exports = {
  buildDiscordClientMemoryOptions,
  resolveGatewayIntents,
  resolveGatewayPartials,
};

/** Trova il bot: bottone nascosto in un canale testuale o bot in un canale vocale. */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { isVoiceChannelEligibleForFindBotMinigame } = require("../../Utils/Minigames/findBotVoiceChannelEligibility") as typeof import("../../Utils/Minigames/findBotVoiceChannelEligibility");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { buildPromptImageAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildFindBotEmbed, buildFindBotButtonEmbed, buildFindBotVoiceEmbed, buildWinEmbed, buildTimeoutFindBotEmbed, buildTimeoutFindBotVoiceEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { getChannelCached, pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeRewardExp } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, clearNoParticipationDelay, clearActiveGame, beginMinigameWinClose, endMinigameWinClose } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { handleExpReward, mergeHalloweenCandyDropIntoMessage, awardMinigameWinToUser } = require("./minigameRewards") as typeof import("./minigameRewards");
const { markSent, saveActiveGame, deleteFindMinigameRemoteMessage, sendMinigameTimeoutAndClose, scheduleMinuteHint, findBotVoiceSessionByGuild, leaveFindBotVoiceChannel } = require("./minigameRound") as typeof import("./minigameRound");
const { getConfig } = require("./minigameConfig") as typeof import("./minigameConfig");

async function finalizeFindMinigameTimeout(client?, cfg?, mainChannelId?, mainChannel?, game?, buildTimeoutEmbed?) {
  if (!game) return;
  if (game.type === "findBotVoice") {
    await leaveFindBotVoiceChannel(mainChannel?.guild?.id);
  } else {
    await deleteFindMinigameRemoteMessage(mainChannel?.guild, game);
  }
  await sendMinigameTimeoutAndClose(client, cfg, mainChannelId, mainChannel, game, buildTimeoutEmbed());
}

function scheduleFindMinigameTimeout(client?, cfg?, mainChannelId?, mainChannel?, customId?, durationMs?, buildTimeoutEmbed?) {
  const timer = setTimeout(async () => {
    const game = activeGames.get(mainChannelId);
    if (!game || game.customId !== customId) return;
    await finalizeFindMinigameTimeout(client, cfg, mainChannelId, mainChannel, game, buildTimeoutEmbed);
  }, durationMs);
  timer.unref?.();
  return timer;
}

async function pickRandomFindBotChannel(guild?, requiredRoleId?, excludeChannelId = null, excludedChannelIds = null) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => {});
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const roleToCheck = requiredRoleId ? guild.roles.cache.get(requiredRoleId) : guild.roles.everyone;
  const excludedSet = new Set(
    [excludeChannelId].filter(Boolean).concat(Array.isArray(excludedChannelIds) ? excludedChannelIds.filter((id?) => id != null && String(id).trim()) : []),
  );

  const channels = guild.channels.cache.filter((channel?) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (excludedSet.has(channel.id)) return false;
    if (!channel.viewable) return false;
    if (me && !me.permissions?.has(PermissionsBitField.Flags.Administrator) && !channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
    const memberPerms = channel.permissionsFor(roleToCheck);
    if (!memberPerms?.has(PermissionsBitField.Flags.ViewChannel)) return false;
    return true;
  });

  const list = Array.from(channels.values());
  return pickRandomItem(list);
}

function countHumanMembersInVoiceChannel(channel?, botUserId = "") {
  if (!channel?.members) return 0;
  const botId = String(botUserId || "");
  return channel.members.filter((member?) => !member.user?.bot && String(member.id) !== botId).size;
}

function guildVoiceBusyForFindBotMinigame(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || findBotVoiceSessionByGuild.has(gid)) return false;
  try {
    const { getVoiceConnection, VoiceConnectionStatus } = require("@discordjs/voice") as typeof import("@discordjs/voice");
    const conn = getVoiceConnection(gid);
    return Boolean(conn && conn.state?.status !== VoiceConnectionStatus.Destroyed);
  } catch {
    return false;
  }
}

function hasFindBotVoiceSession(guildId?, channelId = "") {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  const session = findBotVoiceSessionByGuild.get(gid);
  if (!session) return false;
  const cid = String(channelId || "").trim();
  if (!cid) return true;
  return String(session.channelId || "") === cid;
}

async function joinFindBotVoiceChannel(guild?, voiceChannel?) {
  const gid = String(guild?.id || "").trim();
  if (!gid || !voiceChannel?.id) return false;
  const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require("@discordjs/voice") as typeof import("@discordjs/voice");
  await leaveFindBotVoiceChannel(gid);
  const liveGuild = guild?.voiceAdapterCreator ? guild : await guild.fetch().catch(() => guild);
  if (!liveGuild?.voiceAdapterCreator) return false;
  const channelId = String(voiceChannel.id);
  /* Pending PRIMA di join: voiceStateUpdate “bot solo in VC” altrimenti chiama leaveTtsGuild e butta fuori il minigame. */
  findBotVoiceSessionByGuild.set(gid, {
    channelId,
    connection: null,
    pending: true,
  });
  try {
    const connection = joinVoiceChannel({
      channelId,
      guildId: gid,
      adapterCreator: liveGuild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    findBotVoiceSessionByGuild.set(gid, {
      channelId,
      connection,
    });
    return true;
  } catch (err) {
    warnMinigame(err);
    await leaveFindBotVoiceChannel(gid);
    return false;
  }
}

async function pickRandomEmptyVoiceChannel(guild?, requiredRoleId?, excludedChannelIds = null) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => {});
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const botUserId = String(me?.id || guild.client?.user?.id || "");
  const roleToCheck = requiredRoleId ? guild.roles.cache.get(requiredRoleId) : guild.roles.everyone;
  const client = guild.client;

  const channels = guild.channels.cache.filter((channel?) => {
    if (channel.type !== ChannelType.GuildVoice) return false;
    if (!isVoiceChannelEligibleForFindBotMinigame(channel, client, excludedChannelIds)) return false;
    if (!channel.viewable) return false;
    if (countHumanMembersInVoiceChannel(channel, botUserId) > 0) return false;
    const otherBots = channel.members?.filter((member?) => member.user?.bot && String(member.id) !== botUserId).size || 0;
    if (otherBots > 0) return false;
    if (
      me &&
      !me.permissions?.has(PermissionsBitField.Flags.Administrator) &&
      !channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect])
    ) {
      return false;
    }
    const memberPerms = channel.permissionsFor(roleToCheck);
    if (!memberPerms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect])) return false;
    return true;
  });

  const list = Array.from(channels.values());
  return pickRandomItem(list);
}

function resolveFindBotVoiceBotChannelId(guild?, game?) {
  const session = findBotVoiceSessionByGuild.get(String(guild?.id || "").trim());
  const fromSession = String(session?.channelId || "").trim();
  const fromGame = String(game?.channelId || game?.voiceChannelId || "").trim();
  const me = guild?.members?.me;
  const fromVoice = String(me?.voice?.channelId || "").trim();
  return fromVoice || fromSession || fromGame;
}

function syncFindBotVoiceTargetChannel(guild?, game?, channelId?) {
  const nextId = String(channelId || "").trim();
  if (!game || !nextId) return;
  const prevId = String(game.channelId || game.voiceChannelId || "").trim();
  if (prevId === nextId) return;
  game.channelId = nextId;
  game.voiceChannelId = nextId;
  const gid = String(guild?.id || "").trim();
  const session = findBotVoiceSessionByGuild.get(gid);
  if (session) session.channelId = nextId;
}

function getActiveFindBotVoiceGame(client?) {
  const cfg = getConfig(client);
  const mainChannelId = String(cfg?.channelId || "").trim();
  if (!mainChannelId) return null;
  const game = activeGames.get(mainChannelId);
  if (!game || game.type !== "findBotVoice") return null;
  return { cfg, game, mainChannelId };
}

function shouldDeferTtsLeaveForFindBotVoiceMinigame(client?, guildId?, channelId?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  /* Sessione pending/ready: copre la race join → empty-VC leave prima di activeGames.set */
  if (hasFindBotVoiceSession(gid, cid)) return true;
  const active = getActiveFindBotVoiceGame(client);
  if (!active) return false;
  if (String(active.game.guildId || "") !== gid) return false;
  const guild = client?.guilds?.cache?.get(gid) || null;
  const botVoiceId = guild
    ? resolveFindBotVoiceBotChannelId(guild, active.game)
    : String(active.game.channelId || active.game.voiceChannelId || "");
  if (!cid) return Boolean(botVoiceId);
  return String(botVoiceId || "") === cid;
}

async function startFindBotGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const durationMs = Math.max(60000, Number(cfg?.findBot?.durationMs || 300000));
  const rewardExp = normalizeRewardExp(cfg?.findBot?.rewardExp ?? 100);
  const requiredRoleId = cfg?.findBot?.requiredRoleId || null;
  const excludedChannelIds = cfg?.findBot?.excludedChannelIds || null;

  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel?.guild) return false;

  let targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, channelId, excludedChannelIds);
  if (!targetChannel) {
    targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, null, excludedChannelIds);
  }
  if (!targetChannel) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(mainChannel, cfg, roleId);

  const findBotAttachment = buildPromptImageAttachment("Trova il bot", ["Cerca il messaggio nascosto in un canale del server.", "Clicca il pulsante quando lo trovi!"], "find_bot", "", client);
  const findBotEmbed = buildFindBotEmbed(rewardExp, durationMs);
  if (findBotAttachment) findBotEmbed.setImage(`attachment://${findBotAttachment.name}`);
  const mainMessage = await sendMinigameMessage(mainChannel, { embeds: [findBotEmbed], files: findBotAttachment ? [findBotAttachment] : [], }).catch(() => null);

  const customId = `minigame_findbot:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setEmoji(`<a:VC_Heart:1448672728822448141>`).setLabel("Clicca qui per vincere!").setStyle(ButtonStyle.Primary),);
  const gameMessage = await sendMinigameMessage(targetChannel, { embeds: [buildFindBotButtonEmbed(rewardExp, durationMs)], components: [row] }).catch((err?) => {
    global.logger?.error?.("[MINIGAMES] FindBot: send to target channel failed", { channelId: targetChannel.id, channelName: targetChannel.name, err: err?.message || err });
    return null;
  });
  if (!gameMessage) return false;

  const timeout = scheduleFindMinigameTimeout(client, cfg, channelId, mainChannel, customId, durationMs, buildTimeoutFindBotEmbed);
  const hintTimeout = await scheduleMinuteHint(client, targetChannel.id, durationMs, channelId,);

  activeGames.set(channelId, {
    type: "findBot",
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetChannel.id,
    messageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  await saveActiveGame(client, cfg, {
    type: "findBot",
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetChannel.id,
    gameMessageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  markSent(channelId);

  return true;
}

async function startFindBotVoiceGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const durationMs = Math.max(60000, Number(cfg?.findBotVoice?.durationMs || cfg?.findBot?.durationMs || 300000));
  const rewardExp = normalizeRewardExp(cfg?.findBotVoice?.rewardExp ?? cfg?.findBot?.rewardExp ?? 100);
  const requiredRoleId = cfg?.findBotVoice?.requiredRoleId || cfg?.findBot?.requiredRoleId || null;
  const excludedChannelIds = cfg?.findBotVoice?.excludedChannelIds || cfg?.findBot?.excludedChannelIds || null;

  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel?.guild) return false;
  const guildId = String(mainChannel.guild.id || "");
  if (guildVoiceBusyForFindBotMinigame(guildId)) return false;

  const targetVoice = await pickRandomEmptyVoiceChannel(mainChannel.guild, requiredRoleId, excludedChannelIds);
  if (!targetVoice) return false;

  const joined = await joinFindBotVoiceChannel(mainChannel.guild, targetVoice);
  if (!joined) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(mainChannel, cfg, roleId);

  const attachment = buildPromptImageAttachment(
    "Trova il bot in vocale",
    ["Il bot si è nascosto in una vocale vuota del server.", "Entra in quella vocale per vincere!"],
    "find_bot",
    "",
    client,
  );
  const introEmbed = buildFindBotVoiceEmbed(rewardExp, durationMs);
  if (attachment) introEmbed.setImage(`attachment://${attachment.name}`);
  const mainMessage = await sendMinigameMessage(mainChannel, {
    embeds: [introEmbed],
    files: attachment ? [attachment] : [],
  }).catch(() => null);

  const customId = `minigame_findbotvoice:${Date.now()}`;
  const timeout = scheduleFindMinigameTimeout(
    client,
    cfg,
    channelId,
    mainChannel,
    customId,
    durationMs,
    buildTimeoutFindBotVoiceEmbed,
  );
  const hintTimeout = await scheduleMinuteHint(client, targetVoice.id, durationMs, channelId);

  activeGames.set(channelId, {
    type: "findBotVoice",
    guildId,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetVoice.id,
    voiceChannelId: targetVoice.id,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  await saveActiveGame(client, cfg, {
    type: "findBotVoice",
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetVoice.id,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  markSent(channelId);
  return true;
}

async function handleFindBotVoiceWin(client?, guild?, member?, game?, cfg?) {
  const winCfg = { ...cfg, guildId: String(guild?.id || cfg?.guildId || "") };
  const channelId = String(winCfg.channelId || "");
  if (!channelId || !member?.user || member.user.bot) return false;
  clearNoParticipationDelay(channelId);
  const closed = await beginMinigameWinClose(client, winCfg, game);
  if (!closed) return false;
  try {
    const award = await awardMinigameWinToUser({
      client,
      guild,
      userId: member.id,
      cfg,
      game,
      rewardExp: game.rewardExp,
      channelId,
    });
    const winEmbed = buildWinEmbed(member.id, award.effectiveExp, award.nextTotal, award.details);
    const mainChannel = await getChannelCached(client, channelId);
    if (mainChannel) {
      await sendMinigameMessage(
        mainChannel,
        mergeHalloweenCandyDropIntoMessage(
          {
            content: `${member}`,
            embeds: [winEmbed],
          },
          award,
          member.id,
        ),
      ).catch(() => {});
    }
    if (award.member) {
      await handleExpReward(client, award.member, award.nextTotal);
    }
    return true;
  } catch (err) {
    warnMinigame(err);
    return false;
  } finally {
    await leaveFindBotVoiceChannel(guild.id);
    await clearActiveGame(client, winCfg).catch(() => {});
    endMinigameWinClose(channelId);
  }
}

export = { scheduleFindMinigameTimeout, pickRandomFindBotChannel, hasFindBotVoiceSession, joinFindBotVoiceChannel, resolveFindBotVoiceBotChannelId, syncFindBotVoiceTargetChannel, getActiveFindBotVoiceGame, shouldDeferTtsLeaveForFindBotVoiceMinigame, startFindBotGame, startFindBotVoiceGame, handleFindBotVoiceWin };

/** Memory emoji: sequenza da memorizzare, richiesta di riscriverla e ripristino. */
const { getMemoryEmojiBank } = require("../../Minigames/data/minigameBanks") as typeof import("../../Minigames/data/minigameBanks");
const { shouldUseHalloweenTheme, getHalloweenMemoryEmojiBank } = require("../../Minigames/utils/halloweenMinigameHooks") as typeof import("../../Minigames/utils/halloweenMinigameHooks");
const {
  shouldUseStarWarsTheme,
  getStarWarsMemoryEmojiBank,
} = require("../../Minigames/utils/starWarsMinigameHooks") as typeof import("../../Minigames/utils/starWarsMinigameHooks");
const { buildMemorySequenceEmbed, buildMemoryRecallEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { resolveMinigamePromptAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeRewardExp, shuffleArray, normalizeMemorySequence, displayMemorySequence } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, pickQuestionAvoidRecent } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { markSent, saveActiveGame, parseStateTarget, scheduleMinigameRoundTimeout, catchUpMemoryEmojiWinFromHistory } = require("./minigameRound") as typeof import("./minigameRound");
const { suppressMinigameSnipe } = require("./minigameSnipe") as typeof import("./minigameSnipe");

function isAbsurdMemoryAcceptsAt(value?) {
  const n = Number(value);
  return !Number.isFinite(n) || n >= 1e15;
}

function shuffleMemoryEmojiRow(row?) {
  if (!row || typeof row !== "object") return row;
  if (!Array.isArray(row.sequence) || row.sequence.length <= 1) return row;
  return { ...row, sequence: shuffleArray(row.sequence) };
}

async function persistMemoryEmojiPromptState(client?, cfg?, game?, promptMessageId?) {
  if (!client || !cfg?.channelId || !game || !promptMessageId) return;
  game.promptMessageId = promptMessageId;
  let acceptsAt = Number(game.acceptsAt || 0);
    if (isAbsurdMemoryAcceptsAt(acceptsAt)) acceptsAt = Date.now();
  await saveActiveGame(client, cfg, {
    type: game.type,
    target: JSON.stringify({
      sequence: game.sequence,
      normalizedSequence: game.normalizedSequence,
      acceptsAt,
      sequenceMessageId: game.sequenceMessageId || null,
      promptMessageId,
      durationMs: game.durationMs || null,
    }),
    rewardExp: Number(game.rewardExp || 0),
    startedAt: new Date(game.startedAt || Date.now()),
    endsAt: new Date(game.endsAt || Date.now()),
    gameMessageId: promptMessageId,
  });
}

async function ensureMemoryEmojiRecallPrompt(client?, cfg?, channel?, game?, remainingMs?) {
  if (!game || !channel) return null;
  const existingId = String(game.promptMessageId || "").trim();
  if (existingId) {
    const existing = await channel.messages.fetch(existingId).catch(() => null);
    if (existing) return existing;
  }
  let recallImageUrl = null;
  let recallFiles = [];
  if (shouldUseStarWarsTheme(cfg)) {
    try {
      const { STAR_WARS_CLASSIC_EMBED_ART } = require("../utils/starWarsMinigameHooks") as typeof import("../utils/starWarsMinigameHooks");
      recallImageUrl = STAR_WARS_CLASSIC_EMBED_ART?.memoryRecall || null;
    } catch (_) {}
    /* allegato locale: Discord a volte non mostra solo l'URL CDN sull'embed di recall */
    if (recallImageUrl) {
      try {
        const { fetchRawImageAttachment } = require("./minigameImages") as typeof import("./minigameImages");
        const att = await fetchRawImageAttachment(recallImageUrl, "memory_recall.jpg");
        if (att) {
          recallFiles = [att];
          recallImageUrl = `attachment://${att.name}`;
        }
      } catch (_) {}
    }
  }
  const prompt = await sendMinigameMessage(channel, {
    embeds: [
      buildMemoryRecallEmbed(
        Math.max(60000, Number(remainingMs) || 60000),
        recallImageUrl,
        game?.rewardExp ?? cfg?.memoryEmoji?.rewardExp ?? null,
      ),
    ],
    files: recallFiles,
  }).catch(() => null);
  if (prompt) {
    game.promptMessageId = prompt.id;
  }
  return prompt;
}

async function openMemoryEmojiAnswers(client?, cfg?, channel?, game?, options: Record<string, any> = {}) {
  if (!game) return;
  const channelId = String(cfg?.channelId || channel?.id || "").trim();
  const remainingOverride = Number(options.remainingMs);
  const durationMs =
    Number.isFinite(remainingOverride) && remainingOverride >= 0
      ? Math.max(1000, remainingOverride)
      : Math.max(60000, Number(game.durationMs || cfg?.[game.cfgKey || game.type]?.durationMs || 180000));
  const openAt = Date.now();
  game.acceptsAt = openAt;
  if (!options.preserveEndsAt) {
    game.endsAt = openAt + durationMs;
  }
  if (game.timeout) {
    try {
      clearTimeout(game.timeout);
    } catch (_) {}
  }
  if (channelId && channel) {
    const timeoutMs = options.preserveEndsAt
      ? Math.max(0, Number(game.endsAt || 0) - Date.now())
      : durationMs;
    game.timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, timeoutMs);
  }
  if (game.promptMessageId) {
    await persistMemoryEmojiPromptState(client, cfg, game, game.promptMessageId);
  }
    if (game.hintTimeout) {
    try {
      clearTimeout(game.hintTimeout);
    } catch (_) {}
    game.hintTimeout = null;
  }
}

async function revealMemoryEmojiAndOpenAnswers(client?, cfg?, channel?, channelId?, type?, sequenceMessage = null, options: Record<string, any> = {}) {
  const game = activeGames.get(channelId);
  if (!game || game.type !== type) return;
    game.acceptsAt = Number.MAX_SAFE_INTEGER;
  const seqMsgId = String(game.sequenceMessageId || sequenceMessage?.id || "").trim();
  if (seqMsgId) suppressMinigameSnipe(client, channelId, seqMsgId);

  let deleted = false;
  if (sequenceMessage && typeof sequenceMessage.delete === "function") {
    deleted = await sequenceMessage.delete().then(() => true).catch(() => false);
  }
  if (!deleted && seqMsgId) {
    const msg = await channel.messages.fetch(seqMsgId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }
  game.sequenceMessageId = null;
  suppressMinigameSnipe(client, channelId, seqMsgId);

  const durationMs = Math.max(60000, Number(game.durationMs || 180000));
  const promptMs = Number.isFinite(Number(options.remainingMs))
    ? Number(options.remainingMs)
    : durationMs;
  const prompt = await ensureMemoryEmojiRecallPrompt(client, cfg, channel, game, promptMs);
  if (!prompt) return;
  await openMemoryEmojiAnswers(client, cfg, channel, game, options);
}

async function mountMemoryEmojiGameFromState(client?, cfg?, channel?, state?, remainingMs?) {
  const chId = String(cfg.channelId || "").trim();
  if (!chId || !channel) return;
  const endsAt = new Date(state.endsAt).getTime();
  const parsed = parseStateTarget(state.target);
  const sequence = parsed?.sequence || "";
  const normalizedSequence = parsed?.normalizedSequence || normalizeMemorySequence(sequence);
  let savedAcceptsAt = Number(parsed?.acceptsAt || new Date(state.startedAt).getTime());
  if (isAbsurdMemoryAcceptsAt(savedAcceptsAt)) savedAcceptsAt = 0;
  const sequenceMessageId = String(parsed?.sequenceMessageId || "").trim() || null;
  let promptMessageId = String(parsed?.promptMessageId || "").trim() || null;
  if (
    !promptMessageId &&
    state.gameMessageId &&
    String(state.gameMessageId) !== String(sequenceMessageId || "")
  ) {
    promptMessageId = String(state.gameMessageId);
  }
  const startedAt = new Date(state.startedAt).getTime();
  const rewardExp = Number(state.rewardExp || 0);
  const durationMs = Math.max(60000, Number(parsed?.durationMs || 180000));
  const safeRemaining = Math.max(0, Number(remainingMs) || 0);

  const stillInDisplayPhase =
    Boolean(sequenceMessageId) && !promptMessageId && savedAcceptsAt > Date.now();

  let revealTimeout = null;
  let acceptsAt;
  let mountSequenceId = null;
  let mountPromptId = promptMessageId;

  if (stillInDisplayPhase) {
    acceptsAt = Number.MAX_SAFE_INTEGER;
    mountSequenceId = sequenceMessageId;
    mountPromptId = null;
    const delay = Math.min(Math.max(250, savedAcceptsAt - Date.now()), 2147483647);
    revealTimeout = setTimeout(() => {
      void (async () => {
        await revealMemoryEmojiAndOpenAnswers(client, cfg, channel, chId, state.type, null, {
          remainingMs: Math.max(0, endsAt - Date.now()),
          preserveEndsAt: true,
        });
        const live = activeGames.get(chId);
        if (live) await catchUpMemoryEmojiWinFromHistory(client, cfg, channel, live);
      })().catch(() => {});
    }, delay);
    revealTimeout.unref?.();
  } else {
    acceptsAt = Math.min(savedAcceptsAt || Date.now(), Date.now());
    mountSequenceId = null;
    mountPromptId = promptMessageId;
  }

  const timeout = scheduleMinigameRoundTimeout(client, cfg, chId, channel, safeRemaining);
  activeGames.set(
    chId,
    ({
        type: state.type,
        cfgKey: "memoryEmoji",
        sequence,
        normalizedSequence,
        rewardExp,
        durationMs,
        startedAt,
        acceptsAt,
        endsAt,
        timeout,
        revealTimeout,
        hintTimeout: null,
        sequenceMessageId: mountSequenceId,
        promptMessageId: mountPromptId,
      }),
  );

  if (stillInDisplayPhase) return;

  if (sequenceMessageId) {
    await revealMemoryEmojiAndOpenAnswers(client, cfg, channel, chId, state.type, null, {
      remainingMs: safeRemaining,
      preserveEndsAt: true,
    });
  } else {
    const game = activeGames.get(chId);
    if (game) {
      game.acceptsAt = Math.min(Number(game.acceptsAt) || Date.now(), Date.now());
      const prompt = await ensureMemoryEmojiRecallPrompt(client, cfg, channel, game, safeRemaining);
      if (prompt?.id) {
        await persistMemoryEmojiPromptState(client, cfg, game, prompt.id);
      }
      if (game.hintTimeout) {
        try {
          clearTimeout(game.hintTimeout);
        } catch (_) {}
        game.hintTimeout = null;
      }
    }
  }

  const live = activeGames.get(chId);
  if (live) await catchUpMemoryEmojiWinFromHistory(client, cfg, channel, live);
}

async function startMemoryEmojiGame(client?, cfg?, options?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const type = options?.type || "memoryEmoji";
  const cfgKey = options?.cfgKey || type;
  const gameCfg = cfg?.[cfgKey];
  if (gameCfg === false) return false;
  if (options?.requiresEvent && (!gameCfg?.eventLive || !gameCfg?.unlocked)) return false;

  const pick = pickQuestionAvoidRecent(channelId, type, options?.bank || [], displayMemorySequence, 20);
  const sequence = displayMemorySequence(shuffleMemoryEmojiRow(pick));
  const displaySequence = sequence;
  const normalizedSequence = normalizeMemorySequence(sequence);
  if (!sequence || !normalizedSequence) return false;

  const rewardExp = normalizeRewardExp(gameCfg?.rewardExp ?? 220);
  let displayMs = Math.max(3000, Number(gameCfg?.displayMs || 8000));
  const durationMs = Math.max(60000, Number(gameCfg?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);

  const sequenceEmbed = buildMemorySequenceEmbed(displaySequence, rewardExp, displayMs);
  let sequenceFiles = [];
  if (shouldUseStarWarsTheme(cfg)) {
    const { attachment } = await resolveMinigamePromptAttachment(
      cfg,
      "Memoria",
      [displaySequence, "Memorizza la sequenza"],
      "memory_emoji",
      client,
    );
    if (attachment) {
      sequenceEmbed.setImage(`attachment://${attachment.name}`);
      sequenceFiles = [attachment];
    }
  }
  const sequenceMessage = await sendMinigameMessage(
    channel,
    { embeds: [sequenceEmbed], files: sequenceFiles },
  ).catch(() => null);
  if (!sequenceMessage) return false;
  suppressMinigameSnipe(client, channelId, sequenceMessage.id);

  const now = Date.now();
  const acceptsAt = Number.MAX_SAFE_INTEGER;
  const endsAt = now + displayMs + durationMs;
  const revealTimeout = setTimeout(() => {
    void revealMemoryEmojiAndOpenAnswers(client, cfg, channel, channelId, type, sequenceMessage).catch(() => {});
  }, displayMs);
  revealTimeout.unref?.();

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, displayMs + durationMs);

  activeGames.set(channelId, ({
    type,
    cfgKey,
    sequence,
    normalizedSequence,
    rewardExp,
    durationMs,
    startedAt: now,
    acceptsAt,
    endsAt,
    timeout,
    revealTimeout,
    hintTimeout: null,
    sequenceMessageId: sequenceMessage.id,
    promptMessageId: null,
  }));

  await saveActiveGame(client, cfg, {
    type,
    target: JSON.stringify({
      sequence,
      normalizedSequence,
      acceptsAt: now + displayMs,
      sequenceMessageId: sequenceMessage.id,
      durationMs,
    }),
    rewardExp,
    startedAt: new Date(now),
    endsAt: new Date(endsAt),
    gameMessageId: sequenceMessage.id,
  });

  markSent(channelId);
  return true;
}

async function startStandardMemoryEmojiGame(client?, cfg?) {
  const bank = shouldUseStarWarsTheme(cfg)
    ? getStarWarsMemoryEmojiBank()
    : shouldUseHalloweenTheme(cfg)
      ? getHalloweenMemoryEmojiBank()
      : getMemoryEmojiBank();
  return startMemoryEmojiGame(client, cfg, {
    type: "memoryEmoji",
    cfgKey: "memoryEmoji",
    bank,
  });
}

export = { mountMemoryEmojiGameFromState, startStandardMemoryEmojiGame };

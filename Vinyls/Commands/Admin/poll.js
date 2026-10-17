const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Poll = require("../../Schemas/Poll/pollSchema");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const EPHEMERAL_FLAG = 1 << 6;
const COUNTER_FILTER_QUESTION = "__counter__";
const POLL_CHANNEL_CACHE_TTL_MS = 30_000;
const POLL_CHANNEL_CACHE_TTL_NULL_MS = 5_000;
const NUMBER_EMOJIS = ["<:1_:1444099163116535930>", "<:2_:1444099161673826368>", "<:3_:1444099160294031471>", "<:4_:1444099158859321435>", "<:5_:1444099157194440884>", "<:6_:1444099156007194887>", "<:7_:1444099154610618368>", "<:8_:1444099153125703690>", "<:9_:1444099151443919004>", "<:VC_10:1482706613663174707>",];
const POLL_VOTE_EMOJI_IDS = new Set(
  NUMBER_EMOJIS.map((entry) => String(entry.match(/:(\d+)>$/)?.[1] || "").trim()).filter(Boolean),
);
const NATIVE_POLL_QUESTION_MAX = 300;
const NATIVE_POLL_ANSWER_MAX = 55;
const DEFAULT_NATIVE_POLL_DURATION_HOURS = 24;

function errorEmbed(description) {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor("Red");
}

function successEmbed(description) {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor("#6f4e37");
}

async function getPollChannel(interaction) {
  return getPollChannelFromGuild(interaction?.guild);
}

async function getChatChannelFromGuild(guild) {
  if (!guild) return null;
  const channelId = IDs.channels?.chat;
  if (!channelId) return null;
  const client = guild.client;
  if (!client) return null;
  let ch =
    client.channels.cache.get(channelId) ||
    (await getClientChannelCached(client, String(channelId), { ttlMs: POLL_CHANNEL_CACHE_TTL_MS }));
  if (!ch) {
    ch = await client.channels.fetch(String(channelId)).catch(() => null);
  }
  if (ch && ch.guildId && ch.guildId !== guild.id) ch = null;
  if (!ch || !ch.isTextBased?.()) return null;
  return ch;
}

function truncateNativePollText(value, maxLen) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

function buildNativePollMessageOptions(question, answers, durationHours = DEFAULT_NATIVE_POLL_DURATION_HOURS) {
  const safeQuestion = truncateNativePollText(question, NATIVE_POLL_QUESTION_MAX);
  const safeAnswers = answers
    .map((entry) => truncateNativePollText(entry, NATIVE_POLL_ANSWER_MAX))
    .filter(Boolean);
  const duration = Math.max(1, Math.min(168, Math.floor(Number(durationHours) || DEFAULT_NATIVE_POLL_DURATION_HOURS)));
  return {
    poll: {
      question: { text: safeQuestion },
      answers: safeAnswers.map((text) => ({ text })),
      duration,
      allowMultiselect: false,
    },
  };
}

function buildChatNativePollContent(pollNumber) {
  return `<:VC_id:1478517313618575419> **Poll #${pollNumber}**`;
}

async function getPollChannelFromGuild(guild) {
  if (!guild) return null;
  const channelId = IDs.channels?.polls;
  if (!channelId) return null;
  const client = guild.client;
  if (!client) return null;
  let ch = client.channels.cache.get(channelId) || (await getClientChannelCached(client, String(channelId), { ttlMs: POLL_CHANNEL_CACHE_TTL_MS }));
  if (!ch) {
    ch = await client.channels.fetch(String(channelId)).catch(() => null);
  }
  if (ch && ch.guildId && ch.guildId !== guild.id) ch = null;
  if (!ch || !ch.isTextBased?.()) return null;
  return ch;
}

function buildGuildPollFilter(guildId, extra = {}) {
  return {
    guildId,
    domanda: { $ne: COUNTER_FILTER_QUESTION },
    ...extra,
  };
}

function collectCreateAnswers(interaction) {
  const answers = [];
  for (let i = 1; i <= 10; i += 1) {
    answers.push(interaction.options.getString(`risposta${i}`) || null);
  }
  return answers;
}

function getStoredPollAnswers(pollData) {
  if (!pollData) return [];
  return [
    pollData.risposta1,
    pollData.risposta2,
    pollData.risposta3,
    pollData.risposta4,
    pollData.risposta5,
    pollData.risposta6,
    pollData.risposta7,
    pollData.risposta8,
    pollData.risposta9,
    pollData.risposta10,
  ]
    .map((value) => (value == null ? null : String(value).trim()))
    .filter((value) => value);
}

function collectEditAnswers(interaction, pollMessage, pollData = null) {
  const rawMatches = pollMessage.content.match(/__([^_]+)__/g)?.map((entry) => entry.replace(/__/g, "").trim()) || [];
  const parsedFromMessage = rawMatches.filter((text, idx) => idx !== 0 || !/^Poll\s*#\d+$/i.test(text));
  const existingAnswers = getStoredPollAnswers(pollData).length
    ? getStoredPollAnswers(pollData)
    : parsedFromMessage;
  const answers = [];

  for (let i = 1; i <= 10; i += 1) {
    const provided = interaction.options.getString(`r${i}`);
    const existing = existingAnswers[i - 1] ?? null;
    const value = provided !== null && provided !== undefined && provided !== "" ? provided : existing;
    answers.push(value);
  }

  return answers.filter((a) => a != null && a !== "");
}

function hasAnswerGap(answers) {
  let foundEmpty = false;
  for (let i = 0; i < answers.length; i += 1) {
    const filled = answers[i] != null && String(answers[i]).trim() !== "";
    if (!filled) foundEmpty = true;
    else if (foundEmpty) return i + 1;
  }
  return null;
}

function buildAnswersSection(answers) {
  let text = "";
  const validEmojis = [];

  answers.forEach((answer, index) => {
    if (!answer) return;
    text += `${NUMBER_EMOJIS[index]} __${answer}__\n`;
    validEmojis.push(NUMBER_EMOJIS[index]);
  });

  return { text, validEmojis };
}

function buildPollMessageContent(pollNumber, question, answersText) {
  return `
<:VC_id:1478517313618575419> __Poll #${pollNumber}__

<:VC_PinkQuestionMark:1471892611026391306> **${question}**

${answersText}

`;
}

async function applyPollReactions(pollMessage, reactionEmojis) {
  for (const reaction of reactionEmojis) {
    const emojiId = reaction.match(/:(\d+)>$/)?.[1];
    if (emojiId) {
      await pollMessage.react(emojiId).catch((err) => {
        global.logger?.warn?.("[poll] react:", emojiId, err?.message || err);
      });
    }
  }
}

function normalizePollThreadName(question) {
  let name = String(question || "")
    .replace(/\s+/g, " ")
    .replace(/\?+$/g, "")
    .trim();
  if (!name) name = "Commenti sondaggio";
  return name.slice(0, 100);
}

async function createPollDiscussionThread(pollMessage, question) {
  if (!pollMessage?.startThread) return null;
  if (pollMessage.hasThread) {
    return pollMessage.thread || (await pollMessage.fetch().then((msg) => msg.thread).catch(() => null));
  }
  const name = normalizePollThreadName(question);
  for (const autoArchiveDuration of [10080, 1440, 4320]) {
    const thread = await pollMessage
      .startThread({
        name,
        autoArchiveDuration,
        reason: "Thread commenti sondaggio",
      })
      .catch(() => null);
    if (thread) return thread;
  }
  global.logger?.warn?.("[poll] thread create failed for poll message", pollMessage.id);
  return null;
}

async function announcePollPublishedInChat(guild, pollMessage, question) {
  const chatId = String(IDs.channels?.chat || "").trim();
  if (!chatId || !pollMessage?.id || !guild?.client) return null;
  const chatChannel =
    guild.channels.cache.get(chatId) ||
    (await getClientChannelCached(guild.client, chatId).catch(() => null)) ||
    (await guild.client.channels.fetch(chatId).catch(() => null));
  if (!chatChannel?.isTextBased?.()) return null;

  const pollChannelId = String(pollMessage.channelId || IDs.channels?.polls || "").trim();
  const link = `https://discord.com/channels/${guild.id}/${pollChannelId}/${pollMessage.id}`;
  const pollsChannelMention = pollChannelId ? `<#${pollChannelId}>` : "#sondaggi";

  return chatChannel
    .send({
      content: [
        "<:VC_PinkQuestionMark:1471892611026391306> **Nuovo sondaggio** pubblicato in " + pollsChannelMention + "!",
        "",
        `**${question}**`,
        "",
        `> Vota con le reazioni sul [messaggio del sondaggio](${link}) e commenta la tua scelta nel thread dedicato.`,
      ].join("\n"),
      allowedMentions: { parse: [] },
    })
    .catch((err) => {
      global.logger?.warn?.("[poll] chat announce failed:", err?.message || err);
      return null;
    });
}

async function findPollById(guildId, pollId) {
  return Poll.findOne(buildGuildPollFilter(guildId, { pollcount: pollId }));
}

async function findLastPoll(guildId) {
  return Poll.findOne(buildGuildPollFilter(guildId))
    .sort({ pollcount: -1, createdAt: -1 })
    .catch(() => null);
}

async function syncPollCounter(guildId, highestPollCountOverride = null) {
  const highestPollCount = highestPollCountOverride !== null && highestPollCountOverride !== undefined ? Number(highestPollCountOverride || 0) : Number((await Poll.findOne(buildGuildPollFilter(guildId)).sort({ pollcount: -1 }).select({ pollcount: 1 }).lean())?.pollcount || 0,);

  await Poll.findOneAndUpdate(
    { guildId, domanda: COUNTER_FILTER_QUESTION },
    {
      $set: {
        guildId,
        domanda: COUNTER_FILTER_QUESTION,
        pollcount: highestPollCount,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  return highestPollCount;
}

function normalizeCreateAnswers(rawAnswers) {
  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((value) => value == null ? null : String(value).trim(),) : [];
  while (answers.length < 10) answers.push(null);
  return answers.slice(0, 10);
}

function buildPollAnswersUpdate(answers) {
  const normalized = [...answers];
  while (normalized.length < 10) normalized.push(null);
  return {
    risposta1: normalized[0] ?? null,
    risposta2: normalized[1] ?? null,
    risposta3: normalized[2] ?? null,
    risposta4: normalized[3] ?? null,
    risposta5: normalized[4] ?? null,
    risposta6: normalized[5] ?? null,
    risposta7: normalized[6] ?? null,
    risposta8: normalized[7] ?? null,
    risposta9: normalized[8] ?? null,
    risposta10: normalized[9] ?? null,
  };
}

async function createPollForGuild(guild, payload = {}) {
  const guildId = String(guild?.id || "");
  if (!guildId) {
    return { ok: false, error: "<:vegax:1443934876440068179> Guild non valida." };
  }

  const useNativePoll = payload.useNativePoll === true;
  const publishInChat = payload.publishInChat === true || useNativePoll;
  const skipReactions = payload.skipReactions === true || publishInChat;
  const channel = publishInChat
    ? await getChatChannelFromGuild(guild)
    : await getPollChannelFromGuild(guild);
  if (!channel) {
    return {
      ok: false,
      error: publishInChat
        ? "<:vegax:1443934876440068179> Canale chat non trovato o non valido."
        : "<:vegax:1443934876440068179> Canale poll non trovato o non valido.",
    };
  }

  const question = String(payload.question || "").trim();
  const source = String(payload.source || "manual").trim().toLowerCase() || "manual";
  if (!question) {
    return { ok: false, error: "<:vegax:1443934876440068179> Domanda non valida." };
  }
  const answers = normalizeCreateAnswers(payload.answers);

  const gapPosition = hasAnswerGap(answers);
  if (gapPosition) {
    return {
      ok: false,
      error: `<:vegax:1443934876440068179> Non puoi inserire la risposta ${gapPosition} senza aver riempito le precedenti.`,
    };
  }

  const filledAnswers = answers.filter((entry) => entry != null && String(entry).trim() !== "");
  if (filledAnswers.length < 2) {
    return { ok: false, error: "<:vegax:1443934876440068179> Servono almeno 2 risposte." };
  }

  const counter = await Poll.findOneAndUpdate(
    { guildId, domanda: COUNTER_FILTER_QUESTION },
    {
      $inc: { pollcount: 1 },
      $setOnInsert: { guildId, domanda: COUNTER_FILTER_QUESTION },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const pollNumber = Number(counter?.pollcount || 1);
  let pollMessage = null;

  if (useNativePoll) {
    const nativeDurationHours = Number(payload.nativePollDurationHours || DEFAULT_NATIVE_POLL_DURATION_HOURS);
    const nativeOptions = buildNativePollMessageOptions(question, filledAnswers, nativeDurationHours);
    pollMessage = await channel
      .send({
        content: buildChatNativePollContent(pollNumber),
        ...nativeOptions,
        allowedMentions: { parse: [] },
      })
      .catch((err) => {
        global.logger?.warn?.("[poll] native chat poll send failed:", {
          guildId,
          channelId: channel?.id,
          source,
          err: err?.message || err,
          code: err?.code,
        });
        return null;
      });
  } else {
    const { text: answersText, validEmojis } = buildAnswersSection(answers);
    pollMessage = await channel
      .send({ content: buildPollMessageContent(pollNumber, question, answersText) })
      .catch((err) => {
        global.logger?.warn?.("[poll] channel.send failed:", {
          guildId,
          channelId: channel?.id,
          source,
          err: err?.message || err,
          code: err?.code,
        });
        return null;
      });
    if (pollMessage && !skipReactions) {
      await applyPollReactions(pollMessage, validEmojis);
    }
  }

  if (!pollMessage) {
    await Poll.findOneAndUpdate(
      { guildId, domanda: COUNTER_FILTER_QUESTION },
      { $inc: { pollcount: -1 } },
    ).catch(() => {});
    await syncPollCounter(guildId);
    return {
      ok: false,
      error: "<:vegax:1443934876440068179> Impossibile inviare il poll nel canale.",
    };
  }

  const skipThread = payload.skipThread === true || useNativePoll || publishInChat;
  const skipChatAlert = payload.skipChatAlert === true || publishInChat;
  const thread = skipThread ? null : await createPollDiscussionThread(pollMessage, question);
  if (!skipChatAlert) {
    await announcePollPublishedInChat(guild, pollMessage, question);
  }

  try {
    await Poll.create({
      guildId,
      pollcount: pollNumber,
      domanda: question,
      ...buildPollAnswersUpdate(answers),
      messageId: pollMessage.id,
      channelId: String(channel.id || ""),
      source,
      autoSlot: payload.autoSlot ? String(payload.autoSlot) : null,
      nativePoll: useNativePoll,
    });
  } catch (err) {
    global.logger?.error?.("[poll] Poll.create failed:", err?.message || err);
    await pollMessage.delete().catch(() => {});
    await Poll.findOneAndUpdate(
      { guildId, domanda: COUNTER_FILTER_QUESTION },
      { $inc: { pollcount: -1 } },
    ).catch(() => {});
    await syncPollCounter(guildId);
    return {
      ok: false,
      error: "<:vegax:1443934876440068179> Salvataggio poll fallito; messaggio annullato.",
    };
  }

  return { ok: true, pollNumber, messageId: pollMessage.id, threadId: thread?.id || null, channelId: channel.id };
}

async function handleCreate(interaction) {
  const question = interaction.options.getString("domanda");
  const answers = collectCreateAnswers(interaction);
  const result = await createPollForGuild(interaction.guild, { question, answers, source: "manual", });
  if (!result?.ok) {
    const msg = String(result?.error || "");
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          `<:vegax:1443934876440068179> ${msg || "Errore durante la creazione del poll."}`,
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  await safeEditReply(interaction, {
    embeds: [
      successEmbed(
        `<:vegacheckmark:1443666279058772028> Poll inviato correttamente in <#${IDs.channels?.polls || ""}>!`,
      ),
    ],
  });
  return undefined;
}

async function handleRemove(interaction) {
  const guildId = interaction.guild.id;
  const channel = await getPollChannel(interaction);
  if (!channel) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Canale poll non trovato o non valido.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const lastPoll = await findLastPoll(guildId);
  if (!lastPoll || !lastPoll.messageId) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Nessun poll trovato da rimuovere.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  try {
    const message = await channel.messages.fetch(lastPoll.messageId);
    await message.delete();
  } catch (err) {
    global.logger?.warn?.("[poll] delete message:", err?.message || err);
  }

  await lastPoll.deleteOne();
  const replacementLastPoll = await Poll.findOne(buildGuildPollFilter(guildId)).sort({ pollcount: -1 }).select({ pollcount: 1 }).lean();
  await syncPollCounter(guildId, replacementLastPoll?.pollcount || 0);

  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        `<:VC_purge:1478861828271636561> L'ultimo poll (#${lastPoll.pollcount}) è stato rimosso.`,
      ),
    ],
  });
}

async function handleEdit(interaction) {
  const guildId = interaction.guild.id;
  const pollId = interaction.options.getInteger("id");
  const newQuestion = interaction.options.getString("domanda");

  const pollData = await findPollById(guildId, pollId);
  if (!pollData) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          `<:vegax:1443934876440068179> Nessun poll con ID **${pollId}** trovato.`,
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const channel = await getPollChannel(interaction);
  if (!channel) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Canale poll non trovato o non valido.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  let pollMessage;
  try {
    pollMessage = await channel.messages.fetch(pollData.messageId);
  } catch {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          "<:vegax:1443934876440068179> Il messaggio del poll non esiste più.",
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const answers = collectEditAnswers(interaction, pollMessage, pollData);
  const gapPosition = hasAnswerGap(answers);
  if (gapPosition) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          `<:VC_Attention:1482534443632558151> Non puoi impostare la risposta N°${gapPosition} senza aver riempito le precedenti.`,
        ),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const { text: answersText, validEmojis } = buildAnswersSection(answers);
  const question = newQuestion || pollMessage.content.match(/\*\*(.*?)\*\*/)?.[1]?.trim() || "<:vegax:1443934876440068179> Domanda non trovata";

  await pollMessage.edit({
    content: buildPollMessageContent(pollId, question, answersText),
  }).catch(() => null);

  await pollMessage.reactions.removeAll().catch(() => { });
  await applyPollReactions(pollMessage, validEmojis);

  await Poll.updateOne(
    { _id: pollData._id },
    {
      $set: {
        domanda: question,
        ...buildPollAnswersUpdate(answers),
      },
    }
  ).catch(() => { });

  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        `<:vegacheckmark:1443666279058772028> Poll **#${pollId}** aggiornato correttamente!`,
      ),
    ],
    flags: EPHEMERAL_FLAG,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Crea un poll.")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Crea un nuovo poll")
        .addStringOption((o) =>
          o
            .setName("domanda")
            .setDescription("Domanda del poll")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("risposta1").setDescription("Risposta 1").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("risposta2").setDescription("Risposta 2").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("risposta3")
            .setDescription("Risposta 3")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta4")
            .setDescription("Risposta 4")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta5")
            .setDescription("Risposta 5")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta6")
            .setDescription("Risposta 6")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta7")
            .setDescription("Risposta 7")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta8")
            .setDescription("Risposta 8")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta9")
            .setDescription("Risposta 9")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("risposta10")
            .setDescription("Risposta 10")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Rimuove l'ultimo poll inviato"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Modifica un poll esistente")
        .addIntegerOption((o) =>
          o
            .setName("id")
            .setDescription("ID del poll da modificare")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("domanda")
            .setDescription("Nuova domanda (opzionale)")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r1").setDescription("Nuova risposta 1").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r2").setDescription("Nuova risposta 2").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r3").setDescription("Nuova risposta 3").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r4").setDescription("Nuova risposta 4").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r5").setDescription("Nuova risposta 5").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r6").setDescription("Nuova risposta 6").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r7").setDescription("Nuova risposta 7").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r8").setDescription("Nuova risposta 8").setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("r9").setDescription("Nuova risposta 9").setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("r10")
            .setDescription("Nuova risposta 10")
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

    try {
      if (subcommand === "create") return handleCreate(interaction);
      if (subcommand === "remove") return handleRemove(interaction);
      if (subcommand === "edit") return handleEdit(interaction);
    } catch (err) {
      global.logger.error(err);
      return safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
          ),
        ],
        flags: EPHEMERAL_FLAG,
      });
    }
  },
  createPollForGuild,
  getPollChannelFromGuild,
  getChatChannelFromGuild,
  POLL_VOTE_EMOJI_IDS,
};
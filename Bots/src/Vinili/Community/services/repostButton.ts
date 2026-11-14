/** Repost: pulsante "reposta". */
const { GuildRepost } = require("../schemas/guildBoardPostSchema") as typeof import("../schemas/guildBoardPostSchema");
const { RepostPrivacy } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { resolveQuoteChannelId, resolveBoardPostChannel } = require("../utils/Quote/quotePostChannel") as typeof import("../utils/Quote/quotePostChannel");
const { nextRepostCount } = require("../utils/Quote/quoteCounter") as typeof import("../utils/Quote/quoteCounter");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { withMongoTimeout } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { pickImageUrlFromMessage, serializableMediaFiles, prepareRepostSendMedia, resolvePayloadFilesForSend, extractRepostPayload } = require("./repostMedia") as typeof import("./repostMedia");
const { resolveQuotedAuthorIdFromQuoteMessage, isClipBoardMessage, resolveClipAuthorIdFromMessage, extractClipRepostPayload } = require("./repostClips") as typeof import("./repostClips");
const { REPOST_BTN_PREFIX, REPOST_SRC_PREFIX, messageJumpUrl, buildShareAckEmbed, buildBoardEmbed, buildAckRepostaComponents, buildBoardMessageComponents, buildRepostPrivacyBlockedEmbed } = require("./repostEmbeds") as typeof import("./repostEmbeds");
const { REPOST_DB_MS, ensureRepostDbReady, timedRepostQuery, ensureBoardRepostaButton } = require("./repostBoardSync") as typeof import("./repostBoardSync");
const { EPHEMERAL_FLAG } = require("./repostRemove") as typeof import("./repostRemove");
const { isRepostDisabledInGuild } = require("./repostRoulette") as typeof import("./repostRoulette");
const { SITE_BOARD_CHANNEL, isBachecaSiteGuild, isSiteBoardChannel, newBachecaItemId, bachecaItemUrl, mirrorUrlToBacheca, broadcastBachecaChanged } = require("../../site/bacheca/bachecaSite") as typeof import("../../site/bacheca/bachecaSite");

const REPOST_DISABLED_MESSAGE = "I repost sono disattivati su questo server per ora.";

async function checkRepostPrivacyBlocked(guildId?, authorId?) {
  try {
    const privacy = await timedRepostQuery(
      RepostPrivacy.findOne({ guildId, userId: authorId }).lean(),
      "repost privacy",
    );
    return Boolean(privacy?.blocked);
  } catch {
    return false;
  }
}

async function resolveBoardChannel(guild?, replyChannel?, preferBoardChannel = true) {
  const prefersBoard = preferBoardChannel !== false;
  if (!prefersBoard && replyChannel?.isTextBased?.()) return replyChannel;
  const dedicated = await resolveBoardPostChannel(guild, "repost");
  if (prefersBoard && dedicated?.isTextBased?.()) return dedicated;
  if (replyChannel?.isTextBased?.()) return replyChannel;
  return null;
}

async function findExistingBoardPost(guildId?, sourceChannelId?, sourceMessageId?) {
  const gid = String(guildId || "").trim();
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!gid || !sc || !sm) return null;
  return timedRepostQuery(
    GuildRepost.findOne({
      guildId: gid,
      sourceChannelId: sc,
      sourceMessageId: sm,
      boardChannelId: { $ne: "" },
      boardMessageId: { $ne: "" },
    })
      .sort({ createdAt: -1 })
      .lean(),
    "repost find board",
  ).catch(() => null);
}

async function hasUserAlreadySavedRepost(guildId?, reposterUserId?, sourceChannelId?, sourceMessageId?) {
  const gid = String(guildId || "").trim();
  const uid = String(reposterUserId || "").trim();
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!gid || !uid || !sc || !sm) return false;
  const found = await timedRepostQuery(
    GuildRepost.findOne({
      guildId: gid,
      reposterUserId: uid,
      sourceChannelId: sc,
      sourceMessageId: sm,
    })
      .select("_id")
      .lean(),
    "repost duplicate check",
  ).catch(() => null);
  return Boolean(found?._id);
}

async function createRepostFromMessage(ctx?) {
  const { guild, reposter, targetMessage, replyChannel: replyChannelRaw, preferBoardChannel, quotedAuthorId } = ctx;
  const reposterId = String(reposter?.id || reposter?.user?.id || "");
  const guildId = String(guild?.id || "");
  if (isRepostDisabledInGuild(guildId)) {
    return { ok: false, message: REPOST_DISABLED_MESSAGE };
  }
  if (!(await ensureRepostDbReady())) {
    return {
      ok: false,
      message: "Database temporaneamente non disponibile. Riprova tra qualche secondo.",
    };
  }
  if (!isValidGuildUserId(guildId, reposterId)) {
    return { ok: false, message: "Contesto non valido." };
  }

  let quoteAuthorId = String(quotedAuthorId || "").trim();
  const author = targetMessage?.author;
  const fromClipBoard = isClipBoardMessage(targetMessage);
  if (!quoteAuthorId && fromClipBoard) {
    quoteAuthorId = resolveClipAuthorIdFromMessage(targetMessage) || "";
  }
  if (!quoteAuthorId && author?.bot) {
    quoteAuthorId = resolveQuotedAuthorIdFromQuoteMessage(targetMessage) || "";
  }
  const imageUrlFromMessage = pickImageUrlFromMessage(targetMessage);
  const fromQuoteCanvas = Boolean(
    quoteAuthorId && /^\d{16,20}$/.test(quoteAuthorId) && imageUrlFromMessage,
  );
  if (fromClipBoard) {
    if (!quoteAuthorId || !/^\d{16,20}$/.test(quoteAuthorId)) {
      return { ok: false, message: "Impossibile identificare l'autore del clip." };
    }
  } else if (!fromQuoteCanvas && !author) {
    return { ok: false, message: "Messaggio non valido." };
  }

  const sourceAuthorId = fromClipBoard || fromQuoteCanvas ? quoteAuthorId : String(author.id);
  let payload;
  if (fromClipBoard) {
    payload = extractClipRepostPayload(targetMessage);
    if (!payload.hasContent) {
      return { ok: false, message: "Impossibile repostare questo clip vocale." };
    }
  } else if (fromQuoteCanvas) {
    const imageUrl = imageUrlFromMessage;
    if (!imageUrl) {
      return {
        ok: false,
        message: "Impossibile trovare l'immagine della quote da repostare.",
      };
    }
    payload = { text: "", imageUrl, files: [], hasContent: true };
  } else {
    payload = extractRepostPayload(targetMessage);
    if (!payload.hasContent) {
      return {
        ok: false,
        message: "Il messaggio deve avere testo, un'immagine o un allegato multimediale da repostare.",
      };
    }
  }

  if (await checkRepostPrivacyBlocked(guildId, sourceAuthorId)) {
    const blockedMember = await getGuildMemberCached(guild, sourceAuthorId).catch(() => null);
    const authorLabel = accountUsername(blockedMember) || accountUsername(author) || "Utente";
    return {
      ok: false,
      message: `**${authorLabel}** ha bloccato i repost dei propri messaggi.`,
      privacyBlocked: true,
      privacyEmbed: buildRepostPrivacyBlockedEmbed(authorLabel),
    };
  }

  let totalPosts;
  try {
    totalPosts = await withMongoTimeout(nextRepostCount(guildId), REPOST_DB_MS, "repost count");
  } catch (err) {
    global.logger?.warn?.("[repost] counter failed:", err?.message || err);
    return { ok: false, message: "Contatore repost non disponibile. Riprova tra poco." };
  }

  const replyChannel =
    replyChannelRaw?.isTextBased?.() ? replyChannelRaw : targetMessage.channel?.isTextBased?.() ? targetMessage.channel : null;
  /* bachecaSite1: sul server principale il repost va sulla Bacheca del sito, non nel canale */
  const siteBoard = isBachecaSiteGuild(guildId);
  const boardChannel = siteBoard ? null : await resolveBoardChannel(guild, replyChannel, preferBoardChannel);
  if (!siteBoard && !boardChannel?.isTextBased?.()) {
    return { ok: false, message: "Impossibile pubblicare il repost in questo canale." };
  }
  const boardLink = (channelId?, messageId?) =>
    siteBoard || isSiteBoardChannel(channelId) ? bachecaItemUrl(messageId) : messageJumpUrl(guildId, channelId, messageId);

  if (await hasUserAlreadySavedRepost(guildId, reposterId, targetMessage.channel.id, targetMessage.id)) {
    const existingBoard = await findExistingBoardPost(guildId, targetMessage.channel.id, targetMessage.id);
    const boardUrl = existingBoard?.boardChannelId && existingBoard?.boardMessageId
      ? boardLink(existingBoard.boardChannelId, existingBoard.boardMessageId)
      : "";
    const prefix = String(guild?.client?.config?.prefix || "+").trim() || "+";
    return {
      ok: true,
      alreadySaved: true,
      fromQuoteCanvas,
      ackEmbed: buildShareAckEmbed({ reposterId, boardUrl, prefix, guildId, kind: "repost" }),
      repostId: existingBoard?._id ? String(existingBoard._id) : "",
      ackComponents: buildAckRepostaComponents({
        repostId: existingBoard?._id ? String(existingBoard._id) : "",
        targetMessage,
        sourceAuthorId: existingBoard?.sourceAuthorId || "",
      }),
      components: [],
    };
  }

  const sourceUrl = messageJumpUrl(guildId, targetMessage.channel.id, targetMessage.id);
  const commandPrefix = String(guild?.client?.config?.prefix || "+").trim() || "+";
  const boardFiles = await resolvePayloadFilesForSend(targetMessage, serializableMediaFiles(payload.files));
  const boardSendMedia = prepareRepostSendMedia({ imageUrl: payload.imageUrl, files: boardFiles });
  const boardEmbed = buildBoardEmbed({
    reposter,
    reposterId,
    sourceAuthorId,
    sourceUrl,
    totalPosts,
    text: payload.text,
    imageUrl: boardSendMedia.embedImageUrl,
    commandPrefix,
    imageOnly: fromQuoteCanvas,
    guildId,
    kind: fromClipBoard ? "clip" : "repost",
  });

  const sourceMember = fromQuoteCanvas
    ? await getGuildMemberCached(guild, sourceAuthorId).catch(() => null)
    : targetMessage.member;
  const authorLabel =
    accountUsername(sourceMember) ||
    accountUsername(author) ||
    targetMessage.member?.displayName ||
    author?.username ||
    "Utente";

  const existingBoard = await findExistingBoardPost(guildId, targetMessage.channel.id, targetMessage.id);
  const existingBoardChannelId = String(existingBoard?.boardChannelId || "").trim();
  const existingBoardMessageId = String(existingBoard?.boardMessageId || "").trim();

  const storedMediaFiles = serializableMediaFiles(payload.files);
  const docPayload: Record<string, any> = {
    guildId,
    reposterUserId: reposterId,
    sourceAuthorId,
    sourceChannelId: String(targetMessage.channel.id),
    sourceMessageId: String(targetMessage.id),
    content: payload.text,
    attachmentUrl: payload.imageUrl || "",
    authorUsername: authorLabel,
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlDynamic(sourceMember || targetMessage.member || author, { size: 512 }) || "",
    boardChannelId: existingBoardChannelId || (siteBoard ? SITE_BOARD_CHANNEL : String(boardChannel.id)),
    totalPosts,
    boardMessageId: existingBoardMessageId || (siteBoard ? newBachecaItemId() : ""),
  };
  if (storedMediaFiles.length) docPayload.mediaFiles = storedMediaFiles;

  const doc = await timedRepostQuery(GuildRepost.create(docPayload), "repost create").catch(() => null);

  if (!doc?._id) {
    return { ok: false, message: "Impossibile salvare il repost (database lento o non disponibile)." };
  }

  const repostId = String(doc._id);
  let boardMessage = null;
  let boardUrl = "";
  if (existingBoardChannelId && existingBoardMessageId) {
    boardUrl = boardLink(existingBoardChannelId, existingBoardMessageId);
    if (!isSiteBoardChannel(existingBoardChannelId)) {
      await ensureBoardRepostaButton(
        guild,
        existingBoardChannelId,
        existingBoardMessageId,
        existingBoard?._id ? String(existingBoard._id) : repostId,
      );
    }
    if (siteBoard) broadcastBachecaChanged("repost", existingBoardMessageId);
  } else if (siteBoard) {
    /* media copiati subito sul CDN: gli allegati di Discord scadono */
    const itemId = String(docPayload.boardMessageId);
    const cdnAttachment = payload.imageUrl ? await mirrorUrlToBacheca("repost", itemId, payload.imageUrl, "") : "";
    const cdnFiles = [];
    for (const f of storedMediaFiles) {
      cdnFiles.push({ url: await mirrorUrlToBacheca("repost", itemId, f.url, f.name), name: f.name });
    }
    await timedRepostQuery(
      GuildRepost.updateOne(
        { _id: doc._id },
        { $set: { attachmentUrl: cdnAttachment, ...(cdnFiles.length ? { mediaFiles: cdnFiles } : {}) } },
      ),
      "repost cdn update",
    ).catch(() => {});
    boardUrl = bachecaItemUrl(itemId);
    broadcastBachecaChanged("new", itemId);
  } else {
    const boardSendPayload: Record<string, any> = {
      embeds: [boardEmbed],
      components: buildBoardMessageComponents(repostId, {
        _id: repostId,
        reposterUserId: reposterId,
        sourceChannelId: String(targetMessage.channel.id),
        sourceMessageId: String(targetMessage.id),
        boardChannelId: String(boardChannel.id),
        boardMessageId: "",
        mediaFiles: storedMediaFiles,
      }),
    };
    if (boardSendMedia.files.length) boardSendPayload.files = boardSendMedia.files;

    const boardMsg = await boardChannel.send(boardSendPayload).catch(() => null);

    if (!boardMsg?.id) {
      await GuildRepost.deleteOne({ _id: doc._id }).catch(() => {});
      return { ok: false, message: "Impossibile pubblicare sulla bacheca." };
    }

    boardMessage = boardMsg;
    await timedRepostQuery(
      GuildRepost.updateOne(
        { _id: doc._id },
        { $set: { boardMessageId: String(boardMsg.id), boardChannelId: String(boardChannel.id) } },
      ),
      "repost board update",
    ).catch(() => {});

    boardUrl = messageJumpUrl(guildId, boardChannel.id, boardMsg.id);
    void (async () => {
      try {
        const { stabilizeRepostMedia } = require("../../site/boards/boardMediaStable") as typeof import("../../site/boards/boardMediaStable");
        const lean = await GuildRepost.findById(doc._id).lean().catch(() => null);
        if (lean) await stabilizeRepostMedia(guild?.client, lean);
      } catch (_) {}
    })();
  }
  const prefix = String(guild?.client?.config?.prefix || "+").trim() || "+";
  const ackEmbed = buildShareAckEmbed({ reposterId, boardUrl, prefix, guildId, kind: "repost" });

  return {
    ok: true,
    alreadySaved: false,
    fromQuoteCanvas,
    ackEmbed,
    boardMessage,
    repostId,
    ackComponents: buildAckRepostaComponents({ repostId, targetMessage, sourceAuthorId }),
    components: [],
  };
}

async function resolveSourceMessageFromInteraction(interaction?, sourceChannelId?, sourceMessageId?) {
  const channel =
    interaction.guild.channels.cache.get(sourceChannelId) ||
    (await interaction.guild.channels.fetch(sourceChannelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;
  return channel.messages.fetch(sourceMessageId).catch(() => null);
}

async function handleRepostaButton(interaction?) {
  const raw = String(interaction.customId || "");
  if (!interaction.guild) return { handled: false };
  if (isRepostDisabledInGuild(interaction.guild.id)) {
    await interaction
      .reply({ content: REPOST_DISABLED_MESSAGE, flags: EPHEMERAL_FLAG })
      .catch(() => {});
    return { handled: true };
  }

  let sourceChannelId = "";
  let sourceMessageId = "";
  let quotedAuthorId = "";

  if (raw.startsWith(REPOST_SRC_PREFIX)) {
    const parts = raw.slice(REPOST_SRC_PREFIX.length).split(":");
    sourceChannelId = String(parts[0] || "").trim();
    sourceMessageId = String(parts[1] || "").trim();
    quotedAuthorId = String(parts[2] || "").trim();
  } else if (raw.startsWith(REPOST_BTN_PREFIX)) {
    const repostId = raw.slice(REPOST_BTN_PREFIX.length).trim();
    if (!repostId) {
      await interaction.reply({ content: "Repost non valido.", flags: EPHEMERAL_FLAG }).catch(() => {});
      return { handled: true };
    }
    const doc = await GuildRepost.findById(repostId).lean().catch(() => null);
    if (!doc || String(doc.guildId) !== String(interaction.guild.id)) {
      await interaction.reply({ content: "Repost non trovato.", flags: EPHEMERAL_FLAG }).catch(() => {});
      return { handled: true };
    }
    sourceChannelId = String(doc.sourceChannelId || "");
    sourceMessageId = String(doc.sourceMessageId || "");
    quotedAuthorId = String(doc.sourceAuthorId || "").trim();
  } else {
    return { handled: false };
  }

  const targetMessage = await resolveSourceMessageFromInteraction(
    interaction,
    sourceChannelId,
    sourceMessageId,
  );
  if (!targetMessage) {
    await interaction.reply({
      content: "Il messaggio originale non esiste più: non posso ripostarlo.",
      flags: EPHEMERAL_FLAG,
    }).catch(() => {});
    return { handled: true };
  }

  const isQuoteRepost = raw.startsWith(REPOST_SRC_PREFIX);
  const reposterId = String(interaction.user?.id || interaction.member?.id || "");
  let quoteAlreadySaved = false;
  if (isQuoteRepost && reposterId) {
    quoteAlreadySaved = await hasUserAlreadySavedRepost(
      interaction.guild.id,
      reposterId,
      sourceChannelId,
      sourceMessageId,
    );
  }
      const quoteBoardChannelId = resolveQuoteChannelId(interaction.guild.id);
  const interactionChannelId = String(interaction.channelId || interaction.channel?.id || "").trim();
  const clickedInQuoteBoard =
    Boolean(quoteBoardChannelId) && interactionChannelId === quoteBoardChannelId;

  let usePublicAck = false;
  if (!clickedInQuoteBoard && isQuoteRepost && !quoteAlreadySaved) {
    const existingBoard = await findExistingBoardPost(
      interaction.guild.id,
      sourceChannelId,
      sourceMessageId,
    );
    usePublicAck = !String(existingBoard?.boardMessageId || "").trim();
  }

  await interaction.deferReply({ flags: usePublicAck ? undefined : EPHEMERAL_FLAG }).catch(() => {});

  const result = await createRepostFromMessage({
    guild: interaction.guild,
    reposter: interaction.member || interaction.user,
    targetMessage,
    client: interaction.client,
    replyChannel: interaction.channel?.isTextBased?.() ? interaction.channel : null,
    preferBoardChannel: true,
    quotedAuthorId,
  });

  if (!result.ok) {
    await interaction
      .editReply(
        result.privacyEmbed
          ? { content: "", embeds: [result.privacyEmbed], components: [] }
          : { content: result.message || "Repost fallito.", embeds: [], components: [] },
      )
      .catch(() => {});
    return { handled: true };
  }

  // Site bacheca: boardMessage resta null (niente post Discord). Non cancellare il defer
  // pubblico — editReply con l'ack (link bacheca). Prima: deleteReply + followUp ephemeral
  // → "ci sta lavorando" spariva e l'ack spesso non arrivava.
  await interaction
    .editReply({
      embeds: [result.ackEmbed],
      components: usePublicAck && Array.isArray(result.ackComponents) ? result.ackComponents : [],
      allowedMentions: usePublicAck && reposterId ? { users: [reposterId] } : { parse: [] },
    })
    .catch(async () => {
      await interaction
        .followUp({
          embeds: [result.ackEmbed],
          components: [],
          flags: EPHEMERAL_FLAG,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    });

  return { handled: true };
}

export = { REPOST_DISABLED_MESSAGE, createRepostFromMessage, handleRepostaButton };

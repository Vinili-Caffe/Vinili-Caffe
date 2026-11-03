const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { GuildQuoteBoard } = require("../../schemas/guildBoardPostSchema") as typeof import("../../schemas/guildBoardPostSchema");
const { decrementQuoteCount } = require("./quoteCounter") as typeof import("./quoteCounter");
const { resolveQuotePostChannel } = require("./quotePostChannel") as typeof import("./quotePostChannel");
const { TENANT_EMBED_COLOR } = require("../../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../../MultiGuild/utils/tenantEmbedBranding");
const {
  isRepostDisabledInGuild,
  REPOST_SRC_PREFIX,
} = require("../../services/repostService") as typeof import("../../services/repostService");

const backfillDoneByGuild = new Set();
const backfillInflightByGuild = new Map();
const repostaBackfillDoneByGuild = new Set();
const repostaBackfillInflightByGuild = new Map();
const BACKFILL_MAX_PAGES = 40;
const BACKFILL_PAGE_SIZE = 100;
const BACKFILL_META_CHANNEL = "__meta__";
const BACKFILL_META_MESSAGE = "backfill_v2";
let repostaEditCooldownUntil = 0;

function messageJumpUrl(guildId?, channelId?, messageId?) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!g || !c || !m) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

function extractMentionId(value?) {
  const m = String(value || "").match(/<@!?(\d{17,20})>/);
  return m ? m[1] : "";
}

function parseQuoteRemoveCustomId(customId?) {
  const id = String(customId || "").trim();
  const match = id.match(/^quote_remove:(\d{16,20}):(\d{16,20}):(\d{16,20}|0)$/);
  if (!match) return null;
  return {
    creatorUserId: match[1],
    originChannelId: match[2],
    originMessageId: match[3] === "0" ? "" : match[3],
  };
}

function componentCustomId(comp?) {
  return String(comp?.customId || comp?.custom_id || "").trim();
}

function buildQuoteRemoveButton(creatorUserId?, originChannelId?, originMessageId?, fallbackChannelId = "") {
  const creator = String(creatorUserId || "").trim();
  const oc = String(originChannelId || fallbackChannelId || "").trim();
  const om = String(originMessageId || "").trim() || "0";
  if (!/^\d{16,20}$/.test(creator) || !/^\d{16,20}$/.test(oc)) return null;
  if (om !== "0" && !/^\d{16,20}$/.test(om)) return null;
  return new ButtonBuilder()
    .setCustomId(`quote_remove:${creator}:${oc}:${om}`)
    .setLabel("Rimuovi questa quote")
    .setEmoji("🗑️")
    .setStyle(ButtonStyle.Danger);
}

function buildQuoteBoardComponents({
  guildId,
  creatorUserId,
  originChannelId,
  originMessageId,
  boardChannelId,
  boardMessageId,
  quotedUserId,
  existingRemoveCustomId = "",
}) {
  const buttons = [];
  const bc = String(boardChannelId || "").trim();
  const bm = String(boardMessageId || "").trim();
  if (!isRepostDisabledInGuild(guildId) && /^\d{16,20}$/.test(bc) && /^\d{16,20}$/.test(bm)) {
    const qa = String(quotedUserId || "").trim();
    const customId = `${REPOST_SRC_PREFIX}${bc}:${bm}${qa && /^\d{16,20}$/.test(qa) ? `:${qa}` : ""}`;
    buttons.push(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel("Reposta")
        .setEmoji("1443652837346377841")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  const existingRemove = String(existingRemoveCustomId || "").trim();
  if (existingRemove && parseQuoteRemoveCustomId(existingRemove)) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(existingRemove)
        .setLabel("Rimuovi questa quote")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
    );
  } else {
    const removeBtn = buildQuoteRemoveButton(
      creatorUserId,
      originChannelId,
      originMessageId,
      boardChannelId,
    );
    if (removeBtn) buttons.push(removeBtn);
  }

  if (!buttons.length) return [];
  return [new ActionRowBuilder().addComponents(...buttons.slice(0, 5))];
}

function parseQuoteBoardMessage(message?) {
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  const embed = embeds[0];
  const title = String(embed?.title || embed?.data?.title || "");
  if (/citazione rimossa/i.test(title)) return null;

  let removeMeta = null;
  for (const row of message.components || []) {
    for (const comp of row.components || []) {
      removeMeta = parseQuoteRemoveCustomId(componentCustomId(comp));
      if (removeMeta) break;
    }
    if (removeMeta) break;
  }

  let quotedUserId = "";
  let quotedUsername = "";
  let creatorFromField = "";
  for (const field of embed?.fields || embed?.data?.fields || []) {
    const name = String(field?.name || "").toLowerCase();
    const value = String(field?.value || "");
    if (name.includes("messaggio di")) {
      quotedUserId = extractMentionId(value);
      quotedUsername = value.replace(/<@!?\d+>/g, "").trim() || quotedUsername;
    }
    if (name.includes("creato da")) {
      creatorFromField = extractMentionId(value);
    }
  }

  const footerText = String(embed?.footer?.text || embed?.data?.footer?.text || "");
  const totalMatch = footerText.match(/Post totali:\s*(\d+)/i);
  const totalPosts = totalMatch ? Number(totalMatch[1]) : 0;
  const looksLikeQuote =
    Boolean(removeMeta) ||
    /quotazione/i.test(title) ||
    Boolean(creatorFromField) ||
    Boolean(quotedUserId) ||
    totalPosts > 0;

  if (!looksLikeQuote) return null;

      const creatorUserId = String(removeMeta?.creatorUserId || creatorFromField || "").trim();
  if (!creatorUserId && !/quotazione/i.test(title)) return null;

  const attachmentList =
    typeof message.attachments?.values === "function"
      ? [...message.attachments.values()]
      : Array.isArray(message.attachments)
        ? message.attachments
        : [];

  const imageUrl =
    String(embed?.image?.url || embed?.data?.image?.url || "").trim() ||
    attachmentList
      .map((att?) => String(att?.url || "").trim())
      .find((url?) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)) ||
    "";

  return {
    creatorUserId: creatorUserId || "",
    quotedUserId: quotedUserId || creatorUserId || "0",
    originChannelId: removeMeta?.originChannelId || "",
    originMessageId: removeMeta?.originMessageId || "",
    imageUrl,
    quotedUsername,
    totalPosts,
    createdAt: message.createdAt || new Date(message.createdTimestamp || Date.now()),
  };
}

async function upsertQuoteBoardFromParsed(guildId?, boardChannelId?, boardMessageId?, parsed?) {
  const gid = String(guildId || "").trim();
  const bc = String(boardChannelId || "").trim();
  const bm = String(boardMessageId || "").trim();
  if (!gid || !bc || !bm || !parsed?.creatorUserId) return null;

  const createdAt =
    parsed.createdAt instanceof Date && Number.isFinite(parsed.createdAt.getTime())
      ? parsed.createdAt
      : new Date();

  const doc = await GuildQuoteBoard.findOneAndUpdate(
    { guildId: gid, boardChannelId: bc, boardMessageId: bm },
    {
      $set: {
        creatorUserId: String(parsed.creatorUserId),
        quotedUserId: String(parsed.quotedUserId || parsed.creatorUserId),
        originChannelId: String(parsed.originChannelId || "").trim(),
        originMessageId: String(parsed.originMessageId || "").trim(),
        imageUrl: String(parsed.imageUrl || "").trim(),
        quotedUsername: String(parsed.quotedUsername || "").trim(),
        totalPosts: Number(parsed.totalPosts) || 0,
      },
      $setOnInsert: {
        guildId: gid,
        boardChannelId: bc,
        boardMessageId: bm,
        createdAt,
        updatedAt: createdAt,
      },
    },
    { upsert: true, new: true, timestamps: false, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (doc?._id && String(doc.imageUrl || "").trim()) {
    void (async () => {
      try {
        const { stabilizeQuoteMedia } = require("../../../site/boards/boardMediaStable") as typeof import("../../../site/boards/boardMediaStable");
        await stabilizeQuoteMedia(null, doc.toObject?.() || doc);
      } catch (_) {}
    })();
  }
  return doc;
}

async function backfillQuoteBoardFromChannel(guild?) {
  const channel = await resolveQuotePostChannel(guild);
  if (!channel?.messages?.fetch) return { scanned: 0, imported: 0 };

  let scanned = 0;
  let imported = 0;
  let before;
  for (let page = 0; page < BACKFILL_MAX_PAGES; page += 1) {
    const batch = await channel.messages
      .fetch(before ? { limit: BACKFILL_PAGE_SIZE, before } : { limit: BACKFILL_PAGE_SIZE })
      .catch(() => null);
    if (!batch?.size) break;

    const ordered = [...batch.values()].sort((a?, b?) => b.createdTimestamp - a.createdTimestamp);
    for (const msg of ordered) {
      scanned += 1;
      const parsed = parseQuoteBoardMessage(msg);
      if (!parsed) continue;
      const doc = await upsertQuoteBoardFromParsed(guild.id, channel.id, msg.id, parsed);
      if (doc) imported += 1;
    }

    const oldest = ordered[ordered.length - 1];
    if (!oldest?.id || batch.size < BACKFILL_PAGE_SIZE) break;
    before = oldest.id;
  }

  return { scanned, imported };
}

async function hasPersistedBackfillMarker(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  const meta = await GuildQuoteBoard.findOne({
    guildId: gid,
    boardChannelId: BACKFILL_META_CHANNEL,
    boardMessageId: BACKFILL_META_MESSAGE,
  })
    .select("_id")
    .lean()
    .catch(() => null);
  return Boolean(meta?._id);
}

async function markBackfillComplete(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  await GuildQuoteBoard.updateOne(
    { guildId: gid, boardChannelId: BACKFILL_META_CHANNEL, boardMessageId: BACKFILL_META_MESSAGE },
    {
      $set: {
        creatorUserId: "0",
        quotedUserId: "0",
        quotedUsername: "backfill",
        imageUrl: "",
        originChannelId: "",
        originMessageId: "",
        totalPosts: 0,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        guildId: gid,
        boardChannelId: BACKFILL_META_CHANNEL,
        boardMessageId: BACKFILL_META_MESSAGE,
        createdAt: new Date(),
      },
    },
    { upsert: true, timestamps: false },
  ).catch(() => null);
  backfillDoneByGuild.add(gid);
}

async function isQuoteBoardBackfillComplete(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  if (backfillDoneByGuild.has(gid)) return true;
  if (await hasPersistedBackfillMarker(gid)) {
    backfillDoneByGuild.add(gid);
    return true;
  }
  return false;
}

async function ensureQuoteBoardBackfilled(guild?, opts: Record<string, any> = {}) {
  const wait = opts.wait !== false;
  const gid = String(guild?.id || "").trim();
  if (!gid) return;

  if (await isQuoteBoardBackfillComplete(gid)) return;

  let inflight = backfillInflightByGuild.get(gid);
  if (!inflight) {
    inflight = (async () => {
      try {
        const result = await backfillQuoteBoardFromChannel(guild);
        await markBackfillComplete(gid);
        global.logger?.info?.(
          `[myquote] backfill guild=${gid} scanned=${result.scanned} imported=${result.imported}`,
        );
      } catch (err) {
        global.logger?.warn?.("[myquote] backfill failed:", err?.message || err);
      } finally {
        backfillInflightByGuild.delete(gid);
      }
    })();
    backfillInflightByGuild.set(gid, inflight);
  }

  if (wait) await inflight;
}

async function registerQuoteBoardPost(ctx?) {
  const {
    guildId,
    creatorUserId,
    quotedUserId,
    boardChannelId,
    boardMessageId,
    originChannelId,
    originMessageId,
    imageUrl,
    quotedUsername,
    totalPosts,
    createdAt,
  } = ctx || {};
  return upsertQuoteBoardFromParsed(guildId, boardChannelId, boardMessageId, {
    creatorUserId,
    quotedUserId,
    originChannelId,
    originMessageId,
    imageUrl,
    quotedUsername,
    totalPosts,
    createdAt: createdAt || new Date(),
  });
}

async function listQuotesByUser(guildId?, userId?, opts: Record<string, any> = {}) {
    if (opts.guild) {
    void ensureQuoteBoardBackfilled(opts.guild, { wait: false });
  }
  const limit = Math.min(25, Math.max(1, Number(opts.limit) || 10));
  const skip = Math.max(0, Number(opts.skip) || 0);
  const filter = {
    guildId: String(guildId),
    creatorUserId: String(userId),
    boardChannelId: { $ne: BACKFILL_META_CHANNEL },
  };
  const [rows, total] = await Promise.all([
    GuildQuoteBoard.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    GuildQuoteBoard.countDocuments(filter).catch(() => 0),
  ]);
  return { rows: rows || [], total: Number(total) || 0 };
}

async function deleteUserQuoteEntry({ guild, quoteId, userId }) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  const qid = String(quoteId || "").trim();
  if (!gid || !uid || !qid) return { ok: false, message: "Quote non valida." };

  const doc = await GuildQuoteBoard.findById(qid).lean().catch(() => null);
  if (!doc?._id || String(doc.guildId) !== gid) {
    return { ok: false, message: "Quote non trovata." };
  }
  if (String(doc.creatorUserId) !== uid) {
    return { ok: false, message: "Puoi rimuovere solo le tue quote." };
  }

  const bc = String(doc.boardChannelId || "").trim();
  const bm = String(doc.boardMessageId || "").trim();
  const oc = String(doc.originChannelId || "").trim();
  const om = String(doc.originMessageId || "").trim();

  await GuildQuoteBoard.deleteOne({ _id: doc._id }).catch(() => null);

  if (bc && bm) {
    const boardCh =
      guild.channels.cache.get(bc) || (await guild.channels.fetch(bc).catch(() => null));
    if (boardCh?.isTextBased?.()) {
      const boardMsg = await boardCh.messages.fetch(bm).catch(() => null);
      if (boardMsg) {
        const now = new Date();
        const dateStr = now.toLocaleDateString("it-IT");
        const timeStr = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        const removedEmbed = new EmbedBuilder()
          .setColor(TENANT_EMBED_COLOR)
          .setTitle("🗑️ Citazione rimossa")
          .setDescription("Questa citazione è stata rimossa dall'autore.")
          .addFields(
            { name: "Rimossa da", value: `<@${uid}>`, inline: true },
            { name: "Data rimozione", value: `${dateStr} ${timeStr}`, inline: true },
          )
          .setFooter({
            text: `Gestisci le quote dal profilo sul sito · Personalizza: https://www.viniliecaffe.it/personalizza/ · Oggi alle ${timeStr}`,
          });
        await boardMsg
          .edit({ embeds: [removedEmbed], components: [], files: [], attachments: [] })
          .catch(async () => {
            if (typeof boardMsg.delete === "function") await boardMsg.delete().catch(() => null);
          });
      }
    }
  }

  if (oc && om && om !== "0") {
    const originCh =
      guild.channels.cache.get(oc) || (await guild.channels.fetch(oc).catch(() => null));
    if (originCh?.isTextBased?.()) {
      const originMsg = await originCh.messages.fetch(om).catch(() => null);
      if (originMsg && typeof originMsg.delete === "function") {
        await originMsg.delete().catch(() => null);
      }
    }
  }

  await decrementQuoteCount(gid).catch(() => null);
  return { ok: true };
}

async function deleteQuoteBoardRecordByMessage(guildId?, boardChannelId?, boardMessageId?) {
  const gid = String(guildId || "").trim();
  const bc = String(boardChannelId || "").trim();
  const bm = String(boardMessageId || "").trim();
  if (!gid || !bc || !bm) return false;
  const out = await GuildQuoteBoard.deleteOne({
    guildId: gid,
    boardChannelId: bc,
    boardMessageId: bm,
  }).catch(() => null);
  return Number(out?.deletedCount || 0) > 0;
}

export = {
  messageJumpUrl,
  registerQuoteBoardPost,
  listQuotesByUser,
  deleteUserQuoteEntry,
  deleteQuoteBoardRecordByMessage,
  buildQuoteBoardComponents,
};

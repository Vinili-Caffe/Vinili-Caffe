/** Repost: roulette (un repost a caso) e i repost di un utente. */
const { GuildRepost } = require("../schemas/guildBoardPostSchema") as typeof import("../schemas/guildBoardPostSchema");
const { resolveRoulettePostChannel } = require("../utils/Quote/repostRoulettePostChannel") as typeof import("../utils/Quote/repostRoulettePostChannel");
const { serializableMediaFiles, isImageAttachmentMeta, prepareRepostSendMedia, resolveRepostMediaFilesForSend } = require("./repostMedia") as typeof import("./repostMedia");
const { messageJumpUrl, buildRouletteEmbed, buildRepostaButtonRow } = require("./repostEmbeds") as typeof import("./repostEmbeds");

const ROULETTE_RECENT_LIMIT = Math.max(
  15,
  Math.min(80, Number(process.env.VC_REPOST_ROULETTE_RECENT_LIMIT || 40)),
);
const ROULETTE_PICK_ATTEMPTS = 12;

const recentRouletteSourceKeysByGuild = new Map();

function isRepostDisabledInGuild(guildId?) {
  try {
    const { isTenantBoardFeatureEnabledSync } = require("../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../MultiGuild/core/tenantGuildSettings");
    return !isTenantBoardFeatureEnabledSync(guildId, "repost");
  } catch {
    return false;
  }
}

function repostSourceKey(doc?) {
  const sc = String(doc?.sourceChannelId || "").trim();
  const sm = String(doc?.sourceMessageId || "").trim();
  if (!sc || !sm) return "";
  return `${sc}:${sm}`;
}

function pushRouletteSourceKey(guildId?, sourceKey?) {
  const gid = String(guildId || "").trim();
  const key = String(sourceKey || "").trim();
  if (!gid || !key) return;
  const prev = recentRouletteSourceKeysByGuild.get(gid) || [];
  const next = prev.filter((entry?) => entry !== key);
  next.push(key);
  while (next.length > ROULETTE_RECENT_LIMIT) next.shift();
  recentRouletteSourceKeysByGuild.set(gid, next);
}

async function aggregateRandomUniqueRepost(guildId?, excludeKeys = null) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;

  const pipeline = [
    { $match: { guildId: gid } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { sc: "$sourceChannelId", sm: "$sourceMessageId" },
        doc: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$doc" } },
  ];

  if (excludeKeys instanceof Set && excludeKeys.size) {
    pipeline.push(({
      $match: {
        $expr: {
          $not: {
            $in: [{ $concat: ["$sourceChannelId", ":", "$sourceMessageId"] }, Array.from(excludeKeys)],
          },
        },
      },
    } as any));
  }

  pipeline.push(({ $sample: { size: 1 } } as any));

  const rows = await GuildRepost.aggregate((pipeline as any)).catch(() => []);
  return rows?.[0] || null;
}

async function pickRandomRepostForGuild(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;

  const recent = new Set(recentRouletteSourceKeysByGuild.get(gid) || []);
  let doc = null;

  for (let attempt = 0; attempt < ROULETTE_PICK_ATTEMPTS; attempt += 1) {
    doc = await aggregateRandomUniqueRepost(gid, recent);
    if (!doc) break;
    const sourceKey = repostSourceKey(doc);
    if (!sourceKey || !recent.has(sourceKey)) break;
  }

  if (!doc) {
    doc = await aggregateRandomUniqueRepost(gid);
  }

  const sourceKey = repostSourceKey(doc);
  if (sourceKey) pushRouletteSourceKey(gid, sourceKey);
  return doc;
}

/** L'originale esiste ancora? Solo "messaggio/canale sconosciuto" conta come sparito (non i permessi o gli errori di rete). */
async function repostSourceStillExists(guild?, doc?) {
  const sc = String(doc?.sourceChannelId || "").trim();
  const sm = String(doc?.sourceMessageId || "").trim();
  if (!sc || !sm) return true;
  try {
    const channel = guild.channels.cache.get(sc) || (await guild.channels.fetch(sc));
    if (!channel?.isTextBased?.()) return true;
    await channel.messages.fetch(sm);
    return true;
  } catch (err) {
    const code = Number(err?.code || err?.rawError?.code);
    return !(code === 10008 || code === 10003);
  }
}

async function sendRepostRoulette(client?, guildId?) {
  if (isRepostDisabledInGuild(guildId)) return false;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return false;

  /* repostOrphan1: niente repost di messaggi che non esistono più */
  const { isSiteBoardChannel: isSiteSource } = require("../../site/bacheca/bachecaSite") as typeof import("../../site/bacheca/bachecaSite");
  let doc = null;
  for (let tries = 0; tries < 6 && !doc; tries += 1) {
    const pick = await pickRandomRepostForGuild(guildId);
    if (!pick) return false;
    if (isSiteSource(pick.sourceChannelId) || (await repostSourceStillExists(guild, pick))) {
      doc = pick;
      break;
    }
    const { purgeRepostsOfDeletedSource } = require("./repostRemove") as typeof import("./repostRemove");
    await purgeRepostsOfDeletedSource(guild, pick.sourceChannelId, pick.sourceMessageId).catch(() => null);
  }
  if (!doc) return false;

  const rouletteChannel = await resolveRoulettePostChannel(guild);
  if (!rouletteChannel?.isTextBased?.()) return false;

  /* bachecaSite1: le clip nuove nascono sulla Bacheca del sito (sorgente "site") */
  const { isSiteBoardChannel, bachecaItemUrl } = require("../../site/bacheca/bachecaSite") as typeof import("../../site/bacheca/bachecaSite");
  const sourceUrl = isSiteBoardChannel(doc.sourceChannelId)
    ? bachecaItemUrl(doc.sourceMessageId)
    : messageJumpUrl(guildId, doc.sourceChannelId, doc.sourceMessageId);
  const imageUrl = String(doc.attachmentUrl || "").trim();
  const text = String(doc.content || "").trim();
  const rouletteFiles = await resolveRepostMediaFilesForSend(guild, doc);
  const rouletteSendMedia = prepareRepostSendMedia({ imageUrl, files: rouletteFiles });

  let prefix = "+";
  try {
    const { resolveCommandPrefixForGuild } = require("../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../MultiGuild/core/tenantGuildSettings");
    prefix = resolveCommandPrefixForGuild(guildId, client) || "+";
  } catch {
    prefix = String(client?.config?.prefix || "+").trim() || "+";
  }
  let count = "";
  try {
    count = String(await GuildRepost.countDocuments({ guildId: String(guildId) }).catch(() => 0) || 0);
  } catch {
    count = "";
  }
  const embed = buildRouletteEmbed({
    sourceUrl,
    text,
    imageUrl: rouletteSendMedia.embedImageUrl,
    guildId,
    prefix,
    count,
    authorId: String(doc.sourceAuthorId || "").trim(),
    reposterId: String(doc.reposterUserId || "").trim(),
  });
  const repostId = String(doc._id);

  const roulettePayload: Record<string, any> = {
    embeds: [embed],
    components: [buildRepostaButtonRow(repostId)],
  };
  if (rouletteSendMedia.files.length) roulettePayload.files = rouletteSendMedia.files;

  const { withBoardDraft } = require("../utils/boardDrafts") as typeof import("../utils/boardDrafts");
  await rouletteChannel.send(withBoardDraft(roulettePayload)).catch(() => null);

  return true;
}

async function listRepostsByUser(guildId?, userId?, opts: Record<string, any> = {}) {
  const limit = Math.min(25, Math.max(1, Number(opts.limit) || 10));
  const skip = Math.max(0, Number(opts.skip) || 0);
  const filter: Record<string, any> = { guildId: String(guildId), reposterUserId: String(userId) };
  const clipFilter = {
    $or: [
      {
        $expr: {
          $and: [
            { $eq: ["$sourceChannelId", "$sourceMessageId"] },
            { $eq: ["$boardChannelId", "$boardMessageId"] },
            { $eq: ["$sourceChannelId", "$boardChannelId"] },
          ],
        },
      },
      {
        $expr: {
          $and: [
            { $eq: ["$sourceChannelId", "$boardChannelId"] },
            { $eq: ["$sourceMessageId", "$boardMessageId"] },
            { $ne: ["$sourceMessageId", ""] },
          ],
        },
      },
      { sourceMessageId: "pending" },
      { "mediaFiles.name": { $regex: /^clip\.mp3$/i } },
    ],
  };
  if (opts.clipsOnly) {
    Object.assign(filter, clipFilter);
  } else if (opts.excludeClips) {
    filter.$nor = [clipFilter];
  }
  const [rows, total] = await Promise.all([
    GuildRepost.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    GuildRepost.countDocuments(filter).catch(() => 0),
  ]);
  return { rows: rows || [], total: Number(total) || 0 };
}

function resolveRepostPreviewImageUrl(row?) {
  const direct = String(row?.attachmentUrl || "").trim();
  if (direct && !direct.startsWith("attachment://")) return direct;
  for (const file of serializableMediaFiles(row?.mediaFiles)) {
    if (isImageAttachmentMeta(file.name)) return file.url;
  }
  return "";
}

export = { isRepostDisabledInGuild, sendRepostRoulette, listRepostsByUser, resolveRepostPreviewImageUrl };

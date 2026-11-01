/** Bacheca sul sito: import (una volta sola) dei vecchi post 💀 del canale #bacheca.
 *  Prima la skullboard salvava solo gli id (messaggio → post): qui si legge il post nel canale,
 *  si copia l'immagine sul CDN e si salva il contenuto come GuildSkullPost. Quote, repost e clip
 *  erano già nel database e il sito li mostra così come sono. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { GlobalSettings } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { GuildSkullPost } = require("../../Schemas/Community/guildBoardPostSchema") as typeof import("../../Schemas/Community/guildBoardPostSchema");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { mirrorUrlToBacheca, isBachecaSiteGuild } = require("./bachecaSite") as typeof import("./bachecaSite");

const STATE_KEY = "bachecaSkullImport.v1";
const GAP_MS = 350;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fieldValue(embed?, label?: RegExp) {
  const f = (embed?.fields || []).find((x?) => label.test(String(x?.name || "")));
  return String(f?.value || "");
}

/** Data di un messaggio Discord ricavata dal suo id. */
function snowflakeDate(id?) {
  try {
    return new Date(Number((BigInt(String(id)) >> 22n) + 1420070400000n));
  } catch {
    return null;
  }
}

/** I post importati con la data dell'import (la prima versione non riusciva a scriverla) prendono quella vera del post. */
async function fixImportedSkullDates(guildId: string) {
  const rows: any[] = await GuildSkullPost.find({ guildId, boardMessageId: { $regex: /^\d{16,20}$/ } })
    .select("_id boardMessageId createdAt")
    .lean()
    .catch(() => []);
  let fixed = 0;
  for (const r of rows) {
    const real = snowflakeDate(r.boardMessageId);
    if (!real || Math.abs(new Date(r.createdAt).getTime() - real.getTime()) < 60 * 60 * 1000) continue;
    await GuildSkullPost.collection.updateOne({ _id: r._id }, { $set: { createdAt: real, updatedAt: real } }).catch(() => null);
    fixed += 1;
  }
  if (fixed) global.logger?.info?.(`[BACHECA] date dei post 💀 importati corrette: ${fixed}`);
}

async function importOldSkullPosts(client?) {
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !isBachecaSiteGuild(guildId)) return { ok: false, reason: "disabled" };
  await fixImportedSkullDates(guildId).catch(() => null);
  const done = await getBotState(STATE_KEY, null).catch(() => null);
  if (done?.finishedAt) return { ok: true, skipped: true };
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  const channel = guild ? await getGuildChannelCached(guild, String(IDs.channels?.quotes || "")).catch(() => null) : null;
  if (!channel?.messages?.fetch) return { ok: false, reason: "no_channel" };
  const settings: any = await GlobalSettings.findOne({ guildId }).select("skullboardPosts").lean().catch(() => null);
  const rows = (settings?.skullboardPosts || []).filter((r?) => /^\d{16,20}$/.test(String(r?.postMessageId || "")));
  let imported = 0;
  let missing = 0;
  for (const row of rows) {
    const sourceMessageId = String(row.messageId);
    const postId = String(row.postMessageId);
    if (await GuildSkullPost.exists({ guildId, sourceMessageId }).catch(() => null)) continue;
    const post = await channel.messages.fetch(postId).catch(() => null);
    await sleep(GAP_MS);
    if (!post) {
      missing += 1;
      continue;
    }
    const embed = post.embeds?.[0];
    const authorId = (/<@!?(\d{16,20})>/.exec(fieldValue(embed, /autore/i)) || [])[1] || "";
    const sourceChannelId = (/<#(\d{16,20})>/.exec(fieldValue(embed, /canale/i)) || [])[1] || "";
    if (!authorId) {
      missing += 1;
      continue;
    }
    const image = [...(post.attachments?.values?.() || [])].find((a?) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(a?.name || a?.url || "")));
    const imageUrl = image?.url ? await mirrorUrlToBacheca("skull", postId, image.url, image.name || "skullboard.png") : String(embed?.image?.url || "");
    const skullReaction = post.reactions?.cache?.find?.((r?) => r?.emoji?.name === "💀" || r?.emoji?.name === "☠️");
    const createdAt = post.createdAt instanceof Date ? post.createdAt : new Date();
    await GuildSkullPost.create({
      guildId,
      boardChannelId: String(channel.id),
      boardMessageId: postId,
      sourceAuthorId: authorId,
      sourceChannelId,
      sourceMessageId,
      firstReactorId: "",
      content: "",
      imageUrl,
      authorUsername: String(embed?.author?.name || ""),
      authorAvatarUrl: String(embed?.author?.iconURL || embed?.author?.icon_url || ""),
      skullCount: Math.max(1, Number(skullReaction?.count || 1) - 1),
    })
      .then(async (doc?) => {
        imported += 1;
        /* data vera del post, non quella dell'import (createdAt è immutabile per mongoose: si scrive col driver) */
        await GuildSkullPost.collection.updateOne({ _id: doc._id }, { $set: { createdAt, updatedAt: createdAt } }).catch(() => null);
      })
      .catch(() => null);
  }
  await setBotState(STATE_KEY, { finishedAt: new Date().toISOString(), imported, missing, total: rows.length }).catch(() => null);
  global.logger?.info?.(`[BACHECA] import vecchi post 💀: ${imported} importati, ${missing} non trovati su ${rows.length}`);
  return { ok: true, imported, missing };
}

/** Quote e repost vecchi con link di Discord (scadono dopo un giorno): il bot, che vede il canale #bacheca,
 *  rilegge il messaggio e copia i media sul CDN. A ogni avvio, solo quelli rimasti; quelli già sul CDN si saltano. */
async function stabilizeOldBoardMedia(client?) {
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !isBachecaSiteGuild(guildId)) return { ok: false };
  const { GuildQuoteBoard, GuildRepost } = require("../../Schemas/Community/guildBoardPostSchema") as typeof import("../../Schemas/Community/guildBoardPostSchema");
  const { stabilizeQuoteMedia, stabilizeRepostMedia } = require("../boards/boardMediaStable") as typeof import("../boards/boardMediaStable");
  const discordRe = /cdn\.discordapp\.com|media\.discordapp\.net/i;
  const quotes: any[] = await GuildQuoteBoard.find({ guildId, imageUrl: { $regex: discordRe } }).lean().catch(() => []);
  const reposts: any[] = await GuildRepost.find({
    guildId,
    $or: [{ attachmentUrl: { $regex: discordRe } }, { "mediaFiles.url": { $regex: discordRe } }],
  })
    .lean()
    .catch(() => []);
  let fixed = 0;
  let failed = 0;
  /* non recuperabili: si segnano, così il muro può nasconderli se non hanno testo */
  const markLost = (model?, id?) => model.updateOne({ _id: id }, { $set: { mediaLost: true } }).catch(() => null);
  for (const doc of quotes) {
    const url = await stabilizeQuoteMedia(client, doc).catch(() => "");
    if (url && /cdn\.viniliecaffe\.it/i.test(url)) fixed += 1;
    else {
      failed += 1;
      await markLost(GuildQuoteBoard, doc._id);
    }
    await sleep(GAP_MS);
  }
  for (const doc of reposts) {
    const out: any = await stabilizeRepostMedia(client, doc).catch(() => null);
    const urls = [out?.attachmentUrl, ...(out?.mediaFiles || []).map((f?) => f?.url)].filter(Boolean);
    if (urls.length && urls.every((u) => !discordRe.test(String(u)))) fixed += 1;
    else {
      failed += 1;
      await markLost(GuildRepost, doc._id);
    }
    await sleep(GAP_MS);
  }
  if (quotes.length || reposts.length) {
    global.logger?.info?.(`[BACHECA] media vecchi copiati sul CDN: ${fixed} ok, ${failed} non recuperabili (su ${quotes.length} quote e ${reposts.length} repost)`);
  }
  return { ok: true, fixed, failed };
}

export = { importOldSkullPosts, stabilizeOldBoardMedia };

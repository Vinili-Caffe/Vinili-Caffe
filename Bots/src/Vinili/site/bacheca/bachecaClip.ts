/** Bacheca sul sito: clip vocale salvata senza messaggio nel canale (mp3 sul CDN). */
const fs = require("fs") as typeof import("fs");
const { GuildRepost } = require("../../Schemas/Community/repostSchema") as typeof import("../../Schemas/Community/repostSchema");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { SITE_BOARD_CHANNEL, newBachecaItemId, bachecaItemUrl, putBachecaMedia, broadcastBachecaChanged } = require("./bachecaSite") as typeof import("./bachecaSite");

/** Come le clip pubblicate nel canale: sorgente = bacheca (così il resto del codice la riconosce come clip). */
async function registerBachecaClip(ctx: { guildId?: string; requester?: any; requesterId?: string; mp3Path?: string; transcription?: string; totalPosts?: number }) {
  const gid = String(ctx.guildId || "").trim();
  const uid = String(ctx.requesterId || "").trim();
  if (!gid || !uid || !ctx.mp3Path || !fs.existsSync(ctx.mp3Path)) return { ok: false as const };
  const itemId = newBachecaItemId();
  const mp3Url = await putBachecaMedia("clip", itemId, "clip.mp3", fs.readFileSync(ctx.mp3Path), "audio/mpeg");
  if (!mp3Url) return { ok: false as const };
  const doc = await GuildRepost.create({
    guildId: gid,
    reposterUserId: uid,
    sourceAuthorId: uid,
    sourceChannelId: SITE_BOARD_CHANNEL,
    sourceMessageId: itemId,
    content: String(ctx.transcription || "").trim(),
    attachmentUrl: "",
    mediaFiles: [{ url: mp3Url, name: "clip.mp3" }],
    authorUsername: accountUsername(ctx.requester) || "Utente",
    authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(ctx.requester, { size: 512 }) || "",
    boardChannelId: SITE_BOARD_CHANNEL,
    boardMessageId: itemId,
    totalPosts: Number(ctx.totalPosts) || 0,
  }).catch(() => null);
  if (!doc?._id) return { ok: false as const };
  broadcastBachecaChanged("new", itemId);
  return { ok: true as const, itemId, boardUrl: bachecaItemUrl(itemId) };
}

export = { registerBachecaClip };

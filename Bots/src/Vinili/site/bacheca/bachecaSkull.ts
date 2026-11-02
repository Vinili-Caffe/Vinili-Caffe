/** Bacheca sul sito: messaggio appeso con la 💀 (immagine della card e allegati sul CDN, testo salvato). */
const { GuildSkullPost } = require("../../Schemas/Community/guildBoardPostSchema") as typeof import("../../Schemas/Community/guildBoardPostSchema");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { SITE_BOARD_CHANNEL, newBachecaItemId, putBachecaMedia, mirrorUrlToBacheca, broadcastBachecaChanged } = require("./bachecaSite") as typeof import("./bachecaSite");

async function registerBachecaSkull(ctx: {
  message: any;
  member?: any;
  reactorId?: string;
  content?: string;
  canvasBuffer?: Buffer;
  files?: { attachment: string; name: string }[];
  skullCount?: number;
}) {
  const message = ctx.message;
  const gid = String(message?.guild?.id || "");
  if (!gid || !message?.id || !message?.author?.id) return { ok: false as const };
  const itemId = newBachecaItemId();
  const imageUrl = ctx.canvasBuffer ? await putBachecaMedia("skull", itemId, "skullboard.png", ctx.canvasBuffer, "image/png") : "";
  const mediaFiles = [];
  for (const f of (ctx.files || []).slice(0, 4)) {
    mediaFiles.push({ url: await mirrorUrlToBacheca("skull", itemId, f.attachment, f.name), name: String(f.name || "") });
  }
  const who = ctx.member || message.author;
  const doc = await GuildSkullPost.create({
    guildId: gid,
    boardChannelId: SITE_BOARD_CHANNEL,
    boardMessageId: itemId,
    sourceAuthorId: String(message.author.id),
    sourceChannelId: String(message.channel?.id || ""),
    sourceMessageId: String(message.id),
    firstReactorId: String(ctx.reactorId || ""),
    content: String(ctx.content || "").slice(0, 4000),
    imageUrl,
    ...(mediaFiles.length ? { mediaFiles } : {}),
    authorUsername: accountUsername(who) || String(message.author.username || "Utente"),
    authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(who, { size: 256 }) || "",
    skullCount: Math.max(1, Number(ctx.skullCount || 1)),
  }).catch((err?) => {
    global.logger?.warn?.("[BACHECA] skull save:", err?.message || err);
    return null;
  });
  if (!doc?._id) return { ok: false as const };
  broadcastBachecaChanged("new", itemId);
  return { ok: true as const, itemId };
}

export = { registerBachecaSkull };

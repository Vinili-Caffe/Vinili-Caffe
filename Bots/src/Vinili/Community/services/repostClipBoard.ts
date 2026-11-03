/** Repost: pubblicazione delle clip vocali in bacheca. */
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { GuildRepost } = require("../schemas/guildBoardPostSchema") as typeof import("../schemas/guildBoardPostSchema");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { buildBoardMessageComponents } = require("./repostEmbeds") as typeof import("./repostEmbeds");
const { timedRepostQuery, editBoardMessageKeepAttachments } = require("./repostBoardSync") as typeof import("./repostBoardSync");
const { isRepostDisabledInGuild } = require("./repostRoulette") as typeof import("./repostRoulette");

async function registerClipBoardPost(ctx?) {
  const {
    guild,
    guildId,
    requesterId,
    requester,
    boardChannelId,
    boardMessage,
    transcription,
    totalPosts,
    boardEmbed,
    mp3Path,
    postChannel,
  } = ctx;
  const gid = String(guildId || guild?.id || "").trim();
  const uid = String(requesterId || "").trim();
    if (mp3Path && postChannel?.send && boardEmbed) {
    if (isRepostDisabledInGuild(gid) || !gid || !uid) {
      return { ok: false };
    }
    const authorLabel = accountUsername(requester) || "Utente";
    const doc = await GuildRepost.create({
      guildId: gid,
      reposterUserId: uid,
      sourceAuthorId: uid,
      sourceChannelId: String(postChannel.id),
      sourceMessageId: "pending",
      content: String(transcription || "").trim(),
      attachmentUrl: "",
      mediaFiles: [],
      authorUsername: authorLabel,
      authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(requester, { size: 512 }) || "",
      boardChannelId: String(postChannel.id),
      boardMessageId: "",
      totalPosts: Number(totalPosts) || 0,
    }).catch(() => null);
    if (!doc?._id) return { ok: false };

    const repostId = String(doc._id);
    const components = buildBoardMessageComponents(repostId, {
      _id: repostId,
      boardKind: "clip",
      reposterUserId: uid,
      sourceChannelId: String(postChannel.id),
      sourceMessageId: "pending",
      boardChannelId: String(postChannel.id),
      boardMessageId: "",
      mediaFiles: [{ url: "", name: "clip.mp3" }],
    });

    const attachment = new AttachmentBuilder(mp3Path, { name: "clip.mp3" });
    const boardMsg = await postChannel
      .send({
        files: [attachment],
        embeds: [boardEmbed],
        components,
        allowedMentions: { users: [uid] },
      })
      .catch((err?) => {
        global.logger?.warn?.("[clip] board send:", err?.message || err);
        return null;
      });

    if (!boardMsg?.id) {
      await GuildRepost.deleteOne({ _id: doc._id }).catch(() => null);
      return { ok: false };
    }

    let mp3Url = "";
    let mp3Name = "clip.mp3";
    for (const att of boardMsg.attachments?.values() || []) {
      const url = String(att?.url || "").trim();
      if (!url) continue;
      const name = String(att?.name || "").trim();
      const ct = String(att?.contentType || "").toLowerCase();
      if (name.toLowerCase() === "clip.mp3" || ct.startsWith("audio/")) {
        mp3Url = url;
        mp3Name = name || "clip.mp3";
        break;
      }
    }

    await timedRepostQuery(
      GuildRepost.updateOne(
        { _id: doc._id },
        {
          $set: {
            sourceChannelId: String(postChannel.id),
            sourceMessageId: String(boardMsg.id),
            boardChannelId: String(postChannel.id),
            boardMessageId: String(boardMsg.id),
            mediaFiles: mp3Url ? [{ url: mp3Url, name: mp3Name }] : [],
          },
        },
      ),
      "clip board update",
    ).catch(() => null);

    return { ok: true, repostId, boardMessage: boardMsg };
  }

    const cid = String(boardChannelId || "").trim();
  const mid = String(boardMessage?.id || "").trim();
  if (isRepostDisabledInGuild(gid) || !gid || !uid || !cid || !mid || !boardMessage) {
    return { ok: false };
  }

  let mp3Url = "";
  let mp3Name = "clip.mp3";
  for (const att of boardMessage.attachments?.values() || []) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    const name = String(att?.name || "").trim();
    const ct = String(att?.contentType || "").toLowerCase();
    if (name.toLowerCase() === "clip.mp3" || ct.startsWith("audio/")) {
      mp3Url = url;
      mp3Name = name || "clip.mp3";
      break;
    }
  }
  if (!mp3Url) return { ok: false };

  const authorLabel = accountUsername(requester) || "Utente";
  const doc = await GuildRepost.create({
    guildId: gid,
    reposterUserId: uid,
    sourceAuthorId: uid,
    sourceChannelId: cid,
    sourceMessageId: mid,
    content: String(transcription || "").trim(),
    attachmentUrl: "",
    mediaFiles: [{ url: mp3Url, name: mp3Name }],
    authorUsername: authorLabel,
    authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(requester, { size: 512 }) || "",
    boardChannelId: cid,
    boardMessageId: mid,
    totalPosts: Number(totalPosts) || 0,
  }).catch(() => null);

  if (!doc?._id) return { ok: false };
  const repostId = String(doc._id);
  const components = buildBoardMessageComponents(repostId, {
    _id: repostId,
    boardKind: "clip",
    reposterUserId: uid,
    sourceChannelId: cid,
    sourceMessageId: mid,
    boardChannelId: cid,
    boardMessageId: mid,
    mediaFiles: [{ url: mp3Url, name: mp3Name }],
  });
  await editBoardMessageKeepAttachments(boardMessage, { components });
  return { ok: true, repostId, boardMessage };
}

export = { registerClipBoardPost };

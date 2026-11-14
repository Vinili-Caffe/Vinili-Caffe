/** Repost: rimozione di un repost o di una clip. */
const { GuildRepost } = require("../schemas/guildBoardPostSchema") as typeof import("../schemas/guildBoardPostSchema");
const { decrementRepostCount, decrementClipCount } = require("./globalSettingsBucket") as typeof import("./globalSettingsBucket");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { isClipRepostDoc } = require("./repostClips") as typeof import("./repostClips");
const { REPOST_REMOVE_PREFIX } = require("./repostEmbeds") as typeof import("./repostEmbeds");
const { timedRepostQuery, syncBoardMessageComponents, applyBoardMessageRemovedState } = require("./repostBoardSync") as typeof import("./repostBoardSync");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const EPHEMERAL_FLAG = 1 << 6;

function memberCanForceDeleteClip(member?, guildId?) {
  try {
    const { memberCanForceDeleteBoardItem } = require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation");
    if (memberCanForceDeleteBoardItem(member, guildId, "clip")) return true;
  } catch {
    /* fallback sotto */
  }
  if (!member?.roles?.cache) return false;
  const highStaffId = String(IDs.roles?.HighStaff || "").trim();
  const directorId = String(IDs.roles?.Director || "").trim();
  return Boolean(
    (highStaffId && member.roles.cache.has(highStaffId)) ||
      (directorId && member.roles.cache.has(directorId)),
  );
}

function memberCanForceDeleteRepost(member?, guildId?) {
  try {
    const { memberCanForceDeleteBoardItem } = require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation");
    return memberCanForceDeleteBoardItem(member, guildId, "repost");
  } catch {
    return memberCanForceDeleteClip(member, guildId);
  }
}

async function deleteClipCompletely(guild?, boardChannelId?, boardMessageId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guild?.id || "").trim();
  const bc = String(boardChannelId || "").trim();
  const bm = String(boardMessageId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !bc || !bm || !uid) return { ok: false, message: "Clip non trovata." };

  const forceStaff = options.forceStaff === true;
  const clipQuery = forceStaff
    ? { guildId: gid, boardChannelId: bc, boardMessageId: bm }
    : { guildId: gid, boardChannelId: bc, boardMessageId: bm, reposterUserId: uid };

  const clipDoc = await timedRepostQuery(
    GuildRepost.findOne(clipQuery).lean(),
    "repost clip find",
  ).catch(() => null);

  if (!clipDoc?._id || !isClipRepostDoc(clipDoc)) {
    return {
      ok: false,
      message: forceStaff
        ? "Clip non trovata."
        : "Solo l'autore della clip (o High Staff) può rimuoverla.",
    };
  }

  if (!forceStaff && String(clipDoc.reposterUserId || "") !== uid) {
    return { ok: false, message: "Solo l'autore della clip (o High Staff) può rimuoverla." };
  }

  const deleteResult = await timedRepostQuery(
    GuildRepost.deleteMany({
      guildId: gid,
      $or: [
        { boardChannelId: bc, boardMessageId: bm },
        { sourceChannelId: bc, sourceMessageId: bm },
      ],
    }),
    "repost clip delete",
  ).catch(() => null);

  await applyBoardMessageRemovedState(guild, bc, bm, uid, true);
  if (Number(deleteResult?.deletedCount) > 0) {
    await decrementClipCount(gid).catch(() => null);
  }
  return { ok: true, isClip: true, deletedCount: Number(deleteResult?.deletedCount) || 0 };
}

async function deleteUserRepostEntry({ guild, client, repostId, userId, forceStaff = false }) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  const rid = String(repostId || "").trim();
  if (!gid || !uid || !rid) return { ok: false, message: "Repost non valido." };

  const doc = await timedRepostQuery(GuildRepost.findById(rid).lean(), "repost find by id").catch(() => null);
  if (!doc?._id || String(doc.guildId) !== gid) {
    return { ok: false, message: "Repost non trovato." };
  }
  if (!forceStaff && String(doc.reposterUserId) !== uid) {
    return { ok: false, message: "Puoi rimuovere solo i tuoi repost." };
  }

  if (isClipRepostDoc(doc)) {
    return deleteClipCompletely(guild, doc.boardChannelId, doc.boardMessageId, uid, {
      forceStaff: Boolean(forceStaff),
    });
  }

  /* High staff: toglie l’intero contenuto dalla bacheca (tutti i repost sullo stesso messaggio). */
  if (forceStaff) {
    const bc = String(doc.boardChannelId || "").trim();
    const bm = String(doc.boardMessageId || "").trim();
    const deleted = await timedRepostQuery(
      GuildRepost.deleteMany(bc && bm ? { guildId: gid, boardChannelId: bc, boardMessageId: bm } : { _id: doc._id }),
      "repost staff force delete",
    ).catch(() => null);
    if (bc && bm) {
      await applyBoardMessageRemovedState(guild, bc, bm, uid, false);
      await decrementRepostCount(gid).catch(() => null);
    }
    return { ok: true, isClip: false, boardRemoved: true, deletedCount: Number(deleted?.deletedCount) || 0 };
  }

  const bc = String(doc.boardChannelId || "").trim();
  const bm = String(doc.boardMessageId || "").trim();

  await timedRepostQuery(GuildRepost.deleteOne({ _id: doc._id }), "repost delete one").catch(() => null);

  if (!bc || !bm) return { ok: true, isClip: false };

  const remainingOnBoard = await timedRepostQuery(
    GuildRepost.countDocuments({ guildId: gid, boardChannelId: bc, boardMessageId: bm }),
    "repost board remaining",
  ).catch(() => 0);

  if (remainingOnBoard <= 0) {
    await applyBoardMessageRemovedState(guild, bc, bm, uid, false);
    await decrementRepostCount(gid).catch(() => null);
    return { ok: true, isClip: false, boardRemoved: true };
  }

  await syncBoardMessageComponents(guild, bc, bm);
  return { ok: true, isClip: false, boardRemoved: false };
}

/**
 * Il messaggio originale non esiste più: via i repost collegati (database, sito, bacheca su Discord).
 * Le clip non c'entrano (la loro sorgente non è un messaggio Discord).
 */
async function purgeRepostsOfDeletedSource(guild?, sourceChannelId?, sourceMessageId?) {
  const gid = String(guild?.id || "").trim();
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!gid || !sc || !sm) return 0;
  const docs = await timedRepostQuery(
    GuildRepost.find({ guildId: gid, sourceChannelId: sc, sourceMessageId: sm }).lean(),
    "repost orphan find",
  ).catch(() => []);
  const reposts = (Array.isArray(docs) ? docs : []).filter((d?) => d?._id && !isClipRepostDoc(d));
  if (!reposts.length) return 0;
  await timedRepostQuery(
    GuildRepost.deleteMany({ _id: { $in: reposts.map((d?) => d._id) } }),
    "repost orphan delete",
  ).catch(() => null);
  /* un messaggio in bacheca per ogni repost di quell'originale: si toglie se non ne resta nessun altro */
  const boards = new Map();
  for (const d of reposts) {
    const bc = String(d.boardChannelId || "").trim();
    const bm = String(d.boardMessageId || "").trim();
    if (bc && bm) boards.set(`${bc}:${bm}`, { bc, bm });
  }
  for (const { bc, bm } of boards.values()) {
    const remaining = await timedRepostQuery(
      GuildRepost.countDocuments({ guildId: gid, boardChannelId: bc, boardMessageId: bm }),
      "repost orphan board remaining",
    ).catch(() => 0);
    if (remaining > 0) {
      await syncBoardMessageComponents(guild, bc, bm).catch(() => null);
      continue;
    }
    const channel = guild.channels?.cache?.get(bc) || (await guild.channels?.fetch?.(bc).catch(() => null));
    const boardMsg = channel?.isTextBased?.() ? await channel.messages.fetch(bm).catch(() => null) : null;
    if (boardMsg) await boardMsg.delete().catch(() => null);
    await decrementRepostCount(gid).catch(() => null);
  }
  return reposts.length;
}

function parseRepostRemoveButton(customId?) {
  const id = String(customId || "");
  const modern = id.match(/^repost_remove:([a-f0-9]{24})$/i);
  if (modern) return { repostId: modern[1] };
    const legacy = id.match(/^repost_remove:(\d{16,20}):([a-f0-9]{24})$/i);
  if (!legacy) return null;
  return { ownerUserId: legacy[1], repostId: legacy[2] };
}

function isRepostRemoveButton(customId?) {
  return String(customId || "").startsWith(REPOST_REMOVE_PREFIX);
}

async function findClickerRepostForBoardAnchor(guildId?, anchorDoc?, clickerUserId?) {
  const gid = String(guildId || "").trim();
  const uid = String(clickerUserId || "").trim();
  if (!gid || !uid || !anchorDoc) return null;

  const bc = String(anchorDoc.boardChannelId || "").trim();
  const bm = String(anchorDoc.boardMessageId || "").trim();
  if (bc && bm) {
    const onBoard = await timedRepostQuery(
      GuildRepost.findOne({
        guildId: gid,
        boardChannelId: bc,
        boardMessageId: bm,
        reposterUserId: uid,
      }).lean(),
      "repost clicker on board",
    ).catch(() => null);
    if (onBoard?._id) return onBoard;
  }

  const sc = String(anchorDoc.sourceChannelId || "").trim();
  const sm = String(anchorDoc.sourceMessageId || "").trim();
  if (!sc || !sm) return null;
  return timedRepostQuery(
    GuildRepost.findOne({
      guildId: gid,
      sourceChannelId: sc,
      sourceMessageId: sm,
      reposterUserId: uid,
    }).lean(),
    "repost clicker on source",
  ).catch(() => null);
}

async function handleRepostRemoveButton(interaction?) {
  const parsed = parseRepostRemoveButton(interaction.customId);
  if (!parsed || !interaction.guild) return;

  const clickerId = String(interaction.user?.id || "").trim();
  if (!clickerId) return;

  await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => null);

  const anchor = await timedRepostQuery(
    GuildRepost.findById(parsed.repostId).lean(),
    "repost remove anchor",
  ).catch(() => null);

  if (!anchor?._id || String(anchor.guildId) !== String(interaction.guild.id)) {
    return interaction.editReply({
      content: `${E.vegax} Repost non trovato.`,
    }).catch(() => null);
  }

  const isClip = isClipRepostDoc(anchor);
  const gid = String(interaction.guild.id || "");
  const staffForce = isClip
    ? memberCanForceDeleteClip(interaction.member, gid)
    : memberCanForceDeleteRepost(interaction.member, gid);

  if (isClip) {
    const isAuthor = String(anchor.reposterUserId || "") === clickerId;
    if (!isAuthor && !staffForce) {
      return interaction.editReply({
        content: `${E.vegax} Solo l'autore della clip (o chi ha il permesso) può rimuoverla.`,
      }).catch(() => null);
    }

    const result = await deleteClipCompletely(
      interaction.guild,
      anchor.boardChannelId,
      anchor.boardMessageId,
      clickerId,
      { forceStaff: staffForce && !isAuthor },
    );

    if (!result.ok) {
      return interaction.editReply({
        content: `${E.vegax} ${result.message || "Impossibile rimuovere."}`,
      }).catch(() => null);
    }
    return interaction.editReply({
      content: `${E.VC_Verified} Clip rimossa.`,
    }).catch(() => null);
  }

  const isAuthor = String(anchor.reposterUserId || "") === clickerId;
  if (staffForce && !isAuthor) {
    const result: any = await deleteUserRepostEntry({
      guild: interaction.guild,
      client: interaction.client,
      repostId: String(anchor._id),
      userId: clickerId,
      forceStaff: true,
    });
    if (!result.ok) {
      return interaction.editReply({
        content: `${E.vegax} ${result.message || "Impossibile rimuovere."}`,
      }).catch(() => null);
    }
    return interaction.editReply({
      content: `${E.VC_Verified} Repost rimosso.`,
    }).catch(() => null);
  }

  const own = await findClickerRepostForBoardAnchor(interaction.guild.id, anchor, clickerId);
  if (!own?._id) {
    return interaction.editReply({
      content: `${E.vegax} Non hai repostato questo messaggio.`,
    }).catch(() => null);
  }

  const result: any = await deleteUserRepostEntry({
    guild: interaction.guild,
    client: interaction.client,
    repostId: String(own._id),
    userId: clickerId,
  });

  if (!result.ok) {
    return interaction.editReply({
      content: `${E.vegax} ${result.message || "Impossibile rimuovere."}`,
    }).catch(() => null);
  }

  return interaction.editReply({
    content: `${E.VC_Verified} Repost rimosso.`,
  }).catch(() => null);
}

export = { EPHEMERAL_FLAG, deleteUserRepostEntry, isRepostRemoveButton, handleRepostRemoveButton, purgeRepostsOfDeletedSource };

/**
 * Bacheca sul sito (/bacheca/): quote, repost, clip e 💀 del server principale.
 * GET    /webhooks/site-bacheca?kind=all|quote|repost|clip|skull&sort=new|top|week&page=
 * GET    /webhooks/site-bacheca/item?id=        un contenuto (link condiviso /bacheca/?p=)
 * GET    /webhooks/site-bacheca/random          "Pesca dal muro"
 * POST   /webhooks/site-bacheca/react           Bearer + { id, emoji }  → mette/toglie
 * POST   /webhooks/site-bacheca/repost          Bearer + { id }         → reposta (non le 💀), come il pulsante su Discord
 * DELETE /webhooks/site-bacheca                 Bearer + { id }         → chi l'ha pubblicato lo toglie
 * Con Authorization (facoltativo) nelle GET arrivano anche le reazioni di chi guarda.
 */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { GuildBoardPost, GuildSkullPost } = require("../../Schemas/Community/guildBoardPostSchema") as typeof import("../../Schemas/Community/guildBoardPostSchema");
const { resolveWebsiteGuildMember } = require("../../Web/siteRoleRequestApi") as typeof import("../../Web/siteRoleRequestApi");
const { getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { BACHECA_EMOJIS, toggleBachecaReaction, loadBachecaReactions } = require("./bachecaReactions") as typeof import("./bachecaReactions");
const { broadcastBachecaChanged, isSiteBoardChannel } = require("./bachecaSite") as typeof import("./bachecaSite");

const PER_PAGE = 24;
const KINDS = new Set(["all", "quote", "repost", "clip", "skull"]);
const SORTS = new Set(["new", "top", "week"]);
const ITEM_ID_RE = /^[a-f0-9]{24}$|^\d{16,20}$/i;

function mainGuildId() {
  return String(IDs.guilds?.main || "").trim();
}

function normalizeBearer(raw?) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.toLowerCase().startsWith("bearer ") ? s.slice(7).trim() : s;
}

/** Chi guarda (facoltativo): "" se non c'è token o non è valido. */
async function viewerIdFromRequest(client?, req?) {
  const token = normalizeBearer(req?.headers?.authorization);
  if (!token) return "";
  const resolved = await resolveWebsiteGuildMember(client, token).catch(() => null);
  return resolved?.ok ? String(resolved.userId || resolved.member?.id || "").trim() : "";
}

/* clip = repost nato in bacheca (sorgente = bacheca) o col file clip.mp3 */
const CLIP_MATCH = {
  $or: [{ $expr: { $eq: ["$sourceMessageId", "$boardMessageId"] } }, { sourceMessageId: "pending" }, { "mediaFiles.name": "clip.mp3" }],
};

function kindMatch(kind?) {
  if (kind === "quote") return { type: "quote" };
  if (kind === "skull") return { type: "skull" };
  if (kind === "clip") return { type: "repost", ...CLIP_MATCH };
  if (kind === "repost") return { type: "repost", $nor: CLIP_MATCH.$or };
  return {};
}

function isImageUrl(url?) {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(url || ""));
}

function isAudioName(url?, name?) {
  return /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(`${url || ""} ${name || ""}`);
}

function isVideoName(url?, name?) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(`${url || ""} ${name || ""}`);
}

function jumpUrl(guildId?, channelId?, messageId?) {
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!guildId || !/^\d{16,20}$/.test(c) || !/^\d{16,20}$/.test(m)) return "";
  return `https://discord.com/channels/${guildId}/${c}/${m}`;
}

function memberCard(guild?, userId?, fallbackName = "", fallbackAvatar = "") {
  const id = String(userId || "").trim();
  const m = id ? guild?.members?.cache?.get(id) : null;
  return {
    id,
    name: String(m?.displayName || fallbackName || "Utente"),
    avatar: String(m?.displayAvatarURL?.({ size: 128 }) || fallbackAvatar || ""),
  };
}

function itemKind(doc?) {
  if (doc?.type === "quote") return "quote";
  if (doc?.type === "skull") return "skull";
  const files = Array.isArray(doc?.mediaFiles) ? doc.mediaFiles : [];
  const isClip =
    String(doc?.sourceMessageId || "") === String(doc?.boardMessageId || "") ||
    String(doc?.sourceMessageId || "") === "pending" ||
    files.some((f?) => String(f?.name || "") === "clip.mp3");
  return isClip ? "clip" : "repost";
}

function serializeItem(row?, guild?, guildId?, rx?, mine?, viewerId = "") {
  const doc = row.doc || row;
  const id = String(doc.boardMessageId || "");
  const kind = itemKind(doc);
  const files = (Array.isArray(doc.mediaFiles) ? doc.mediaFiles : []).map((f?) => ({
    url: String(f?.url || ""),
    name: String(f?.name || ""),
  }));
  const media = files
    .filter((f) => f.url)
    .map((f) => ({
      url: f.url,
      type: isAudioName(f.url, f.name) ? "audio" : isVideoName(f.url, f.name) ? "video" : isImageUrl(f.url) || isImageUrl(f.name) ? "image" : "file",
      name: f.name,
    }));
  const base: Record<string, any> = {
    id,
    kind,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    number: Number(doc.totalPosts || 0) || null,
    reactions: rx || {},
    mine: mine || [],
    reposts: Math.max(0, Number(row.reposts || 1) - 1),
    repostedByMe: Boolean(viewerId) && (row.reposters || []).includes(viewerId),
    onDiscord: !isSiteBoardChannel(doc.boardChannelId),
  };
  if (kind === "quote") {
    return {
      ...base,
      author: memberCard(guild, doc.quotedUserId, doc.quotedUsername),
      by: memberCard(guild, doc.creatorUserId),
      text: "",
      imageUrl: String(doc.imageUrl || ""),
      media: [],
      sourceUrl: jumpUrl(guildId, doc.originChannelId, doc.originMessageId),
    };
  }
  if (kind === "skull") {
    return {
      ...base,
      author: memberCard(guild, doc.sourceAuthorId, doc.authorUsername, doc.authorAvatarUrl),
      by: memberCard(guild, doc.firstReactorId),
      text: String(doc.content || "").slice(0, 2000),
      imageUrl: String(doc.imageUrl || ""),
      media,
      skulls: Math.max(1, Number(doc.skullCount || 1)),
      sourceUrl: jumpUrl(guildId, doc.sourceChannelId, doc.sourceMessageId),
    };
  }
  const image = isImageUrl(doc.attachmentUrl) ? String(doc.attachmentUrl) : media.find((m) => m.type === "image")?.url || "";
  return {
    ...base,
    author: memberCard(guild, doc.sourceAuthorId, doc.authorUsername, doc.authorAvatarUrl),
    by: memberCard(guild, doc.reposterUserId),
    text: String(doc.content || "").slice(0, 2000),
    imageUrl: kind === "clip" ? "" : image,
    media: media.filter((m) => !(kind !== "clip" && m.url === image)),
    audioUrl: kind === "clip" ? media.find((m) => m.type === "audio")?.url || "" : "",
    sourceUrl: kind === "clip" ? "" : jumpUrl(guildId, doc.sourceChannelId, doc.sourceMessageId),
  };
}

/** Un contenuto in bacheca = tutti i doc con lo stesso boardMessageId (un repost ripetuto da più persone). */
function groupPipeline(match: Record<string, any>): any[] {
  return [
    { $match: match },
    { $sort: { createdAt: 1 } },
    { $group: { _id: "$boardMessageId", doc: { $first: "$ROOT" }, reposts: { $sum: 1 }, reposters: { $addToSet: "$reposterUserId" } } },
  ];
}

/* i contenuti vecchi hanno ancora link di Discord che scadono: si copiano sul CDN in sottofondo (la prossima volta escono dal CDN) */
const stabilizing = new Set<string>();
function stabilizeInBackground(client?, rows?: any[]) {
  const { stabilizeQuoteMedia, stabilizeRepostMedia } = require("../boards/boardMediaStable") as typeof import("../boards/boardMediaStable");
  const isCdn = (u?) => !u || /cdn\.viniliecaffe\.it/i.test(String(u));
  for (const r of rows) {
    const doc = r.doc || r;
    const key = String(doc._id || "");
    if (!key || stabilizing.has(key) || doc.type === "skull") continue;
    const stale =
      doc.type === "quote"
        ? !isCdn(doc.imageUrl)
        : !isCdn(doc.attachmentUrl) || (doc.mediaFiles || []).some((f?) => !isCdn(f?.url));
    if (!stale) continue;
    stabilizing.add(key);
    const job = doc.type === "quote" ? stabilizeQuoteMedia(client, doc) : stabilizeRepostMedia(client, doc);
    void Promise.resolve(job)
      .catch(() => null)
      .finally(() => stabilizing.delete(key));
  }
}

async function hydrate(client?, rows?: any[], viewerId = "") {
  const guildId = mainGuildId();
  stabilizeInBackground(client, rows);
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  const ids = rows.map((r) => String(r.doc?.boardMessageId || r._id || ""));
  const { counts, mine } = await loadBachecaReactions(guildId, ids, viewerId);
  return rows.map((r) => {
    const id = String(r.doc?.boardMessageId || r._id || "");
    return serializeItem(r, guild, guildId, counts.get(id), mine.get(id), viewerId);
  });
}

async function handleBachecaList(client?, req?, res?) {
  try {
    const guildId = mainGuildId();
    const kind = KINDS.has(String(req.query?.kind || "")) ? String(req.query.kind) : "all";
    const sort = SORTS.has(String(req.query?.sort || "")) ? String(req.query.sort) : "new";
    const page = Math.max(1, Math.min(200, Math.floor(Number(req.query?.page) || 1)));
    const match: Record<string, any> = { guildId, boardMessageId: { $nin: ["", null, "0", "pending"] }, ...kindMatch(kind) };
    if (sort === "week") match.createdAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    const pipeline: any[] = groupPipeline(match);
    if (sort === "new") {
      pipeline.push({ $sort: { "doc.createdAt": -1 } });
    } else {
      /* più amati: reazioni dal sito + 💀 + quante volte è stato repostato */
      pipeline.push(
        { $lookup: { from: "bachecareactions", localField: "_id", foreignField: "itemId", as: "rx" } },
        { $addFields: { score: { $add: [{ $size: "$rx" }, { $ifNull: ["$doc.skullCount", 0] }, { $subtract: ["$reposts", 1] }] } } },
        { $project: { rx: 0 } },
        { $sort: { score: -1, "doc.createdAt": -1 } },
      );
    }
    pipeline.push({ $skip: (page - 1) * PER_PAGE }, { $limit: PER_PAGE + 1 });
    const [rows, viewerId] = await Promise.all([
      GuildBoardPost.aggregate(pipeline).allowDiskUse(true),
      viewerIdFromRequest(client, req),
    ]);
    const hasMore = rows.length > PER_PAGE;
    const items = await hydrate(client, rows.slice(0, PER_PAGE), viewerId);
    res.set("Cache-Control", viewerId ? "private, no-store" : "public, max-age=15");
    return res.status(200).json({ ok: true, items, page, hasMore, emojis: BACHECA_EMOJIS });
  } catch (err) {
    global.logger?.error?.("[site-bacheca] list:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function findItemRows(itemId: string) {
  return GuildBoardPost.aggregate(groupPipeline({ guildId: mainGuildId(), boardMessageId: itemId }));
}

async function handleBachecaItem(client?, req?, res?) {
  try {
    const id = String(req.query?.id || "").trim();
    if (!ITEM_ID_RE.test(id)) return res.status(400).json({ ok: false, error: "bad_request" });
    const [rows, viewerId] = await Promise.all([findItemRows(id), viewerIdFromRequest(client, req)]);
    if (!rows.length) return res.status(200).json({ ok: false, status: 404, error: "not_found", message: "Questo contenuto non è più in bacheca." });
    const [item] = await hydrate(client, rows, viewerId);
    return res.status(200).json({ ok: true, item });
  } catch (err) {
    global.logger?.error?.("[site-bacheca] item:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleBachecaRandom(client?, req?, res?) {
  try {
    const guildId = mainGuildId();
    const [picked] = await GuildBoardPost.aggregate([
      { $match: { guildId, boardMessageId: { $nin: ["", null, "0", "pending"] } } },
      { $sample: { size: 1 } },
    ]);
    if (!picked) return res.status(200).json({ ok: false, status: 404, error: "empty" });
    const rows = await findItemRows(String(picked.boardMessageId));
    const [item] = await hydrate(client, rows, await viewerIdFromRequest(client, req));
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, item });
  } catch (err) {
    global.logger?.error?.("[site-bacheca] random:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function requireViewer(client?, req?, res?) {
  const viewerId = await viewerIdFromRequest(client, req);
  if (!viewerId) {
    res.status(401).json({ ok: false, error: "auth", message: "Accedi con Discord." });
    return "";
  }
  return viewerId;
}

async function handleBachecaReact(client?, req?, res?) {
  try {
    const viewerId = await requireViewer(client, req, res);
    if (!viewerId) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = String(body.id || "").trim();
    const emoji = String(body.emoji || "").trim();
    if (!ITEM_ID_RE.test(id) || !BACHECA_EMOJIS.includes(emoji)) {
      return res.status(400).json({ ok: false, error: "bad_request", message: "Parametri non validi." });
    }
    const guildId = mainGuildId();
    const exists = await GuildBoardPost.exists({ guildId, boardMessageId: id });
    if (!exists) return res.status(404).json({ ok: false, error: "not_found", message: "Contenuto non trovato." });
    const active = await toggleBachecaReaction(guildId, id, viewerId, emoji);
    const { counts, mine } = await loadBachecaReactions(guildId, [id], viewerId);
    broadcastBachecaChanged("react", id);
    return res.status(200).json({ ok: true, id, emoji, active, reactions: counts.get(id) || {}, mine: mine.get(id) || [] });
  } catch (err) {
    global.logger?.error?.("[site-bacheca] react:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

/** Reposta dal sito: come il pulsante "Reposta" su Discord, si aggiunge un repost a nome di chi clicca
 *  sullo stesso contenuto (il contatore sale e il repost compare nel suo profilo). Le 💀 non si repostano. */
async function handleBachecaRepost(client?, req?, res?) {
  try {
    const viewerId = await requireViewer(client, req, res);
    if (!viewerId) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = String(body.id || "").trim();
    if (!ITEM_ID_RE.test(id)) return res.status(400).json({ ok: false, error: "bad_request" });
    const guildId = mainGuildId();
    const { isRepostDisabledInGuild } = require("../../Services/Community/repostRoulette") as typeof import("../../Services/Community/repostRoulette");
    if (isRepostDisabledInGuild(guildId)) {
      return res.status(403).json({ ok: false, error: "disabled", message: "I repost sono disattivati per ora." });
    }
    const docs: any[] = await GuildBoardPost.find({ guildId, boardMessageId: id }).sort({ createdAt: 1 }).lean();
    if (!docs.length) return res.status(404).json({ ok: false, error: "not_found", message: "Contenuto non trovato." });
    const first = docs[0];
    if (first.type === "skull") return res.status(400).json({ ok: false, error: "not_repostable", message: "Le 💀 non si repostano." });
    if (docs.some((d) => String(d.reposterUserId || "") === viewerId)) {
      return res.status(409).json({ ok: false, error: "already", message: "L'hai già repostato." });
    }
    const isQuote = first.type === "quote";
    const sourceAuthorId = String(isQuote ? first.quotedUserId : first.sourceAuthorId || "");
    const { RepostPrivacy } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
    const blocked = await RepostPrivacy.findOne({ guildId, userId: sourceAuthorId }).lean().catch(() => null);
    if ((blocked as any)?.blocked) {
      return res.status(403).json({ ok: false, error: "privacy", message: "Questa persona ha bloccato i repost dei suoi messaggi." });
    }
    const { GuildRepost } = require("../../Schemas/Community/repostSchema") as typeof import("../../Schemas/Community/repostSchema");
    const { nextRepostCount } = require("../../Utils/Quote/quoteCounter") as typeof import("../../Utils/Quote/quoteCounter");
    const totalPosts = await nextRepostCount(guildId).catch(() => 0);
    await GuildRepost.create({
      guildId,
      reposterUserId: viewerId,
      sourceAuthorId,
      sourceChannelId: String(isQuote ? first.originChannelId || "site" : first.sourceChannelId || "site"),
      sourceMessageId: String(isQuote ? first.originMessageId || id : first.sourceMessageId || id),
      content: String(isQuote ? "" : first.content || ""),
      attachmentUrl: String(isQuote ? first.imageUrl || "" : first.attachmentUrl || ""),
      ...(Array.isArray(first.mediaFiles) && first.mediaFiles.length ? { mediaFiles: first.mediaFiles } : {}),
      authorUsername: String(isQuote ? first.quotedUsername || "" : first.authorUsername || ""),
      authorAvatarUrl: String(first.authorAvatarUrl || ""),
      boardChannelId: String(first.boardChannelId || ""),
      boardMessageId: id,
      totalPosts: Number(totalPosts) || 0,
    });
    broadcastBachecaChanged("repost", id);
    return res.status(200).json({ ok: true, id, reposts: docs.length });
  } catch (err) {
    global.logger?.error?.("[site-bacheca] repost:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

/** Toglie un contenuto: quote → chi l'ha creata; clip → chi l'ha registrata; repost → il proprio repost; 💀 → l'autore del messaggio. */
async function handleBachecaDelete(client?, req?, res?) {
  try {
    const viewerId = await requireViewer(client, req, res);
    if (!viewerId) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = String(body.id || "").trim();
    if (!ITEM_ID_RE.test(id)) return res.status(400).json({ ok: false, error: "bad_request" });
    const guildId = mainGuildId();
    const guild = await getClientGuildCached(client, guildId).catch(() => null);
    if (!guild) return res.status(503).json({ ok: false, error: "no_guild" });
    const docs: any[] = await GuildBoardPost.find({ guildId, boardMessageId: id }).sort({ createdAt: 1 }).lean();
    if (!docs.length) return res.status(404).json({ ok: false, error: "not_found" });
    const first = docs[0];
    let result: any = { ok: false, message: "Non puoi togliere questo contenuto." };
    if (first.type === "quote") {
      const { deleteUserQuoteEntry } = require("../../Utils/Quote/quoteBoardService") as typeof import("../../Utils/Quote/quoteBoardService");
      result = await deleteUserQuoteEntry({ guild, quoteId: String(first._id), userId: viewerId });
    } else if (first.type === "skull") {
      if (String(first.sourceAuthorId) === viewerId) {
        await GuildSkullPost.deleteOne({ _id: first._id });
        result = { ok: true };
      }
    } else {
      const own = docs.find((d) => String(d.reposterUserId) === viewerId);
      if (own) {
        const { deleteUserRepostEntry } = require("../../Services/Community/repostService") as typeof import("../../Services/Community/repostService");
        result = await deleteUserRepostEntry({ guild, client, repostId: String(own._id), userId: viewerId });
      }
    }
    if (!result?.ok) return res.status(403).json({ ok: false, error: "forbidden", message: String(result?.message || "Non puoi togliere questo contenuto.") });
    broadcastBachecaChanged("remove", id);
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    global.logger?.error?.("[site-bacheca] delete:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

export = { handleBachecaList, handleBachecaItem, handleBachecaRandom, handleBachecaReact, handleBachecaRepost, handleBachecaDelete };

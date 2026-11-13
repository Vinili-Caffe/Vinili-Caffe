/**
 * Profilo sito — quote / repost / clip dell'utente (ex +myquote/+myrepost/+myclip).
 * GET  /webhooks/site-user-boards?kind=&userId=&page=
 * DELETE /webhooks/site-user-boards  Authorization Bearer + { kind, id }
 */
"use strict";

const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { listQuotesByUser, deleteUserQuoteEntry } = require("../../Community/utils/Quote/quoteBoardService") as typeof import("../../Community/utils/Quote/quoteBoardService");
const {
  listRepostsByUser,
  deleteUserRepostEntry,
} = require("../../Community/services/repostService") as typeof import("../../Community/services/repostService");
const { resolveWebsiteGuildMember } = require("../../site/http/siteRoleRequestApi") as typeof import("../../site/http/siteRoleRequestApi");
const { getClientGuildCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const {
  stabilizeQuoteMedia,
  stabilizeRepostMedia,
} = require("./boardMediaStable") as typeof import("./boardMediaStable");

const { isSiteBoardChannel, bachecaItemUrl } = require("../bacheca/bachecaSite") as typeof import("../bacheca/bachecaSite");

const PER_PAGE = 6;
const KINDS = new Set(["quote", "repost", "clip"]);

function normalizeBearer(raw?) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.toLowerCase().startsWith("bearer ") ? s.slice(7).trim() : s;
}

function mainGuildId() {
  return String(IDs.guilds?.main || "").trim();
}

function jumpUrl(guildId?, channelId?, messageId?) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!g || !c || !m || m === "pending" || m === "0") return "";
  /* bachecaSite1: i contenuti nuovi stanno sulla Bacheca del sito, non in un canale */
  if (isSiteBoardChannel(c)) return bachecaItemUrl(m);
  if (!/^\d{16,20}$/.test(c)) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

function isImageUrl(url?) {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(url || ""));
}

function isAudioUrl(url?, name?) {
  const s = `${url || ""} ${name || ""}`;
  return /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac)(\?|\s|$)/i.test(s);
}

/* video allegati (anche quelli col nome senza estensione, riconosciuti dall'URL) */
function isVideoUrl(url?, name?) {
  const s = `${url || ""} ${name || ""}`;
  return /\.(mp4|webm|mov|m4v|mkv)(\?|\s|$)/i.test(s);
}

function serializeQuote(doc?, guildId?) {
  const id = String(doc?._id || "");
  const imageUrl = String(doc?.imageUrl || "").trim();
  return {
    id,
    kind: "quote",
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    boardUrl: jumpUrl(guildId, doc?.boardChannelId, doc?.boardMessageId),
    originUrl: jumpUrl(guildId, doc?.originChannelId, doc?.originMessageId),
    previewImageUrl: isImageUrl(imageUrl) ? imageUrl : "",
    previewAudioUrl: "",
    previewVideoUrl: "",
    content: "",
    quotedUserId: String(doc?.quotedUserId || "").trim(),
    quotedUsername: String(doc?.quotedUsername || "").trim(),
    sourceAuthorId: "",
    authorUsername: "",
  };
}

function serializeRepost(doc?, guildId?, kind?) {
  const id = String(doc?._id || "");
  const files = Array.isArray(doc?.mediaFiles) ? doc.mediaFiles : [];
  let previewImageUrl = isImageUrl(doc?.attachmentUrl) ? String(doc.attachmentUrl).trim() : "";
  let previewAudioUrl = "";
  let previewVideoUrl = "";
  for (const f of files) {
    const url = String(f?.url || "").trim();
    const name = String(f?.name || "");
    if (!previewImageUrl && (isImageUrl(url) || isImageUrl(name))) previewImageUrl = url;
    if (!previewAudioUrl && (isAudioUrl(url, name) || /^clip\.mp3$/i.test(name))) previewAudioUrl = url;
    if (!previewVideoUrl && isVideoUrl(url, name)) previewVideoUrl = url;
  }
  return {
    id,
    kind: kind === "clip" ? "clip" : "repost",
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    boardUrl: jumpUrl(guildId, doc?.boardChannelId, doc?.boardMessageId),
    originUrl: jumpUrl(guildId, doc?.sourceChannelId, doc?.sourceMessageId),
    previewImageUrl,
    previewAudioUrl,
    previewVideoUrl,
    content: String(doc?.content || "").trim().slice(0, 400),
    quotedUserId: "",
    quotedUsername: "",
    sourceAuthorId: String(doc?.sourceAuthorId || "").trim(),
    authorUsername: String(doc?.authorUsername || "").trim(),
  };
}

async function stabilizeAndSerializeQuote(client?, doc?, guildId?) {
  const imageUrl = await stabilizeQuoteMedia(client, doc);
  return serializeQuote({ ...doc, imageUrl }, guildId);
}

async function stabilizeAndSerializeRepost(client?, doc?, guildId?, kind?) {
  const media = await stabilizeRepostMedia(client, doc);
  return serializeRepost(
    {
      ...doc,
      attachmentUrl: media.attachmentUrl,
      mediaFiles: media.mediaFiles,
    },
    guildId,
    kind,
  );
}

async function handleSiteUserBoardsGet(client?, req?, res?) {
  try {
    const kind = String(req.query?.kind || "").trim().toLowerCase();
    const userId = String(req.query?.userId || "").trim();
    const page = Math.max(1, Math.floor(Number(req.query?.page) || 1));
    if (!KINDS.has(kind)) {
      return res.status(400).json({ ok: false, error: "bad_kind", message: "kind deve essere quote|repost|clip." });
    }
    if (!/^\d{17,22}$/.test(userId)) {
      return res.status(400).json({ ok: false, error: "bad_user", message: "userId non valido." });
    }
    let guildId = mainGuildId();
    if (!guildId) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }
    /* un altro server (profilo per server): solo per chi ne fa parte */
    const wanted = String(req.query?.guild || "").trim();
    if (/^\d{16,22}$/.test(wanted) && wanted !== guildId) {
      const GP = require("../http/usersLbGuildProfile") as typeof import("../http/usersLbGuildProfile");
      const viewerId = await GP.viewerIdOf(req);
      if (!viewerId || !(await GP.memberOf(client, wanted, viewerId))) {
        return res.status(403).json({ ok: false, error: "not_member", message: "Puoi vedere solo i server dove sei anche tu." });
      }
      guildId = wanted;
      res.setHeader("Cache-Control", "private, no-store");
      const MS = require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches");
      if (!MS.isModuleOn(wanted, "bacheca")) {
        return res.status(200).json({ ok: true, disabled: true, kind, userId, page: 1, perPage: PER_PAGE, total: 0, totalPages: 1, items: [] });
      }
    }

    const skip = (page - 1) * PER_PAGE;
    let rows = [];
    let total = 0;
    if (kind === "quote") {
      const out = await listQuotesByUser(guildId, userId, { limit: PER_PAGE, skip });
      total = Number(out.total) || 0;
      rows = await Promise.all(
        (out.rows || []).map((d?) => stabilizeAndSerializeQuote(client, d, guildId)),
      );
    } else {
      const out = await listRepostsByUser(guildId, userId, {
        limit: PER_PAGE,
        skip,
        clipsOnly: kind === "clip",
        excludeClips: kind === "repost",
      });
      total = Number(out.total) || 0;
      rows = await Promise.all(
        (out.rows || []).map((d?) => stabilizeAndSerializeRepost(client, d, guildId, kind)),
      );
    }

    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const safePage = Math.min(page, totalPages);
    return res.status(200).json({
      ok: true,
      kind,
      userId,
      page: safePage,
      perPage: PER_PAGE,
      total,
      totalPages,
      items: rows,
    });
  } catch (err) {
    global.logger?.error?.("[site-user-boards] GET:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteUserBoardsDelete(client?, req?, res?) {
  try {
    const token = normalizeBearer(req.headers?.authorization);
    if (!token) {
      return res.status(401).json({ ok: false, error: "auth", message: "Accedi con Discord." });
    }
    const resolved = await resolveWebsiteGuildMember(client, token);
    if (!resolved?.ok) {
      return res.status(Number(resolved?.status) || 401).json({
        ok: false,
        error: resolved?.error || "auth",
        message: String(resolved?.message || "Sessione non valida."),
      });
    }
    const actorId = String(resolved?.userId || resolved?.member?.id || "").trim();
    if (!actorId) {
      return res.status(401).json({ ok: false, error: "auth", message: "Sessione non valida." });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const kind = String(body.kind || "").trim().toLowerCase();
    const id = String(body.id || "").trim();
    if (!KINDS.has(kind) || !/^[a-f0-9]{24}$/i.test(id)) {
      return res.status(400).json({ ok: false, error: "bad_request", message: "Parametri non validi." });
    }

    const guildId = mainGuildId();
    const guild = await getClientGuildCached(client, guildId);
    if (!guild) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non disponibile." });
    }

    let result;
    if (kind === "quote") {
      result = await deleteUserQuoteEntry({ guild, quoteId: id, userId: actorId });
    } else {
      result = await deleteUserRepostEntry({ guild, client, repostId: id, userId: actorId });
    }
    if (!result?.ok) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: String(result?.message || "Non puoi rimuovere questa voce."),
      });
    }
    return res.status(200).json({ ok: true, kind, id });
  } catch (err) {
    global.logger?.error?.("[site-user-boards] DELETE:", err?.message || err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteUserBoardsGet,
  handleSiteUserBoardsDelete,
  PER_PAGE,
};

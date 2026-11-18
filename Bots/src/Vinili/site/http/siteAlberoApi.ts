const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/siteDocumentSchema") as typeof import("../../Community/schemas/siteDocumentSchema");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { guildMemberDisplayAvatarUrlForSite, memberDisplayName } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { animatedDiscordCdnAvatarUrl } = require("./siteLiveAvatars") as typeof import("./siteLiveAvatars");
const { broadcastAlberoChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");

const DOC = SITE_DOCUMENT_TYPE.XMAS_TREE_ORNAMENT;
const MAX_MSG = 90;
const MAX_ORNAMENTS = 800;
const COLORS = new Set(["ruby", "gold", "emerald", "frost", "amber", "wine"]);

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function romeParts(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    return {
      y: Number(parts.find((p) => p.type === "year")?.value),
      m: Number(parts.find((p) => p.type === "month")?.value),
      d: Number(parts.find((p) => p.type === "day")?.value),
      h: Number(parts.find((p) => p.type === "hour")?.value),
    };
  } catch {
    return {
      y: now.getFullYear(),
      m: now.getMonth() + 1,
      d: now.getDate(),
      h: now.getHours(),
    };
  }
}

/** Albero community (Rome): 15 dic 12:00 → 25 dic 12:00. */
function isAlberoSeasonRome(now = new Date()) {
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m !== 12) return false;
  if (d > 15 && d < 25) return true;
  if (d === 15 && h >= 12) return true;
  if (d === 25 && h < 12) return true;
  return false;
}

function isAlberoPublicEnabled(now = new Date()) {
  const env = String(process.env.WEBSITE_ALBERO_HTTP || "").trim().toLowerCase();
  if (env === "0" || env === "false" || env === "off" || env === "no") return false;
  if (env === "1" || env === "true" || env === "yes" || env === "on") return true;
  return isAlberoSeasonRome(now);
}

function memberIsAlberoPreviewStaff(member?) {
  try {
    const { memberIsHighStaffEligible } = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");
    return Boolean(memberIsHighStaffEligible(member));
  } catch {
    return false;
  }
}

function assertAlberoAccess(resolved?) {
  if (isAlberoPublicEnabled()) return null;
  if (memberIsAlberoPreviewStaff(resolved?.member)) return null;
  return {
    ok: false,
    status: 503,
    error: "albero_disabled",
    message: "L'albero di Natale non è aperto in questo periodo.",
  };
}

function clamp01(n?) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(0.94, Math.max(0.06, v));
}

function sanitizeMessage(raw?) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MSG);
}

function sanitizeColor(raw?) {
  const c = String(raw || "").trim().toLowerCase();
  return COLORS.has(c) ? c : "gold";
}

function alberoOrnamentRoleId() {
  return String(IDs.roles?.AlberoOrnament || "1572318958277894336").trim();
}

/** Assegna il ruolo commemorativo; userId resta in DB anche se la palla è anonima. */
async function grantAlberoOrnamentRole(client?, guildId?, userId?, member?) {
  const roleId = alberoOrnamentRoleId();
  if (!roleId || !guildId || !userId) return false;
  try {
    let m = member;
    if (!m?.roles) {
      const guild =
        client?.guilds?.cache?.get(guildId) ||
        (await client?.guilds?.fetch?.(guildId).catch(() => null));
      m =
        guild?.members?.cache?.get(userId) ||
        (await guild?.members?.fetch?.(userId).catch(() => null));
    }
    if (!m?.roles) return false;
    if (m.roles.cache.has(roleId)) return true;
    await m.roles.add(roleId, "Pallina sull'albero community");
    return true;
  } catch (err: any) {
    global.logger?.warn?.("[ALBERO] role grant:", err?.message || err);
    return false;
  }
}

function serializeOrnament(doc?, viewerId?) {
  const payload = doc?.payload && typeof doc.payload === "object" ? doc.payload : {};
  const userId = String(doc?.userId || "").trim();
  const mine = Boolean(viewerId && userId === viewerId);
  const anonymous = Boolean(payload.anonymous);
  return {
    id: String(doc?._id || ""),
    /* Nascondi userId agli altri se anonima (ownership resta lato DB). */
    userId: anonymous && !mine ? "" : userId,
    displayName: anonymous ? "Anonimo" : String(doc?.authorName || "Ospite").trim() || "Ospite",
    avatarUrl: anonymous ? null : String(doc?.authorAvatarUrl || "").trim() || null,
    message: String(doc?.content || "").trim(),
    color: sanitizeColor(payload.color),
    x: clamp01(payload.x),
    y: clamp01(payload.y),
    anonymous,
    mine,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

async function listAlbero(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  let resolved: any = null;
  let viewerId = "";

  if (accessToken) {
    resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (resolved?.ok) {
      const denied = assertAlberoAccess(resolved);
      if (denied) return denied;
      viewerId = String(resolved.userId || "").trim();
    } else if (!isAlberoPublicEnabled()) {
      return {
        ok: false,
        status: 503,
        error: "albero_disabled",
        message: "L'albero di Natale non è aperto in questo periodo.",
      };
    }
  } else if (!isAlberoPublicEnabled()) {
    return {
      ok: false,
      status: 503,
      error: "albero_disabled",
      message: "L'albero di Natale non è aperto in questo periodo.",
    };
  }

  const guildId = resolveGuildId(client);
  if (!guildId) {
    return { ok: false, status: 500, error: "misconfigured", message: "Guild non configurata." };
  }

  const docs = await SiteDocument.find({ docType: DOC, guildId })
    .sort({ updatedAt: -1 })
    .limit(MAX_ORNAMENTS)
    .lean()
    .catch(() => []);

  const ornaments = (docs || []).map((d?) => serializeOrnament(d, viewerId));
  const mine = ornaments.find((o?) => o.mine) || null;

  return {
    ok: true,
    status: 200,
    season: isAlberoSeasonRome(),
    count: ornaments.length,
    mine,
    ornaments,
  };
}

async function upsertAlberoOrnament(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  if (!accessToken) {
    return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  }

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const denied = assertAlberoAccess(resolved);
  if (denied) return denied;

  const guildId = resolveGuildId(client);
  const userId = String(resolved.userId || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "misconfigured", message: "Guild/user non risolti." };
  }

  const message = sanitizeMessage(payload?.message);
  if (message.length < 2) {
    return { ok: false, status: 400, error: "message_short", message: "Scrivi almeno 2 caratteri sulla palla." };
  }

  const x = clamp01(payload?.x);
  const y = clamp01(payload?.y);
  const color = sanitizeColor(payload?.color);
  const anonymous = Boolean(payload?.anonymous);
  const member = resolved.member;
  const displayName = anonymous
    ? "Anonimo"
    : memberDisplayName(member) || String(member?.user?.username || "Ospite");
  let avatarUrl = "";
  if (!anonymous) {
    const liveAvatar = guildMemberDisplayAvatarUrlForSite(member, { size: 128, preferAnimated: true }) || "";
    avatarUrl = animatedDiscordCdnAvatarUrl(liveAvatar, { size: 128 }) || liveAvatar || "";
  }

  const doc = await SiteDocument.findOneAndUpdate(
    { docType: DOC, guildId, userId },
    {
      $set: {
        content: message,
        authorName: displayName,
        authorAvatarUrl: avatarUrl,
        payload: {
          x,
          y,
          color,
          anonymous,
          seasonKey: String(romeParts().y || new Date().getFullYear()),
        },
      },
      $setOnInsert: {
        docType: DOC,
        guildId,
        userId,
      },
    },
    { upsert: true, new: true },
  ).catch((err?) => {
    global.logger?.error?.("[ALBERO] upsert:", err?.message || err);
    return null;
  });

  if (!doc) {
    return { ok: false, status: 500, error: "save_failed", message: "Non riesco a salvare la palla." };
  }

  /* Ruolo sempre su userId reale (anche se anonymous: l’id non viene esposto in serialize). */
  void grantAlberoOrnamentRole(client, guildId, userId, member);

  try {
    broadcastAlberoChanged("upsert");
  } catch (_) {}

  return {
    ok: true,
    status: 200,
    ornament: serializeOrnament(doc, userId),
  };
}

async function deleteAlberoOrnament(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  if (!accessToken) {
    return { ok: false, status: 401, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." };
  }

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const denied = assertAlberoAccess(resolved);
  if (denied) return denied;

  const guildId = resolveGuildId(client);
  const userId = String(resolved.userId || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "misconfigured", message: "Guild/user non risolti." };
  }

  await SiteDocument.deleteOne({ docType: DOC, guildId, userId }).catch(() => null);
  try {
    broadcastAlberoChanged("delete");
  } catch (_) {}
  return { ok: true, status: 200, removed: true };
}

export = {
  listAlbero,
  upsertAlberoOrnament,
  deleteAlberoOrnament,
  isAlberoSeasonRome,
  isAlberoPublicEnabled,
};

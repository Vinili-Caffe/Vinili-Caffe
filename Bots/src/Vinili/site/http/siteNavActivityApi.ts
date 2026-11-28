/** Summary leggero per bollini nav (!): latest + canVote + ticket unclaimed. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { normalizeHeaderSecret } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const { sendJsonWithEtag, weakEtagFromJson } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");
const { memberIsWebTicketStaff } = require("../tickets/ticketStaffAccess") as typeof import("../tickets/ticketStaffAccess");
const { countOpenWebTickets } = require("../tickets/siteWebTicketsApi") as typeof import("../tickets/siteWebTicketsApi");

const CACHE_TTL_MS = 25_000;
const cache = new Map();

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function cacheGet(key?) {
  const row = cache.get(key);
  if (row && row.expiresAt > Date.now()) return row.payload;
  return null;
}

function cacheSet(key?, payload?) {
  cache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, row] of cache) if (row.expiresAt <= now) cache.delete(k);
  }
}

function toMs(v?) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

function voteLeaf(doc?) {
  return doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
}

function voteCooldownMs(client?, platform?) {
  if (platform === "topgg") {
    const hours = Number(client?.config?.topgg?.voteReminderCooldownHours);
    return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 60 * 60 * 1000;
  }
  const hours = Number(client?.config?.discadiaVoteReminder?.cooldownHours);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

function platformCanVote(client?, leaf?, platform?) {
  const key = platform === "topgg" ? "topgg" : "discadia";
  const lastRaw =
    key === "topgg"
      ? leaf?.lastVoteAtTopgg || (leaf?.lastVoteListing === "topgg" ? leaf?.lastVoteAt : null)
      : leaf?.lastVoteAtDiscadia || (leaf?.lastVoteListing === "discadia" ? leaf?.lastVoteAt : null);
  const lastAt = lastRaw ? new Date(lastRaw) : null;
  const lastMs = lastAt && Number.isFinite(lastAt.getTime()) ? lastAt.getTime() : 0;
  const nextMs = lastMs ? lastMs + voteCooldownMs(client, key) : 0;
  return !nextMs || Date.now() >= nextMs;
}

async function latestConfessionaleMs(guildId?) {
  const doc = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.CONFESSIONALE,
    confessionBoard: "community",
    $or: [
      { status: "active" },
      { status: "resolved" },
      { status: "soft_deleted" },
      { status: "deleted" },
      { status: null },
      { status: { $exists: false } },
    ],
  })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean()
    .catch(() => null);
  return toMs(doc?.createdAt);
}

async function latestFeedbackMs(guildId?) {
  const doc = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.SUGGESTION,
    $or: [
      { suggestionBoard: { $exists: false } },
      { suggestionBoard: null },
      { suggestionBoard: "" },
      { suggestionBoard: "community" },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("updatedAt createdAt")
    .lean()
    .catch(() => null);
  return Math.max(toMs(doc?.updatedAt), toMs(doc?.createdAt));
}

async function latestReviewsMs(guildId?) {
  const gid = String(guildId || "").trim();
  const docs = await Promise.all(
    ["server", "staff", "bot"].map((reviewKind) =>
      SiteDocument.findOne({ docType: SITE_DOCUMENT_TYPE.REVIEW, guildId: gid, reviewKind })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean()
        .catch(() => null),
    ),
  );
  return docs.reduce((max?, d?) => Math.max(max, toMs(d?.createdAt)), 0);
}

async function latestBachecaMs(guildId?) {
  const gid = String(guildId || "").trim();
  const { GuildBoardPost } = require("../../Community/schemas/guildBoardPostSchema") as typeof import("../../Community/schemas/guildBoardPostSchema");
  const doc = await GuildBoardPost.findOne({
    guildId: gid,
    boardMessageId: { $nin: ["", null, "0", "pending"] },
    mediaLost: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean()
    .catch(() => null);
  return toMs(doc?.createdAt);
}

async function handleSiteNavActivityGet(client?, req?, res?) {
  try {
    const guildId = resolveGuildId(client);
    if (!guildId) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }

    const accessToken = normalizeHeaderSecret(req?.headers?.authorization);
    let userId = "";
    let member = null;
    if (accessToken) {
      const resolved = await resolveWebsiteGuildMember(client, accessToken).catch(() => null);
      if (resolved?.ok) {
        userId = String(resolved.userId || "").trim();
        member = resolved.member || null;
      }
    }

    const { romeDayStartMs, romeMonthStartMs } = require("../../Community/utils/leaderboardHelpers") as typeof import("../../Community/utils/leaderboardHelpers");
    const publicKey = `nav-act:v4:${guildId}:pub`;
    let pub = cacheGet(publicKey);
    if (!pub) {
      const now = new Date();
      const [confessionaleLatestAt, feedbackLatestAt, reviewsLatestAt, bachecaLatestAt] = await Promise.all([
        latestConfessionaleMs(guildId),
        latestFeedbackMs(guildId),
        latestReviewsMs(guildId),
        latestBachecaMs(guildId),
      ]);
      pub = {
        confessionaleLatestAt,
        feedbackLatestAt,
        reviewsLatestAt,
        bachecaLatestAt,
        quizDayStartAt: romeDayStartMs(now),
        /* 1° del mese Rome 00:00 → nuovo Wrapped mensile (mese precedente) */
        wrappedMonthStartAt: romeMonthStartMs(now),
      };
      cacheSet(publicKey, pub);
    }

    let voteCanVote = false;
    let ticketsUnclaimed = 0;
    let isTicketStaff = false;

    if (userId) {
      const personalKey = `nav-act:v1:${guildId}:u:${userId}`;
      let personal = cacheGet(personalKey);
      if (!personal) {
        const leafDoc = await ActivityUserProfile.findOne({ guildId, userId })
          .select("profile.totals.exp.bumpVoteRewards.discadia_vote")
          .lean()
          .catch(() => null);
        const leaf = voteLeaf(leafDoc);
        voteCanVote = platformCanVote(client, leaf, "topgg") || platformCanVote(client, leaf, "discadia");
        isTicketStaff = Boolean(member && memberIsWebTicketStaff(member));
        if (isTicketStaff) {
          const stats = await countOpenWebTickets(guildId).catch(() => ({ unclaimedTickets: 0 }));
          ticketsUnclaimed = Math.max(0, Number(stats?.unclaimedTickets) || 0);
        }
        personal = { voteCanVote, ticketsUnclaimed, isTicketStaff };
        cacheSet(personalKey, personal);
      } else {
        voteCanVote = Boolean(personal.voteCanVote);
        ticketsUnclaimed = Math.max(0, Number(personal.ticketsUnclaimed) || 0);
        isTicketStaff = Boolean(personal.isTicketStaff);
      }
    }

    const payload = {
      ok: true,
      confessionaleLatestAt: Number(pub.confessionaleLatestAt) || 0,
      feedbackLatestAt: Number(pub.feedbackLatestAt) || 0,
      reviewsLatestAt: Number(pub.reviewsLatestAt) || 0,
      bachecaLatestAt: Number(pub.bachecaLatestAt) || 0,
      quizDayStartAt: Number(pub.quizDayStartAt) || 0,
      wrappedMonthStartAt: Number(pub.wrappedMonthStartAt) || 0,
      voteCanVote,
      ticketsUnclaimed: isTicketStaff ? ticketsUnclaimed : 0,
      isTicketStaff,
    };

    return sendJsonWithEtag(req, res, payload, {
      cacheControl: userId ? "private, max-age=15" : "public, max-age=20",
      etag: weakEtagFromJson(payload),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-nav-activity:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { handleSiteNavActivityGet };

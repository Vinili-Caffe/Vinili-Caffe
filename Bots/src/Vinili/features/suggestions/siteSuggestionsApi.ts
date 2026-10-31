
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { normalizeSuggestionBoard, SUGGESTION_TOPIC_TAGS, boardListQuery, scrubDiscordDefaultAvatarUrl, avatarHashFromDiscordUrl } = require("./suggestionFields") as typeof import("./suggestionFields");
const { resolveWebsiteGuildMember } = require("../../Web/siteRoleRequestApi") as typeof import("../../Web/siteRoleRequestApi");
const {
  applyLiveAvatarToSuggestionLike,
  collectUserIdsFromSuggestionLikeDocs,
  prefetchGuildMembersForIds,
  prefetchUsersForIds,
} = require("../../Web/siteLiveAvatars") as typeof import("../../Web/siteLiveAvatars");
const { SG, MAX_IMAGES, memberCanModerateSuggestions, serveSiteSuggestionFile } = require("./suggestionFiles") as typeof import("./suggestionFiles");
const { serializeSuggestion } = require("./suggestionSerialize") as typeof import("./suggestionSerialize");
const { displayNameForMember, addSiteSuggestionComment, updateSiteSuggestionComment, deleteSiteSuggestionComment, setSiteSuggestionCommentVote } = require("./suggestionComments") as typeof import("./suggestionComments");
const { staffAcceptSiteSuggestion, staffRejectSiteSuggestion, staffSetSiteSuggestionDecision, staffDeleteSiteSuggestion } = require("./suggestionStaff") as typeof import("./suggestionStaff");
const { createSiteSuggestion, setSiteSuggestionVote, updateOwnSiteSuggestion, deleteOwnSiteSuggestion } = require("./suggestionOwn") as typeof import("./suggestionOwn");

const LIST_LIMIT = 60;

const { memberCanAccessStaffFeedbackBoard } = require("../../Utils/Staff/staffGuideAccess") as typeof import("../../Utils/Staff/staffGuideAccess");

async function resolveGuild(client?) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

async function getSiteSuggestions(client?, payload: Record<string, any> = {}) {
  const guild = await resolveGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }

  const board = normalizeSuggestionBoard(payload.board);
  let viewer = null;
  let canAccessStaffBoard = false;
  const accessToken = String(payload.accessToken || "").trim();

  // feedbackShowRejected1: lista pubblica include rejected (community + staff); niente filtro $ne.
  const listQuery = {
    docType: SG,
    guildId: guild.id,
    ...boardListQuery(board),
  };
  const listDocsP = SiteDocument.find(listQuery)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean()
    .catch(() => []);
  const viewerP = accessToken
    ? resolveWebsiteGuildMember(client, accessToken).catch(() => null)
    : Promise.resolve(null);
  const [listDocs, resolved] = await Promise.all([listDocsP, viewerP]);

  if (resolved && resolved.ok) {
    canAccessStaffBoard = memberCanAccessStaffFeedbackBoard(resolved.member);
    viewer = {
      id: resolved.userId,
      name: displayNameForMember(resolved.member),
      canModerateSuggestions: memberCanModerateSuggestions(resolved.member),
      canAccessStaffBoard,
    };
  }

  if (board === "staff" && !canAccessStaffBoard) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "La bacheca Staff è riservata allo staff (Partner Manager esclusi).",
      viewer,
      board: "staff",
    };
  }

  const viewerId = viewer && viewer.id ? String(viewer.id) : "";
  let docs = Array.isArray(listDocs) ? listDocs : [];

  const authorIds = collectUserIdsFromSuggestionLikeDocs(docs);
  await prefetchGuildMembersForIds(guild, authorIds);
  const missingMembers = authorIds
    .map((id?) => String(id || "").trim())
    .filter((id?) => id && !guild.members?.cache?.has?.(id));
  await prefetchUsersForIds(client, missingMembers);

  const seenIds = new Set();
  const suggestions = [];
  for (const d of docs) {
    const id = String(d && d._id ? d._id : "").trim();
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const serialized = applyLiveAvatarToSuggestionLike(
      serializeSuggestion(d, viewerId, { leanList: true }),
      guild,
      {
        size: 128,
        // feedbackAvatar1: static PNG CDN only; never Discord embed defaults (site coffee fallback).
        preferAnimated: false,
        allowDefault: false,
        client,
      },
    );
    if (serialized) {
      serialized.authorAvatarUrl = scrubDiscordDefaultAvatarUrl(serialized.authorAvatarUrl);
      serialized.authorAvatarHash =
        avatarHashFromDiscordUrl(serialized.authorAvatarUrl) || String(serialized.authorAvatarHash || "").trim();
      if (Array.isArray(serialized.comments)) {
        serialized.comments = serialized.comments.map((c?) => {
          if (!c) return c;
          c.authorAvatarUrl = scrubDiscordDefaultAvatarUrl(c.authorAvatarUrl);
          c.authorAvatarHash = avatarHashFromDiscordUrl(c.authorAvatarUrl) || String(c.authorAvatarHash || "").trim();
          return c;
        });
      }
    }
    suggestions.push(serialized);
  }

  return {
    ok: true,
    status: 200,
    board,
    suggestions,
    viewer,
  };
}

export = {
  getSiteSuggestions,
  createSiteSuggestion,
  updateOwnSiteSuggestion,
  deleteOwnSiteSuggestion,
  addSiteSuggestionComment,
  updateSiteSuggestionComment,
  deleteSiteSuggestionComment,
  setSiteSuggestionCommentVote,
  setSiteSuggestionVote,
  staffAcceptSiteSuggestion,
  staffRejectSiteSuggestion,
  staffSetSiteSuggestionDecision,
  staffDeleteSiteSuggestion,
  serveSiteSuggestionFile,
  MAX_IMAGES,
  SUGGESTION_TOPIC_TAGS,
};

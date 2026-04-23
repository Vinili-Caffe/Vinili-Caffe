const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const { SiteReview } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");

const STAFF_ROLE_ID = String(IDs?.roles?.Staff || "").trim();
const FALLBACK_REVIEW_CHANNEL_ID = String(IDs?.channels?.supporters || "").trim();
const STAFF_CACHE_TTL_MS = 2 * 60 * 1000;

let staffCache = {
  guildId: "",
  expiresAt: 0,
  list: [],
  ids: new Set(),
};

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function normalizeRating(value) {
  const n = Math.round(Number(value) || 0);
  return Math.max(1, Math.min(5, n));
}

function sanitizeContent(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 1200);
}

function displayNameForMember(member) {
  return (
    String(member?.displayName || "").trim() ||
    String(member?.user?.globalName || "").trim() ||
    String(member?.user?.username || "").trim() ||
    "Utente"
  );
}

async function resolveGuild(client) {
  const guildId = resolveGuildId(client);
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

async function getStaffTargets(client, guild) {
  const guildId = String(guild?.id || "").trim();
  if (
    guildId &&
    staffCache.guildId === guildId &&
    staffCache.expiresAt > Date.now() &&
    Array.isArray(staffCache.list)
  ) {
    return staffCache;
  }

  if (!guild || !STAFF_ROLE_ID) {
    staffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, list: [], ids: new Set() };
    return staffCache;
  }

  await guild.members.fetch().catch(() => null);
  const role = guild.roles.cache.get(STAFF_ROLE_ID) || (await guild.roles.fetch(STAFF_ROLE_ID).catch(() => null));
  const members = role ? Array.from(role.members.values()) : [];
  const list = members
    .filter((member) => !member.user?.bot)
    .map((member) => ({
      id: String(member.id),
      name: displayNameForMember(member),
      avatarUrl:
        member.displayAvatarURL?.({ extension: "png", size: 128 }) ||
        member.user?.displayAvatarURL?.({ extension: "png", size: 128 }) ||
        "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
  const ids = new Set(list.map((entry) => entry.id));
  staffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, list, ids };
  return staffCache;
}

async function cleanupOrphanStaffReviews(client, guild) {
  const staff = await getStaffTargets(client, guild);
  const activeIds = Array.from(staff.ids);
  if (!activeIds.length) {
    await SiteReview.deleteMany({ guildId: guild.id, kind: "staff" }).catch(() => null);
    return staff;
  }
  await SiteReview.deleteMany({
    guildId: guild.id,
    kind: "staff",
    staffUserId: { $nin: activeIds },
  }).catch(() => null);
  return staff;
}

function serializeReview(doc, staffMap) {
  const raw = doc && typeof doc === "object" ? doc : {};
  const target = raw.kind === "staff" ? staffMap.get(String(raw.staffUserId || "")) || null : null;
  return {
    id: String(raw._id || ""),
    kind: String(raw.kind || "server"),
    userId: String(raw.userId || ""),
    staffUserId: raw.staffUserId ? String(raw.staffUserId) : null,
    rating: normalizeRating(raw.rating),
    content: String(raw.content || ""),
    authorName: String(raw.authorName || "Utente"),
    authorAvatarUrl: String(raw.authorAvatarUrl || ""),
    staffName: target?.name || String(raw.staffName || ""),
    staffAvatarUrl: target?.avatarUrl || String(raw.staffAvatarUrl || ""),
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : null,
  };
}

async function announceServerReview(client, guild, authorMember, review, isUpdate) {
  const announceId =
    String(client?.config?.siteReviews?.channelId || "").trim() ||
    String(client?.config?.disboardReviews?.channelId || "").trim() ||
    FALLBACK_REVIEW_CHANNEL_ID;
  if (!announceId) return;
  const channel = guild.channels.cache.get(announceId) || (await guild.channels.fetch(announceId).catch(() => null));
  if (!channel || !channel.isTextBased?.()) return;

  const authorName = displayNameForMember(authorMember);
  const avatarUrl =
    authorMember?.displayAvatarURL?.({ extension: "png", size: 256 }) ||
    authorMember?.user?.displayAvatarURL?.({ extension: "png", size: 256 }) ||
    "";
  const stars = "⭐".repeat(normalizeRating(review.rating));
  const reviewsPageUrl = String(client?.config?.siteReviews?.pageUrl || "").trim();

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: `${isUpdate ? "Recensione aggiornata da" : "Nuova recensione da"} ${authorName}`,
      iconURL: avatarUrl || undefined,
      url: reviewsPageUrl || undefined,
    })
    .setTitle("Recensione del server")
    .setURL(reviewsPageUrl || null)
    .setThumbnail(avatarUrl || null)
    .setDescription(`**Valutazione:** ${stars}\n\n> ${String(review.content || "").slice(0, 1024)}`)
    .addFields(
      {
        name: "<:VC_Dot:1482532364222595303> Origine",
        value: "Invio dal sito web `/recensioni`",
        inline: true,
      },
      {
        name: "<:VC_Dot:1482532364222595303> Stato",
        value: isUpdate ? "Recensione aggiornata" : "Nuova recensione",
        inline: true,
      },
    )
    .setFooter({
      text: ".gg/viniliecaffe · Feedback community",
      iconURL: client.user?.displayAvatarURL?.() || undefined,
    })
    .setTimestamp();

  await channel.send({
    content: `<@${authorMember.id}>`,
    embeds: [embed],
    allowedMentions: { users: [authorMember.id] },
  }).catch(() => null);
}

async function getSiteReviews(client, payload = {}) {
  const guild = await resolveGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }

  const staff = await cleanupOrphanStaffReviews(client, guild);
  const staffMap = new Map(staff.list.map((entry) => [entry.id, entry]));
  const [serverDocs, staffDocs] = await Promise.all([
    SiteReview.find({ guildId: guild.id, kind: "server" }).sort({ updatedAt: -1, createdAt: -1 }).limit(80).lean().catch(() => []),
    SiteReview.find({ guildId: guild.id, kind: "staff" }).sort({ updatedAt: -1, createdAt: -1 }).limit(80).lean().catch(() => []),
  ]);

  let viewer = null;
  const accessToken = String(payload.accessToken || "").trim();
  if (accessToken) {
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (resolved.ok) {
      const viewerDocs = await SiteReview.find({
        guildId: guild.id,
        userId: resolved.userId,
      }).lean().catch(() => []);
      viewer = {
        id: resolved.userId,
        name: displayNameForMember(resolved.member),
        serverReview: null,
        staffReviews: [],
      };
      viewerDocs.forEach((doc) => {
        const entry = serializeReview(doc, staffMap);
        if (entry.kind === "server") viewer.serverReview = entry;
        else viewer.staffReviews.push(entry);
      });
    }
  }

  return {
    ok: true,
    status: 200,
    externalReviewsUrl: String(client?.config?.disboardReviews?.reviewUrl || client?.config?.reviewsUrl || "").trim(),
    staffers: staff.list,
    reviews: {
      server: serverDocs.map((doc) => serializeReview(doc, staffMap)),
      staff: staffDocs.map((doc) => serializeReview(doc, staffMap)),
    },
    viewer,
  };
}

async function submitSiteReview(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const kind = String(payload.kind || "server").trim().toLowerCase();
  if (kind !== "server" && kind !== "staff") {
    return { ok: false, status: 400, error: "invalid_kind", message: "Tipo recensione non valido." };
  }

  const rating = normalizeRating(payload.rating);
  const content = sanitizeContent(payload.content);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }

  let staffUserId = null;
  let staffName = "";
  let staffAvatarUrl = "";
  if (kind === "staff") {
    const staff = await cleanupOrphanStaffReviews(client, resolved.guild);
    staffUserId = String(payload.staffUserId || "").trim();
    if (!staff.ids.has(staffUserId)) {
      return { ok: false, status: 404, error: "staff_not_found", message: "Lo staffer selezionato non è disponibile." };
    }
    if (staffUserId === resolved.userId) {
      return { ok: false, status: 400, error: "self_review", message: "Non puoi recensire te stesso." };
    }
    const target = staff.list.find((entry) => entry.id === staffUserId) || null;
    staffName = String(target?.name || "");
    staffAvatarUrl = String(target?.avatarUrl || "");
  }

  const query = {
    guildId: resolved.guild.id,
    kind,
    userId: resolved.userId,
    staffUserId: kind === "staff" ? staffUserId : null,
  };
  const existing = await SiteReview.findOne(query).lean().catch(() => null);

  const nextDoc = await SiteReview.findOneAndUpdate(
    query,
    {
      $setOnInsert: {
        guildId: resolved.guild.id,
        kind,
        userId: resolved.userId,
        staffUserId: kind === "staff" ? staffUserId : null,
      },
      $set: {
        rating,
        content,
        authorName: displayNameForMember(resolved.member),
        authorAvatarUrl:
          resolved.member?.displayAvatarURL?.({ extension: "png", size: 128 }) ||
          resolved.member?.user?.displayAvatarURL?.({ extension: "png", size: 128 }) ||
          "",
        staffName,
        staffAvatarUrl,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean().catch(() => null);

  if (!nextDoc) {
    return { ok: false, status: 500, error: "save_failed", message: "Non sono riuscito a salvare la recensione." };
  }

  if (kind === "server") {
    await announceServerReview(client, resolved.guild, resolved.member, nextDoc, Boolean(existing));
  }

  return {
    ok: true,
    status: 200,
    review: serializeReview(nextDoc, new Map()),
    message: existing ? "Recensione aggiornata con successo." : "Recensione inviata con successo.",
  };
}

module.exports = {
  getSiteReviews,
  submitSiteReview,
};

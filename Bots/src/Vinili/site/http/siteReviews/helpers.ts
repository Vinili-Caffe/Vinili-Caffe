const { memberDisplayName } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const {
  ADMIN_ROLE_ID,
  HIGH_STAFF_ROLE_ID,
  STAFF_ROLE_ID,
  IDs,
} = require("./constants") as typeof import("./constants");

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function normalizeRating(value?) {
  const n = Math.round(Number(value) || 0);
  return Math.max(1, Math.min(5, n));
}

function sanitizeContent(value?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 1200);
}

function sanitizeReplyContent(value?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 800);
}

function memberCanReplyAsServer(member?) {
  if (!member || member.user?.bot) return false;
  const hasRole = (id?) => {
    const v = String(id || "").trim();
    return Boolean(v && member.roles?.cache?.has?.(v));
  };
  if (hasRole(ADMIN_ROLE_ID)) return true;
  if (hasRole(HIGH_STAFF_ROLE_ID)) return true;
  try {
    if (String(member.guild?.ownerId || "") === String(member.id)) return true;
  } catch (_) {
      }
  return false;
}

function displayNameForMember(member?) {
    return memberDisplayName(member) || "Utente";
}

async function resolveGuild(client?) {
  const guildId = resolveGuildId(client);
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

function normalizeContentLang(value?) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "en" || raw.indexOf("en-") === 0) return "en";
  return "it";
}

function isPublicReviewKind(kind?) {
  const k = String(kind || "").trim().toLowerCase();
  return k === "server" || k === "bot" || k === "staff";
}

function memberHasStaffOrHighStaffRole(member?) {
  if (!member?.roles?.cache) return false;
  if (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) return true;
  if (HIGH_STAFF_ROLE_ID && member.roles.cache.has(HIGH_STAFF_ROLE_ID)) return true;
  return false;
}

function memberCanWriteStaffReview(member?) {
  // Solo membri non-staff: staff/HS non recensiscono se stessi né altri staff/HS.
  if (!member?.roles?.cache) return false;
  return !memberHasStaffOrHighStaffRole(member);
}

function reviewPagePathForKind(kind?) {
  return String(kind || "").trim().toLowerCase() === "bot" ? "/dashboard/recensioni/" : "/recensioni";
}

function reviewNotifOpenUrl(reviewId?, kind?, opts: Record<string, any> = {}) {
  const id = String(reviewId || "").trim();
  const base = reviewPagePathForKind(kind);
  const k = String(kind || "").trim().toLowerCase();
  const hash = id ? `#vc-review-${id}` : "";
  if (k === "staff") {
    const params = new URLSearchParams({ board: "staff" });
    const staffer = String(opts.stafferId || "").trim();
    if (/^\d{5,32}$/.test(staffer)) params.set("staffer", staffer);
    return `${base}?${params.toString()}${hash}`;
  }
  return id ? `${base}${hash}` : base;
}

export = {
  resolveGuildId,
  normalizeRating,
  sanitizeContent,
  sanitizeReplyContent,
  memberCanReplyAsServer,
  displayNameForMember,
  resolveGuild,
  normalizeContentLang,
  isPublicReviewKind,
  memberHasStaffOrHighStaffRole,
  memberCanWriteStaffReview,
  reviewPagePathForKind,
  reviewNotifOpenUrl,
};

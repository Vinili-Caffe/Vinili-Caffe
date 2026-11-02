/** Workflow staff: la persona di cui parla ogni richiesta (nome, avatar dal server). */
const { getUserCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { guildMemberDisplayAvatarUrlDynamic, userAvatarUrlDynamic, normalizeDiscordCdnAvatarUrl, sitePreferredAvatarUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { stripDiscordDecorations, isSnowflakeLikeLabel } = require("./workflowLabels") as typeof import("./workflowLabels");

function isGenericWorkflowSubjectLabel(value?, doc?) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (/^richiesta\s+(unban|unmute)\b/i.test(v)) return true;
  if (/^candidatura\b/i.test(v)) return true;
  if (/^appello\b/i.test(v)) return true;
  return isWorkflowRoleSlug(v, doc);
}

function pickSubjectDisplayName(userId?, ...candidates) {
  const uid = String(userId || "").trim();
  for (const raw of candidates) {
    const name = String(raw || "").trim();
    if (!name || isSnowflakeLikeLabel(name, uid) || isGenericWorkflowSubjectLabel(name)) continue;
    return name.slice(0, 120);
  }
  return "";
}

function memberToSubjectFields(member?, userId?) {
  const uid = String(userId || member?.id || member?.user?.id || "").trim();
  const displayName = pickSubjectDisplayName(
    uid,
    member?.displayName,
    member?.user?.globalName,
    member?.user?.username,
  );
  const avatarUrl = liveWorkflowAvatarUrl(member, member?.user || member, 128);
  return {
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function hasRealDiscordAvatarUrl(url?) {
  const u = String(url || "").trim();
  if (!u) return false;
  if (/\/embed\/avatars\//i.test(u)) return false;
  // User global + guild member + media CDN (pause usa spesso /avatars/, resoconti spesso /guilds/.../avatars/)
  return /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(?:avatars\/\d+\/|guilds\/\d+\/users\/\d+\/avatars\/)/i.test(
    u,
  );
}

function preferAnimatedStoredAvatarUrl(url?, size = 128) {
  const raw = String(url || "").trim();
  if (!hasRealDiscordAvatarUrl(raw)) return "";
  try {
    if (typeof normalizeDiscordCdnAvatarUrl === "function") {
      return normalizeDiscordCdnAvatarUrl(raw, { size, preferAnimated: true }) || raw;
    }
  } catch (_) {}
  if (/\/a_[a-f0-9]+\./i.test(raw)) {
    return raw.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
  }
  return raw;
}

/** Mai usare embed/default Discord: se manca il member, non deve coprire l'avatar salvato.
 *  avatarGlobalFirst1: globale prima del guild (CDN /guilds/... spesso 404). */
function liveWorkflowAvatarUrl(member?, user?, size = 128) {
  const fromPreferred =
    sitePreferredAvatarUrl(member, { size, preferAnimated: true, allowDefault: false }) ||
    sitePreferredAvatarUrl(user, { size, preferAnimated: true, allowDefault: false }) ||
    "";
  if (hasRealDiscordAvatarUrl(fromPreferred)) {
    return preferAnimatedStoredAvatarUrl(fromPreferred, size) || fromPreferred;
  }
  const fromMember = member
    ? guildMemberDisplayAvatarUrlDynamic(member, { size, allowDefault: false })
    : "";
  if (hasRealDiscordAvatarUrl(fromMember) && !/\/guilds\/\d+\/users\//i.test(String(fromMember))) {
    return preferAnimatedStoredAvatarUrl(fromMember, size) || fromMember;
  }
  const fromUser = user
    ? userAvatarUrlDynamic(user, { size, allowDefault: false })
    : "";
  if (hasRealDiscordAvatarUrl(fromUser) && !/\/guilds\/\d+\/users\//i.test(String(fromUser))) {
    return preferAnimatedStoredAvatarUrl(fromUser, size) || fromUser;
  }
  if (hasRealDiscordAvatarUrl(fromMember)) return preferAnimatedStoredAvatarUrl(fromMember, size) || fromMember;
  if (hasRealDiscordAvatarUrl(fromUser)) return preferAnimatedStoredAvatarUrl(fromUser, size) || fromUser;
  return "";
}

/* mobileStaffFast1: list enrichment default = cache only (no Discord-fetch).
   inboxAvatarFetch1: detail può allowFetch → getUserCached (appelli/candidature fuori guild). */
async function resolveWorkflowSubject(client?, guild?, userId?, options: Record<string, any> = {}) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return { displayName: "", avatarUrl: "" };

  const member = guild?.members?.cache?.get?.(uid) || null;
  let user = member?.user || null;
  if (!user && client?.users?.cache?.get) {
    user = client.users.cache.get(uid) || null;
  }
  if (!user && options.allowFetch && client) {
    try {
      user = await Promise.race([
        getUserCached(client, uid),
        new Promise((resolve?) => setTimeout(() => resolve(null), Number(options.fetchTimeoutMs) || 1200)),
      ]);
    } catch (_) {
      user = null;
    }
  }

  const displayName = pickSubjectDisplayName(
    uid,
    member?.displayName,
    user?.globalName,
    user?.username,
  );
  const avatarUrl = liveWorkflowAvatarUrl(member, user, 128);

  return {
    displayName: displayName || "",
    avatarUrl,
  };
}

async function applyWorkflowSubjectToItem(client?, guild?, item?, options: Record<string, any> = {}) {
  if (!item) return item;
  const uid = String(item.userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return item;
  const name = pickSubjectDisplayName(uid, item.displayName);
  const nameMissing = !name;
  const storedUrl = String(item.avatarUrl || "").trim();
  /* avatarGlobalFirst1: URL guild salvati spesso 404 — ricalcola sempre dal member live. */
  const storedIsGuild = /\/guilds\/\d+\/users\//i.test(storedUrl);
  if (hasRealDiscordAvatarUrl(storedUrl) && !nameMissing && !storedIsGuild) return item;

  const sub = await resolveWorkflowSubject(client, guild, uid, options);
  const resolvedName = pickSubjectDisplayName(uid, sub.displayName);
  return {
    ...item,
    displayName: name || resolvedName || "",
    avatarUrl: sub.avatarUrl || (hasRealDiscordAvatarUrl(storedUrl) && !storedIsGuild ? storedUrl : "") || "",
  };
}

function cleanAppealPreviewText(text?) {
  return stripDiscordDecorations(String(text || ""), { keepNewlines: true })
    .replace(/^Utente\s*:?\s*/im, "")
    .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
    .replace(/\b\d{16,20}\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isWorkflowRoleSlug(value?, doc?) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return true;
  const type = String(doc?.workflowType || doc?.workflowKind || "").trim().toLowerCase();
  if (type && v === type) return true;
  return /^(helper|partnermanager|partner manager|blogger)$/.test(v);
}

function readStoredSubject(doc?) {
  const uid = String(doc?.userId || "").trim();
  const storedName = pickSubjectDisplayName(uid, stripDiscordDecorations(doc?.workflowSubjectName || ""));
  const storedAvatar = String(doc?.workflowSubjectAvatarUrl || "").trim();
  const title = stripDiscordDecorations(doc?.title || "");
  const queue = String(doc?.workflowQueue || "");
  if (storedName) {
    return { displayName: storedName, avatarUrl: storedAvatar };
  }
  if (queue === "pause" && title && !isGenericWorkflowSubjectLabel(title, doc) && !isSnowflakeLikeLabel(title, uid)) {
    return { displayName: title, avatarUrl: "" };
  }
    if (queue !== "appelli" && queue !== "candidature" && title && !isGenericWorkflowSubjectLabel(title, doc) && !isSnowflakeLikeLabel(title, uid)) {
    return { displayName: title, avatarUrl: "" };
  }
  return { displayName: "", avatarUrl: storedAvatar };
}

export = { isGenericWorkflowSubjectLabel, pickSubjectDisplayName, memberToSubjectFields, hasRealDiscordAvatarUrl, preferAnimatedStoredAvatarUrl, liveWorkflowAvatarUrl, resolveWorkflowSubject, applyWorkflowSubjectToItem, cleanAppealPreviewText, isWorkflowRoleSlug, readStoredSubject };

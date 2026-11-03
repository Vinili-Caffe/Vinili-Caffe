const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const {
  getOrCreateStaffDoc,
  ensureStaff,
} = require("../staffDocUtils") as typeof import("../staffDocUtils");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic, resolveEmbedUserAvatarUrl } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { TENANT_EMBED_COLOR } = require("../../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../../MultiGuild/utils/tenantEmbedBranding");
const { STAFF_WARN_THREE_NEGATIVES_REASON } = require("../../../Staff/services/staffWarnService") as typeof import("../../../Staff/services/staffWarnService");

const VALUTAZIONE_EMBED_COLOR = TENANT_EMBED_COLOR;

function clearWebStaffProfileCache(userId?, action = "valutazione") {
  const uid = String(userId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) return;
  try {
    require("../../../site/staff/siteStaffProfileApi").clearStaffProfileCacheForUser(uid, { action });
  } catch (_) {}
}

function formatStaffMention(userLike?) {
  const id = String(userLike?.id || userLike?.user?.id || "").trim();
  if (/^\d{16,22}$/.test(id)) return `<@${id}>`;
  if (typeof userLike?.toString === "function") {
    const asText = String(userLike.toString());
    if (asText && asText !== "[object Object]") return asText;
  }
  return "Utente";
}

async function ensureStaffProfileDoc(profileDoc?, guildId?, userId?) {
  if (profileDoc) {
    ensureStaff(profileDoc);
    return profileDoc;
  }
  return getOrCreateStaffDoc(guildId, userId);
}

async function getStaffDoc(guildId?, userId?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u });
}

async function makeLogEmbed(
  actor?,
  user?,
  title?,
  reason?,
  idValue?,
  color = VALUTAZIONE_EMBED_COLOR,
  guild = null,
) {
  const actorLike = actor?.member || actor?.user || actor;
  const targetMember = guild?.members?.cache?.get(user.id) || null;
  const [actorIcon, thumb] = await Promise.all([
    resolveEmbedUserAvatarUrl(actorLike),
    resolveEmbedUserAvatarUrl(targetMember || user),
  ]);
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${accountUsername(actorLike)}`,
      iconURL: actorIcon,
    })
    .setTitle(title)
    .setThumbnail(thumb)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${formatStaffMention(user)}`,
        `<:VC_reason:1478517122929004544> __${reason}__`,
        `<:VC_id:1478517313618575419> **ID Valutazione** __\`${idValue}\`__`,
      ].join("\n"),
    )
    .setColor(color);
}

async function buildAutoStaffWarnFromNegativesEmbed(actorLike?, targetUser?, warnCount?, guild = null) {
  const actorForAuthor = actorLike?.member || actorLike?.user || actorLike;
  const username = accountUsername(actorForAuthor) || "Staff";
  const targetMention = formatStaffMention(targetUser);
  const targetMember = guild?.members?.cache?.get(targetUser.id) || null;
  const [actorIcon, thumb] = await Promise.all([
    resolveEmbedUserAvatarUrl(actorForAuthor),
    resolveEmbedUserAvatarUrl(targetMember || targetUser),
  ]);
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${username}`,
      iconURL: actorIcon,
    })
    .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF__** \`#${warnCount}\``)
    .setThumbnail(thumb)
    .setDescription(
      [
        `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${targetMention}`,
        `<:VC_reason:1478517122929004544> __${STAFF_WARN_THREE_NEGATIVES_REASON}__`,
        `<:VC_id:1478517313618575419> **ID Warn** __\`${warnCount}\`__`,
      ].join("\n"),
    )
    .setColor("#E74C3C");
}

function makeRemovalEmbed(actor?, user?, title?, description?, reason?, updatedLabel?, updatedValue?) {
  const actorLike = actor?.member || actor?.user || actor;
  const safeDescriptionRaw = String(description || "").trim();
  const mention = formatStaffMention(user);
  const safeDescription = safeDescriptionRaw
    ? safeDescriptionRaw.replace(/\{user\}/g, mention)
    : `<:VC_Staff:1494286904089247754> <a:VC_Arrow:1482706699365257397> ${mention}`;
  const safeReasonField = String(reason || "").trim() || "—";
  const safeUpdatedLabel = String(updatedLabel || "").trim() || "Aggiornamento";
  const safeUpdatedValue = String(updatedValue || "").trim() || "—";
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione rimossa da ${accountUsername(actorLike)}`,
      iconURL: guildMemberDisplayAvatarUrlDynamic(actorLike) || undefined,
    })
    .setTitle(title)
    .setDescription(safeDescription)
    .addFields(
      { name: "<:VC_reason:1478517122929004544> Motivazione: ", value: safeReasonField, inline: false },
      { name: safeUpdatedLabel, value: safeUpdatedValue, inline: false },
    )
    .setColor(VALUTAZIONE_EMBED_COLOR);
}

async function sendChannelEmbed(_channel?, _payload?) {
  return null;
}

function getValutazioneEntry(staff?, kind?, index?, reason?) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  const reasonsName = kind === "negative" ? "negativeReasons" : "positiveReasons";
  const list = Array.isArray(staff?.[listName]) ? staff[listName] : [];
  const reasons = Array.isArray(staff?.[reasonsName]) ? staff[reasonsName] : [];
  const byIndex = list[index] || null;
  if (byIndex?.messageId && byIndex?.channelId) return byIndex;

  const targetReason = String(reason || "");
  let reasonOccurrenceAtIndex = 0;
  for (let i = 0; i <= index && i < reasons.length; i += 1) {
    if (String(reasons[i] || "") === targetReason) reasonOccurrenceAtIndex += 1;
  }
  if (reasonOccurrenceAtIndex <= 0) return null;

  const auto = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  let seen = 0;
  for (const entry of auto) {
    if (String(entry?.type || "") !== kind) continue;
    if (String(entry?.reason || "") !== targetReason) continue;
    if (!String(entry?.messageId || "") || !String(entry?.channelId || "")) continue;
    seen += 1;
    if (seen === reasonOccurrenceAtIndex) return entry;
  }
  return null;
}

function removeLinkedAutoValutazioneEntry(staff?, resolvedEntry?) {
  const messageId = String(resolvedEntry?.messageId || "").trim();
  if (!messageId || !Array.isArray(staff?.autoValutazioni)) return;
  staff.autoValutazioni = staff.autoValutazioni.filter(
    (entry?) => String(entry?.messageId || "") !== messageId,
  );
}

function markLinkedAutoValutazioneSpentByTrade(staff?, resolvedEntry?, tradeReason = "") {
  if (!Array.isArray(staff?.autoValutazioni)) return false;
  const messageId = String(resolvedEntry?.messageId || "").trim();
  const reason = String(resolvedEntry?.reason || "").trim();
  let marked = false;
  for (const entry of staff.autoValutazioni) {
    if (!entry || typeof entry !== "object") continue;
    const sameMessage = messageId && String(entry.messageId || "") === messageId;
    const sameReason =
      !sameMessage &&
      reason &&
      String(entry.reason || "").trim() === reason &&
      !entry.spentByTrade;
    if (!sameMessage && !sameReason) continue;
    entry.spentByTrade = true;
    entry.spentAt = new Date();
    entry.spentReason = String(tradeReason || "").slice(0, 300);
    entry.updatedAt = new Date();
    marked = true;
        const keyStr = String(entry.key || "");
    const m = /^resoconto_reviewer_task:([^:]+):([^:]+):(\d{17,20})$/.exec(keyStr);
    if (m) {
      if (!Array.isArray(staff.resocontoCompitoClaims)) staff.resocontoCompitoClaims = [];
      const id = `${m[1]}:${m[2]}:${m[3]}`;
      if (!staff.resocontoCompitoClaims.some((row?) => String(row?.id || row || "") === id)) {
        staff.resocontoCompitoClaims.push({
          id,
          weekKey: m[1],
          segment: m[2],
          userId: m[3],
          at: new Date(),
        });
      }
    }
    if (sameMessage) break;
  }
  return marked;
}

function pushValutazioneEntry(staff?, kind?, reason?, message?, meta = null) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  if (!Array.isArray(staff[listName])) staff[listName] = [];
  const row: Record<string, any> = {
    reason: String(reason || ""),
    channelId: message?.channelId ? String(message.channelId) : null,
    messageId: message?.id ? String(message.id) : null,
    createdAt: new Date(),
  };
  if (meta?.sectionId != null) row.sectionId = Number(meta.sectionId);
  if (meta?.globalId != null) row.globalId = Number(meta.globalId);
  const actorId = String(meta?.actorId || "").trim();
  if (actorId && /^\d{16,22}$/.test(actorId)) row.actorId = actorId;
  const actorName = String(meta?.actorName || "").trim();
  if (actorName) row.actorName = actorName.slice(0, 128);
  staff[listName].push(row);
}

async function mirrorValTrackHistory(guildId?, userId?, kind?, reason?, actor?, entryId?) {
  try {
    const { appendStaffTrackHistory, actorLabelFromUser } = require("../staffTrackHistory") as typeof import("../staffTrackHistory");
    const actorLike = actor?.member || actor?.user || actor;
    await appendStaffTrackHistory(guildId, userId, {
      kind,
      reason,
      date: new Date(),
      actorId: String(actorLike?.id || "").trim() || null,
      actorName: actorLabelFromUser(actorLike, actorLike?.id),
      entryId: entryId || null,
    });
  } catch (_) {}
}

function removeValutazioneEntry(staff?, kind?, index?) {
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  if (!Array.isArray(staff?.[listName])) return;
  if (index >= 0 && index < staff[listName].length) staff[listName].splice(index, 1);
}

const VALUTAZIONE_EMBED_ID_RE = /ID Valutazione[^`]*`(\d+)`/i;
const VALUTAZIONE_EMBED_TITLE_NUM_RE = /#(\d+)/;

function resolveValutazioneRemoveIndex(staff?, kind?, removeId?) {
  const reasonsName = kind === "negative" ? "negativeReasons" : "positiveReasons";
  const listName = kind === "negative" ? "negativeValutazioni" : "positiveValutazioni";
  const reasons = Array.isArray(staff?.[reasonsName]) ? staff[reasonsName] : [];
  const list = Array.isArray(staff?.[listName]) ? staff[listName] : [];
  const n = Math.floor(Number(removeId));
  if (!Number.isInteger(n) || n < 1) return -1;

  if (reasons[n - 1] !== undefined) return n - 1;

  const bySection = list.findIndex((entry?) => Number(entry?.sectionId) === n);
  if (bySection >= 0 && bySection < reasons.length) return bySection;

  const byGlobal = list.findIndex((entry?) => Number(entry?.globalId) === n);
  if (byGlobal >= 0 && byGlobal < reasons.length) return byGlobal;

  return -1;
}

async function resolveValutazioneRemoveIndexFull(_guild?, staff?, kind?, removeId?, _targetUserId = null) {
  /* Solo indice DB — niente fetch/scan canale Discord. */
  return resolveValutazioneRemoveIndex(staff, kind, removeId);
}

async function editOriginalValutazioneMessage(_guild?, _entry?, _embed?) {
  return false;
}

async function syncProfileStaffFromDb(profileDoc?, guildId?, userId?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!profileDoc || !g || !u) return ensureStaff(profileDoc);
  const fresh = await ActivityUserProfile.findOne({ guildId: g, userId: u }).catch(() => null);
  if (fresh?.staff) profileDoc.staff = fresh.staff;
  return ensureStaff(profileDoc);
}

export = {
  VALUTAZIONE_EMBED_COLOR,
  clearWebStaffProfileCache,
  formatStaffMention,
  ensureStaffProfileDoc,
  getStaffDoc,
  makeLogEmbed,
  buildAutoStaffWarnFromNegativesEmbed,
  makeRemovalEmbed,
  sendChannelEmbed,
  getValutazioneEntry,
  removeLinkedAutoValutazioneEntry,
  markLinkedAutoValutazioneSpentByTrade,
  pushValutazioneEntry,
  mirrorValTrackHistory,
  removeValutazioneEntry,
  resolveValutazioneRemoveIndex,
  resolveValutazioneRemoveIndexFull,
  editOriginalValutazioneMessage,
  syncProfileStaffFromDb,
};

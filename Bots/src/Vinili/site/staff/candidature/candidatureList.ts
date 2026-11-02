/** Candidature: elenco e dettaglio per lo staff sul sito. */
const IDs = require("../../../Utils/Config/ids") as typeof import("../../../Utils/Config/ids");
const { APPLICATION_TYPES } = require("./candidatureEligibility") as typeof import("./candidatureEligibility");
const { APPLY_PEX_PREFIX, resolveSubmissionChannel } = require("./candidatureEmbeds") as typeof import("./candidatureEmbeds");

function memberHasCandidatureReviewAccess(member?, guild?) {
  const userId = String(member?.id || "").trim();
  const ownerId = String(guild?.ownerId || "").trim();
  if (userId && ownerId && userId === ownerId) return true;
  if (!member?.roles?.cache) return false;
  const allowed = [IDs.roles?.Admin, IDs.roles?.Manager, IDs.roles?.Founder, IDs.roles?.Director]
    .filter(Boolean)
    .map((id?) => String(id));
  return allowed.some((roleId?) => member.roles.cache.has(roleId));
}

function parseCandidateTypeFromMessage(message?) {
  const rows = message?.components || [];
  for (const row of rows) {
    for (const comp of row?.components || []) {
      const id = String(comp?.customId || "");
      if (id.startsWith(`${APPLY_PEX_PREFIX}:`)) {
        const [, type, userId] = id.split(":");
        if (APPLICATION_TYPES.includes(String(type || "")) && /^\d{16,20}$/.test(String(userId || ""))) {
          return { type: String(type), userId: String(userId) };
        }
      }
    }
  }
  const title = String(message?.embeds?.[0]?.title || "");
  if (/partner\s*manager/i.test(title)) return { type: "partnermanager", userId: parseUserIdFromEmbedFooter(message) };
  if (/blogger/i.test(title)) return { type: "blogger", userId: parseUserIdFromEmbedFooter(message) };
  if (/helper/i.test(title)) return { type: "helper", userId: parseUserIdFromEmbedFooter(message) };
  return null;
}

function parseUserIdFromEmbedFooter(message?) {
  const footer = String(message?.embeds?.[0]?.footer?.text || "");
  const m = footer.match(/User ID:\s*(\d{16,20})/i);
  return m ? String(m[1]) : "";
}

function messageHasPendingCandidatureButtons(message?) {
  const rows = message?.components || [];
  for (const row of rows) {
    for (const comp of row?.components || []) {
      const id = String(comp?.customId || "");
      if (id.startsWith(`${APPLY_PEX_PREFIX}:`)) return true;
    }
  }
  return false;
}

function deriveCandidatureStatus(message?) {
  if (messageHasPendingCandidatureButtons(message)) return "pending";
  const color = Number(message?.embeds?.[0]?.color ?? 0);
  if (color === 0x2ecc71) return "accepted";
  if (color === 0xed4245) return "rejected";
  return "closed";
}

function embedFieldsToPlain(embed?) {
  const fields = Array.isArray(embed?.fields) ? embed.fields : [];
  return fields
    .map((field?) => ({
      name: String(field?.name || "").trim(),
      value: stripDiscordDecorations(field?.value || ""),
    }))
    .filter((field?) => field.name || field.value);
}

async function listCandidatureApplications(guild?, opts: Record<string, any> = {}) {
  const scope = String(opts.scope || "all").toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 60));
  const channel = await resolveSubmissionChannel(guild);
  if (!channel?.messages?.fetch) return [];
  const fetchLimit = scope === "all" ? 100 : 50;
  const fetched = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
  if (!fetched) return [];
  const items = [];
  for (const msg of fetched.values()) {
    const parsed = parseCandidateTypeFromMessage(msg);
    if (!parsed?.userId) continue;
    const status = deriveCandidatureStatus(msg);
    if (scope === "pending" && status !== "pending") continue;
    const embed = msg.embeds?.[0];
    items.push({
      messageId: String(msg.id),
      channelId: String(msg.channelId || channel.id),
      type: parsed.type,
      userId: parsed.userId,
      title: String(embed?.title || "Candidatura").trim(),
      preview: stripDiscordDecorations(String(embed?.description || "")).slice(0, 400),
      createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
      status,
      canAct: status === "pending",
    });
  }
  return items.sort((a?, b?) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, limit);
}

function embedDescriptionsJoined(message?) {
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  return embeds
    .map((embed?) => String(embed?.description || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function stripDiscordDecorationsKeepNewlines(text?) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F\uFFFD]/g, (ch?) => (ch === "\n" || ch === "\t" ? ch : ""))
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/<a?:[\w~-]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\|\|(.+?)\|\|/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[*_`~|]+/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function getCandidatureApplicationDetail(guild?, messageId?) {
  const channel = await resolveSubmissionChannel(guild);
  const msg = channel ? await channel.messages.fetch(String(messageId)).catch(() => null) : null;
  if (!msg) return null;
  const parsed = parseCandidateTypeFromMessage(msg);
  if (!parsed?.userId) return null;
  const embed = msg.embeds?.[0];
  const status = deriveCandidatureStatus(msg);
  const fullBody = embedDescriptionsJoined(msg) || String(embed?.description || "");
  const body = stripDiscordDecorationsKeepNewlines(fullBody);
  return {
    messageId: String(msg.id),
    channelId: String(msg.channelId || channel.id),
    type: parsed.type,
    userId: parsed.userId,
    title: String(embed?.title || "Candidatura").trim(),
    body,
    preview: stripDiscordDecorations(body).slice(0, 400),
    fields: embedFieldsToPlain(embed),
    createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
    status,
    canAct: status === "pending",
  };
}

async function resolveCandidatureBoundFromStore(guildId?, messageId?, type?, userId?) {
  let boundType = String(type || "")
    .trim()
    .toLowerCase();
  let boundUserId = String(userId || "").trim();
  if (boundUserId && APPLICATION_TYPES.includes(boundType)) {
    return { boundType, boundUserId };
  }
  try {
    const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../Schemas/Community/communitySchemas") as typeof import("../../../Schemas/Community/communitySchemas");
    const mid = String(messageId || "").trim();
    if (!mid || !guildId) return { boundType, boundUserId };
    const bare = mid.includes(":") ? mid.split(":").slice(1).join(":") : mid;
    const dedupeKey = mid.startsWith("candidature:") ? mid : `candidature:${bare}`;
    const doc = await SiteDocument.findOne({
      docType: SITE_DOCUMENT_TYPE.STAFF_WORKFLOW,
      guildId: String(guildId),
      workflowQueue: "candidature",
      $or: [{ dedupeKey }, { workflowMessageId: bare }, { workflowMessageId: mid }],
    })
      .select({ workflowType: 1, userId: 1 })
      .lean()
      .catch(() => null);
    if (doc) {
      if (!boundType) boundType = String(doc.workflowType || "").trim().toLowerCase();
      if (!boundUserId) boundUserId = String(doc.userId || "").trim();
    }
  } catch (_) {}
  return { boundType, boundUserId };
}

function stripDiscordDecorations(text?) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export = { memberHasCandidatureReviewAccess, parseCandidateTypeFromMessage, listCandidatureApplications, getCandidatureApplicationDetail, resolveCandidatureBoundFromStore, stripDiscordDecorations };

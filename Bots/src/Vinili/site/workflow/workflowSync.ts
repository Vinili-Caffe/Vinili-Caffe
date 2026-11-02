/** Workflow staff: allineamento dello store con appelli, resoconti e pause. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteDocument, ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getPauseStatusLabel, getTodayUtc } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
const { resolveSubmissionChannel } = require("../../site/staff/candidature/candidatureApplicationHandlers") as typeof import("../../site/staff/candidature/candidatureApplicationHandlers");
const { parseAppealFromMessageOrEmbed, deriveAppealStatus, appealSanctionStillActive, closeAppealAsObsolete } = require("../staff/siteStaffAppealsRuntime") as typeof import("../staff/siteStaffAppealsRuntime");
const { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX } = require("../../Events/interaction/resocontoHandlers") as typeof import("../../Events/interaction/resocontoHandlers");
const { stripDiscordDecorations, weekKeyFromDate, buildWorkflowDedupeKey, normalizeStatus, pauseTrackRoleKey, parseResocontoOutcomeFromContent, normalizeResocontoActionKey } = require("./workflowLabels") as typeof import("./workflowLabels");
const { pickSubjectDisplayName, memberToSubjectFields, resolveWorkflowSubject, cleanAppealPreviewText } = require("./workflowSubjects") as typeof import("./workflowSubjects");
const { WORKFLOW_DOC, upsertStaffWorkflowItem, updateStaffWorkflowFromPause } = require("./workflowWrites") as typeof import("./workflowWrites");
const { upsertPauseWorkflowFromPause } = require("./workflowQueries") as typeof import("./workflowQueries");

function memberStillRelevantForStaffResoconto(member?, roleId?) {
  const { memberHasAnyStaffPresenceForDepexSync } = require("../../Staff/utils/staffPmUtils") as typeof import("../../Staff/utils/staffPmUtils");
  if (!member) return false;
  const rid = String(roleId || "").trim();
  if (rid && !member.roles?.cache?.has?.(rid)) return false;
  return memberHasAnyStaffPresenceForDepexSync(member);
}

function memberStillRelevantForResoconto(member?, kind?, roleId?) {
  const { memberHasPartnerManagerRole } = require("../../Staff/utils/staffPmUtils") as typeof import("../../Staff/utils/staffPmUtils");
  const k = String(kind || "").trim().toLowerCase();
  if (!member) return false;
  if (k === "p") return memberHasPartnerManagerRole(member);
  if (k === "s") return memberStillRelevantForStaffResoconto(member, roleId);
  return false;
}

function resocontoAutoCancelLabel(member?, kind?) {
  if (!member) return "Annullato (uscita)";
  const k = String(kind || "").trim().toLowerCase();
  if (k === "p") return "Annullato (depex PM)";
  return "Annullato (depex)";
}

function memberEligibleForPauseRole(member?, ruoloRichiesto?) {
  const {
    memberHasAnyStaffPresenceForDepexSync,
    memberHasPartnerManagerRole,
  } = require("../../Staff/utils/staffPmUtils") as typeof import("../../Staff/utils/staffPmUtils");
  if (!member) return false;
  const role = String(ruoloRichiesto || "Staff")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (role === "partnermanager" || role === "pm") {
    return memberHasPartnerManagerRole(member);
  }
  if (role === "entrambi" || role === "both") {
    return memberHasAnyStaffPresenceForDepexSync(member) || memberHasPartnerManagerRole(member);
  }
  return memberHasAnyStaffPresenceForDepexSync(member);
}

function pauseAutoCancelLabel(member?) {
  return member ? "Annullato (depex)" : "Annullato (uscita)";
}

async function autoCancelPendingPausesIfNotEligible(guild?, userId?, options: Record<string, any> = {}) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return 0;
  const { getStaffPauseRecord, updatePauseInDb } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
  const { resolveGuildMemberPresence } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
  const presence = await resolveGuildMemberPresence(guild, uid, { preferFresh: true }).catch(() => ({
    member: null,
    left: false,
    uncertain: true,
  }));
    if (presence.uncertain && !presence.member) return 0;
  const member = presence.member || null;
  const leftServer = Boolean(presence.left) || !member;
  const record = await getStaffPauseRecord(gid, uid);
  const pauses = Array.isArray(record?.staff?.pauses) ? record.staff.pauses : [];
  let count = 0;

  for (const pause of pauses) {
    if (String(pause?.status || "") !== "pending") continue;
    const pauseId = String(pause?._id || "").trim();
    if (!pauseId) continue;
    const ruolo = pause.ruoloRichiesto || pause.ruolo || "Staff";
    if (!leftServer && memberEligibleForPauseRole(member, ruolo)) continue;
    const statusLabel = String(
      options.statusLabel || (leftServer ? "Annullato (uscita)" : pauseAutoCancelLabel(member)),
    ).slice(0, 200);
    await updatePauseInDb(gid, uid, pauseId, { status: "cancelled", cancelledAt: new Date() }).catch(() => null);
    await updateStaffWorkflowFromPause(gid, uid, pauseId, "cancelled", {
      statusLabel,
      staffReason: statusLabel,
      decidedBy: String(options.decidedBy || "system"),
    }).catch(() => null);
    count += 1;
  }
  return count;
}

async function reconcilePendingPauseWorkflows(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  const guild =
    client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
  if (!guild) return 0;
  const { getStaffPauseRecord } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
  const { resolveGuildMemberPresence } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
  const pendingDocs = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "pause",
    status: "pending",
  })
    .select("userId workflowPauseId dedupeKey workflowFields")
    .lean()
    .catch(() => []);
  let updated = 0;
  for (const doc of pendingDocs || []) {
    const uid = String(doc?.userId || "").trim();
    const pauseId = String(doc?.workflowPauseId || "").trim();
    const dedupeKey = String(doc?.dedupeKey || "").trim();
    if (!uid || !pauseId || !dedupeKey) continue;
    const presence = await resolveGuildMemberPresence(guild, uid, { preferFresh: true }).catch(() => ({
      member: null,
      left: false,
      uncertain: true,
    }));
        if (presence.uncertain && !presence.member) continue;
    const member = presence.member || null;
    const leftServer = Boolean(presence.left) || !member;
    const ruolo = doc?.workflowFields?.ruoloRichiesto || "Staff";
    if (leftServer || !memberEligibleForPauseRole(member, ruolo)) {
      const statusLabel = leftServer ? "Annullato (uscita)" : pauseAutoCancelLabel(member);
      await updateStaffWorkflowFromPause(gid, uid, pauseId, "cancelled", {
        statusLabel,
        decidedBy: "system",
      }).catch(() => null);
      const { updatePauseInDb } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
      await updatePauseInDb(gid, uid, pauseId, {
        status: "cancelled",
        cancelledAt: new Date(),
      }).catch(() => null);
      updated += 1;
      continue;
    }
    const record = await getStaffPauseRecord(gid, uid);
    const pause = (Array.isArray(record?.staff?.pauses) ? record.staff.pauses : []).find(
      (p?) => String(p?._id || "") === pauseId,
    );
    if (!pause) {
      await SiteDocument.deleteOne({
        docType: WORKFLOW_DOC,
        guildId: gid,
        dedupeKey,
      }).catch(() => null);
      updated += 1;
      continue;
    }
    if (String(pause.status || "") !== "pending") {
      await updateStaffWorkflowFromPause(gid, uid, pauseId, normalizeStatus(pause.status), {
        statusLabel: getPauseStatusLabel(pause, getTodayUtc()),
        decidedBy: "system",
      });
      updated += 1;
    }
  }
      updated += await pruneOrphanClosedPauseWorkflows(gid).catch(() => 0);
  return updated;
}

async function pruneOrphanClosedPauseWorkflows(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  const { getStaffPauseRecord } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
  const closed = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "pause",
    status: { $in: ["rejected", "cancelled"] },
  })
    .select("userId workflowPauseId dedupeKey")
    .limit(200)
    .lean()
    .catch(() => []);
  let removed = 0;
  const pauseIdsByUser = new Map();
  for (const doc of closed || []) {
    const uid = String(doc?.userId || "").trim();
    const pauseId = String(doc?.workflowPauseId || "").trim();
    const dedupeKey = String(doc?.dedupeKey || "").trim();
    if (!uid || !pauseId || !dedupeKey) continue;
    let idSet = pauseIdsByUser.get(uid);
    if (!idSet) {
      const record = await getStaffPauseRecord(gid, uid);
      const pauses = Array.isArray(record?.staff?.pauses) ? record.staff.pauses : [];
      idSet = new Set(pauses.map((p?) => String(p?._id || "")).filter(Boolean));
      pauseIdsByUser.set(uid, idSet);
    }
    if (idSet.has(pauseId)) continue;
    const del = await SiteDocument.deleteOne({
      docType: WORKFLOW_DOC,
      guildId: gid,
      dedupeKey,
    }).catch(() => null);
    if (del?.deletedCount) removed += 1;
  }
  return removed;
}

function parseResocontoPayloadFromCustomId(customId?) {
  const raw = String(customId || "");
  const isApply = raw.startsWith(`${RESOCONTO_APPLY_PREFIX}:`);
  const isReject = raw.startsWith(`${RESOCONTO_REJECT_PREFIX}:`);
  const isOverride = raw.startsWith("resoconto_override:");
  const isReason = raw.startsWith("resoconto_reason:");
  if (!isApply && !isReject && !isOverride && !isReason) return null;
  const parts = raw.split(":");
  const kind = String(parts[1] || "");
  const userId = String(parts[2] || "");
  if (!/^\d{16,20}$/.test(userId)) return null;
  if (kind === "s") {
    const roleId = String(parts[3] || "");
    const actionKey = String(parts[4] || parts[3] || "");
    if (roleId && !/^\d{16,20}$/.test(roleId)) return null;
    return { kind, userId, roleId: roleId || null, actionKey, pending: isApply };
  }
  if (kind === "p") {
    return { kind, userId, roleId: null, actionKey: String(parts[3] || ""), pending: isApply };
  }
  return null;
}

function parseResocontoFromMessage(msg?) {
  for (const row of msg?.components || []) {
    for (const comp of row?.components || []) {
      const parsed = parseResocontoPayloadFromCustomId(comp?.customId);
      if (parsed) return parsed;
    }
  }
  const content = String(msg?.content || "");
  if (!/\*\*Staffer:\*\*|\*\*Partner Manager:\*\*|Staffer:|Partner Manager:/i.test(content)) return null;
  const userId = content.match(/<@!?(\d{16,20})>/)?.[1];
  if (!/^\d{16,20}$/.test(String(userId || ""))) return null;
  const actionMatch =
    content.match(/\*\*Azione:\*\*\s*__([^_]+)__/) ||
    content.match(/\*\*Azione:\*\*\s*([^\n*]+)/i) ||
    content.match(/Azione:\s*([^\n]+)/i);
  const displayAction = String(actionMatch?.[1] || "nl").trim();
  const actionKey = normalizeResocontoActionKey(displayAction) || "";
  if (/\*\*Partner Manager:\*\*|Partner Manager:/i.test(content)) {
    return { kind: "p", userId, roleId: null, actionKey, pending: false };
  }
  const roleId = content.match(/<@&(\d{16,20})>/)?.[1] || null;
  return { kind: "s", userId, roleId, actionKey, pending: false };
}

async function syncAppealsToWorkflowStore(guild?, opts: Record<string, any> = {}) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return 0;
  const channel = await resolveSubmissionChannel(guild);
  if (!channel?.messages?.fetch) return 0;
  const scope = String(opts.scope || "all").toLowerCase();
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 5));
  const skipSanctionCheck = Boolean(opts.skipSanctionCheck || opts.fastInbox);
  let count = 0;
  let before;
  for (let page = 0; page < maxPages; page += 1) {
    const fetched = await channel.messages
      .fetch({ limit: 100, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!fetched?.size) break;
    const msgs = [...fetched.values()];
    before = msgs[msgs.length - 1]?.id;
    for (const msg of msgs) {
      const parsed = parseAppealFromMessageOrEmbed(msg);
      if (!parsed) continue;
      let status = deriveAppealStatus(msg);
      if (
        status === "pending" &&
        !skipSanctionCheck &&
        !(await appealSanctionStillActive(guild, parsed.kind, parsed.userId))
      ) {
        await closeAppealAsObsolete(guild, msg, parsed, { messageId: msg.id }).catch(() => null);
        status = "cancelled";
      }
      if (scope === "pending" && status !== "pending") continue;
      await persistAppealWorkflowFromMessage(guild, msg, parsed, status);
      count += 1;
    }
    if (fetched.size < 100) break;
  }
  return count;
}

async function syncResocontiToWorkflowStore(guild?, opts: Record<string, any> = {}) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return 0;
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return 0;
  const channelId = String(IDs.channels?.resocontiStaff || IDs.channels?.valutazioniStaff || "").trim();
  if (!channelId) return 0;
  const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.messages?.fetch) return 0;

  let count = 0;
  let before;
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 3));
  for (let page = 0; page < maxPages; page += 1) {
    const fetched = await channel.messages
      .fetch({ limit: 100, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!fetched?.size) break;
    const msgs = [...fetched.values()];
    before = msgs[msgs.length - 1]?.id;
    for (const msg of msgs) {
      const payload = parseResocontoFromMessage(msg);
      if (!payload) continue;
      const hasActionButtons = (msg.components || []).some((row?) =>
        (row.components || []).some((c?) => {
          const id = String(c?.customId || "");
          return id.startsWith(`${RESOCONTO_APPLY_PREFIX}:`) || id.startsWith(`${RESOCONTO_REJECT_PREFIX}:`);
        }),
      );
      const rawBody = String(msg.content || "");
      const decidedMarker = /azione confermata da|azione negata da/i.test(rawBody);
      const outcome = decidedMarker ? parseResocontoOutcomeFromContent(rawBody) : null;
      const member = await getGuildMemberCached(guild, payload.userId).catch(() => null);
      let stillRelevant = memberStillRelevantForResoconto(member, payload.kind, payload.roleId);
      let status = "pending";
      if (decidedMarker) {
        status = outcome?.rejected ? "rejected" : "accepted";
      } else if (hasActionButtons) {
        status = "pending";
      } else if (!stillRelevant) {
        status = "cancelled";
      }
      const appliedActionKey =
        normalizeResocontoActionKey(outcome?.actionKey || "") || normalizeResocontoActionKey(payload.actionKey);
      const title =
        payload.kind === "p"
          ? `Resoconto PM · ${payload.actionKey || ""}`.trim()
          : `Resoconto staff · ${payload.actionKey || ""}`.trim();
      const subject = await resolveWorkflowSubject(guild?.client, guild, payload.userId);
      const fromMember = memberToSubjectFields(member, payload.userId);
      await upsertStaffWorkflowItem({
        guildId,
        queue: "resoconti",
        dedupeKey: buildWorkflowDedupeKey("resoconti", [msg.id]),
        userId: payload.userId,
        messageId: msg.id,
        channelId: String(msg.channelId || channel.id),
        kind: payload.kind,
        roleId: payload.roleId,
        actionKey: appliedActionKey || payload.actionKey,
        status,
        ...(status === "cancelled"
          ? {
              statusLabel: resocontoAutoCancelLabel(member, payload.kind),
              decidedBy: "system",
            }
          : outcome?.label
            ? { statusLabel: outcome.label, staffReason: outcome.label }
            : {}),
        title,
        preview: rawBody.slice(0, 400),
        content: rawBody,
        createdAt: msg.createdAt,
        weekKey: weekKeyFromDate(msg.createdAt),
        displayName: fromMember.displayName || subject.displayName || "",
        avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
      });
      count += 1;
    }
    if (fetched.size < 100) break;
  }
  return count;
}

async function ensurePauseWorkflowDoc(client?, guildId?, dedupeKey?) {
  const gid = String(guildId || "").trim();
  const key = String(dedupeKey || "").trim();
  if (!gid || !key.toLowerCase().startsWith("pause:")) return null;
  const existing = await SiteDocument.findOne({ docType: WORKFLOW_DOC, guildId: gid, dedupeKey: key })
    .select("status workflowQueue userId dedupeKey")
    .lean()
    .catch(() => null);
  if (existing) return existing;

  const parts = key.split(":");
    const uid = String(parts[1] || "").trim();
  const pauseId = String(parts.slice(2).join(":") || "").trim();
  if (!uid || !pauseId) return null;

  const { getStaffPauseRecord } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
  const record = await getStaffPauseRecord(gid, uid);
  const pause = (Array.isArray(record?.staff?.pauses) ? record.staff.pauses : []).find(
    (p?) => String(p?._id || "") === pauseId,
  );
  if (!pause || String(pause.status || "") !== "pending") return null;

  const guild =
    client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
  await upsertPauseWorkflowFromPause(client, guild, uid, pause).catch(() => null);
  return SiteDocument.findOne({ docType: WORKFLOW_DOC, guildId: gid, dedupeKey: key })
    .select("status workflowQueue userId dedupeKey")
    .lean()
    .catch(() => null);
}

async function syncPauseWorkflowFieldsFromProfiles(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  const docs = await ActivityUserProfile.find(
    { guildId: gid, "staff.pauses.0": { $exists: true } },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);
  let count = 0;
  for (const doc of docs || []) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    for (const pause of Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : []) {
      if (!pause?._id) continue;
      await upsertPauseWorkflowFromPause(null, null, userId, pause).catch(() => null);
      count += 1;
    }
  }
    const legacy = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "pause",
    $or: [
      { "workflowFields.ruoloTrack": { $exists: false } },
      { "workflowFields.ruoloTrack": null },
      { "workflowFields.ruoloTrack": "" },
    ],
  })
    .select("_id workflowFields")
    .limit(300)
    .lean()
    .catch(() => []);
  for (const w of legacy || []) {
    const track = pauseTrackRoleKey(w.workflowFields || {});
    await SiteDocument.updateOne(
      { _id: w._id },
      {
        $set: {
          "workflowFields.ruoloTrack": track,
          "workflowFields.ruoloRichiesto": track,
        },
      },
    ).catch(() => null);
  }
  return count;
}

async function syncPausesToWorkflowStore(client?, guildId?) {
  const gid = String(guildId || "").trim();
  await syncPauseWorkflowFieldsFromProfiles(gid).catch(() => 0);
  const docs = await ActivityUserProfile.find({ guildId: gid, "staff.pauses.0": { $exists: true } }, { userId: 1, staff: 1 })
    .lean()
    .catch(() => []);
  const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
  let count = 0;
  const seenUsers = new Set();
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    const member = guild ? await getGuildMemberCached(guild, userId).catch(() => null) : null;
    if (guild && userId && !seenUsers.has(userId)) {
      seenUsers.add(userId);
      await autoCancelPendingPausesIfNotEligible(guild, userId, { decidedBy: "system" }).catch(() => 0);
    }
    for (const pause of pauses) {
      if (!pause?._id) continue;
      const pauseId = String(pause._id);
      let status = normalizeStatus(pause.status, "pending");
      const ruolo = pause.ruoloRichiesto || pause.ruolo || "Staff";
            if (status === "pending" && member && !memberEligibleForPauseRole(member, ruolo)) {
        const { updatePauseInDb } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
        const statusLabel = pauseAutoCancelLabel(member);
        await updatePauseInDb(gid, userId, pauseId, { status: "cancelled", cancelledAt: new Date() }).catch(
          () => null,
        );
        status = "cancelled";
        pause.status = "cancelled";
        pause.cancelledAt = new Date();
      }
      await upsertPauseWorkflowFromPause(client, guild, userId, { ...pause, status, _id: pauseId });
      count += 1;
    }
  }
  await reconcilePendingPauseWorkflows(client, gid).catch(() => 0);
  return count;
}

async function persistAppealWorkflowFromMessage(guild?, message?, parsed?, status = "pending") {
  if (!guild || !message || !parsed) return null;
  const embed = message.embeds?.[0];
  const body = stripDiscordDecorations(String(embed?.description || ""), { keepNewlines: true });
  const fallbackTitle = parsed.kind === "unban" ? "Richiesta Unban" : "Richiesta Unmute";
  return persistAppealWorkflowFromPayload(guild, {
    messageId: message.id,
    channelId: message.channelId,
    userId: parsed.userId,
    kind: parsed.kind,
    status,
    title: stripDiscordDecorations(embed?.title || fallbackTitle) || fallbackTitle,
    body,
    createdAt: message.createdAt,
  });
}

async function persistAppealWorkflowFromPayload(guild?, payload: Record<string, any> = {}) {
  if (!guild) return null;
  const messageId = String(payload.messageId || "").trim();
  const userId = String(payload.userId || "").trim();
  const kind = String(payload.kind || "").trim().toLowerCase();
  if (!messageId || !userId || (kind !== "unban" && kind !== "unmute")) return null;
  const body = stripDiscordDecorations(String(payload.body || ""), { keepNewlines: true });
  const fallbackTitle = kind === "unban" ? "Richiesta Unban" : "Richiesta Unmute";
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  const subject = await resolveWorkflowSubject(guild?.client, guild, userId);
  const fromMember = memberToSubjectFields(member, userId);
  const displayName = pickSubjectDisplayName(
    userId,
    payload.displayName,
    payload.subjectDisplayName,
    payload.workflowSubjectName,
    fromMember.displayName,
    subject.displayName,
  );
  const avatarUrl =
    String(payload.avatarUrl || payload.subjectAvatarUrl || "").trim() ||
    fromMember.avatarUrl ||
    subject.avatarUrl ||
    "";
  return upsertStaffWorkflowItem({
    guildId: guild.id,
    queue: "appelli",
    dedupeKey: buildWorkflowDedupeKey("appelli", [messageId]),
    userId,
    kind,
    messageId,
    channelId: String(payload.channelId || "site"),
    status: payload.status || "pending",
    title: stripDiscordDecorations(payload.title || fallbackTitle) || fallbackTitle,
    preview: cleanAppealPreviewText(body).slice(0, 500),
    content: body,
    createdAt: payload.createdAt || new Date(),
    displayName,
    avatarUrl,
  });
}

export = { memberStillRelevantForResoconto, resocontoAutoCancelLabel, memberEligibleForPauseRole, autoCancelPendingPausesIfNotEligible, reconcilePendingPauseWorkflows, parseResocontoFromMessage, syncAppealsToWorkflowStore, syncResocontiToWorkflowStore, ensurePauseWorkflowDoc, syncPauseWorkflowFieldsFromProfiles, syncPausesToWorkflowStore, persistAppealWorkflowFromPayload };

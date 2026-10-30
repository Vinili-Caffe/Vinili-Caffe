const cron = require("node-cron") as typeof import("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
const axios = require("axios") as typeof import("axios").default;
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const {
  resolvePartnershipConfigSync,
  getPartnershipChannelId,
  getPartnershipLogChannelIds,
  listPartnershipAuditGuildIds,
  shouldApplyMainPartnershipFilters,
  memberHasPartnerManagerRole,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
let dailyPartnerAuditTask = null;
let intradayPartnerAuditTimer = null;
let intradayPartnerAuditInFlight = false;
const SAME_DAY_DUPLICATE_REASON = "Non fare partnership con lo stesso server più di una volta al giorno";
const SELF_PARTNERSHIP_DAILY_REASON = "Non fare partnership con se stessi più di una volta al giorno";
const SAME_MANAGER_DAILY_CAP_REASON = "Non mettere più di 5 partnership con lo stesso utente";
const MANAGER_LEFT_SERVER_REASON = "Manager fuori dal server";

function isManagerInLeaveGrace(client?, guildId?, managerUserId?) {
  const map = client?._partnerManagerLeaveGrace;
  if (!(map instanceof Map)) return false;
  const gid = String(guildId || "").trim();
  const uid = String(managerUserId || "").trim();
  if (!gid || !uid) return false;
  return map.has(`${gid}:${uid}`);
}

function getRomeDateKey(date?) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", });
  return fmt.format(date);
}

function getPreviousRomeDateKey(baseDate = new Date()) {
  const romeNow = new Date(baseDate.toLocaleString("en-US", { timeZone: "Europe/Rome" }),);
  romeNow.setDate(romeNow.getDate() - 1);
  return getRomeDateKey(romeNow);
}

function resolvePartnerAuditIntradayIntervalMinutes() {
  const raw = String(process.env.PARTNER_AUDIT_INTRADAY_MINUTES ?? "30").trim().toLowerCase();
  if (!raw || ["0", "false", "no", "off"].includes(raw)) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(120, Math.max(5, Math.floor(n)));
}

function extractInviteCode(text?) {
  if (!text) return null;
  const patterns = [/discord\.gg\/([a-zA-Z0-9_-]+)/i, /discord\.com\/invite\/([a-zA-Z0-9_-]+)/i, /discordapp\.com\/invite\/([a-zA-Z0-9_-]+)/i,];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractInviteCodes(text?) {
  if (!text) return [];
  const source = String(text || "");
  const patterns = [/discord\.gg\/([a-zA-Z0-9_-]+)/gi, /discord\.com\/invite\/([a-zA-Z0-9_-]+)/gi, /discordapp\.com\/invite\/([a-zA-Z0-9_-]+)/gi,];
  const out = new Set();
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(source)) !== null) {
      if (match?.[1]) out.add(String(match[1]).toLowerCase());
    }
  }
  return Array.from(out);
}

function extractDesignatedManagerIdsFromText(sourceText?) {
  const text = String(sourceText || "");
  const managerLineMatches = Array.from(text.matchAll(/Manager:\s*<@!?(\d+)>/gi));
  const ids = managerLineMatches.map((m?) => m?.[1]).filter(Boolean).map((id?) => String(id));
  return Array.from(new Set(ids));
}

async function fetchPartnerActionText(guild?, action?) {
  const channelId =
    action?.partnershipChannelId ||
    getPartnershipChannelId(guild?.id) ||
    IDs.channels.partnerships;
  if (!channelId) {
    global.logger?.warn?.("[PARTNER AUDIT] No channel ID for action");
    return "";
  }

  const channel = await getGuildChannelCached(guild, channelId);
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.(`[PARTNER AUDIT] Channel not found or not text-based: ${channelId}`);
    return "";
  }

  const ids = Array.isArray(action?.partnerMessageIds) ? action.partnerMessageIds : [];
  const chunks = [];

  for (const messageId of ids) {
    const msg = await channel.messages.fetch(messageId).catch((err?) => {
      const code = String(err?.code || "").trim();
      const msgText = String(err?.message || "").trim();
      const httpStatus = String(err?.status || err?.httpStatus || "").trim();
      const detail = `${code} ${httpStatus} ${msgText}`.trim();
            if (
        code === "10008" ||
        httpStatus === "404" ||
        /unknown message/i.test(detail) ||
        /discordapierror\s*\[\s*10008\s*\]/i.test(detail)
      ) return null;
      global.logger?.warn?.(`[PARTNER AUDIT] Failed to fetch message ${messageId}: ${msgText || err}`);
      return null;
    });
    if (!msg) continue;

    const plain = String(msg.content || "").trim();
    if (plain) chunks.push(plain);

    const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
    for (const e of embeds) {
      const title = String(e?.title || "").trim();
      const desc = String(e?.description || "").trim();
      const url = String(e?.url || "").trim();
      const fields = Array.isArray(e?.fields) ? e.fields.map((f?) => { const n = String(f?.name || "").trim(); const v = String(f?.value || "").trim(); return [n, v].filter(Boolean).join("\n"); }).filter(Boolean).join("\n") : "";

      const embedText = [title, desc, fields, url].filter(Boolean).join("\n").trim();
      if (embedText) chunks.push(embedText);
    }
  }

  return chunks.join("\n");
}

async function resolveInviteCodeToGuildId(rawCode?, cache?) {
  const code = String(rawCode || "").trim();
  if (!code) return "";
  const key = code.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  try {
    const res = await axios.get(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`, {
      timeout: 12000,
      headers: { Accept: "application/json" },
      validateStatus: () => true,
    });
    const gid =
      res?.status === 200 && res.data?.guild?.id ? String(res.data.guild.id).trim() : "";
    if (/^\d{17,20}$/.test(gid)) {
      cache.set(key, gid);
      return gid;
    }
    cache.set(key, "");
    return "";
  } catch {
    cache.set(key, "");
    return "";
  }
}

async function resolveRowPartnerGuildId(row?, inviteGuildIdCache?) {
  const ex = String(row?.action?.partnerGuildId || "").trim();
  if (/^\d{17,20}$/.test(ex)) {
    row.resolvedPartnerGuildId = ex;
    return ex;
  }
  for (const c of row.inviteCodes || []) {
    const gid = await resolveInviteCodeToGuildId(c, inviteGuildIdCache);
    if (gid) {
      row.resolvedPartnerGuildId = gid;
      return gid;
    }
  }
  const single = extractInviteCode(row.action?.invite || "");
  if (single) {
    const gid = await resolveInviteCodeToGuildId(single, inviteGuildIdCache);
    row.resolvedPartnerGuildId = gid || "";
    return row.resolvedPartnerGuildId;
  }
  row.resolvedPartnerGuildId = "";
  return "";
}

async function resolveTextLogChannel(guild?, channelId?) {
  if (!channelId) return null;
  const ch = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  return ch?.isTextBased?.() ? ch : null;
}

async function logPointRemoval(guild?, staffUserId?, reason?, action?) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  const { primary: primaryId, fallback: fallbackId } = getPartnershipLogChannelIds(guild?.id);
  const hardFallback = isDiscordStaffChannelPostsEnabled()
    ? String(IDs.channels?.puntiTolti || "").trim()
    : "";

  let channel = null;
  if (isDiscordStaffChannelPostsEnabled()) {
    for (const channelId of [primaryId, fallbackId, hardFallback]) {
      if (!channelId) continue;
      channel = await resolveTextLogChannel(guild, channelId);
      if (channel) break;
    }
  }

  const msgRef = Array.isArray(action?.partnerMessageIds) && action.partnerMessageIds.length
    ? `https://discord.com/channels/${guild.id}/${action.partnershipChannelId || getPartnershipChannelId(guild.id)}/${action.partnerMessageIds[0]}`
    : "N/D";
  const inviteDb = action?.invite ? String(action.invite).slice(0, 300) : "N/D";
  const { logPmPointsRemoved } = require("../../Utils/Partner/pmPointsRemovedStore") as typeof import("../../Utils/Partner/pmPointsRemovedStore");

  const mirrorContent = `<:VC_PartnerManager:1494286911286808576> <@${staffUserId}>
<:VC_reason:1478517122929004544> ${reason}
<:VC_Chat:1482532573002465413> Messaggio: ${msgRef}
<:link:1470064815899803668> Invite: ${inviteDb}`;

  try {
    const entry = await logPmPointsRemoved({
      guild,
      pmUserId: staffUserId,
      rule: reason,
      messageLink: msgRef !== "N/D" ? msgRef : null,
      invite: inviteDb !== "N/D" ? inviteDb : null,
      status: "logged",
      source: "audit",
      mirrorChannel: channel,
      mirrorContent: channel ? mirrorContent : null,
    });
    if (!entry) return null;
    if (entry.discordMessageId) {
      return { channelId: entry.discordChannelId, messageId: entry.discordMessageId };
    }
    return { channelId: null, messageId: null, entryId: String(entry._id || entry.id || "") };
  } catch (err) {
    global.logger?.warn?.(`[PARTNER AUDIT] log failed: ${err?.message || err}`);
    return null;
  }
}

async function auditSingleProfilePartnerDay(guild?, doc?, targetDateKey?, opts: Record<string, any> = {}) {
  let checked = 0;
  let removed = 0;
  let logsSent = 0;
  const inviteGuildIdCache = opts.inviteGuildIdCache instanceof Map ? opts.inviteGuildIdCache : new Map();
  if (!doc.staff) doc.staff = {};
  const actions = Array.isArray(doc.staff.partnerActions) ? doc.staff.partnerActions : [];
  const allCreates = actions
    .map((action?, index?) => ({ action, index }))
    .filter(({ action }) => String(action?.action || "create") === "create")
    .map(({ action, index }) => {
      const dateMs = new Date(action?.date || 0).getTime();
      return { action, index, dateMs, inviteCodes: [] };
    })
    .sort((a?, b?) => a.dateMs - b.dateMs);

  const dayCreates = allCreates
    .filter(({ action }) => getRomeDateKey(new Date(action?.date || Date.now())) === targetDateKey)
    .sort((a?, b?) => a.dateMs - b.dateMs);

  if (!dayCreates.length) return { checked, removed, logsSent };

    const staffMember = await guild.members.fetch(String(doc.userId || "")).catch(() => null);
  if (!memberHasPartnerManagerRole(staffMember, guild.id)) {
    return { checked: dayCreates.length, removed: 0, logsSent: 0 };
  }

  checked = dayCreates.length;

  const rowsForAudit = allCreates
    .filter((row?) => {
      const rowKey = getRomeDateKey(new Date(row?.action?.date || Date.now()));
      return rowKey === targetDateKey;
    })
    .sort((a?, b?) => a.dateMs - b.dateMs);

  const actionTextCache = new Map();
  const getActionTextCached = async (row?) => {
    if (!row?.action) return "";
    if (actionTextCache.has(row.index)) return actionTextCache.get(row.index);
    const text = await fetchPartnerActionText(guild, row.action);
    actionTextCache.set(row.index, text || "");
    return actionTextCache.get(row.index);
  };
  const enrichInviteCodes = async (row?) => {
    if (!row?.action) {
      row.inviteCodes = [];
      return row.inviteCodes;
    }
    const fromInviteField = extractInviteCodes(row.action?.invite || "");
    const actionText = await getActionTextCached(row);
    const fromText = extractInviteCodes(actionText);
    const combined = Array.from(new Set([...fromInviteField, ...fromText]));
    if (!combined.length && row.action?.invite) {
      const singleCode = extractInviteCode(row.action.invite);
      if (singleCode) combined.push(singleCode);
    }
    row.inviteCodes = combined;
    return row.inviteCodes;
  };

  await Promise.all(rowsForAudit.map((row?) => enrichInviteCodes(row)));
  await Promise.all(rowsForAudit.map((row?) => resolveRowPartnerGuildId(row, inviteGuildIdCache)));

  const managerIdsUnique = [
    ...new Set(
      dayCreates
        .map(({ action }) => String(action?.managerId || "").trim())
        .filter((id?) => /^\d{17,20}$/.test(id)),
    ),
  ];
  const managerPresentInGuild = new Map();
  await Promise.all(
    managerIdsUnique.map(async (mid?) => {
      const m = await guild.members.fetch(mid).catch(() => null);
      managerPresentInGuild.set(mid, Boolean(m));
    }),
  );

  const firstPartnerGuildIdIndexSameDay = new Map();
  const managerDailyCounter = new Map();
  const selfDailyCounter = new Map();
  const invalidIndices = new Set();
  const invalidReasonsByIndex = new Map();
  const addInvalidReason = (index?, reason?) => {
    if (!reason) return;
    if (!invalidReasonsByIndex.has(index)) {
      invalidReasonsByIndex.set(index, []);
    }
    const current = invalidReasonsByIndex.get(index);
    if (!current.includes(reason)) current.push(reason);
  };

  for (const item of dayCreates) {
    const { index } = item;
    const reasons = [];
    const actionText = await getActionTextCached(item);
    const storedManagerId = String(item.action?.managerId || "").trim();
    const designatedManagerFromDb = /^\d{17,20}$/.test(storedManagerId) ? storedManagerId : "";

    const partnerGuildId = String(item.resolvedPartnerGuildId || "").trim();
    if (partnerGuildId) {
      if (!firstPartnerGuildIdIndexSameDay.has(partnerGuildId)) {
        firstPartnerGuildIdIndexSameDay.set(partnerGuildId, index);
      } else {
        reasons.push(SAME_DAY_DUPLICATE_REASON);
      }
    }

    const isDuplicatePartnerGuildSameDay =
      Boolean(partnerGuildId) &&
      firstPartnerGuildIdIndexSameDay.get(partnerGuildId) !== index;

    if (!isDuplicatePartnerGuildSameDay) {
      if (designatedManagerFromDb && designatedManagerFromDb === String(doc.userId)) {
        const selfUsed = Number(selfDailyCounter.get(String(doc.userId)) || 0) + 1;
        selfDailyCounter.set(String(doc.userId), selfUsed);
        if (selfUsed > 1) {
          reasons.push(SELF_PARTNERSHIP_DAILY_REASON);
        }
      }

      const canonicalManagers =
        designatedManagerFromDb !== ""
          ? [designatedManagerFromDb]
          : extractDesignatedManagerIdsFromText(actionText);

      for (const managerId of canonicalManagers) {
        if (!/^\d{17,20}$/.test(String(managerId || ""))) continue;
        const used = Number(managerDailyCounter.get(managerId) || 0) + 1;
        managerDailyCounter.set(managerId, used);
        if (used > 5) {
          reasons.push(SAME_MANAGER_DAILY_CAP_REASON);
        }
      }
    }

    const mgrId = String(item.action?.managerId || "").trim();
    if (
      mgrId &&
      /^\d{17,20}$/.test(mgrId) &&
      !managerPresentInGuild.get(mgrId) &&
      !isManagerInLeaveGrace(guild?.client, guild?.id, mgrId)
    ) {
      reasons.push(MANAGER_LEFT_SERVER_REASON);
    }

    if (reasons.length) {
      invalidIndices.add(index);
      for (const reason of reasons) {
        addInvalidReason(index, reason);
      }
    }
  }

  for (const keepIndex of firstPartnerGuildIdIndexSameDay.values()) {
    const reasons = invalidReasonsByIndex.get(keepIndex);
    if (!Array.isArray(reasons) || !reasons.length) continue;

    const filteredReasons = reasons.filter((reason?) => reason !== SAME_DAY_DUPLICATE_REASON);

    if (filteredReasons.length) {
      invalidReasonsByIndex.set(keepIndex, filteredReasons);
      invalidIndices.add(keepIndex);
    } else {
      invalidReasonsByIndex.delete(keepIndex);
      invalidIndices.delete(keepIndex);
    }
  }

  if (!invalidIndices.size) return { checked, removed, logsSent };

  let flagged = 0;
  for (const index of invalidIndices) {
    const action = actions[(index as any)];
    if (!action) continue;
    const alreadyPenalized = Array.isArray(action.auditPenaltyDates) && action.auditPenaltyDates.includes(targetDateKey);
    if (alreadyPenalized) continue;
    const penaltyReasons = invalidReasonsByIndex.get(index) || [];
    const penaltyReasonText = penaltyReasons.join(" | ");

    const logResult = await logPointRemoval(
      guild,
      doc.userId,
      penaltyReasonText,
      action,
    );
    if (logResult?.messageId) logsSent += 1;
    action.auditPenaltyDates = Array.isArray(action.auditPenaltyDates) ? action.auditPenaltyDates : [];
    action.auditPenaltyDates.push(targetDateKey);
    action.auditPenaltyLogs = Array.isArray(action.auditPenaltyLogs) ? action.auditPenaltyLogs : [];
    action.auditPenaltyLogs.push({
      dateKey: targetDateKey,
      reason: penaltyReasonText,
      channelId: logResult?.channelId || "",
      messageId: logResult?.messageId || "",
    });
    flagged += 1;
  }

  if (flagged > 0) {
    const currentCount = Number(doc.staff?.partnerCount || 0);
    doc.staff.partnerCount = Math.max(0, currentCount - flagged);
    doc.markModified("staff");
    try {
      await doc.save();
      removed = flagged;
    } catch (saveErr) {
      global.logger?.error?.(`[PARTNER AUDIT] User ${doc.userId}: failed to persist penalties ${saveErr?.message || saveErr}`);
    }
  }

  return { checked, removed, logsSent };
}

async function runImmediatePartnerAuditForUser(client?, userId?, guildId?) {
  const gid = String(guildId || IDs.guilds.main || client.guilds.cache.first()?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { checked: 0, removed: 0, logsSent: 0 };
  if (!shouldApplyMainPartnershipFilters(gid)) return { checked: 0, removed: 0, logsSent: 0 };
  const guild = await getClientGuildCached(client, gid);
  if (!guild) return { checked: 0, removed: 0, logsSent: 0 };
  const dateKey = getRomeDateKey(new Date());
  const doc = await ActivityUserProfile.findOne({ guildId: guild.id, userId: uid }).catch(() => null);
  if (!doc) return { checked: 0, removed: 0, logsSent: 0 };
  try {
    const out = await auditSingleProfilePartnerDay(guild, doc, dateKey, { inviteGuildIdCache: new Map() });
    if (out.removed > 0) {
      global.logger?.info?.(`[PARTNER AUDIT] immediate user=${uid} date=${dateKey} removed=${out.removed} logs=${out.logsSent}`);
    }
    return out;
  } catch (err) {
    global.logger?.error?.(`[PARTNER AUDIT] Immediate audit failed for ${uid}: ${err?.message || err}`);
    return { checked: 0, removed: 0, logsSent: 0 };
  }
}

async function runDailyPartnerAuditForGuild(client?, guildId?, opts: Record<string, any> = {}) {
  const jobsDebug = String(process.env.DEBUG_JOBS || "").trim() === "1";
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const guild = await getClientGuildCached(client, gid);
  if (!guild) return;

  const targetDateKey = opts.dateKey || getPreviousRomeDateKey(new Date());
  const quiet = Boolean(opts.quiet);
  const docs = await ActivityUserProfile.find({
    guildId: guild.id,
    "staff.partnerActions.0": { $exists: true },
  }).catch(() => []);

  let totalChecked = 0;
  let totalRemoved = 0;
  let totalRemovalLogsSent = 0;
  const inviteGuildIdCache = new Map();

  for (const doc of docs) {
    const { checked, removed, logsSent } = await auditSingleProfilePartnerDay(guild, doc, targetDateKey, {
      inviteGuildIdCache,
    });
    totalChecked += checked;
    totalRemoved += removed;
    totalRemovalLogsSent += logsSent;
  }

  if (jobsDebug && (!quiet || totalRemoved > 0 || totalRemovalLogsSent > 0)) {
    global.logger?.info?.(
      `[PARTNER AUDIT] guild=${gid} date=${targetDateKey} checked=${totalChecked} removed=${totalRemoved} logsSent=${totalRemovalLogsSent}${quiet ? " intraday" : ""}`,
    );
  }
}

async function runDailyPartnerAudit(client?, opts: Record<string, any> = {}) {
  const guildIds = listPartnershipAuditGuildIds(client);
  for (const guildId of guildIds) {
    await runDailyPartnerAuditForGuild(client, guildId, opts);
  }
}

async function runIntradayPartnerAuditTick(client?) {
  if (intradayPartnerAuditInFlight) return;
  intradayPartnerAuditInFlight = true;
  try {
    const todayKey = getRomeDateKey(new Date());
    await runDailyPartnerAudit(client, { dateKey: todayKey, quiet: true });
  } catch (err) {
    global.logger?.error?.(`[PARTNER AUDIT] Intraday tick failed: ${err?.message || err}`);
  } finally {
    intradayPartnerAuditInFlight = false;
  }
}

function startDailyPartnerAuditLoop(client?) {
  const dedicated = String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1";
  const external = String(process.env.COMMUNITY_POLL_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) return null;
  if (dailyPartnerAuditTask) return dailyPartnerAuditTask;

  dailyPartnerAuditTask = cron.schedule(
    "0 0 * * *",
    runCronDetached("[PARTNER AUDIT] Daily", () => runDailyPartnerAudit(client)),
    { timezone: "Europe/Rome", noOverlap: true },
  );

  setImmediate(() => {
    const todayKey = getRomeDateKey(new Date());
    runDailyPartnerAudit(client, { dateKey: todayKey }).catch((err?) =>
      global.logger?.warn?.(`[PARTNER AUDIT] Run on bot start failed (${todayKey}): ${err?.message || err}`),
    );
  });

  const intradayMin = resolvePartnerAuditIntradayIntervalMinutes();
  if (intradayMin > 0 && !intradayPartnerAuditTimer) {
    const ms = intradayMin * 60 * 1000;
    intradayPartnerAuditTimer = setInterval(() => {
      void runIntradayPartnerAuditTick(client);
    }, ms);
    if (typeof intradayPartnerAuditTimer.unref === "function") intradayPartnerAuditTimer.unref();
    if (String(process.env.DEBUG_JOBS || "").trim() === "1") {
      global.logger?.info?.(`[PARTNER AUDIT] Intraday loop ogni ${intradayMin} min (giorno corrente Europe/Rome)`);
    }
  }

  return dailyPartnerAuditTask;
}

export = {
  MANAGER_LEFT_SERVER_REASON,
  logPointRemoval,
  startDailyPartnerAuditLoop,
  runDailyPartnerAudit,
  runDailyPartnerAuditForGuild,
  runImmediatePartnerAuditForUser,
};
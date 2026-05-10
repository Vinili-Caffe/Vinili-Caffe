const cron = require("node-cron");
const axios = require("axios");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache");
let dailyPartnerAuditTask = null;
let intradayPartnerAuditTimer = null;
let intradayPartnerAuditInFlight = false;
const SAME_DAY_DUPLICATE_REASON = "Non fare partnership con lo stesso server più di una volta al giorno";
const SELF_PARTNERSHIP_DAILY_REASON = "Non fare partnership con se stessi più di una volta al giorno";
const SAME_MANAGER_DAILY_CAP_REASON = "Non mettere più di 5 partnership con lo stesso utente";
const MANAGER_LEFT_SERVER_REASON = "Manager fuori dal server";

function getRomeDateKey(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", });
  return fmt.format(date);
}

function getPreviousRomeDateKey(baseDate = new Date()) {
  const romeNow = new Date(baseDate.toLocaleString("en-US", { timeZone: "Europe/Rome" }),);
  romeNow.setDate(romeNow.getDate() - 1);
  return getRomeDateKey(romeNow);
}

/** Minuti tra un passaggio e l’altro dell’audit sul giorno corrente (Roma). `0` / env assente = disattivato. Clamp 5–120. */
function resolvePartnerAuditIntradayIntervalMinutes() {
  const raw = String(process.env.PARTNER_AUDIT_INTRADAY_MINUTES ?? "30").trim().toLowerCase();
  if (!raw || ["0", "false", "no", "off"].includes(raw)) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(120, Math.max(5, Math.floor(n)));
}

function extractInviteCode(text) {
  if (!text) return null;
  const patterns = [/discord\.gg\/([a-zA-Z0-9_-]+)/i, /discord\.com\/invite\/([a-zA-Z0-9_-]+)/i, /discordapp\.com\/invite\/([a-zA-Z0-9_-]+)/i,];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractInviteCodes(text) {
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

/** Solo la riga "Manager: <@...>"; mai tutti i mention (evita falsi positivi sulla regola "con te stesso"). */
function extractDesignatedManagerIdsFromText(sourceText) {
  const text = String(sourceText || "");
  const managerLineMatches = Array.from(text.matchAll(/Manager:\s*<@!?(\d+)>/gi));
  const ids = managerLineMatches.map((m) => m?.[1]).filter(Boolean).map((id) => String(id));
  return Array.from(new Set(ids));
}

async function fetchPartnerActionText(guild, action) {
  const channelId = action?.partnershipChannelId || IDs.channels.partnerships;
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
    const msg = await channel.messages.fetch(messageId).catch((err) => {
      const code = String(err?.code || "").trim();
      const msgText = String(err?.message || "").trim();
      const httpStatus = String(err?.status || err?.httpStatus || "").trim();
      const detail = `${code} ${httpStatus} ${msgText}`.trim();
      // Messaggio già cancellato/non più accessibile: caso normale durante l'audit, evita spam nei log.
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
      const fields = Array.isArray(e?.fields) ? e.fields.map((f) => { const n = String(f?.name || "").trim(); const v = String(f?.value || "").trim(); return [n, v].filter(Boolean).join("\n"); }).filter(Boolean).join("\n") : "";

      const embedText = [title, desc, fields, url].filter(Boolean).join("\n").trim();
      if (embedText) chunks.push(embedText);
    }
  }

  return chunks.join("\n");
}

async function resolveInviteCodeToGuildId(rawCode, cache) {
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

async function resolveRowPartnerGuildId(row, inviteGuildIdCache) {
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

async function resolveTextLogChannel(guild, channelId) {
  if (!channelId) return null;
  const ch = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  return ch?.isTextBased?.() ? ch : null;
}

async function logPointRemoval(guild, staffUserId, reason, action) {
  const primaryId = IDs.channels.puntiTolti;
  const fallbackId = IDs.channels.partnerLogs;
  if (!primaryId && !fallbackId) return null;

  let channel = await resolveTextLogChannel(guild, primaryId);
  if (!channel && fallbackId && String(fallbackId) !== String(primaryId)) {
    channel = await resolveTextLogChannel(guild, fallbackId);
  }
  if (!channel) {
    global.logger?.warn?.("[PARTNER AUDIT] log channel non disponibile (puntiTolti/partnerLogs)");
    return null;
  }

  const msgRef = Array.isArray(action?.partnerMessageIds) && action.partnerMessageIds.length ? `https://discord.com/channels/${guild.id}/${action.partnershipChannelId || IDs.channels.partnerships}/${action.partnerMessageIds[0]}`
    : "N/D";

  const inviteDb = action?.invite ? String(action.invite).slice(0, 300) : "N/D";

  try {
    const sentMessage = await channel.send({
      content: `<:VC_PartnerManager:1494286911286808576> <@${staffUserId}>
<:VC_reason:1478517122929004544> ${reason}
<:VC_Chat:1482532573002465413> Messaggio: ${msgRef}
<:link:1470064815899803668> Invite: ${inviteDb}`,
    });
    return { channelId: sentMessage.channelId || channel.id, messageId: sentMessage.id };
  } catch (err) {
    const isPrimary = String(channel.id || "") === String(primaryId || "");
    if (isPrimary && fallbackId && String(fallbackId) !== String(primaryId)) {
      const fallback = await resolveTextLogChannel(guild, fallbackId);
      if (fallback) {
        try {
          const sentMessage = await fallback.send({
            content: `<:VC_PartnerManager:1494286911286808576> <@${staffUserId}>
<:VC_reason:1478517122929004544> ${reason}
<:VC_Chat:1482532573002465413> Messaggio: ${msgRef}
<:link:1470064815899803668> Invite: ${inviteDb}`,
          });
          return { channelId: sentMessage.channelId || fallback.id, messageId: sentMessage.id };
        } catch (fallbackErr) {
          global.logger?.warn?.(`[PARTNER AUDIT] fallback log send failed: ${fallbackErr?.message || fallbackErr}`);
        }
      }
    }
    global.logger?.warn?.(`[PARTNER AUDIT] log send failed: ${err?.message || err}`);
    return null;
  }
}

async function deletePointRemovalLog(guild, penaltyLog) {
  const channelId = String(penaltyLog?.channelId || "").trim();
  const messageId = String(penaltyLog?.messageId || "").trim();
  if (!channelId || !messageId) return false;

  const channel = await resolveTextLogChannel(guild, channelId).catch(() => null);
  if (!channel) return false;

  try {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return false;
    await message.delete().catch(() => {});
    return true;
  } catch (err) {
    global.logger?.warn?.(`[PARTNER AUDIT] delete point-removal log failed: ${err?.message || err}`);
    return false;
  }
}

async function auditSingleProfilePartnerDay(guild, doc, targetDateKey, opts = {}) {
  let checked = 0;
  let removed = 0;
  let logsSent = 0;
  const inviteGuildIdCache = opts.inviteGuildIdCache instanceof Map ? opts.inviteGuildIdCache : new Map();
  if (!doc.staff) doc.staff = {};
  const actions = Array.isArray(doc.staff.partnerActions) ? doc.staff.partnerActions : [];
  const allCreates = actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => String(action?.action || "create") === "create")
    .map(({ action, index }) => {
      const dateMs = new Date(action?.date || 0).getTime();
      return { action, index, dateMs, inviteCodes: [] };
    })
    .sort((a, b) => a.dateMs - b.dateMs);

  const dayCreates = allCreates
    .filter(({ action }) => getRomeDateKey(new Date(action?.date || Date.now())) === targetDateKey)
    .sort((a, b) => a.dateMs - b.dateMs);

  if (!dayCreates.length) return { checked, removed, logsSent };

  checked = dayCreates.length;

  const rowsForAudit = allCreates
    .filter((row) => {
      const rowKey = getRomeDateKey(new Date(row?.action?.date || Date.now()));
      return rowKey === targetDateKey;
    })
    .sort((a, b) => a.dateMs - b.dateMs);

  const actionTextCache = new Map();
  const getActionTextCached = async (row) => {
    if (!row?.action) return "";
    if (actionTextCache.has(row.index)) return actionTextCache.get(row.index);
    const text = await fetchPartnerActionText(guild, row.action);
    actionTextCache.set(row.index, text || "");
    return actionTextCache.get(row.index);
  };
  const enrichInviteCodes = async (row) => {
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

  await Promise.all(rowsForAudit.map((row) => enrichInviteCodes(row)));
  await Promise.all(rowsForAudit.map((row) => resolveRowPartnerGuildId(row, inviteGuildIdCache)));

  const managerIdsUnique = [
    ...new Set(
      dayCreates
        .map(({ action }) => String(action?.managerId || "").trim())
        .filter((id) => /^\d{17,20}$/.test(id)),
    ),
  ];
  const managerPresentInGuild = new Map();
  await Promise.all(
    managerIdsUnique.map(async (mid) => {
      const m = await guild.members.fetch(mid).catch(() => null);
      managerPresentInGuild.set(mid, Boolean(m));
    }),
  );

  const firstPartnerGuildIdIndexSameDay = new Map();
  const managerDailyCounter = new Map();
  const selfDailyCounter = new Map();
  const invalidIndices = new Set();
  const invalidReasonsByIndex = new Map();
  const addInvalidReason = (index, reason) => {
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
    if (mgrId && /^\d{17,20}$/.test(mgrId) && !managerPresentInGuild.get(mgrId)) {
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

    const filteredReasons = reasons.filter((reason) => reason !== SAME_DAY_DUPLICATE_REASON);

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
    const action = actions[index];
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

async function runImmediatePartnerAuditForUser(client, userId) {
  const guildId = IDs.guilds.main || client.guilds.cache.first()?.id;
  const uid = String(userId || "").trim();
  if (!guildId || !uid) return { checked: 0, removed: 0, logsSent: 0 };
  const guild = await getClientGuildCached(client, guildId);
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

async function restoreManagerLeftServerPartnerPointsOnRejoin(client, managerUserId) {
  const guildId = IDs.guilds.main || client.guilds.cache.first()?.id;
  const managerId = String(managerUserId || "").trim();
  if (!guildId || !/^\d{17,20}$/.test(managerId)) {
    return { restored: 0, logsDeleted: 0 };
  }

  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return { restored: 0, logsDeleted: 0 };

  const docs = await ActivityUserProfile.find({
    guildId: guild.id,
    "staff.partnerActions": {
      $elemMatch: {
        managerId,
        auditPenaltyDates: { $exists: true, $ne: [] },
      },
    },
  }).catch(() => []);

  let restored = 0;
  let logsDeleted = 0;
  const logsToDelete = [];

  for (const doc of docs) {
    if (!doc.staff) continue;
    const actions = Array.isArray(doc.staff.partnerActions) ? doc.staff.partnerActions : [];
    let restoredForDoc = 0;
    const logsToDeleteForDoc = [];

    for (const action of actions) {
      if (String(action?.managerId || "") !== managerId) continue;

      const penaltyLogs = Array.isArray(action.auditPenaltyLogs) ? action.auditPenaltyLogs : [];
      const restorableLogs = penaltyLogs.filter((entry) => {
        const reason = String(entry?.reason || "").trim();
        return reason === MANAGER_LEFT_SERVER_REASON;
      });
      if (!restorableLogs.length) continue;

      const restorableDateKeys = new Set(
        restorableLogs.map((entry) => String(entry?.dateKey || "").trim()).filter(Boolean),
      );
      if (!restorableDateKeys.size) continue;

      action.auditPenaltyDates = (Array.isArray(action.auditPenaltyDates) ? action.auditPenaltyDates : [])
        .filter((dateKey) => !restorableDateKeys.has(String(dateKey || "").trim()));
      action.auditPenaltyLogs = penaltyLogs.filter((entry) => {
        const reason = String(entry?.reason || "").trim();
        const dateKey = String(entry?.dateKey || "").trim();
        return reason !== MANAGER_LEFT_SERVER_REASON || !restorableDateKeys.has(dateKey);
      });

      restoredForDoc += restorableDateKeys.size;
      logsToDeleteForDoc.push(...restorableLogs);
    }

    if (restoredForDoc > 0) {
      doc.staff.partnerCount = Math.max(0, Number(doc.staff.partnerCount || 0)) + restoredForDoc;
      doc.markModified("staff");
      try {
        await doc.save();
        restored += restoredForDoc;
        logsToDelete.push(...logsToDeleteForDoc);
      } catch (saveErr) {
        global.logger?.error?.(`[PARTNER AUDIT] Restore failed for PM ${doc.userId}: ${saveErr?.message || saveErr}`);
      }
    }
  }

  for (const penaltyLog of logsToDelete) {
    const deleted = await deletePointRemovalLog(guild, penaltyLog);
    if (deleted) logsDeleted += 1;
  }

  if (restored > 0) {
    global.logger?.info?.(`[PARTNER AUDIT] manager=${managerId} rejoined: restored=${restored} deletedLogs=${logsDeleted}`);
  }

  return { restored, logsDeleted };
}

async function runDailyPartnerAudit(client, opts = {}) {
  const guildId = IDs.guilds.main || client.guilds.cache.first()?.id;
  if (!guildId) return;
  const guild = await getClientGuildCached(client, guildId);
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

  if (!quiet || totalRemoved > 0 || totalRemovalLogsSent > 0) {
    global.logger?.info?.(
      `[PARTNER AUDIT] date=${targetDateKey} checked=${totalChecked} removed=${totalRemoved} logsSent=${totalRemovalLogsSent}${quiet ? " intraday" : ""}`,
    );
  }
}

async function runIntradayPartnerAuditTick(client) {
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

function startDailyPartnerAuditLoop(client) {
  if (dailyPartnerAuditTask) return dailyPartnerAuditTask;

  dailyPartnerAuditTask = cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await runDailyPartnerAudit(client);
      } catch (err) {
        global.logger?.error?.(`[PARTNER AUDIT] Daily audit failed ${err?.message || err}`);
      }
    },
    { timezone: "Europe/Rome" },
  );

  setImmediate(() => {
    const todayKey = getRomeDateKey(new Date());
    runDailyPartnerAudit(client, { dateKey: todayKey }).catch((err) =>
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
    global.logger?.info?.(`[PARTNER AUDIT] Intraday loop ogni ${intradayMin} min (giorno corrente Europe/Rome)`);
  }

  return dailyPartnerAuditTask;
}

module.exports = {
  startDailyPartnerAuditLoop,
  runDailyPartnerAudit,
  runImmediatePartnerAuditForUser,
  restoreManagerLeftServerPartnerPointsOnRejoin,
};
const { ModCase, GlobalSettings, ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { MOD_CASES_PATH } = require("../../Community/utils/activityUserProfilePaths") as typeof import("../../Community/utils/activityUserProfilePaths");
const { normalizeModConfigFromGlobal } = require("../../Community/services/globalSettingsGuildStores") as typeof import("../../Community/services/globalSettingsGuildStores");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const BOT_MODERATOR_IDS = new Set(
  Object.values(IDs?.bots || {})
    .filter(Boolean)
    .map((id?) => String(id)),
);

const MOD_CASE_STORAGE_MODE = String(process.env.MOD_CASE_STORAGE_MODE || "compact")
  .trim()
  .toLowerCase();
const MOD_CASE_MAX_CASES_PER_USER = Math.max(
  100,
  Number(process.env.MOD_CASE_MAX_CASES_PER_USER) || 800,
);

function useLegacyModCase() {
  return MOD_CASE_STORAGE_MODE === "legacy" || MOD_CASE_STORAGE_MODE === "dual";
}

function useCompactModCase() {
  return MOD_CASE_STORAGE_MODE === "compact" || MOD_CASE_STORAGE_MODE === "dual";
}

function normalizeAction(action?) {
  return String(action || "UNKNOWN").trim().toUpperCase();
}

function plainFromLegacyDoc(doc?) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return { ...o, _caseSource: "legacy" };
}

function plainFromCompactCase(guildId?, userId?, c?) {
  if (!c) return null;
  return {
    _id: c._id,
    guildId: String(guildId),
    caseId: Number(c.caseId),
    action: String(c.action || ""),
    userId: String(c.userId || userId),
    modId: String(c.modId || ""),
    reason: c.reason != null ? String(c.reason) : "Nessun motivo fornito",
    durationMs: c.durationMs == null ? null : Number(c.durationMs),
    expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
    active: c.active !== false,
    context: c.context || { channelId: null, messageId: null },
    edits: Array.isArray(c.edits) ? c.edits : [],
    closedAt: c.closedAt ? new Date(c.closedAt) : null,
    closeReason: c.closeReason != null ? String(c.closeReason) : null,
    createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
    updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
    _caseSource: "compact",
    _compactRef: { guildId: String(guildId), userId: String(userId), caseId: Number(c.caseId) },
  };
}

async function loadCompactUserDoc(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select(MOD_CASES_PATH)
    .lean()
    .catch(() => null);
  const cases = Array.isArray(doc?.moderation?.modCases) ? doc.moderation.modCases : [];
  return { cases };
}

function findDuplicateInCompactCases(cases?, params?) {
  const {
    guildId,
    action,
    userId,
    modId,
    messageId,
    windowMs,
    matchReason,
    reason,
    durationMs,
  } = params;
  const list = Array.isArray(cases) ? cases : [];
  const now = Date.now();
  const createdAtFrom = windowMs ? now - windowMs : 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const c = list[i];
    if (String(c.userId || userId) !== String(userId)) continue;
    if (String(c.action || "") !== String(action)) continue;
    if (String(c.modId || "") !== String(modId)) continue;
    if (messageId) {
      if (String(c.context?.messageId || "") === String(messageId)) return c;
      continue;
    }
    const created = new Date(c.createdAt || 0).getTime();
    if (created < createdAtFrom) continue;
    if (matchReason && String(c.reason || "") !== String(reason || "")) continue;
    if (durationMs == null) {
      if (c.durationMs != null) continue;
    } else if (Number(c.durationMs) !== Number(durationMs)) continue;
    return c;
  }
  return null;
}

async function createCompactCaseEntry(guildId?, userId?, payload?) {
  const entry = {
    caseId: payload.caseId,
    action: payload.action,
    userId: String(userId),
    modId: payload.modId,
    reason: payload.reason,
    durationMs: payload.durationMs,
    expiresAt: payload.expiresAt,
    active: payload.active !== false,
    context: payload.context || { channelId: null, messageId: null },
    edits: Array.isArray(payload.edits) ? payload.edits : [],
    closedAt: payload.closedAt || null,
    closeReason: payload.closeReason || null,
    createdAt: payload.createdAt || new Date(),
    updatedAt: new Date(),
  };
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId) },
    {
      $setOnInsert: { guildId: String(guildId), userId: String(userId) },
      $push: {
        [MOD_CASES_PATH]: {
          $each: [entry],
          $slice: -MOD_CASE_MAX_CASES_PER_USER,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function resolveCaseByGuildCaseId(guildId?, caseId?) {
  const n = Number(caseId);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (useCompactModCase()) {
    const parent = await ActivityUserProfile.findOne({
      guildId: String(guildId),
      [MOD_CASES_PATH]: { $elemMatch: { caseId: n } },
    })
      .select(`userId ${MOD_CASES_PATH}`)
      .lean()
      .catch(() => null);
    if (parent) {
      const list = parent.moderation?.modCases || [];
      const c = list.find((x?) => Number(x.caseId) === n);
      if (c) {
        return {
          source: "compact",
          guildId: String(guildId),
          userId: String(parent.userId),
          legacyDoc: null,
          row: plainFromCompactCase(guildId, parent.userId, c),
        };
      }
    }
  }
  if (useLegacyModCase()) {
    const legacyDoc = await ModCase.findOne({ guildId: String(guildId), caseId: n }).catch(() => null);
    if (legacyDoc) {
      return {
        source: "legacy",
        guildId: String(guildId),
        userId: String(legacyDoc.userId),
        legacyDoc,
        row: plainFromLegacyDoc(legacyDoc),
      };
    }
  }
  return null;
}

async function resolveCaseByContextMessageId(guildId?, messageId?) {
  const gid = String(guildId || "");
  const mid = String(messageId || "").trim();
  if (!gid || !mid) return null;
  if (useCompactModCase()) {
    const parent = await ActivityUserProfile.findOne({
      guildId: gid,
      [MOD_CASES_PATH]: { $elemMatch: { "context.messageId": mid } },
    })
      .select(`userId ${MOD_CASES_PATH}`)
      .lean()
      .catch(() => null);
    if (parent) {
      const list = parent.moderation?.modCases || [];
      const c = list.find((x?) => String(x?.context?.messageId || "") === mid);
      if (c) {
        return {
          source: "compact",
          guildId: gid,
          userId: String(parent.userId),
          legacyDoc: null,
          row: plainFromCompactCase(gid, parent.userId, c),
        };
      }
    }
  }
  if (useLegacyModCase()) {
    const legacyDoc = await ModCase.findOne({ guildId: gid, "context.messageId": mid })
      .sort({ createdAt: -1 })
      .catch(() => null);
    if (legacyDoc) {
      return {
        source: "legacy",
        guildId: gid,
        userId: String(legacyDoc.userId),
        legacyDoc,
        row: plainFromLegacyDoc(legacyDoc),
      };
    }
  }
  return null;
}

async function createModCaseStore({
  guildId,
  action,
  userId,
  modId,
  reason,
  durationMs,
  context,
  dedupe,
}) {
  if (modId != null && BOT_MODERATOR_IDS.has(String(modId))) {
    const cfgDoc = await GlobalSettings.findOneAndUpdate(
      { guildId: IDs.guilds.main },
      { $setOnInsert: { guildId: IDs.guilds.main } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    const cfg = normalizeModConfigFromGlobal(cfgDoc);
    return {
      doc: null,
      config: cfg,
      created: false,
      isDuplicate: false,
      skipped: true,
      skipReason: "bot_moderator",
    };
  }

  const normalizedAction = normalizeAction(action);
  const normalizedReason = reason || "Nessun motivo fornito";
  const normalizedDurationMs = durationMs || null;
  const normalizedContext = {
    channelId: context?.channelId || null,
    messageId: context?.messageId || null,
  };
  const dedupeEnabled = Boolean(dedupe?.enabled);

  if (dedupeEnabled) {
    const byMessageId = dedupe?.byMessageId !== false;
    const messageId = String(normalizedContext.messageId || "").trim();
    if (byMessageId && messageId) {
      if (useLegacyModCase()) {
        const existingByMessage = await ModCase.findOne({
          guildId,
          action: normalizedAction,
          userId,
          modId,
          "context.messageId": messageId,
        })
          .sort({ createdAt: -1 })
          .catch(() => null);
        if (existingByMessage) {
          const cfgDocExisting = await GlobalSettings.findOneAndUpdate(
            { guildId: IDs.guilds.main },
            { $setOnInsert: { guildId: IDs.guilds.main } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          ).catch(() => null);
          const cfgExisting = normalizeModConfigFromGlobal(cfgDocExisting);
          return {
            doc: plainFromLegacyDoc(existingByMessage),
            config: cfgExisting,
            created: false,
            isDuplicate: true,
          };
        }
      }
      if (useCompactModCase()) {
        const udoc = await loadCompactUserDoc(guildId, userId);
        const dupMsg = findDuplicateInCompactCases(udoc?.cases, {
          guildId,
          action: normalizedAction,
          userId,
          modId,
          messageId,
          windowMs: 0,
          matchReason: false,
          reason: normalizedReason,
          durationMs: normalizedDurationMs,
        });
        if (dupMsg) {
          const cfgDocExisting = await GlobalSettings.findOneAndUpdate(
            { guildId: IDs.guilds.main },
            { $setOnInsert: { guildId: IDs.guilds.main } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          ).catch(() => null);
          const cfgExisting = normalizeModConfigFromGlobal(cfgDocExisting);
          return {
            doc: plainFromCompactCase(guildId, userId, dupMsg),
            config: cfgExisting,
            created: false,
            isDuplicate: true,
          };
        }
      }
    }
    if (useCompactModCase()) {
      const udoc = await loadCompactUserDoc(guildId, userId);
      const dupC = findDuplicateInCompactCases(udoc?.cases, {
        guildId,
        action: normalizedAction,
        userId,
        modId,
        messageId: "",
        windowMs: Number(dedupe?.windowMs) > 0 ? Number(dedupe.windowMs) : 15_000,
        matchReason: dedupe?.matchReason !== false,
        reason: normalizedReason,
        durationMs: normalizedDurationMs,
      });
      if (dupC) {
        const cfgDocExisting = await GlobalSettings.findOneAndUpdate(
          { guildId },
          { $setOnInsert: { guildId } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).catch(() => null);
        const cfgExisting = normalizeModConfigFromGlobal(cfgDocExisting);
        return {
          doc: plainFromCompactCase(guildId, userId, dupC),
          config: cfgExisting,
          created: false,
          isDuplicate: true,
        };
      }
    }
    const rawWindowMs = Number(dedupe?.windowMs);
    const windowMs = Number.isFinite(rawWindowMs) && rawWindowMs > 0 ? rawWindowMs : 15_000;
    const createdAtFrom = new Date(Date.now() - windowMs);
    const matchReason = dedupe?.matchReason !== false;
    const fallbackQuery: Record<string, any> = {
      guildId,
      action: normalizedAction,
      userId,
      modId,
      createdAt: { $gte: createdAtFrom },
    };
    if (matchReason) fallbackQuery.reason = normalizedReason;
    if (normalizedDurationMs == null) fallbackQuery.durationMs = null;
    else fallbackQuery.durationMs = Number(normalizedDurationMs);
    if (useLegacyModCase()) {
      const existingRecent = await ModCase.findOne(fallbackQuery)
        .sort({ createdAt: -1 })
        .catch(() => null);
      if (existingRecent) {
        const cfgDocExisting = await GlobalSettings.findOneAndUpdate(
          { guildId },
          { $setOnInsert: { guildId } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).catch(() => null);
        const cfgExisting = normalizeModConfigFromGlobal(cfgDocExisting);
        return {
          doc: plainFromLegacyDoc(existingRecent),
          config: cfgExisting,
          created: false,
          isDuplicate: true,
        };
      }
    }
  }

  const cfgDoc = await GlobalSettings.findOneAndUpdate(
    { guildId: IDs.guilds.main },
    { $inc: { "modConfig.caseCounter": 1 }, $setOnInsert: { guildId: IDs.guilds.main } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const cfg = normalizeModConfigFromGlobal(cfgDoc);
  const caseId = cfg.caseCounter;
  const expiresAt = normalizedDurationMs ? new Date(Date.now() + normalizedDurationMs) : null;

    if (normalizedAction === "BAN" || normalizedAction === "MUTE") {
    const closeReason = normalizedAction === "BAN"
      ? "Mute chiuso: utente bannato"
      : "Mute sostituito da nuova sanzione";
    await closeOpenMuteCases(guildId, userId, closeReason).catch(() => null);
  }

  let legacyDoc = null;
  if (useLegacyModCase()) {
    legacyDoc = await ModCase.create({
      guildId,
      caseId,
      action: normalizedAction,
      userId,
      modId,
      reason: normalizedReason,
      durationMs: normalizedDurationMs,
      expiresAt,
      context: normalizedContext,
    }).catch(() => null);
  }

  if (useCompactModCase()) {
    await createCompactCaseEntry(guildId, userId, {
      caseId,
      action: normalizedAction,
      modId,
      reason: normalizedReason,
      durationMs: normalizedDurationMs,
      expiresAt,
      active: true,
      context: normalizedContext,
    });
  }

  const doc =
    legacyDoc != null
      ? plainFromLegacyDoc(legacyDoc)
      : plainFromCompactCase(guildId, userId, {
          caseId,
          action: normalizedAction,
          userId,
          modId,
          reason: normalizedReason,
          durationMs: normalizedDurationMs,
          expiresAt,
          active: true,
          context: normalizedContext,
          edits: [],
          createdAt: new Date(),
        });

  return { doc, config: cfg, created: true, isDuplicate: false };
}

async function closeCaseByRef(guildId?, userId?, caseId?, closeReason?) {
  const n = Number(caseId);
  const reason = closeReason ? String(closeReason).slice(0, 300) : null;
  const now = new Date();
  if (useCompactModCase()) {
    await ActivityUserProfile.updateOne(
      { guildId: String(guildId), userId: String(userId) },
      {
        $set: {
          [`${MOD_CASES_PATH}.$[c].active`]: false,
          [`${MOD_CASES_PATH}.$[c].closedAt`]: now,
          [`${MOD_CASES_PATH}.$[c].closeReason`]: reason,
          [`${MOD_CASES_PATH}.$[c].updatedAt`]: now,
        },
      },
      { arrayFilters: [{ "c.caseId": n }] },
    ).catch(() => null);
  }
  if (useLegacyModCase()) {
    await ModCase.updateOne(
      { guildId: String(guildId), caseId: n },
      { $set: { active: false, closedAt: now, closeReason: reason } },
    ).catch(() => null);
  }
}

async function closeOpenMuteCases(guildId?, userId?, closeReason?) {
  const openMutes = await findOpenCases(guildId, userId, "MUTE");
  for (const item of openMutes) {
    await closeCaseByRef(
      String(guildId),
      String(userId),
      Number(item.caseId),
      closeReason || "Mute chiuso",
    ).catch(() => null);
  }
  return openMutes.length;
}

async function findOpenCases(guildId?, userId?, action?) {
  const act = normalizeAction(action);
  const out = [];
  if (useCompactModCase()) {
    const u = await loadCompactUserDoc(guildId, userId);
    for (const c of u?.cases || []) {
      if (String(c.action || "") !== act) continue;
      if (c.active === false) continue;
      out.push(plainFromCompactCase(guildId, userId, c));
    }
  }
  if (useLegacyModCase()) {
    const legacy = await ModCase.find({
      guildId: String(guildId),
      userId: String(userId),
      action: act,
      active: true,
    })
      .sort({ createdAt: -1 })
      .lean()
      .catch(() => []);
    for (const row of legacy) {
      if (useCompactModCase()) {
        const dup = out.some((x?) => Number(x.caseId) === Number(row.caseId));
        if (dup) continue;
      }
      out.push({ ...row, _caseSource: "legacy" });
    }
  }
  return out;
}

async function findActiveWarns(guildId?, userId?, limit = 20) {
  const rows = [];
  if (useCompactModCase()) {
    const u = await loadCompactUserDoc(guildId, userId);
    const warns = (u?.cases || [])
      .filter((c?) => String(c.action || "") === "WARN" && c.active !== false)
      .sort((a?, b?) => (new Date(b.createdAt || 0) as any) - (new Date(a.createdAt || 0) as any))
      .slice(0, limit);
    for (const c of warns) rows.push(plainFromCompactCase(guildId, userId, c));
  }
  if (useLegacyModCase()) {
    const legacy = await ModCase.find({
      guildId: String(guildId),
      userId: String(userId),
      action: "WARN",
      active: true,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .catch(() => []);
    for (const row of legacy) {
      if (useCompactModCase() && rows.some((x?) => Number(x.caseId) === Number(row.caseId))) continue;
      rows.push({ ...row, _caseSource: "legacy" });
    }
  }
  return rows.slice(0, limit);
}

async function findActiveModerations(guildId?, targetUserId?, limit?) {
  const now = new Date();
  const queryBase: Record<string, any> = {
    guildId: String(guildId),
    active: true,
    expiresAt: { $gt: now },
    action: { $in: ["MUTE", "BAN"] },
  };
  if (targetUserId) queryBase.userId = String(targetUserId);

  const byCase = new Map();
  if (useCompactModCase()) {
    const match: Record<string, any> = { guildId: String(guildId) };
    if (targetUserId) match.userId = String(targetUserId);
    const parents = await ActivityUserProfile.find(match).select(`guildId userId ${MOD_CASES_PATH}`).lean().catch(() => []);
    for (const p of parents) {
      for (const c of p.moderation?.modCases || []) {
        if (!["MUTE", "BAN"].includes(String(c.action || "").toUpperCase())) continue;
        if (c.active === false) continue;
        const exp = c.expiresAt ? new Date(c.expiresAt) : null;
        if (!exp || exp.getTime() <= now.getTime()) continue;
        const plain = plainFromCompactCase(p.guildId, p.userId, c);
        byCase.set(Number(plain.caseId), plain);
      }
    }
  }
  if (useLegacyModCase()) {
    const legacy = await ModCase.find(queryBase)
      .sort({ expiresAt: 1 })
      .limit(limit * 20)
      .lean()
      .catch(() => []);
    for (const row of legacy) {
      const k = Number(row.caseId);
      if (useCompactModCase() && byCase.has(k)) continue;
      byCase.set(k, { ...row, _caseSource: "legacy" });
    }
  }
  const rows = Array.from(byCase.values());
  rows.sort((a?, b?) => (new Date(a.expiresAt || 0) as any) - (new Date(b.expiresAt || 0) as any));
  return rows.slice(0, limit);
}

function sortCasesDesc(list?) {
  return list.slice().sort((a?, b?) => {
    const ca = new Date(a.createdAt || 0).getTime();
    const cb = new Date(b.createdAt || 0).getTime();
    if (cb !== ca) return cb - ca;
    return Number(b.caseId || 0) - Number(a.caseId || 0);
  });
}

async function mergeUserModCases(guildId?, userId?) {
  const gid = String(guildId);
  const uid = String(userId);
  const map = new Map();
  if (useCompactModCase()) {
    const u = await loadCompactUserDoc(gid, uid);
    for (const c of u?.cases || []) {
      map.set(Number(c.caseId), plainFromCompactCase(gid, uid, c));
    }
  }
  if (useLegacyModCase()) {
    const leg = await ModCase.find({ guildId: gid, userId: uid }).lean().catch(() => []);
    for (const row of leg) {
      const k = Number(row.caseId);
      if (map.has(k)) continue;
      map.set(k, { ...row, _caseSource: "legacy" });
    }
  }
  return sortCasesDesc(Array.from(map.values()));
}

async function countModLogsForUser(guildId?, userId?) {
  if (!useCompactModCase() && useLegacyModCase()) {
    return ModCase.countDocuments({ guildId: String(guildId), userId: String(userId) }).catch(() => 0);
  }
  const merged = await mergeUserModCases(guildId, userId);
  return merged.length;
}

async function findModLogsPage(guildId?, userId?, skip?, perPage?) {
  if (!useCompactModCase() && useLegacyModCase()) {
    return ModCase.find({ guildId: String(guildId), userId: String(userId) })
      .sort({ createdAt: -1, caseId: -1 })
      .skip(skip)
      .limit(perPage)
      .lean()
      .catch(() => []);
  }
  const merged = await mergeUserModCases(guildId, userId);
  return merged.slice(skip, skip + perPage);
}

async function summarizeModActionsByModWindows(guildId?, modId?) {
  const mid = String(modId || "");
  const actions = ["MUTE", "BAN", "KICK", "WARN"];
  const now = Date.now();
  const t7 = now - 7 * 24 * 60 * 60 * 1000;
  const t30 = now - 30 * 24 * 60 * 60 * 1000;
  const empty = () => ({ d7: 0, d30: 0, all: 0 });
  const buckets = Object.fromEntries(actions.map((a?) => [a, empty()]));
  const seen = Object.fromEntries(actions.map((a?) => [a, new Set()]));

  function bump(act?, caseId?, createdAt?) {
    const a = normalizeAction(act);
    if (!buckets[a]) return;
    const key = String(Number(caseId));
    if (seen[a].has(key)) return;
    seen[a].add(key);
    const t = new Date(createdAt || 0).getTime();
    buckets[a].all += 1;
    if (Number.isFinite(t) && t >= t30) buckets[a].d30 += 1;
    if (Number.isFinite(t) && t >= t7) buckets[a].d7 += 1;
  }

  if (useCompactModCase() && mid) {
    const parents = await ActivityUserProfile.find({
      guildId: String(guildId),
      [MOD_CASES_PATH]: { $elemMatch: { modId: mid } },
    })
      .select(MOD_CASES_PATH)
      .lean()
      .catch(() => []);
    for (const p of parents) {
      for (const c of p.moderation?.modCases || []) {
        if (String(c.modId || "") !== mid) continue;
        bump(c.action, c.caseId, c.createdAt);
      }
    }
  }

  if (useLegacyModCase() && mid) {
    const leg = await ModCase.find({
      guildId: String(guildId),
      modId: mid,
      action: { $in: actions },
    })
      .select("caseId action createdAt")
      .lean()
      .catch(() => []);
    for (const d of leg) {
      bump(d.action, d.caseId, d.createdAt);
    }
  }

  return buckets;
}

async function aggregateSanctionsByModInWeek(guildId?, weekStart?, weekEnd?, sanctionActions?) {
  const actions = Array.from(sanctionActions || []).map((a?) => String(a).toUpperCase());
  const map = new Map();
  const seenCaseIds = new Set();
  if (useCompactModCase()) {
    const parents = await ActivityUserProfile.find({ guildId: String(guildId) }).select(MOD_CASES_PATH).lean().catch(() => []);
    for (const p of parents) {
      for (const c of p.moderation?.modCases || []) {
        if (!actions.includes(String(c.action || "").toUpperCase())) continue;
        const when = new Date(c.createdAt || 0);
        if (when < weekStart || when > weekEnd) continue;
        const mid = String(c.modId || "");
        if (!mid) continue;
        const cid = String(Number(c.caseId));
        seenCaseIds.add(cid);
        map.set(mid, (map.get(mid) || 0) + 1);
      }
    }
  }
  if (useLegacyModCase()) {
    const leg = await ModCase.find({
      guildId: String(guildId),
      createdAt: { $gte: weekStart, $lte: weekEnd },
      action: { $in: actions },
    })
      .select("modId caseId")
      .lean()
      .catch(() => []);
    for (const d of leg) {
      const cid = String(Number(d.caseId));
      if (useCompactModCase() && seenCaseIds.has(cid)) continue;
      const mid = String(d.modId || "");
      if (!mid) continue;
      map.set(mid, (map.get(mid) || 0) + 1);
    }
  }
  return map;
}

async function findLifecycleCandidates(action?, now?, limit?, extraMatch: Record<string, any> = {}) {
  const act = normalizeAction(action);
  const rows = [];
  if (useCompactModCase()) {
    const parents = await ActivityUserProfile.find({
      ...extraMatch,
      [MOD_CASES_PATH]: {
        $elemMatch: {
          action: act,
          active: true,
          expiresAt: { $lte: now },
        },
      },
    })
      .limit(limit * 3)
      .select(`guildId userId ${MOD_CASES_PATH}`)
      .lean()
      .catch(() => []);
    for (const p of parents) {
      for (const c of p.moderation?.modCases || []) {
        if (String(c.action || "") !== act) continue;
        if (c.active === false) continue;
        const exp = c.expiresAt ? new Date(c.expiresAt) : null;
        if (!exp || exp.getTime() > now.getTime()) continue;
        rows.push({
          guildId: String(p.guildId),
          userId: String(p.userId),
          caseId: Number(c.caseId),
          expiresAt: exp,
          _virtual: plainFromCompactCase(p.guildId, p.userId, c),
        });
        if (rows.length >= limit) break;
      }
      if (rows.length >= limit) break;
    }
  }
  if (useLegacyModCase()) {
    const leg = await ModCase.find({
      action: act,
      active: true,
      expiresAt: { $lte: now },
      ...extraMatch,
    })
      .sort({ expiresAt: 1 })
      .limit(limit)
      .exec()
      .catch(() => []);
    for (const doc of leg) {
      if (useCompactModCase() && rows.some((x?) => Number(x.caseId) === Number(doc.caseId) && String(x.guildId) === String(doc.guildId))) continue;
      rows.push({
        guildId: String(doc.guildId),
        userId: String(doc.userId),
        caseId: Number(doc.caseId),
        expiresAt: doc.expiresAt,
        legacyDoc: doc,
        _virtual: plainFromLegacyDoc(doc),
      });
    }
  }
  return rows.slice(0, limit);
}

async function appendCaseEditStore(guildId?, userId?, caseId?, field?, previous?, next?, editedBy?) {
  const n = Number(caseId);
  const entry = {
    field: String(field),
    previous: previous == null ? "" : String(previous),
    next: next == null ? "" : String(next),
    editedBy: editedBy ? String(editedBy) : null,
    editedAt: new Date(),
  };
  if (useCompactModCase()) {
    await ActivityUserProfile.updateOne(
      { guildId: String(guildId), userId: String(userId) },
      {
        $push: { [`${MOD_CASES_PATH}.$[c].edits`]: entry },
        $set: { [`${MOD_CASES_PATH}.$[c].updatedAt`]: new Date() },
      },
      { arrayFilters: [{ "c.caseId": n }] },
    ).catch(() => null);
  }
  if (useLegacyModCase()) {
    await ModCase.updateOne(
      { guildId: String(guildId), caseId: n },
      { $push: { edits: entry }, $set: { updatedAt: new Date() } },
    ).catch(() => null);
  }
}

async function setCaseReasonStore(guildId?, userId?, caseId?, nextReason?) {
  const n = Number(caseId);
  if (useCompactModCase()) {
    await ActivityUserProfile.updateOne(
      { guildId: String(guildId), userId: String(userId) },
      {
        $set: {
          [`${MOD_CASES_PATH}.$[c].reason`]: String(nextReason).slice(0, 512),
          [`${MOD_CASES_PATH}.$[c].updatedAt`]: new Date(),
        },
      },
      { arrayFilters: [{ "c.caseId": n }] },
    ).catch(() => null);
  }
  if (useLegacyModCase()) {
    await ModCase.updateOne(
      { guildId: String(guildId), caseId: n },
      { $set: { reason: String(nextReason).slice(0, 512), updatedAt: new Date() } },
    ).catch(() => null);
  }
}

async function setCaseDurationStore(guildId?, userId?, caseId?, durationMs?, expiresAt?) {
  const n = Number(caseId);
  if (useCompactModCase()) {
    await ActivityUserProfile.updateOne(
      { guildId: String(guildId), userId: String(userId) },
      {
        $set: {
          [`${MOD_CASES_PATH}.$[c].durationMs`]: durationMs,
          [`${MOD_CASES_PATH}.$[c].expiresAt`]: expiresAt,
          [`${MOD_CASES_PATH}.$[c].active`]: true,
          [`${MOD_CASES_PATH}.$[c].updatedAt`]: new Date(),
        },
      },
      { arrayFilters: [{ "c.caseId": n }] },
    ).catch(() => null);
  }
  if (useLegacyModCase()) {
    await ModCase.updateOne(
      { guildId: String(guildId), caseId: n },
      {
        $set: {
          durationMs,
          expiresAt,
          active: true,
          updatedAt: new Date(),
        },
      },
    ).catch(() => null);
  }
}

function normalizeCaseQueryFilters(raw?) {
  const r = raw && typeof raw === "object" ? raw : {};
  const userId = String(r.userId || "").trim();
  const action = String(r.action || "").trim().toUpperCase();
  const fromMs = Number(r.from);
  const toMs = Number(r.to);
  return {
    userId: /^\d{16,22}$/.test(userId) ? userId : "",
    action: action && action !== "ALL" && action !== "ANY" ? action : "",
    from: Number.isFinite(fromMs) && fromMs > 0 ? fromMs : 0,
    to: Number.isFinite(toMs) && toMs > 0 ? toMs : 0,
  };
}

function buildCompactCaseMatch(filters?) {
  const f = filters || normalizeCaseQueryFilters();
  const match: Record<string, any> = {};
  if (f.userId) match.$expr = { $eq: [{ $ifNull: ["$cases.userId", "$userId"] }, f.userId] };
  if (f.action) match["cases.action"] = f.action;
  if (f.from || f.to) {
    match["cases.createdAt"] = {};
    if (f.from) match["cases.createdAt"].$gte = new Date(f.from);
    if (f.to) match["cases.createdAt"].$lte = new Date(f.to);
  }
  return match;
}

function buildLegacyCaseQuery(guildId?, filters?) {
  const f = filters || normalizeCaseQueryFilters();
  const q: Record<string, any> = { guildId: String(guildId || "") };
  if (f.userId) q.userId = f.userId;
  if (f.action) q.action = f.action;
  if (f.from || f.to) {
    q.createdAt = {};
    if (f.from) q.createdAt.$gte = new Date(f.from);
    if (f.to) q.createdAt.$lte = new Date(f.to);
  }
  return q;
}

async function listRecentGuildCases(guildId?, limit = 40, skip = 0, filtersRaw?) {
  const gid = String(guildId || "").trim();
  const lim = Math.max(1, Math.min(100, Math.floor(Number(limit) || 40)));
  const off = Math.max(0, Math.floor(Number(skip) || 0));
  const filters = normalizeCaseQueryFilters(filtersRaw);
  if (!gid) return [];
  const byCase = new Map();
  const hasFilters = Boolean(filters.userId || filters.action || filters.from || filters.to);
  const compactMatch = buildCompactCaseMatch(filters);

  if (useCompactModCase() && !useLegacyModCase()) {
    const pipeline: any[] = [
      { $match: { guildId: gid, "moderation.modCases.0": { $exists: true } } },
      { $project: { userId: 1, cases: "$moderation.modCases" } },
      { $unwind: "$cases" },
    ];
    if (hasFilters && Object.keys(compactMatch).length) pipeline.push({ $match: compactMatch });
    pipeline.push(
      { $sort: { "cases.createdAt": -1, "cases.caseId": -1 } },
      { $skip: off },
      { $limit: lim },
      {
        $project: {
          caseId: "$cases.caseId",
          action: "$cases.action",
          userId: { $ifNull: ["$cases.userId", "$userId"] },
          modId: "$cases.modId",
          reason: "$cases.reason",
          durationMs: "$cases.durationMs",
          expiresAt: "$cases.expiresAt",
          active: "$cases.active",
          createdAt: "$cases.createdAt",
          context: "$cases.context",
          edits: "$cases.edits",
          closedAt: "$cases.closedAt",
          closeReason: "$cases.closeReason",
          updatedAt: "$cases.updatedAt",
          _id: "$cases._id",
        },
      },
    );
    const rows = await ActivityUserProfile.aggregate(pipeline).catch(() => []);
    return (Array.isArray(rows) ? rows : [])
      .map((c?) => plainFromCompactCase(gid, c.userId, c))
      .filter(Boolean);
  }

  if (useCompactModCase()) {
    const pipeline: any[] = [
      { $match: { guildId: gid, "moderation.modCases.0": { $exists: true } } },
      { $project: { userId: 1, cases: "$moderation.modCases" } },
      { $unwind: "$cases" },
    ];
    if (hasFilters && Object.keys(compactMatch).length) pipeline.push({ $match: compactMatch });
    pipeline.push(
      { $sort: { "cases.createdAt": -1, "cases.caseId": -1 } },
      { $limit: off + lim },
      {
        $project: {
          caseId: "$cases.caseId",
          action: "$cases.action",
          userId: { $ifNull: ["$cases.userId", "$userId"] },
          modId: "$cases.modId",
          reason: "$cases.reason",
          durationMs: "$cases.durationMs",
          expiresAt: "$cases.expiresAt",
          active: "$cases.active",
          createdAt: "$cases.createdAt",
          context: "$cases.context",
          edits: "$cases.edits",
          closedAt: "$cases.closedAt",
          closeReason: "$cases.closeReason",
          updatedAt: "$cases.updatedAt",
          _id: "$cases._id",
        },
      },
    );
    const rows = await ActivityUserProfile.aggregate(pipeline).catch(() => []);
    for (const c of Array.isArray(rows) ? rows : []) {
      const plain = plainFromCompactCase(gid, c.userId, c);
      if (plain) byCase.set(Number(plain.caseId), plain);
    }
  }

  if (useLegacyModCase()) {
    const legacy = await ModCase.find(buildLegacyCaseQuery(gid, filters))
      .sort({ createdAt: -1, caseId: -1 })
      .skip(useCompactModCase() ? 0 : off)
      .limit(useCompactModCase() ? off + lim : lim)
      .lean()
      .catch(() => []);
    for (const row of legacy) {
      const k = Number(row.caseId);
      if (useCompactModCase() && byCase.has(k)) continue;
      byCase.set(k, { ...row, _caseSource: "legacy" });
    }
  }

  return sortCasesDesc(Array.from(byCase.values())).slice(off, off + lim);
}

async function countGuildCases(guildId?, filtersRaw?) {
  const gid = String(guildId || "").trim();
  const filters = normalizeCaseQueryFilters(filtersRaw);
  if (!gid) return 0;
  const hasFilters = Boolean(filters.userId || filters.action || filters.from || filters.to);
  if (!hasFilters) {
    const overview = await aggregateGuildModerationOverview(gid).catch(() => null);
    return Math.max(0, Number(overview?.totalCases) || 0);
  }

  let total = 0;
  if (useCompactModCase()) {
    const compactMatch = buildCompactCaseMatch(filters);
    const pipeline: any[] = [
      { $match: { guildId: gid, "moderation.modCases.0": { $exists: true } } },
      { $project: { userId: 1, cases: "$moderation.modCases" } },
      { $unwind: "$cases" },
    ];
    if (Object.keys(compactMatch).length) pipeline.push({ $match: compactMatch });
    pipeline.push({ $count: "total" });
    const rows = await ActivityUserProfile.aggregate(pipeline).catch(() => []);
    total += Math.max(0, Number(rows?.[0]?.total) || 0);
  }
  if (useLegacyModCase() && !useCompactModCase()) {
    total += Math.max(0, Number(await ModCase.countDocuments(buildLegacyCaseQuery(gid, filters)).catch(() => 0)) || 0);
  } else if (useLegacyModCase() && useCompactModCase()) {
    /* hybrid raro: conta legacy filtrati e sottrai overlap è costoso → usa list merge size-capped */
    const legacy = await ModCase.find(buildLegacyCaseQuery(gid, filters)).select({ caseId: 1 }).lean().catch(() => []);
    const compactIds = new Set();
    if (useCompactModCase()) {
      const compactMatch = buildCompactCaseMatch(filters);
      const pipeline: any[] = [
        { $match: { guildId: gid, "moderation.modCases.0": { $exists: true } } },
        { $project: { cases: "$moderation.modCases" } },
        { $unwind: "$cases" },
      ];
      if (Object.keys(compactMatch).length) pipeline.push({ $match: compactMatch });
      pipeline.push({ $project: { caseId: "$cases.caseId" } });
      const rows = await ActivityUserProfile.aggregate(pipeline).catch(() => []);
      for (const r of Array.isArray(rows) ? rows : []) compactIds.add(Number(r.caseId));
    }
    let extra = 0;
    for (const row of Array.isArray(legacy) ? legacy : []) {
      if (!compactIds.has(Number(row.caseId))) extra += 1;
    }
    total += extra;
  }
  return total;
}

async function aggregateGuildModerationOverview(guildId?) {
  const gid = String(guildId || "").trim();
  const emptyByAction = { BAN: 0, SOFTBAN: 0, KICK: 0, MUTE: 0, WARN: 0, UNBAN: 0, UNMUTE: 0, other: 0 };
  const empty = {
    totalCases: 0,
    cases7d: 0,
    activeWarns: 0,
    activeTimed: 0,
    byAction: { ...emptyByAction },
  };
  if (!gid) return empty;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const byAction = { ...emptyByAction };
  let totalCases = 0;
  let cases7d = 0;
  let activeWarns = 0;
  let activeTimed = 0;
  const seenCaseIds = new Set();

  function bumpCase(caseId?, action?, createdAt?, active?, expiresAt?) {
    const cid = String(Number(caseId) || 0);
    if (cid !== "0") {
      if (seenCaseIds.has(cid)) return;
      seenCaseIds.add(cid);
    }
    totalCases += 1;
    const act = normalizeAction(action);
    const t = createdAt ? new Date(createdAt).getTime() : 0;
    if (Number.isFinite(t) && t >= weekAgo.getTime()) {
      cases7d += 1;
      if (Object.prototype.hasOwnProperty.call(byAction, act)) byAction[act] += 1;
      else byAction.other += 1;
    }
    if (act === "WARN" && active !== false) activeWarns += 1;
    if ((act === "MUTE" || act === "BAN") && active !== false) {
      const exp = expiresAt ? new Date(expiresAt).getTime() : 0;
      if (Number.isFinite(exp) && exp > now.getTime()) activeTimed += 1;
    }
  }

  // Percorso veloce: solo compact (modalità default) → aggregazione Mongo su tutti i casi.
  if (useCompactModCase() && !useLegacyModCase()) {
    const [facet] = await ActivityUserProfile.aggregate([
      { $match: { guildId: gid, "moderation.modCases.0": { $exists: true } } },
      { $unwind: "$moderation.modCases" },
      {
        $group: {
          _id: null,
          totalCases: { $sum: 1 },
          cases7d: {
            $sum: {
              $cond: [{ $gte: ["$moderation.modCases.createdAt", weekAgo] }, 1, 0],
            },
          },
          activeWarns: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $toUpper: "$moderation.modCases.action" }, "WARN"] },
                    { $ne: ["$moderation.modCases.active", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          activeTimed: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: [{ $toUpper: "$moderation.modCases.action" }, ["MUTE", "BAN"]] },
                    { $ne: ["$moderation.modCases.active", false] },
                    { $gt: ["$moderation.modCases.expiresAt", now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).catch(() => []);

    if (facet) {
      totalCases = Number(facet.totalCases) || 0;
      cases7d = Number(facet.cases7d) || 0;
      activeWarns = Number(facet.activeWarns) || 0;
      activeTimed = Number(facet.activeTimed) || 0;
    }

    const weekActions = await ActivityUserProfile.aggregate([
      { $match: { guildId: gid, "moderation.modCases.0": { $exists: true } } },
      { $unwind: "$moderation.modCases" },
      { $match: { "moderation.modCases.createdAt": { $gte: weekAgo } } },
      {
        $group: {
          _id: { $toUpper: "$moderation.modCases.action" },
          n: { $sum: 1 },
        },
      },
    ]).catch(() => []);
    for (const row of Array.isArray(weekActions) ? weekActions : []) {
      const act = normalizeAction(row?._id);
      if (Object.prototype.hasOwnProperty.call(byAction, act)) byAction[act] = Number(row.n) || 0;
      else byAction.other += Number(row.n) || 0;
    }
    return { totalCases, cases7d, activeWarns, activeTimed, byAction };
  }

  if (useCompactModCase()) {
    const parents = await ActivityUserProfile.find({
      guildId: gid,
      "moderation.modCases.0": { $exists: true },
    })
      .select(MOD_CASES_PATH)
      .lean()
      .catch(() => []);
    for (const p of parents) {
      for (const c of p.moderation?.modCases || []) {
        bumpCase(c.caseId, c.action, c.createdAt, c.active, c.expiresAt);
      }
    }
  }

  if (useLegacyModCase()) {
    const legacy = await ModCase.find({ guildId: gid })
      .select("caseId action createdAt active expiresAt")
      .lean()
      .catch(() => []);
    for (const row of legacy) bumpCase(row.caseId, row.action, row.createdAt, row.active, row.expiresAt);
  }

  return { totalCases, cases7d, activeWarns, activeTimed, byAction };
}

export = {
  createModCaseStore,
  resolveCaseByGuildCaseId,
  resolveCaseByContextMessageId,
  closeCaseByRef,
  findOpenCases,
  findActiveWarns,
  findActiveModerations,
  countModLogsForUser,
  findModLogsPage,
  summarizeModActionsByModWindows,
  aggregateSanctionsByModInWeek,
  listRecentGuildCases,
  countGuildCases,
  aggregateGuildModerationOverview,
  findLifecycleCandidates,
  appendCaseEditStore,
  setCaseReasonStore,
  setCaseDurationStore,
};
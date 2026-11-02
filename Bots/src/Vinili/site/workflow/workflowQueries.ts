/** Workflow staff: letture dal database (settimane, richieste di un utente, dettaglio). */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getPauseStatusLabel, getPausePhase, getPauseTimingText, computePauseScaledDaysThisYear, getCurrentYearBoundsUtc, getTodayUtc } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
const { weekKeyFromDate, formatWeekLabel, buildWorkflowDedupeKey, normalizeStatus, pauseTrackRoleKey, pauseRoleDisplayLabel } = require("./workflowLabels") as typeof import("./workflowLabels");
const { pickSubjectDisplayName, memberToSubjectFields, hasRealDiscordAvatarUrl, resolveWorkflowSubject, applyWorkflowSubjectToItem } = require("./workflowSubjects") as typeof import("./workflowSubjects");
const { docToListItem, docToDetail, snowflakeToDate } = require("./workflowSerialize") as typeof import("./workflowSerialize");
const { enrichResocontoDetailChart, enrichResocontoRolesHistory } = require("./workflowResocontoHistory") as typeof import("./workflowResocontoHistory");
const { WORKFLOW_DOC, upsertStaffWorkflowItem } = require("./workflowWrites") as typeof import("./workflowWrites");

const ENSURE_WEEK_KEYS_MIN_MS = 10 * 60 * 1000;
const INBOX_WEEKS_CACHE_MS = 30000;

async function loadMembersForIds(guild?, ids?, limit = 40) {
  const cache = new Map();
  if (!guild) return cache;
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map((id?) => String(id || "")).filter(Boolean))].slice(
    0,
    Math.max(1, Math.min(60, Number(limit) || 40)),
  );
  await Promise.all(
    unique.map(async (uid?) => {
      try {
        const member = await Promise.race([
          getGuildMemberCached(guild, uid),
          new Promise((resolve?) => setTimeout(() => resolve(null), 2500)),
        ]);
      if (member) cache.set(uid, member);
      } catch {
              }
    }),
  );
  return cache;
}

async function ensureResocontiWeekKeys(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  if (!(ensureResocontiWeekKeys as any).__at) (ensureResocontiWeekKeys as any).__at = new Map();
  const last = Number((ensureResocontiWeekKeys as any).__at.get(gid) || 0);
  if (Date.now() - last < ENSURE_WEEK_KEYS_MIN_MS) return 0;
  (ensureResocontiWeekKeys as any).__at.set(gid, Date.now());
  const missing = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "resoconti",
    $or: [{ workflowWeekKey: { $exists: false } }, { workflowWeekKey: null }, { workflowWeekKey: "" }],
  })
    .select("_id createdAt workflowMessageId")
    .lean()
    .catch(() => []);
  let updated = 0;
  for (const doc of missing || []) {
    const key =
      weekKeyFromDate(snowflakeToDate(doc?.workflowMessageId)) ||
      weekKeyFromDate(doc?.createdAt) ||
      "";
    if (!key) continue;
    const ok = await SiteDocument.updateOne(
      { _id: doc._id },
      { $set: { workflowWeekKey: key } },
    ).catch(() => null);
    if (ok?.modifiedCount) updated += 1;
  }
  return updated;
}

async function listResocontiWeeks(guildId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  if (!gid) return [];
  const cacheKey = `${gid}:${String(opts.scope || "all").toLowerCase()}:${String(opts.filter || "").toLowerCase()}`;
  if (!(listResocontiWeeks as any).__cache) (listResocontiWeeks as any).__cache = new Map();
  const hit = (listResocontiWeeks as any).__cache.get(cacheKey);
  if (hit && Date.now() - hit.at < INBOX_WEEKS_CACHE_MS) return hit.weeks;
  void ensureResocontiWeekKeys(gid).catch(() => 0);
  const match: Record<string, any> = { docType: WORKFLOW_DOC, guildId: gid, workflowQueue: "resoconti" };
  if (String(opts.scope || "").toLowerCase() === "pending") match.status = "pending";
  const roleFilter = String(opts.filter || "").trim().toLowerCase();
  if (roleFilter === "staff" || roleFilter === "s") match.workflowKind = "s";
  else if (roleFilter === "pm" || roleFilter === "p" || roleFilter === "partnermanager") {
    match.workflowKind = "p";
  }
  const uid = String(opts.userId || "").trim();
  if (/^\d{16,22}$/.test(uid)) match.userId = uid;
  const rows = await SiteDocument.aggregate([
    { $match: match },
    { $group: { _id: "$workflowWeekKey", count: { $sum: 1 } } },
    { $match: { _id: { $regex: /^\d{4}-\d{2}-\d{2}$/ } } },
    { $sort: { _id: -1 } },
  ]).catch(() => []);
  const weeks = (rows || []).map((row?) => ({
    weekKey: String(row._id),
    label: formatWeekLabel(row._id),
    count: Number(row.count) || 0,
  }));
  (listResocontiWeeks as any).__cache.set(cacheKey, { at: Date.now(), weeks });
  return weeks;
}

async function listUserWorkflowsForMember(guildId?, userId?, opts: Record<string, any> = {}) {
  const scope = String(opts.scope || "pending").toLowerCase();
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
    const filter: Record<string, any> = { docType: WORKFLOW_DOC, guildId: gid, userId: uid, workflowQueue: "pause" };
  if (scope === "pending") filter.status = "pending";
  const docs = await SiteDocument.find(filter).sort({ createdAt: -1 }).limit(40).lean().catch(() => []);
  return (docs || []).map((doc?) => docToListItem(doc, null));
}

/** Live chat FAB: appelli/candidature where subject was invited into workflow chat. */
async function listUserInvitedSubjectChats(guildId?, userId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const rawQ = String(opts.queue || opts.queues || "")
    .trim()
    .toLowerCase();
  let queues = ["appelli", "candidature"];
  if (rawQ === "appelli" || rawQ === "candidature") queues = [rawQ];
  else if (rawQ && rawQ !== "all" && rawQ !== "subject") {
    queues = rawQ
      .split(",")
      .map((x?) => String(x || "").trim().toLowerCase())
      .filter((x?) => x === "appelli" || x === "candidature");
    if (!queues.length) queues = ["appelli", "candidature"];
  }
  const includeClosed = Boolean(opts.includeClosed);
  const filter: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: { $in: queues },
  };
  if (!includeClosed) filter.status = "pending";
  const docs = await SiteDocument.find(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(30)
    .lean()
    .catch(() => []);
  const out = [];
  for (const doc of docs || []) {
    const fields =
      doc?.workflowFields && typeof doc.workflowFields === "object" ? doc.workflowFields : {};
    const sc = fields.subjectChat && typeof fields.subjectChat === "object" ? fields.subjectChat : {};
    const windows = Array.isArray(sc.windows) ? sc.windows : [];
    if (!windows.length) continue;
    const active = windows.some((w?) => w && !w.leftAt);
    const item = docToListItem(doc, null);
    out.push({
      ...item,
      queue: String(doc?.workflowQueue || "").trim().toLowerCase(),
      chatInvited: true,
      chatActive: active,
      openPath:
        String(doc?.workflowQueue || "").toLowerCase() === "candidature"
          ? `/candidature/?chat=${encodeURIComponent(String(doc?.dedupeKey || ""))}`
          : `/appelli/?chat=${encodeURIComponent(String(doc?.dedupeKey || ""))}`,
    });
  }
  return out;
}

async function getUserWorkflowDetailFromDb(guildId?, userId?, dedupeKey?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const key = String(dedupeKey || "").trim();
  if (!gid || !uid || !key) return null;
  if (!key.toLowerCase().startsWith("pause:")) return null;
  const doc = await SiteDocument.findOne({
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    dedupeKey: key,
    workflowQueue: "pause",
  })
    .lean()
    .catch(() => null);
  if (!doc) return null;
  return docToDetail(doc, null, null);
}

async function getPendingPauseWorkflowForMember(guildId?, userId?, client = null) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return null;
  let doc = await SiteDocument.findOne({
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: "pause",
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);
  if (!doc) {
        try {
      const { getStaffPauseRecord } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
      const record = await getStaffPauseRecord(gid, uid);
      const pause = (Array.isArray(record?.staff?.pauses) ? record.staff.pauses : [])
        .filter((p?) => String(p?.status || "") === "pending")
        .sort((a?, b?) => (new Date(b?.createdAt || 0) as any) - (new Date(a?.createdAt || 0) as any))[0];
      if (pause?._id) {
        const bot = client || global.client || null;
        const guild =
          bot?.guilds?.cache?.get(gid) || (await bot?.guilds?.fetch(gid).catch(() => null));
        await upsertPauseWorkflowFromPause(bot, guild, uid, pause).catch(() => null);
        doc = await SiteDocument.findOne({
          docType: WORKFLOW_DOC,
          guildId: gid,
          userId: uid,
          workflowQueue: "pause",
          status: "pending",
          workflowPauseId: String(pause._id),
        })
          .lean()
          .catch(() => null);
      }
    } catch (_) {}
  }
  if (!doc) return null;
  return docToDetail(doc, null, null);
}

async function getStaffWorkflowDetailFromDb(client?, guildId?, queue?, itemId?, userId?) {
  const gid = String(guildId || "").trim();
  const q = String(queue || "").trim().toLowerCase();
  const id = String(itemId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !q || !id) return null;

  let doc = null;
  if (/^[a-f0-9]{24}$/i.test(id)) {
    doc = await SiteDocument.findOne({ _id: id, docType: WORKFLOW_DOC, guildId: gid, workflowQueue: q }).lean().catch(() => null);
  }
  if (!doc && q === "pause" && uid) {
    doc = await SiteDocument.findOne({
      docType: WORKFLOW_DOC,
      guildId: gid,
      workflowQueue: "pause",
      workflowPauseId: id,
      userId: uid,
    })
      .lean()
      .catch(() => null);
  }
  if (!doc) {
    doc = await SiteDocument.findOne({
      docType: WORKFLOW_DOC,
      guildId: gid,
      workflowQueue: q,
      workflowMessageId: id,
    })
      .lean()
      .catch(() => null);
  }
  if (!doc) return null;

    let fast = docToDetail(doc, null, null);
  if (q === "resoconti") {
    try {
      const guildFast =
        client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
            fast = await enrichResocontoRolesHistory(fast, doc, guildFast);
      const hasChart = Array.isArray(fast.costanzaChart) && fast.costanzaChart.length >= 5;
      const hasStats = fast.weeklyMessages != null && fast.weeklyVoiceSeconds != null;
      if (!hasChart || !hasStats) {
                        const enrichP = enrichResocontoDetailChart(fast, doc, guildFast).catch(() => null);
        const raced = await Promise.race([
          enrichP,
          new Promise((resolve?) => setTimeout(() => resolve(null), 420)),
        ]);
        if (raced) {
          fast = raced;
        } else {
          void enrichP;
        }
      }
    } catch (_) {}
  }
  const needsSubject =
    !hasRealDiscordAvatarUrl(fast.avatarUrl) ||
    !pickSubjectDisplayName(fast.userId, fast.displayName);

  if (!needsSubject || !client) return fast;

  const enrich = (async () => {
  const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
  const memberCache = await loadMembersForIds(guild, [String(doc.userId || ""), String(doc.workflowDecidedBy || "")]);
  const member = memberCache.get(String(doc.userId || "")) || null;
  let detail = docToDetail(doc, member, memberCache);
  if (q === "resoconti") {
    detail = await enrichResocontoDetailChart(detail, doc, guild);
  }
    const enriched = await applyWorkflowSubjectToItem(client, guild, detail, {
      allowFetch: true,
      fetchTimeoutMs: 1400,
    });
        const resolvedName = pickSubjectDisplayName(enriched?.userId, enriched?.displayName);
    const resolvedAvatar = hasRealDiscordAvatarUrl(enriched?.avatarUrl) ? String(enriched.avatarUrl) : "";
    const storedName = pickSubjectDisplayName(doc.userId, doc.workflowSubjectName);
    const storedAvatar = hasRealDiscordAvatarUrl(doc.workflowSubjectAvatarUrl)
      ? String(doc.workflowSubjectAvatarUrl)
      : "";
    if (
      doc?._id &&
      ((resolvedName && resolvedName !== storedName) || (resolvedAvatar && resolvedAvatar !== storedAvatar))
    ) {
      void SiteDocument.updateOne(
        { _id: doc._id },
        {
          $set: {
            ...(resolvedName ? { workflowSubjectName: resolvedName.slice(0, 120) } : {}),
            ...(resolvedAvatar ? { workflowSubjectAvatarUrl: resolvedAvatar.slice(0, 512) } : {}),
          },
        },
      ).catch(() => null);
    }
    return enriched;
  })().catch(() => null);

  const enriched = await Promise.race([
    enrich,
    new Promise((resolve?) => setTimeout(() => resolve(null), 900)),
  ]);
  return enriched || fast;
}

async function upsertPauseWorkflowFromPause(client?, guild?, userId?, pause?) {
  const gid = String(guild?.id || IDs.guilds.main || "").trim();
  const uid = String(userId || "").trim();
  const pauseId = String(pause?._id || pause?.id || "").trim();
  if (!gid || !uid || !pauseId) return null;
  const today = getTodayUtc();
  const yearBounds = (getCurrentYearBoundsUtc as any)(today);
  const status = normalizeStatus(pause?.status, "pending");
      const statusLabel = getPauseStatusLabel(pause, today);
  const member = guild ? await getGuildMemberCached(guild, uid).catch(() => null) : null;
  const subject = await resolveWorkflowSubject(guild?.client || client, guild, uid);
  const fromMember = memberToSubjectFields(member, uid);
  const roleTrack = pauseTrackRoleKey(pause);
  const roleLabel = pauseRoleDisplayLabel(
    { ruoloRichiesto: roleTrack, ruoloLabel: String(pause?.ruoloLabel || pause?.ruolo || "").trim() },
    member,
    guild,
  );
  return upsertStaffWorkflowItem({
        guildId: gid,
        queue: "pause",
    dedupeKey: buildWorkflowDedupeKey("pause", [uid, pauseId]),
    userId: uid,
        pauseId,
        status,
        statusLabel,
    title: fromMember.displayName || subject.displayName || uid,
    displayName: fromMember.displayName || subject.displayName || uid,
        avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
        preview: String(pause.motivazione || "").slice(0, 500),
        motivazione: String(pause.motivazione || ""),
        content: String(pause.motivazione || ""),
        createdAt: pause.createdAt,
        fields: [
          {
            name: "Periodo",
            value: pause.halfDay
              ? `${pause.dataRichiesta || "?"} · mezza giornata (${pause.halfDay === "mattina" ? "mattina" : "pomeriggio/sera"})${pause.autoAccepted ? " · accettata in automatico" : ""}`
              : `${pause.dataRichiesta || "?"} → ${pause.dataRitorno || "?"}`,
          },
      { name: "Ruolo richiesto", value: roleLabel },
          { name: "Motivazione", value: String(pause.motivazione || "—") },
          ...(Array.isArray(pause.requisitiNonRispettati) && pause.requisitiNonRispettati.length
            ? [{ name: "Requisiti non rispettati", value: `${pause.requisitiNonRispettati.map((r?) => `• ${r}`).join("\n")}\nL'High Staff può accettare comunque.` }]
            : []),
          { name: "Stato", value: statusLabel },
        ],
        workflowFields: {
          start: String(pause.dataRichiesta || ""),
          end: String(pause.dataRitorno || ""),
      dataRichiesta: String(pause.dataRichiesta || ""),
      dataRitorno: String(pause.dataRitorno || ""),
      ruoloTrack: roleTrack,
      ruoloRichiesto: roleTrack,
      ruoloLabel: roleLabel,
      halfDay: pause.halfDay || null,
      autoAccepted: Boolean(pause.autoAccepted),
          phase: getPausePhase(pause.dataRichiesta, pause.dataRitorno, today),
          timing: (getPauseTimingText as any)(pause.dataRichiesta, pause.dataRitorno, today),
          statusLabel,
          giorniScalati: computePauseScaledDaysThisYear(pause, today, yearBounds.yearStart, yearBounds.yearEnd),
        },
      });
}

export = { listResocontiWeeks, listUserWorkflowsForMember, listUserInvitedSubjectChats, getUserWorkflowDetailFromDb, getPendingPauseWorkflowForMember, getStaffWorkflowDetailFromDb, upsertPauseWorkflowFromPause };

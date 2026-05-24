const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids");

const COMPLETION_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_EVENT_COMPLETION;
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const EVENT_OWNER_ID = "__event__";
const STALE_RUN_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SWEEP_MS = 15 * 60 * 1000;
const BATCH_DELAY_MS = 1200;
const loopState = new WeakSet();

function normalizeId(value) {
  return String(value || "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function eventEnded(cfg, nowMs = Date.now()) {
  if (!cfg?.enabled) return false;
  const end = Number(cfg.endMs);
  return Number.isFinite(end) && Number(nowMs) >= end;
}

async function findCompletionMarker(guildId, eventKey) {
  return SiteDocument.findOne({
    docType: COMPLETION_DOC,
    guildId: normalizeId(guildId),
    userId: EVENT_OWNER_ID,
    dedupeKey: normalizeId(eventKey),
  })
    .lean()
    .catch(() => null);
}

async function tryAcquireCompletionRun(guildId, eventKey, roleId) {
  const g = normalizeId(guildId);
  const key = normalizeId(eventKey);
  const rid = normalizeId(roleId);
  if (!g || !key || !rid) return null;
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const doc = await SiteDocument.findOneAndUpdate(
    {
      docType: COMPLETION_DOC,
      guildId: g,
      userId: EVENT_OWNER_ID,
      dedupeKey: key,
      $or: [{ status: { $exists: false } }, { status: null }, { status: "failed" }, { status: "running", updatedAt: { $lte: staleBefore } }],
    },
    {
      $setOnInsert: {
        docType: COMPLETION_DOC,
        guildId: g,
        userId: EVENT_OWNER_ID,
        dedupeKey: key,
        createdBy: "bot",
      },
      $set: {
        status: "running",
        roleId: rid,
        planKey: "completion_roles",
        decidedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return doc?.status === "running" ? doc : null;
}

async function markCompletionRun(guildId, eventKey, status, stats = {}) {
  await SiteDocument.updateOne(
    {
      docType: COMPLETION_DOC,
      guildId: normalizeId(guildId),
      userId: EVENT_OWNER_ID,
      dedupeKey: normalizeId(eventKey),
    },
    {
      $set: {
        status,
        rawWebhook: stats,
        decidedAt: new Date(),
      },
    },
  ).catch(() => null);
}

async function assignCompletionRoleToMember(member, roleId) {
  const rid = normalizeId(roleId);
  if (!rid || !member) return { code: "no_member" };
  if (member.roles?.cache?.has(rid)) return { code: "already" };
  if (member.manageable === false) return { code: "not_manageable" };
  try {
    await member.roles.add(rid, "Fine evento Hogwarts — smistamento completato");
    return { code: "assigned" };
  } catch (err) {
    return { code: "error", error: String(err?.message || err).slice(0, 200) };
  }
}

async function listSortedUserIds(guildId, eventKey) {
  const rows = await SiteDocument.find({
    docType: SORTING_DOC,
    guildId: normalizeId(guildId),
    dedupeKey: normalizeId(eventKey),
    status: { $in: HOUSES },
  })
    .select({ userId: 1 })
    .lean()
    .catch(() => []);
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const uid = normalizeId(row?.userId);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

async function assignCompletionRolesToSortedUsers(client, guild, cfg) {
  const roleId = normalizeId(cfg.completionRoleId);
  const eventKey = normalizeId(cfg.eventKey);
  if (!roleId || !eventKey) {
    return { ok: false, reason: "misconfigured", assigned: 0, already: 0, failed: 0, missing: 0 };
  }
  const userIds = await listSortedUserIds(guild.id, eventKey);
  let assigned = 0;
  let already = 0;
  let failed = 0;
  let missing = 0;
  for (let i = 0; i < userIds.length; i += 1) {
    const uid = userIds[i];
    const member =
      (await getGuildMemberCached(guild, uid, { preferFresh: false }).catch(() => null))
      || (await guild.members.fetch(uid).catch(() => null));
    if (!member) {
      missing += 1;
    } else {
      const result = await assignCompletionRoleToMember(member, roleId);
      if (result.code === "assigned") assigned += 1;
      else if (result.code === "already") already += 1;
      else failed += 1;
    }
    if (i < userIds.length - 1) await sleep(BATCH_DELAY_MS);
  }
  return { ok: true, total: userIds.length, assigned, already, failed, missing, roleId, eventKey };
}

async function runHogwartsEventCompletionSweep(client) {
  const cfg = resolveHogwartsEventConfig(client);
  if (!eventEnded(cfg)) return;
  const roleId = normalizeId(cfg.completionRoleId);
  if (!roleId) return;
  const eventKey = normalizeId(cfg.eventKey);
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  if (!guildId || !eventKey) return;
  const marker = await findCompletionMarker(guildId, eventKey);
  if (marker?.status === "done") return;
  const lock = await tryAcquireCompletionRun(guildId, eventKey, roleId);
  if (!lock) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    await markCompletionRun(guildId, eventKey, "failed", { reason: "guild_unavailable" });
    return;
  }
  try {
    const stats = await assignCompletionRolesToSortedUsers(client, guild, cfg);
    await markCompletionRun(guildId, eventKey, "done", stats);
    global.logger?.info?.(
      `[HOGWARTS EVENT END] Ruolo completamento assegnato: ${stats.assigned} nuovi, ${stats.already} già presenti, ${stats.failed} errori, ${stats.missing} assenti (${stats.total} smistati).`,
    );
  } catch (err) {
    await markCompletionRun(guildId, eventKey, "failed", { error: String(err?.message || err).slice(0, 300) });
    global.logger?.warn?.("[HOGWARTS EVENT END] sweep failed:", err?.message || err);
  }
}

async function maybeAssignHogwartsCompletionRoleOnJoin(client, member) {
  if (!member?.guild || member.user?.bot) return;
  const cfg = resolveHogwartsEventConfig(client);
  if (!eventEnded(cfg)) return;
  const roleId = normalizeId(cfg.completionRoleId);
  const eventKey = normalizeId(cfg.eventKey);
  const guildId = normalizeId(member.guild.id);
  if (!roleId || !eventKey || guildId !== normalizeId(IDs.guilds?.main)) return;
  const marker = await findCompletionMarker(guildId, eventKey);
  if (marker?.status !== "done") return;
  const sorted = await SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId,
    userId: normalizeId(member.id),
    dedupeKey: eventKey,
    status: { $in: HOUSES },
  })
    .select({ _id: 1 })
    .lean()
    .catch(() => null);
  if (!sorted) return;
  const result = await assignCompletionRoleToMember(member, roleId);
  if (result.code === "error") {
    global.logger?.warn?.("[HOGWARTS EVENT END] join role assign:", member.id, result.error);
  }
}

function startHogwartsEventEndLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    runHogwartsEventCompletionSweep(client).catch((err) => {
      global.logger?.warn?.("[HOGWARTS EVENT END] sweep:", err?.message || err);
    });
  };
  const first = setTimeout(tick, 60 * 1000);
  if (typeof first.unref === "function") first.unref();
  const interval = setInterval(tick, DEFAULT_SWEEP_MS);
  if (typeof interval.unref === "function") interval.unref();
}

module.exports = {
  assignCompletionRoleToMember,
  maybeAssignHogwartsCompletionRoleOnJoin,
  runHogwartsEventCompletionSweep,
  startHogwartsEventEndLoop,
};
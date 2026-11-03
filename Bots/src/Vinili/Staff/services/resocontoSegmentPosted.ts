/** Resoconti settimanali: stato “già inviato” e dedupe sito. */
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");

const BOT_STATE_KEY_LAST_RESOCONTO = "lastResocontoRun";

async function writeLastResocontoRun() {
  await setBotState(BOT_STATE_KEY_LAST_RESOCONTO, { lastRunAt: Date.now() });
}

const BOT_STATE_KEY_STAFF_RESOCONTO_POSTED_PREFIX = "staffResocontoPosted";

function buildStaffResocontoPostedStateKey(guildId?, resocontoWeekKey?) {
  return `${BOT_STATE_KEY_STAFF_RESOCONTO_POSTED_PREFIX}:${String(guildId || "")}:${String(resocontoWeekKey || "")}`;
}

async function loadStaffResocontoPostedIds(guildId?, resocontoWeekKey?) {
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  return new Set((Array.isArray(cur?.userIds) ? cur.userIds : [])
    .map((x?) => String(x || "").trim())
    .filter((id?) => /^\d{17,20}$/.test(id) || /^\d{16,20}:\d{17,20}$/.test(id)));
}

async function appendStaffResocontoPostedId(guildId?, resocontoWeekKey?, userId?) {
  const uid = String(userId || "").trim();
  if (!/^\d{17,20}$/.test(uid)) return;
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  const arr = Array.isArray(cur?.userIds) ? cur.userIds.map((x?) => String(x || "").trim()).filter(Boolean) : [];
  if (arr.includes(uid)) return;
  arr.push(uid);
  await setBotState(key, { userIds: arr });
}

async function appendStaffResocontoPostedRoleId(guildId?, resocontoWeekKey?, userId?, roleId?) {
  const uid = String(userId || "").trim();
  const rid = String(roleId || "").trim();
  if (!/^\d{17,20}$/.test(uid) || !rid) return;
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  const arr = Array.isArray(cur?.userIds) ? cur.userIds.map((x?) => String(x || "").trim()).filter(Boolean) : [];
  const roleKey = `${rid}:${uid}`;
  if (!arr.includes(roleKey)) arr.push(roleKey);
  await setBotState(key, { userIds: arr });
}

function hadStaffRoleResocontoPostedThisCycle(staffResocontoPostedIds?, staffRoleId?, userId?) {
  const uid = String(userId || "").trim();
  const rid = String(staffRoleId || "").trim();
  if (!uid || !rid || !staffResocontoPostedIds) return false;
  return staffResocontoPostedIds.has(`${rid}:${uid}`);
}

async function hasSiteResocontoThisWeek(guildId?, resocontoWeekKey?, userId?, kind?) {
  try {
    const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
    const doc = await SiteDocument.findOne({
      docType: SITE_DOCUMENT_TYPE.STAFF_WORKFLOW,
      guildId,
      workflowQueue: "resoconti",
      userId: String(userId),
      workflowKind: String(kind),
      workflowWeekKey: resocontoWeekKey,
    })
      .select({ _id: 1 })
      .lean()
      .catch(() => null);
    return Boolean(doc);
  } catch {
    return false;
  }
}

export = {
  writeLastResocontoRun,
  loadStaffResocontoPostedIds,
  appendStaffResocontoPostedId,
  appendStaffResocontoPostedRoleId,
  hadStaffRoleResocontoPostedThisCycle,
  hasSiteResocontoThisWeek,
};

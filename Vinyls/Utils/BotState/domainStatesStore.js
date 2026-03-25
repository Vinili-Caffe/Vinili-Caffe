const { randomUUID } = require("crypto");
const BotState = require("../../Schemas/BotState/botStateSchema");

const { COMPACT_BOTSTATE_KEY } = BotState;

async function getDomainsLean() {
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  return doc?.domains || {};
}

async function joinRaidFindOneLean(guildId) {
  const g = String(guildId || "");
  const domains = await getDomainsLean();
  const arr = domains.joinRaidStates || [];
  return arr.find((x) => String(x.guildId) === g) || null;
}

async function joinRaidUpdateOneUpsert(guildId, setFields) {
  const g = String(guildId || "");
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.joinRaidStates || [])];
  const idx = arr.findIndex((x) => String(x.guildId) === g);
  const row =
    idx >= 0 ? { ...arr[idx], ...setFields } : { guildId: g, ...setFields };
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.joinRaidStates": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function minigameStateFindOneLean(filter) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const domains = await getDomainsLean();
  const arr = domains.minigameStates || [];
  return (
    arr.find(
      (x) =>
        String(x.guildId) === guildId && String(x.channelId) === channelId,
    ) || null
  );
}

async function minigameStateFindOneAndUpdate(filter, update) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const $set = update.$set || {};
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameStates || [])];
  const idx = arr.findIndex(
    (x) =>
      String(x.guildId) === guildId && String(x.channelId) === channelId,
  );
  const row =
    idx >= 0
      ? { ...arr[idx], ...$set, guildId, channelId }
      : { guildId, channelId, ...$set };
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.minigameStates": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function minigameStateDeleteOne(filter) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameStates || [])].filter(
    (x) =>
      !(
        String(x.guildId) === guildId &&
        String(x.channelId) === channelId
      ),
  );
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.minigameStates": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function minigameStateDeleteMany(filter) {
  const channelId =
    filter.channelId != null ? String(filter.channelId) : "";
  if (!channelId) return;
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameStates || [])].filter(
    (x) => String(x.channelId) !== channelId,
  );
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.minigameStates": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function minigameRotationFindOneLean(filter) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const domains = await getDomainsLean();
  const arr = domains.minigameRotations || [];
  return (
    arr.find(
      (x) =>
        String(x.guildId) === guildId && String(x.channelId) === channelId,
    ) || null
  );
}

async function minigameRotationFindOneAndUpdate(filter, update) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const $set = update.$set || {};
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameRotations || [])];
  const idx = arr.findIndex(
    (x) =>
      String(x.guildId) === guildId && String(x.channelId) === channelId,
  );
  const row =
    idx >= 0
      ? { ...arr[idx], ...$set, guildId, channelId }
      : { guildId, channelId, ...$set };
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.minigameRotations": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function minigameRotationDeleteOne(filter) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameRotations || [])].filter(
    (x) =>
      !(
        String(x.guildId) === guildId &&
        String(x.channelId) === channelId
      ),
  );
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.minigameRotations": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function minigameRotationDeleteMany(filter) {
  const channelId =
    filter.channelId != null ? String(filter.channelId) : "";
  if (!channelId) return;
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameRotations || [])].filter(
    (x) => String(x.channelId) !== channelId,
  );
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.minigameRotations": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function voiceFindOneAndUpdate(filter, update) {
  const guildId = String(filter.guildId || "");
  const $set = update.$set || {};
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.voiceStates || [])];
  const idx = arr.findIndex((x) => String(x.guildId) === guildId);
  const row = idx >= 0 ? { ...arr[idx], ...$set } : { ...$set };
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.voiceStates": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function voiceDeleteOne(filter) {
  const guildId = String(filter.guildId || "");
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.voiceStates || [])].filter(
    (x) => String(x.guildId) !== guildId,
  );
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.voiceStates": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function voiceDeleteManyInGuildIds(guildIds) {
  const set = new Set((guildIds || []).map((id) => String(id || "")));
  if (!set.size) return;
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.voiceStates || [])].filter(
    (x) => !set.has(String(x.guildId)),
  );
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.voiceStates": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function voiceFindManyLean() {
  const domains = await getDomainsLean();
  return domains.voiceStates || [];
}

async function chatReminderRotationFindOneLean(filter) {
  const guildId = String(filter.guildId || "");
  const domains = await getDomainsLean();
  const arr = domains.chatReminderRotations || [];
  return arr.find((x) => String(x.guildId) === guildId) || null;
}

async function chatReminderRotationFindOneAndUpdate(filter, update) {
  const guildId = String(filter.guildId || "");
  const $set = update.$set || {};
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.chatReminderRotations || [])];
  const idx = arr.findIndex((x) => String(x.guildId) === guildId);
  const row =
    idx >= 0 ? { ...arr[idx], ...$set, guildId } : { guildId, ...$set };
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.chatReminderRotations": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function chatReminderScheduleCreate({ guildId, fireAt, kind }) {
  const scheduleId = randomUUID();
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.chatReminderSchedules || [])];
  const row = {
    scheduleId,
    guildId: String(guildId || ""),
    fireAt: fireAt instanceof Date ? fireAt : new Date(fireAt),
    kind: kind || "first",
  };
  arr.push(row);
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.chatReminderSchedules": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
  return row;
}

async function chatReminderScheduleUpdateOne(filter, update) {
  const sid = String(filter.scheduleId || filter._id || "");
  if (!sid) return;
  const $set = update.$set || {};
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.chatReminderSchedules || [])];
  const idx = arr.findIndex((x) => String(x.scheduleId) === sid);
  if (idx < 0) return;
  arr[idx] = { ...arr[idx], ...$set };
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.chatReminderSchedules": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function chatReminderScheduleDeleteOne(filter) {
  const sid = String(filter.scheduleId || filter._id || "");
  if (!sid) return;
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.chatReminderSchedules || [])].filter(
    (x) => String(x.scheduleId) !== sid,
  );
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.chatReminderSchedules": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

async function chatReminderScheduleFindLatestFuture({ guildId, now }) {
  const g = String(guildId || "");
  const t = (now instanceof Date ? now : new Date(now)).getTime();
  const domains = await getDomainsLean();
  const arr = (domains.chatReminderSchedules || []).filter(
    (x) =>
      String(x.guildId) === g && new Date(x.fireAt).getTime() > t,
  );
  arr.sort(
    (a, b) => new Date(b.fireAt).getTime() - new Date(a.fireAt).getTime(),
  );
  return arr[0] || null;
}

async function chatReminderScheduleFindDueLean(now) {
  const t = (now instanceof Date ? now : new Date(now)).getTime();
  const domains = await getDomainsLean();
  const arr = domains.chatReminderSchedules || [];
  return arr.filter((x) => new Date(x.fireAt).getTime() <= t);
}

async function chatReminderScheduleDeleteManyFuture(now) {
  const t = (now instanceof Date ? now : new Date(now)).getTime();
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.chatReminderSchedules || [])].filter(
    (x) => new Date(x.fireAt).getTime() <= t,
  );
  await BotState.findOneAndUpdate(
    { key: COMPACT_BOTSTATE_KEY },
    {
      $set: { "domains.chatReminderSchedules": arr },
      $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {} },
    },
    { upsert: true },
  );
}

module.exports = {
  joinRaidFindOneLean,
  joinRaidUpdateOneUpsert,
  minigameStateFindOneLean,
  minigameStateFindOneAndUpdate,
  minigameStateDeleteOne,
  minigameStateDeleteMany,
  minigameRotationFindOneLean,
  minigameRotationFindOneAndUpdate,
  minigameRotationDeleteOne,
  minigameRotationDeleteMany,
  voiceFindOneAndUpdate,
  voiceDeleteOne,
  voiceDeleteManyInGuildIds,
  voiceFindManyLean,
  chatReminderRotationFindOneLean,
  chatReminderRotationFindOneAndUpdate,
  chatReminderScheduleCreate,
  chatReminderScheduleUpdateOne,
  chatReminderScheduleDeleteOne,
  chatReminderScheduleFindLatestFuture,
  chatReminderScheduleFindDueLean,
  chatReminderScheduleDeleteManyFuture,
};
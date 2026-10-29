const { randomUUID } = require("crypto") as typeof import("crypto");
const BotState = require("../../Schemas/BotState/botStateSchema");

const { COMPACT_BOTSTATE_KEY } = BotState;

async function getDomainsLean() {
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  return doc?.domains || {};
}

async function ensureCompactBotState() {
  await BotState.updateOne(
    { key: COMPACT_BOTSTATE_KEY },
    { $setOnInsert: { key: COMPACT_BOTSTATE_KEY, value: {}, domains: {} } },
    { upsert: true },
  ).catch((err?) => {
    if (err?.code !== 11000) throw err;
  });
}

function arrayOrEmpty(path?) {
  return { $ifNull: [`$${path}`, []] };
}

async function atomicSetArray(path?, expression?) {
  await ensureCompactBotState();
  await BotState.updateOne(
    { key: COMPACT_BOTSTATE_KEY },
    [{ $set: { [path]: expression } }],
  );
}

async function joinRaidFindOneLean(guildId?) {
  const g = String(guildId || "");
  const domains = await getDomainsLean();
  const arr = domains.joinRaidStates || [];
  return arr.find((x?) => String(x.guildId) === g) || null;
}

async function joinRaidUpdateOneUpsert(guildId?, setFields?) {
  const g = String(guildId || "");
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.joinRaidStates || [])];
  const idx = arr.findIndex((x?) => String(x.guildId) === g);
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

async function minigameStateFindOneLean(filter?) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const domains = await getDomainsLean();
  const arr = domains.minigameStates || [];
  return (
    arr.find(
      (x?) =>
        String(x.guildId) === guildId && String(x.channelId) === channelId,
    ) || null
  );
}

async function minigameStateFindOneAndUpdate(filter?, update?) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const $set = update.$set || {};
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameStates || [])];
  const idx = arr.findIndex(
    (x?) =>
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

async function minigameStateDeleteOne(filter?) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameStates || [])].filter(
    (x?) =>
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

async function minigameStateDeleteMany(filter?) {
  const channelId =
    filter.channelId != null ? String(filter.channelId) : "";
  if (!channelId) return;
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameStates || [])].filter(
    (x?) => String(x.channelId) !== channelId,
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

async function minigameRotationFindOneLean(filter?) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const domains = await getDomainsLean();
  const arr = domains.minigameRotations || [];
  return (
    arr.find(
      (x?) =>
        String(x.guildId) === guildId && String(x.channelId) === channelId,
    ) || null
  );
}

async function minigameRotationFindOneAndUpdate(filter?, update?) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const $set = update.$set || {};
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameRotations || [])];
  const idx = arr.findIndex(
    (x?) =>
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

async function minigameRotationDeleteOne(filter?) {
  const guildId = String(filter.guildId || "");
  const channelId = String(filter.channelId || "");
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameRotations || [])].filter(
    (x?) =>
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

async function minigameRotationDeleteMany(filter?) {
  const channelId =
    filter.channelId != null ? String(filter.channelId) : "";
  if (!channelId) return;
  const doc = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
  const arr = [...(doc?.domains?.minigameRotations || [])].filter(
    (x?) => String(x.channelId) !== channelId,
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

async function voiceFindOneAndUpdate(filter?, update?) {
  const guildId = String(filter.guildId || "");
  const botUserId = String(filter.botUserId || "").trim();
  if (!guildId || !botUserId) return;
  const row = { ...(update.$set || {}), guildId, botUserId };
  const source = arrayOrEmpty("domains.voiceStates");
  const matchesRow = (rowRef?) => {
    const exact = {
      $and: [
        { $eq: [{ $toString: `${rowRef}.guildId` }, guildId] },
        { $eq: [{ $trim: { input: { $toString: { $ifNull: [`${rowRef}.botUserId`, ""] } } } }, botUserId] },
      ],
    };
    if (!filter.claimLegacyVoiceRow) return exact;
    return {
      $or: [
        exact,
        {
          $and: [
            { $eq: [{ $toString: `${rowRef}.guildId` }, guildId] },
            { $eq: [{ $trim: { input: { $toString: { $ifNull: [`${rowRef}.botUserId`, ""] } } } }, ""] },
          ],
        },
      ],
    };
  };
  await atomicSetArray(
    "domains.voiceStates",
    {
      $let: {
        vars: { source },
        in: {
          $cond: [
            { $anyElementTrue: { $map: { input: "$$source", as: "row", in: matchesRow("$$row") } } },
            {
              $map: {
                input: "$$source",
                as: "row",
                in: {
                  $cond: [
                    matchesRow("$$row"),
                    { $mergeObjects: ["$$row", { $literal: row }] },
                    "$$row",
                  ],
                },
              },
            },
            { $concatArrays: ["$$source", [{ $literal: row }]] },
          ],
        },
      },
    },
  );
}

async function voiceDeleteOne(filter?) {
  const guildId = String(filter.guildId || "");
  const botUserId = String(filter.botUserId || "").trim();
  if (!guildId || !botUserId) return;
  await atomicSetArray(
    "domains.voiceStates",
    {
      $filter: {
        input: arrayOrEmpty("domains.voiceStates"),
        as: "row",
        cond: {
          $not: [
            {
              $and: [
                { $eq: [{ $toString: "$$row.guildId" }, guildId] },
                { $eq: [{ $trim: { input: { $toString: { $ifNull: ["$$row.botUserId", ""] } } } }, botUserId] },
              ],
            },
          ],
        },
      },
    },
  );
}

async function voiceDeleteManyInGuildIds(guildIds?) {
  const set = new Set((guildIds || []).map((id?) => String(id || "")));
  if (!set.size) return;
  await atomicSetArray(
    "domains.voiceStates",
    {
      $filter: {
        input: arrayOrEmpty("domains.voiceStates"),
        as: "row",
        cond: { $not: [{ $in: [{ $toString: "$$row.guildId" }, Array.from(set)] }] },
      },
    },
  );
}

async function voiceFindManyLeanForBot(botUserId?, options: Record<string, any> = {}) {
  const id = String(botUserId || "").trim();
  if (!id) return [];
  const includeLegacy = Boolean(options.includeLegacyWithoutBot);
  const domains = await getDomainsLean();
  const arr = Array.isArray(domains.voiceStates) ? domains.voiceStates : [];
  function hasAnyExplicitBotForGuild(gid?) {
    return arr.some((x?) => String(x.guildId) === gid && String(x.botUserId || "").trim() !== "");
  }
  return arr.filter((x?) => {
    const gid = String(x.guildId || "");
    const b = String(x.botUserId || "").trim();
    if (!gid) return false;
    if (b === id) return true;
    if (includeLegacy && !b && !hasAnyExplicitBotForGuild(gid)) return true;
    return false;
  });
}

async function voiceFindManyLean() {
  const domains = await getDomainsLean();
  return domains.voiceStates || [];
}

async function ttsUserLangFindManyLean() {
  const domains = await getDomainsLean();
  return domains.ttsUserLangs || [];
}

async function ttsUserLangFindOneLean(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  const domains = await getDomainsLean();
  const arr = domains.ttsUserLangs || [];
  return arr.find((x?) => String(x.userId) === uid) || null;
}

async function ttsUserLangUpsert(userId?, lang?) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  if (!lang) {
    await atomicSetArray(
      "domains.ttsUserLangs",
      {
        $filter: {
          input: arrayOrEmpty("domains.ttsUserLangs"),
          as: "row",
          cond: { $ne: [{ $toString: "$$row.userId" }, uid] },
        },
      },
    );
    return;
  }
  const row = { userId: uid, lang: String(lang) };
  await atomicSetArray(
    "domains.ttsUserLangs",
    {
      $let: {
        vars: { source: arrayOrEmpty("domains.ttsUserLangs") },
        in: {
          $concatArrays: [
            {
              $filter: {
                input: "$$source",
                as: "row",
                cond: { $ne: [{ $toString: "$$row.userId" }, uid] },
              },
            },
            [{ $literal: row }],
          ],
        },
      },
    },
  );
}

async function chatReminderRotationFindOneLean(filter?) {
  const guildId = String(filter.guildId || "");
  const domains = await getDomainsLean();
  const arr = domains.chatReminderRotations || [];
  return arr.find((x?) => String(x.guildId) === guildId) || null;
}

async function chatReminderRotationFindOneAndUpdate(filter?, update?) {
  const guildId = String(filter.guildId || "");
  const $set = update.$set || {};
  if (!guildId) return;
  const row = { guildId, ...$set };
  await atomicSetArray(
    "domains.chatReminderRotations",
    {
      $let: {
        vars: { source: arrayOrEmpty("domains.chatReminderRotations") },
        in: {
          $cond: [
            {
              $anyElementTrue: {
                $map: {
                  input: "$$source",
                  as: "row",
                  in: { $eq: [{ $toString: "$$row.guildId" }, guildId] },
                },
              },
            },
            {
              $map: {
                input: "$$source",
                as: "row",
                in: {
                  $cond: [
                    { $eq: [{ $toString: "$$row.guildId" }, guildId] },
                    { $mergeObjects: ["$$row", { $literal: row }] },
                    "$$row",
                  ],
                },
              },
            },
            { $concatArrays: ["$$source", [{ $literal: row }]] },
          ],
        },
      },
    },
  );
}

async function chatReminderScheduleCreate({ guildId, fireAt, kind }) {
  const scheduleId = randomUUID();
  const row = {
    scheduleId,
    guildId: String(guildId || ""),
    fireAt: fireAt instanceof Date ? fireAt : new Date(fireAt),
    kind: kind || "first",
  };
  await atomicSetArray(
    "domains.chatReminderSchedules",
    { $concatArrays: [arrayOrEmpty("domains.chatReminderSchedules"), [{ $literal: row }]] },
  );
  return row;
}

async function chatReminderScheduleUpdateOne(filter?, update?) {
  const sid = String(filter.scheduleId || filter._id || "");
  if (!sid) return;
  const $set = update.$set || {};
  await atomicSetArray(
    "domains.chatReminderSchedules",
    {
      $map: {
        input: arrayOrEmpty("domains.chatReminderSchedules"),
        as: "row",
        in: {
          $cond: [
            { $eq: [{ $toString: "$$row.scheduleId" }, sid] },
            { $mergeObjects: ["$$row", { $literal: $set }] },
            "$$row",
          ],
        },
      },
    },
  );
}

async function chatReminderScheduleDeleteOne(filter?) {
  const sid = String(filter.scheduleId || filter._id || "");
  if (!sid) return;
  await atomicSetArray(
    "domains.chatReminderSchedules",
    {
      $filter: {
        input: arrayOrEmpty("domains.chatReminderSchedules"),
        as: "row",
        cond: { $ne: [{ $toString: "$$row.scheduleId" }, sid] },
      },
    },
  );
}

async function chatReminderScheduleFindLatestFuture({ guildId, now }) {
  const g = String(guildId || "");
  const t = (now instanceof Date ? now : new Date(now)).getTime();
  const domains = await getDomainsLean();
  const arr = (domains.chatReminderSchedules || []).filter(
    (x?) =>
      String(x.guildId) === g && new Date(x.fireAt).getTime() > t,
  );
  arr.sort(
    (a?, b?) => new Date(b.fireAt).getTime() - new Date(a.fireAt).getTime(),
  );
  return arr[0] || null;
}

async function chatReminderScheduleFindDueLean(now?) {
  const t = (now instanceof Date ? now : new Date(now)).getTime();
  const domains = await getDomainsLean();
  const arr = domains.chatReminderSchedules || [];
  return arr.filter((x?) => new Date(x.fireAt).getTime() <= t);
}

async function chatReminderScheduleDeleteManyFuture(now?) {
  const cutoff = now instanceof Date ? now : new Date(now);
  await atomicSetArray(
    "domains.chatReminderSchedules",
    {
      $filter: {
        input: arrayOrEmpty("domains.chatReminderSchedules"),
        as: "row",
        cond: { $lte: [{ $toDate: "$$row.fireAt" }, cutoff] },
      },
    },
  );
}

export = {
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
  voiceFindManyLeanForBot,
  voiceFindManyLean,
  ttsUserLangFindManyLean,
  ttsUserLangFindOneLean,
  ttsUserLangUpsert,
  chatReminderRotationFindOneLean,
  chatReminderRotationFindOneAndUpdate,
  chatReminderScheduleCreate,
  chatReminderScheduleUpdateOne,
  chatReminderScheduleDeleteOne,
  chatReminderScheduleFindLatestFuture,
  chatReminderScheduleFindDueLean,
  chatReminderScheduleDeleteManyFuture,
};
/**
 * Dati per-guild embedded in `GlobalSettings` (collection globalsettings):
 * modConfig, personalityPanels, channelSnapshots, skullboardPosts.
 */
const { GlobalSettings } = require("../../Schemas/Community/communitySchemas");

function normalizeModConfigFromGlobal(doc) {
  const o = !doc ? {} : typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const m = o.modConfig || {};
  const guildId = String(o.guildId || "");
  return {
    guildId,
    logChannelId: m.logChannelId ?? null,
    dmOnAction: m.dmOnAction !== false,
    caseCounter: Number(m.caseCounter || 0),
    exemptRoles: Array.isArray(m.exemptRoles) ? m.exemptRoles : [],
    exemptChannels: Array.isArray(m.exemptChannels) ? m.exemptChannels : [],
  };
}

function panelRowFromDoc(row) {
  if (!row) return null;
  const o = row.toObject ? row.toObject() : { ...row };
  return {
    channelId: String(o.channelId || ""),
    personalityMessageId: o.personalityMessageId ?? null,
    mentionsMessageId: o.mentionsMessageId ?? null,
    colorsMessageId: o.colorsMessageId ?? null,
    plusColorsMessageId: o.plusColorsMessageId ?? null,
    infoMessageId1: o.infoMessageId1 ?? null,
    infoMessageId2: o.infoMessageId2 ?? null,
    verifyInfoMessageId: o.verifyInfoMessageId ?? null,
    verifyPanelMessageId: o.verifyPanelMessageId ?? null,
    ticketInfoMessageId: o.ticketInfoMessageId ?? null,
    ticketPanelMessageId: o.ticketPanelMessageId ?? null,
    sponsorTicketPanelMessageId: o.sponsorTicketPanelMessageId ?? null,
  };
}

async function personalityPanelFindOneAndUpdate(filter, update = {}, options = {}) {
  const guildId = String(filter?.guildId || "");
  const channelId = String(filter?.channelId || "");
  if (!guildId || !channelId) return null;
  const $set = update.$set || {};
  const $setOnInsert = update.$setOnInsert || {};
  const doc = await GlobalSettings.findOne({ guildId }).select("personalityPanels").lean().catch(() => null);
  let arr = [...(doc?.personalityPanels || [])];
  const i = arr.findIndex((x) => String(x.channelId) === channelId);
  let row = i >= 0 ? { ...arr[i] } : { channelId, ...$setOnInsert };
  Object.assign(row, $set);
  row.channelId = channelId;
  if (i >= 0) arr[i] = row;
  else arr.push(row);
  const updated = await GlobalSettings.findOneAndUpdate(
    { guildId },
    { $set: { personalityPanels: arr }, $setOnInsert: { guildId } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...options },
  ).catch(() => null);
  const list = updated?.personalityPanels || [];
  const found = list.find((x) => String(x.channelId) === channelId);
  return found ? panelRowFromDoc(found) : null;
}

async function personalityPanelUpdateOne(filter, update = {}) {
  const guildId = String(filter?.guildId || "");
  const channelId = String(filter?.channelId || "");
  if (!guildId || !channelId) return { modifiedCount: 0 };
  const $set = update.$set || {};
  const doc = await GlobalSettings.findOne({ guildId }).select("personalityPanels").lean().catch(() => null);
  let arr = [...(doc?.personalityPanels || [])];
  const i = arr.findIndex((x) => String(x.channelId) === channelId);
  if (i < 0) {
    arr.push({ channelId, ...$set });
  } else {
    arr[i] = { ...arr[i], ...$set, channelId };
  }
  const r = await GlobalSettings.updateOne(
    { guildId },
    { $set: { personalityPanels: arr }, $setOnInsert: { guildId } },
    { upsert: true },
  ).catch(() => null);
  return { modifiedCount: r?.modifiedCount ?? 0, upsertedCount: r?.upsertedCount ?? 0 };
}

async function mergeChannelSnapshots(guildId, mutator) {
  const gid = String(guildId || "");
  if (!gid) return null;
  const doc = await GlobalSettings.findOne({ guildId: gid }).select("channelSnapshots").lean().catch(() => null);
  let arr = [...(doc?.channelSnapshots || [])];
  arr = mutator(arr) || arr;
  return GlobalSettings.updateOne(
    { guildId: gid },
    { $set: { channelSnapshots: arr }, $setOnInsert: { guildId: gid } },
    { upsert: true },
  ).catch(() => null);
}

async function upsertChannelSnapshotEmbedded(channel, options = {}) {
  const guildId = String(channel?.guildId || channel?.guild?.id || "");
  const channelId = String(channel?.id || "");
  if (!guildId || !channelId) return false;
  const deletedAt = options.deletedAt != null ? options.deletedAt : null;
  const name = String(channel?.name || "")
    .replace(/\s+/g, " ")
    .trim();
  const payload = {
    channelId,
    name,
    type: Number.isInteger(channel?.type) ? Number(channel.type) : null,
    parentId: channel?.parentId ? String(channel.parentId) : null,
    deletedAt,
  };
  await mergeChannelSnapshots(guildId, (arr) => {
    const i = arr.findIndex((x) => String(x.channelId) === channelId);
    if (i >= 0) arr[i] = { ...arr[i], ...payload };
    else arr.push(payload);
    return arr;
  });
  return true;
}

async function syncGuildChannelSnapshotsEmbedded(guild) {
  if (!guild?.id || !guild?.channels?.cache) return 0;
  const guildId = String(guild.id);
  const next = [];
  for (const ch of guild.channels.cache.values()) {
    const gid = String(ch.guildId || ch.guild?.id || guildId);
    const channelId = String(ch.id || "");
    if (!gid || !channelId) continue;
    next.push({
      channelId,
      name: String(ch.name || "")
        .replace(/\s+/g, " ")
        .trim(),
      type: Number.isInteger(ch.type) ? Number(ch.type) : null,
      parentId: ch.parentId ? String(ch.parentId) : null,
      deletedAt: null,
    });
  }
  await GlobalSettings.updateOne(
    { guildId },
    { $set: { channelSnapshots: next }, $setOnInsert: { guildId } },
    { upsert: true },
  ).catch(() => null);
  return next.length;
}

async function getChannelSnapshotMapEmbedded(guildId, channelIds = []) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return new Map();
  const ids = Array.from(new Set((Array.isArray(channelIds) ? channelIds : []).map((x) => String(x).trim()).filter(Boolean)));
  if (!ids.length) return new Map();
  const doc = await GlobalSettings.findOne({ guildId: safeGuildId }).select("channelSnapshots").lean().catch(() => null);
  const rows = doc?.channelSnapshots || [];
  const out = new Map();
  for (const row of rows) {
    const cid = String(row?.channelId || "");
    if (!ids.includes(cid)) continue;
    const name = String(row?.name || "")
      .replace(/\s+/g, " ")
      .trim();
    if (cid && name) out.set(cid, name);
  }
  return out;
}

async function skullboardFindOneLean(guildId, messageId) {
  const gid = String(guildId || "");
  const mid = String(messageId || "");
  if (!gid || !mid) return null;
  const doc = await GlobalSettings.findOne({ guildId: gid }).select("skullboardPosts").lean().catch(() => null);
  const row = (doc?.skullboardPosts || []).find((x) => String(x.messageId) === mid);
  return row || null;
}

async function skullboardUpsert(guildId, messageId, postMessageId) {
  const gid = String(guildId || "");
  const mid = String(messageId || "");
  if (!gid || !mid) return null;
  const doc = await GlobalSettings.findOne({ guildId: gid }).select("skullboardPosts").lean().catch(() => null);
  let arr = [...(doc?.skullboardPosts || [])];
  const i = arr.findIndex((x) => String(x.messageId) === mid);
  const row = { messageId: mid, postMessageId: postMessageId != null ? String(postMessageId) : null };
  if (i >= 0) arr[i] = { ...arr[i], ...row };
  else arr.push(row);
  return GlobalSettings.findOneAndUpdate(
    { guildId: gid },
    { $set: { skullboardPosts: arr }, $setOnInsert: { guildId: gid } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

module.exports = {
  normalizeModConfigFromGlobal,
  personalityPanelFindOneAndUpdate,
  personalityPanelUpdateOne,
  upsertChannelSnapshotEmbedded,
  syncGuildChannelSnapshotsEmbedded,
  getChannelSnapshotMapEmbedded,
  skullboardFindOneLean,
  skullboardUpsert,
};
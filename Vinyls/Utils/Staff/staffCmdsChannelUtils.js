const IDs = require("../Config/ids");
const { getStaffCmdsThreadIds } = require("../Global/globalSettingsBucket");

let threadIdsCache = { pm: null, high: null };

function staffCmdsChannelId() {
  return String(IDs.channels?.staffCmds || "").trim();
}

function setStaffCmdsThreadIdsCache(ids = {}) {
  threadIdsCache = {
    pm: ids?.pm ? String(ids.pm) : null,
    high: ids?.high ? String(ids.high) : null,
  };
}

function getStaffCmdsThreadIdsCache() {
  return { ...threadIdsCache };
}

/** #staff-cmds o thread sotto quel canale. */
function isChannelOrThreadUnderStaffCmds(channel) {
  const cmds = staffCmdsChannelId();
  if (!channel) return false;
  const id = String(channel.id);
  if (cmds && id === cmds) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const parent = String(channel.parentId || "");
    if (cmds && parent === cmds) return true;
  }
  return false;
}

function isStaffCmdsMainChannel(channel) {
  const cmds = staffCmdsChannelId();
  if (!channel || !cmds) return false;
  return String(channel.id) === cmds;
}

async function isStaffCmdsPmCommandsThread(channel) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const parentId = staffCmdsChannelId();
  if (!parentId || String(channel.parentId || "") !== parentId) return false;
  const cached = getStaffCmdsThreadIdsCache().pm;
  if (cached) return String(channel.id) === String(cached);
  const ids = await getStaffCmdsThreadIds();
  return String(channel.id) === String(ids.pm || "");
}

async function isStaffCmdsHighCommandsThread(channel) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const parentId = staffCmdsChannelId();
  if (!parentId || String(channel.parentId || "") !== parentId) return false;
  const cached = getStaffCmdsThreadIdsCache().high;
  if (cached) return String(channel.id) === String(cached);
  const ids = await getStaffCmdsThreadIds();
  return String(channel.id) === String(ids.high || "");
}

async function isStaffCmdsManagedCommandsThread(channel) {
  return (await isStaffCmdsPmCommandsThread(channel)) || (await isStaffCmdsHighCommandsThread(channel));
}

async function resolveStaffCmdsPmThread(client) {
  const cached = getStaffCmdsThreadIdsCache().pm;
  const threadId = cached || (await getStaffCmdsThreadIds()).pm;
  if (!threadId) return null;
  const resolved =
    client?.channels?.cache?.get(threadId) || (await client?.channels?.fetch(threadId).catch(() => null));
  return resolved?.isThread?.() ? resolved : null;
}

module.exports = {
  staffCmdsChannelId,
  setStaffCmdsThreadIdsCache,
  getStaffCmdsThreadIdsCache,
  isChannelOrThreadUnderStaffCmds,
  isStaffCmdsMainChannel,
  isStaffCmdsPmCommandsThread,
  isStaffCmdsHighCommandsThread,
  isStaffCmdsManagedCommandsThread,
  resolveStaffCmdsPmThread,
};
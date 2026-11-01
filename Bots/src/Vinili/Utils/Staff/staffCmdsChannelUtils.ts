const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getStaffCmdsThreadIds } = require("../Global/globalSettingsBucket") as typeof import("../Global/globalSettingsBucket");

let threadIdsCache = { pm: null, high: null };

function staffCmdsChannelId() {
  return String(IDs.channels?.staffCmds || "").trim();
}

function setStaffCmdsThreadIdsCache(ids: Record<string, any> = {}) {
  threadIdsCache = {
    pm: ids?.pm ? String(ids.pm) : null,
    high: ids?.high ? String(ids.high) : null,
  };
}

function getStaffCmdsThreadIdsCache() {
  return { ...threadIdsCache };
}

function isChannelOrThreadUnderStaffCmds(channel?) {
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

function isStaffCmdsMainChannel(channel?) {
  const cmds = staffCmdsChannelId();
  if (!channel || !cmds) return false;
  return String(channel.id) === cmds;
}

function isPmCommandsThreadName(channel?) {
  const name = String(channel?.name || "").trim().toLowerCase();
  return (
    name.includes("partner manager") ||
    name.includes("comandi partner") ||
    name.includes("comandi pm")
  );
}

function isHighCommandsThreadName(channel?) {
  const name = String(channel?.name || "").trim().toLowerCase();
  return name.includes("high staff") || name.includes("comandi high");
}

function isStaffCmdsPmCommandsThreadSync(channel?) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const parentId = staffCmdsChannelId();
  if (!parentId || String(channel.parentId || "") !== parentId) return false;
  const cached = getStaffCmdsThreadIdsCache().pm;
  if (cached && String(channel.id) === String(cached)) return true;
  return isPmCommandsThreadName(channel);
}

function isHighStaffCommandsThread(channel?) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const parentId = staffCmdsChannelId();
  if (!parentId || String(channel.parentId || "") !== parentId) return false;
  const cached = getStaffCmdsThreadIdsCache().high;
  if (cached && String(channel.id) === String(cached)) return true;
  return isHighCommandsThreadName(channel);
}

async function isStaffCmdsPmCommandsThread(channel?) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const parentId = staffCmdsChannelId();
  if (!parentId || String(channel.parentId || "") !== parentId) return false;
  const cached = getStaffCmdsThreadIdsCache().pm;
  if (cached && String(channel.id) === String(cached)) return true;
  if (isPmCommandsThreadName(channel)) return true;
  try {
    const ids = await getStaffCmdsThreadIds();
    if (ids?.pm && String(channel.id) === String(ids.pm)) return true;
  } catch (_) {}
  return false;
}

async function isStaffCmdsHighCommandsThread(channel?) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const parentId = staffCmdsChannelId();
  if (!parentId || String(channel.parentId || "") !== parentId) return false;
  const cached = getStaffCmdsThreadIdsCache().high;
  if (cached && String(channel.id) === String(cached)) return true;
  if (isHighCommandsThreadName(channel)) return true;
  try {
    const ids = await getStaffCmdsThreadIds();
    if (ids?.high && String(channel.id) === String(ids.high)) return true;
  } catch (_) {}
  return false;
}

async function isStaffCmdsManagedCommandsThread(channel?) {
  return (await isStaffCmdsPmCommandsThread(channel)) || (await isStaffCmdsHighCommandsThread(channel));
}

let staffCmdsThreadIdsHydratePromise = null;

async function ensureStaffCmdsThreadIdsHydrated() {
  const cache = getStaffCmdsThreadIdsCache();
  if (cache.pm && cache.high) return cache;
  if (!staffCmdsThreadIdsHydratePromise) {
    staffCmdsThreadIdsHydratePromise = (async () => {
      try {
        const ids = await getStaffCmdsThreadIds();
        setStaffCmdsThreadIdsCache(ids);
      } catch (err) {
        global.logger?.warn?.("[staffCmdsChannelUtils] hydrate thread ids:", err?.message || err);
      } finally {
        staffCmdsThreadIdsHydratePromise = null;
      }
    })();
  }
  await staffCmdsThreadIdsHydratePromise;
  return getStaffCmdsThreadIdsCache();
}

function resolveStaffCmdsThreadSpecKeySync(channel?, ids: Record<string, any> = {}) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return null;
  const parentId = staffCmdsChannelId();
  if (!parentId || String(channel.parentId || "") !== parentId) return null;
  const threadId = String(channel.id);
  if (ids.pm && threadId === String(ids.pm)) return "pm";
  if (ids.high && threadId === String(ids.high)) return "high";
  if (isPmCommandsThreadName(channel)) return "pm";
  if (isHighCommandsThreadName(channel)) return "high";
  return null;
}

export = {
  staffCmdsChannelId,
  setStaffCmdsThreadIdsCache,
  getStaffCmdsThreadIdsCache,
  isChannelOrThreadUnderStaffCmds,
  isStaffCmdsMainChannel,
  isStaffCmdsPmCommandsThreadSync,
  isHighStaffCommandsThread,
  isStaffCmdsPmCommandsThread,
  isStaffCmdsManagedCommandsThread,
  ensureStaffCmdsThreadIdsHydrated,
  resolveStaffCmdsThreadSpecKeySync,
};
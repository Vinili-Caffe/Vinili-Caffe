"use strict";

const cron = require("node-cron") as typeof import("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { GlobalSettings } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const {
  grantBestStaffWeekPauseBonus,
} = require("../../Utils/Pause/pauseHandlersUtils") as typeof import("../../Utils/Pause/pauseHandlersUtils");
const {
  TIME_ZONE,
  getStaffWeekKeyNow,
  resolveStafferBonusMonthKey,
} = require("../../Utils/Staff/stafferDellaSettimanaWeekKey") as typeof import("../../Utils/Staff/stafferDellaSettimanaWeekKey");
/* Marker: stafferMonthBridge1 */

function stafferDellaSettimanaRoleId() {
  return String(IDs.roles?.StafferDellaSettimana || "").trim();
}

function listRoleHolders(guild?, roleId?) {
  const holders = [];
  if (!roleId || !guild?.members?.cache) return holders;
  for (const member of guild.members.cache.values()) {
    if (!member?.roles?.cache?.has?.(roleId)) continue;
    if (member.user?.bot) continue;
    holders.push(member);
  }
  holders.sort((a?, b?) =>
    String(a.displayName || "").localeCompare(String(b.displayName || ""), "it", {
      sensitivity: "base",
    }),
  );
  return holders;
}

async function persistStafferDellaSettimanaState(guildId?, userId?, weekKey?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  await GlobalSettings.findOneAndUpdate(
    { guildId: gid },
    {
      $set: {
        stafferDellaSettimanaState: {
          userId: userId ? String(userId) : null,
          weekKey: weekKey ? String(weekKey) : null,
          updatedAt: new Date(),
        },
      },
      $setOnInsert: { guildId: gid },
    },
    { upsert: true },
  ).catch(() => null);
}

async function loadStafferDellaSettimanaState(guildId?) {
  const doc = await GlobalSettings.findOne(
    { guildId: String(guildId || "") },
    { stafferDellaSettimanaState: 1 },
  )
    .lean()
    .catch(() => null);
  const state = doc?.stafferDellaSettimanaState;
  if (!state || typeof state !== "object") return { userId: null, weekKey: null };
  return {
    userId: String(state.userId || "").trim() || null,
    weekKey: String(state.weekKey || "").trim() || null,
  };
}

/** Grant +1 giorno pausa (mese della settimana ISO / giovedì) quando viene assegnato il ruolo. */
async function onStafferDellaSettimanaRoleAdded(guildId?, userId?) {
  const weekKey = getStaffWeekKeyNow();
  const monthKey = resolveStafferBonusMonthKey({ weekKey });
  const grant = await grantBestStaffWeekPauseBonus(guildId, userId, { weekKey, monthKey });
  try {
    const { grantCompitiSwapBonus } = require("../../features/staff/siteStaffCompitiApi") as typeof import("../../features/staff/siteStaffCompitiApi");
    const swap = await grantCompitiSwapBonus(guildId, userId, 1, { weekKey, monthKey });
    if (!swap?.ok || Number(swap.granted || 0) < 1) {
      global.logger?.warn?.("[STAFFER SETTIMANA] compiti swap grant:", swap);
    }
  } catch (err) {
    global.logger?.warn?.("[STAFFER SETTIMANA] compiti swap grant failed:", err?.message || err);
  }
  await persistStafferDellaSettimanaState(guildId, userId, weekKey);
  return grant;
}

/**
 * Domenica 21 Europe/Rome: se lo stesso holder della settimana precedente
 * ha ancora il ruolo, concede di nuovo +1 giorno per la nuova weekKey.
 */
async function tickStafferDellaSettimanaWeek(client?) {
  const guildId = String(IDs.guilds?.main || "").trim();
  const roleId = stafferDellaSettimanaRoleId();
  if (!guildId || !roleId) return { ok: false, reason: "missing_config" };

  const guild =
    client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_unavailable" };

  if (guild.members?.fetch) {
    await guild.members.fetch().catch(() => null);
  }

  const weekKey = getStaffWeekKeyNow();
  const monthKey = resolveStafferBonusMonthKey({ weekKey });
  const holders = listRoleHolders(guild, roleId);
  const prev = await loadStafferDellaSettimanaState(guildId);

  if (!holders.length) {
    await persistStafferDellaSettimanaState(guildId, null, weekKey);
    return { ok: true, holders: 0, weekKey, granted: [] };
  }

  // Ruolo singolare: un solo holder (preferisci chi ce l'aveva già se ancora in lista).
  const stillPrev = prev.userId
    ? holders.find((m?) => String(m.id) === prev.userId)
    : null;
  const target = stillPrev || holders[0];
  const primaryId = String(target.id);
  const granted = [];
  const sameAsLastWeek =
    Boolean(prev.userId) &&
    prev.userId === primaryId &&
    Boolean(prev.weekKey) &&
    prev.weekKey !== weekKey;
  const newWeekBoundary = !prev.weekKey || prev.weekKey !== weekKey;
  // Stesso holder a domenica 21 → nuova settimana → +1.
  // Altrimenti (nuovo holder / prima run) assicura il grant della week corrente.
  if (sameAsLastWeek || newWeekBoundary) {
    const res = await grantBestStaffWeekPauseBonus(guildId, primaryId, { weekKey, monthKey });
    try {
      const { grantCompitiSwapBonus } = require("../../features/staff/siteStaffCompitiApi") as typeof import("../../features/staff/siteStaffCompitiApi");
      const swap = await grantCompitiSwapBonus(guildId, primaryId, 1, { weekKey, monthKey });
      if (!swap?.ok || (Number(swap.granted || 0) < 1 && !swap?.skipped)) {
        global.logger?.warn?.("[STAFFER SETTIMANA] tick compiti swap:", swap);
      }
      granted.push({ userId: primaryId, ...res, compitiSwap: swap });
    } catch (err) {
      global.logger?.warn?.("[STAFFER SETTIMANA] tick compiti swap failed:", err?.message || err);
      granted.push({ userId: primaryId, ...res });
    }
  }

  await persistStafferDellaSettimanaState(guildId, primaryId, weekKey);
  return { ok: true, holders: holders.length, weekKey, granted };
}

let loopStarted = false;
function startStafferDellaSettimanaLoop(client?) {
  if (loopStarted) return;
  loopStarted = true;
  // 1 min dopo i weekly winners (0 21) per non contendere il cron.
  cron.schedule(
    "1 21 * * 0",
    runCronDetached("[STAFFER SETTIMANA]", async () => {
      await tickStafferDellaSettimanaWeek(client);
    }),
    { timezone: TIME_ZONE, noOverlap: true },
  );
}

export = {
  onStafferDellaSettimanaRoleAdded,
  tickStafferDellaSettimanaWeek,
  startStafferDellaSettimanaLoop,
  stafferDellaSettimanaRoleId,
};

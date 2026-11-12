const { voteStateLastAt, extractDiscadiaVoteState, isVoteListingRecordedAtOrAfter } = require("./voteReminderState") as typeof import("./voteReminderState");
const { getVoteCooldownMs, getVoteCheckIntervalMs, enqueueVoteCompletedSiteNotification } = require("./voteReminderMessages") as typeof import("./voteReminderMessages");
const { recordDiscadiaVote, restorePendingVoteReminders, sendDueDiscadiaVoteReminders } = require("./discadiaVotes") as typeof import("./discadiaVotes");
const { buildBumpStateModel, createBumpReminderService } = require("./bumpReminder") as typeof import("./bumpReminder");
const { awardBumpVoteExp } = require("./bumpRewards") as typeof import("./bumpRewards");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const DISBOARD_BUMP_USER_ID = "__disboard_bump__";
const DISCADIA_BUMP_USER_ID = "__discadia_bump__";

const disboardService = createBumpReminderService({ model: buildBumpStateModel("disboard", DISBOARD_BUMP_USER_ID), configKey: "disboard", defaultCooldownMinutes: 120, mentionContent: "<@&1544830661637046303>", title: `${E.VC_Eye} **È L'ORA DEL \`BUMP\`!**`, url: "https://disboard.org/it/server/1329080093599076474", description: `${E.VC_bump} **Per bumpare scrivi __\`/bump\` in chat__**!`, errorTag: `${E.VC_Alert} [DISBOARD REMINDER ERROR]`, logTag: `${E.VC_Alert} [DISBOARD REMINDER]`, suppressInfoLogs: true, });

const discadiaBumpService = createBumpReminderService({ model: buildBumpStateModel("discadia", DISCADIA_BUMP_USER_ID), configKey: "discadia", defaultCooldownMinutes: 1440, mentionContent: "<@&1544830661637046303>", title: `${E.VC_Eye} **È L'ORA DEL \`BUMP\` SU DISCADIA!**`, url: "https://discadia.com/server/viniliecaffe/", description: `${E.VC_bump} **Per bumpare scrivi __\`/bump\` in chat__**!`, errorTag: `${E.VC_Alert} [DISCADIA REMINDER ERROR]`, logTag: `${E.VC_Alert} [DISCADIA REMINDER]`, suppressInfoLogs: true, });
let discadiaVoteReminderLoopHandle = null;
const BUMP_DUE_REMINDER_SWEEP_MS = 2 * 60 * 1000;

async function classicBumpReminderStillOwns(service: "disboard" | "discadia") {
  try {
    const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
    const gid = String(IDs?.guilds?.main || "");
    if (!gid) return true;
    const { moduleHandlesBump } = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
    return !(await moduleHandlesBump(gid, service));
  } catch {
    return true;
  }
}

function startBumpDueReminderSweepLoop(client?) {
  if (!client || client._bumpDueReminderSweepStarted) return;
  client._bumpDueReminderSweepStarted = true;
  const tick = () => {
    Promise.all([
      classicBumpReminderStillOwns("disboard").then((ok) => (ok ? disboardService.sweepDueReminders(client) : null)),
      classicBumpReminderStillOwns("discadia").then((ok) => (ok ? discadiaBumpService.sweepDueReminders(client) : null)),
    ]).catch(() => null);
  };
  setInterval(tick, BUMP_DUE_REMINDER_SWEEP_MS);
  tick();
}

function startDiscadiaVoteReminderLoop(client?) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return null;
  const intervalMs = getVoteCheckIntervalMs(client);
  if (client._discadiaVoteReminderInterval) {
    clearInterval(client._discadiaVoteReminderInterval);
    client._discadiaVoteReminderInterval = null;
  }
  if (discadiaVoteReminderLoopHandle) {
    clearInterval(discadiaVoteReminderLoopHandle);
    discadiaVoteReminderLoopHandle = null;
  }
  const tick = () => {
    sendDueDiscadiaVoteReminders(client).catch((error?) => {
      global.logger?.error?.("[DISCADIA VOTE REMINDER ERROR]", error?.message || error);
    });
  };
  discadiaVoteReminderLoopHandle = setInterval(tick, intervalMs);
  client._discadiaVoteReminderInterval = discadiaVoteReminderLoopHandle;
  if (typeof discadiaVoteReminderLoopHandle.unref === "function") discadiaVoteReminderLoopHandle.unref();
      return discadiaVoteReminderLoopHandle;
}

export = { recordBump: disboardService.recordBump, restorePendingReminders: disboardService.restorePendingReminders, startBumpDueReminderSweepLoop, recordDiscadiaBump: discadiaBumpService.recordBump, restorePendingDiscadiaReminders: discadiaBumpService.restorePendingReminders, recordDiscadiaVote, enqueueVoteCompletedSiteNotification, startDiscadiaVoteReminderLoop, restorePendingVoteReminders, awardBumpVoteExp, getVoteCooldownMs, isVoteListingRecordedAtOrAfter, voteStateLastAt, extractDiscadiaVoteState };
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { shouldBlockDm } = require("../../Utils/noDmList") as typeof import("../../Utils/noDmList");
const { isUserDmPrivacyBlockedError, notifyDmPrivacyBlockedInCommands } = require("../../../shared/discord/dmPrivacyNotice") as typeof import("../../../shared/discord/dmPrivacyNotice");
const { enqueueSiteInAppNotification } = require("../../features/notifications/siteInAppNotificationsService") as typeof import("../../features/notifications/siteInAppNotificationsService");
const { shouldSkipDiscordDmForActiveWebPush } = require("../../Web/siteNotifPrefs") as typeof import("../../Web/siteNotifPrefs");
const { getClientChannelCached, getClientGuildCached, getGuildMemberCached, getUserCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../Community/expService") as typeof import("../Community/expService");
const { voteCountMonthKeyRome } = require("../../Utils/romeVoteMonthKey") as typeof import("../../Utils/romeVoteMonthKey");
const { voteStateLastAt, extractDiscadiaVoteState, isVoteListingRecordedAtOrAfter } = require("./voteReminderState") as typeof import("./voteReminderState");
const { getVoteCooldownMs, getVoteCheckIntervalMs, enqueueVoteCompletedSiteNotification } = require("./voteReminderMessages") as typeof import("./voteReminderMessages");
const { recordDiscadiaVote, restorePendingVoteReminders, sendDueDiscadiaVoteReminders } = require("./discadiaVotes") as typeof import("./discadiaVotes");
const { buildBumpStateModel, createBumpReminderService } = require("./bumpReminder") as typeof import("./bumpReminder");
const { awardBumpVoteExp } = require("./bumpRewards") as typeof import("./bumpRewards");


const DISBOARD_BUMP_USER_ID = "__disboard_bump__";
const DISCADIA_BUMP_USER_ID = "__discadia_bump__";

const disboardService = createBumpReminderService({ model: buildBumpStateModel("disboard", DISBOARD_BUMP_USER_ID), configKey: "disboard", defaultCooldownMinutes: 120, mentionContent: "<@&1544830661637046303>", title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP`!**", url: "https://disboard.org/it/server/1329080093599076474", description: "<:VC_bump:1482531857521311885> **Per bumpare scrivi __`/bump` in chat__**!", errorTag: "<a:VC_Alert:1482706673176150077> [DISBOARD REMINDER ERROR]", logTag: "<a:VC_Alert:1482706673176150077> [DISBOARD REMINDER]", suppressInfoLogs: true, });

const discadiaBumpService = createBumpReminderService({ model: buildBumpStateModel("discadia", DISCADIA_BUMP_USER_ID), configKey: "discadia", defaultCooldownMinutes: 1440, mentionContent: "<@&1544830661637046303>", title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP` SU DISCADIA!**", url: "https://discadia.com/server/viniliecaffe/", description: "<:VC_bump:1482531857521311885> **Per bumpare scrivi __`/bump` in chat__**!", errorTag: "<a:VC_Alert:1482706673176150077> [DISCADIA REMINDER ERROR]", logTag: "<a:VC_Alert:1482706673176150077> [DISCADIA REMINDER]", suppressInfoLogs: true, });
let discadiaVoteReminderLoopHandle = null;
const BUMP_DUE_REMINDER_SWEEP_MS = 2 * 60 * 1000;

function startBumpDueReminderSweepLoop(client?) {
  if (!client || client._bumpDueReminderSweepStarted) return;
  client._bumpDueReminderSweepStarted = true;
  const tick = () => {
    Promise.all([
      disboardService.sweepDueReminders(client),
      discadiaBumpService.sweepDueReminders(client),
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
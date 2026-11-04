/** Resoconti settimanali: limiti di attività e sanzioni per ruolo. */
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const STAFF_ACTIVITY_LIMITS = {
  [String(IDs.roles.Helper)]: { messages: 400, hours: 4 },
  [String(IDs.roles.Mod)]: { messages: 500, hours: 5 },
  [String(IDs.roles.SeniorModerator)]: { messages: 600, hours: 6 },
  [String(IDs.roles.Director)]: { messages: 550, hours: 5.5 },
  };
const STAFF_LIMITS_MSG_PER_HOUR_SWAP = 100;

function scaleStaffActivityLimits(limits?, multiplier = 1) {
  if (!limits) return null;
  const m = Math.max(0, Number(multiplier) || 0);
  return {
    messages: Math.max(0, Number(limits.messages || 0) * m),
    hours: Math.max(0, Number(limits.hours || 0) * m),
  };
}

function evaluateStaffWeeklyLimitsWithSwap(weeklyMessages?, weeklyVoiceHours?, limits?) {
  if (!limits) {
    return {
      reached: false,
      effectiveMessages: Math.max(0, Math.floor(toSafeNumber(weeklyMessages))),
      effectiveHours: Math.max(0, toSafeNumber(weeklyVoiceHours)),
      swapApplied: false,
      hoursToMessages: 0,
      messagesToHours: 0,
      remainingMessages: 0,
      remainingHours: 0,
    };
  }

  const reqMsg = Math.max(0, Number(limits.messages || 0));
  const reqHrs = Math.max(0, Number(limits.hours || 0));
  let msg = Math.max(0, Math.floor(toSafeNumber(weeklyMessages)));
  let hrs = Math.max(0, toSafeNumber(weeklyVoiceHours));
  let hoursToMessages = 0;
  let messagesToHours = 0;

  const msgGap = Math.max(0, reqMsg - msg);
  if (msgGap > 0) {
    const hrsSurplus = Math.max(0, hrs - reqHrs);
    const hrsToSwap = Math.min(hrsSurplus, msgGap / STAFF_LIMITS_MSG_PER_HOUR_SWAP);
    if (hrsToSwap > 0) {
      hoursToMessages = hrsToSwap;
      msg += hrsToSwap * STAFF_LIMITS_MSG_PER_HOUR_SWAP;
      hrs -= hrsToSwap;
    }
  }

  const hrsGap = Math.max(0, reqHrs - hrs);
  if (hrsGap > 0) {
    const msgSurplus = Math.max(0, msg - reqMsg);
    const msgToSwap = Math.min(msgSurplus, hrsGap * STAFF_LIMITS_MSG_PER_HOUR_SWAP);
    if (msgToSwap > 0) {
      messagesToHours = msgToSwap;
      hrs += msgToSwap / STAFF_LIMITS_MSG_PER_HOUR_SWAP;
      msg -= msgToSwap;
    }
  }

  const remainingMessages = Math.max(0, reqMsg - msg);
  const remainingHours = Math.max(0, reqHrs - hrs);
  return {
    reached: remainingMessages === 0 && remainingHours === 0,
    effectiveMessages: msg,
    effectiveHours: hrs,
    swapApplied: hoursToMessages > 0 || messagesToHours > 0,
    hoursToMessages,
    messagesToHours,
    remainingMessages,
    remainingHours,
  };
}

/** Stesso swap del base (100 msg = 1h, illimitato), ma sui limiti ×multiplier (doppio = ×2 msg e ×2 h). */
function evaluateStaffWeeklyLimitsAtMultiplier(weeklyMessages?, weeklyVoiceHours?, limits?, multiplier = 1) {
  return evaluateStaffWeeklyLimitsWithSwap(
    weeklyMessages,
    weeklyVoiceHours,
    scaleStaffActivityLimits(limits, multiplier),
  );
}

function formatStaffLimitsSwapLine(limitsEval?) {
  if (!limitsEval?.swapApplied) return null;
  const parts = [];
  if (limitsEval.hoursToMessages > 0) {
    const msgGain = Math.round(limitsEval.hoursToMessages * STAFF_LIMITS_MSG_PER_HOUR_SWAP);
    parts.push(`__${formatHoursFromSeconds(limitsEval.hoursToMessages * 3600)}__ → __${msgGain}__ messaggi`);
  }
  if (limitsEval.messagesToHours > 0) {
    const hrsGain = limitsEval.messagesToHours / STAFF_LIMITS_MSG_PER_HOUR_SWAP;
    parts.push(`__${limitsEval.messagesToHours}__ messaggi → __${formatHoursFromSeconds(hrsGain * 3600)}__`);
  }
  if (!parts.length) return null;
  return `${E.VC_Dot__329582} **Scambio limiti** (${STAFF_LIMITS_MSG_PER_HOUR_SWAP} msg = 1h): ${parts.join(" · ")}`;
}
const STAFF_SANCTION_LIMITS = {
  [String(IDs.roles.Helper)]: 1,
  [String(IDs.roles.Mod)]: 2,
  [String(IDs.roles.SeniorModerator)]: 2,
  [String(IDs.roles.Director)]: 1,
};

function toSafeNumber(value?) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatHoursFromSeconds(seconds?) {
  const safeSeconds = Math.max(0, Math.floor(toSafeNumber(seconds)));
  const hours = safeSeconds / 3600;
  return `${hours.toFixed(2)}h`;
}

export = { STAFF_ACTIVITY_LIMITS, STAFF_LIMITS_MSG_PER_HOUR_SWAP, evaluateStaffWeeklyLimitsWithSwap, evaluateStaffWeeklyLimitsAtMultiplier, formatStaffLimitsSwapLine, STAFF_SANCTION_LIMITS, toSafeNumber, formatHoursFromSeconds };

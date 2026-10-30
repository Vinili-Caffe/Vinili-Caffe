const { findModLogsPage } = require("./modCaseStore") as typeof import("./modCaseStore");

const STAFF_REGOLA_STEPS = {
  "1.1": [{ type: "ban" }],
  "1.2": [
    { type: "mute", duration: "4h" },
    { type: "mute", duration: "12h" },
    { type: "mute", duration: "24h" },
  ],
  "1.3": [
    { type: "mute", duration: "4h" },
    { type: "mute", duration: "8h" },
    { type: "mute", duration: "18h" },
  ],
  "1.4": [{ type: "ban" }],
  "1.5": [{ type: "ban" }],
  "1.6": [
    { type: "mute", duration: "12h" },
    { type: "mute", duration: "24h" },
    { type: "mute", duration: "48h" },
    { type: "ban" },
  ],
  "2.1": [{ type: "mute", duration: "24h" }, { type: "ban" }],
  "2.2": [{ type: "ban" }],
  "2.3": [
    { type: "mute", duration: "3h" },
    { type: "mute", duration: "6h" },
  ],
  "2.4": [{ type: "warn" }, { type: "mute", duration: "2h" }],
  "3.1": [
    { type: "mute", duration: "12h" },
    { type: "mute", duration: "24h" },
    { type: "ban" },
  ],
  "3.2": [
    { type: "mute", duration: "4h" },
    { type: "mute", duration: "12h" },
    { type: "mute", duration: "24h" },
  ],
  "3.3": [
    { type: "mute", duration: "2h" },
    { type: "mute", duration: "6h" },
    { type: "mute", duration: "12h" },
  ],
  "3.4": [
    { type: "mute", duration: "6h" },
    { type: "mute", duration: "15h" },
    { type: "mute", duration: "35h" },
  ],
  "3.5": [
    { type: "mute", duration: "5h" },
    { type: "mute", duration: "11h" },
    { type: "mute", duration: "24h" },
  ],
};

const KNOWN_RULE_DOTS = Object.keys(STAFF_REGOLA_STEPS);

function normalizeRuleDot(raw?) {
  const s = String(raw || "").trim().replace(",", ".").replace("_", ".");
  const m = s.match(/^(\d+)\s*[\._-]?\s*(\d+)$/);
  if (!m) return null;
  const dot = `${m[1]}.${m[2]}`;
    if (dot === "3.6") return "3.5";
  return dot;
}

function buildRuleMatchRe(ruleDot?) {
  const parts = String(ruleDot || "").split(".");
  if (parts.length !== 2) return null;
  const [major, minor] = parts;
  return new RegExp(`\\b${major}\\s*[\\._-]\\s*${minor}\\b`, "i");
}

function isMatchingRuleCase(row?, ruleDot?) {
  const reason = String(row?.reason || "");
  if (!reason) return false;
  const re = buildRuleMatchRe(ruleDot);
  if (re && re.test(reason)) return true;
  const lower = reason.toLowerCase();
  const dot = String(ruleDot || "").toLowerCase();
  return lower.includes(`regola ${dot}`) || lower.includes(`regola \`${dot}\``) || lower.includes(`violazione della regola ${dot}`);
}

function staffLadderIncludesWarn(ruleDot?) {
  const steps = STAFF_REGOLA_STEPS[String(ruleDot || "")];
  if (!Array.isArray(steps) || !steps.length) return false;
  return steps.some((s?) => String(s?.type || "").toLowerCase() === "warn");
}

async function countPreviousRuleCases(guildId?, userId?, ruleDot?) {
  const page = await findModLogsPage(guildId, userId, 0, 100).catch(() => []);
  const rows = (Array.isArray(page) ? page : []).filter((row?) => isMatchingRuleCase(row, ruleDot));
    if (!staffLadderIncludesWarn(ruleDot)) {
    return rows.filter((row?) => String(row?.action || "").toUpperCase() !== "WARN").length;
  }
  return rows.length;
}

function resolveStepIndex(previousCount?, stepsLength?) {
  const n = Number(previousCount || 0);
  const len = Number(stepsLength || 0);
  if (!Number.isFinite(n) || n < 0 || len <= 0) return 0;
  return Math.min(n, len - 1);
}

function buildDefaultReason(ruleDot?, stepIndex?, customMotivo?) {
  const n = Number(stepIndex) + 1;
  const base = `Violazione della regola ${ruleDot} (${n}°)`;
  const extra = String(customMotivo || "").trim();
  if (extra) return `${base} — ${extra}`.slice(0, 512);
  return base.slice(0, 512);
}

function resolveStaffRegolaSanction(ruleDot?, previousCount?) {
  const steps = STAFF_REGOLA_STEPS[ruleDot];
  if (!Array.isArray(steps) || !steps.length) return null;
  const stepIndex = resolveStepIndex(previousCount, steps.length);
  const step = steps[stepIndex];
  if (!step?.type) return null;
  return { step, stepIndex, stepsLength: steps.length, ruleDot };
}

function buildDynoArgs(targetId?, resolved?, reason?, durationOverride?) {
  const tid = String(targetId || "").trim();
  const type = String(resolved?.step?.type || "").toLowerCase();
  const defaultDur = String(resolved?.step?.duration || "").trim();
  const dur = String(durationOverride || "").trim() || defaultDur;
  switch (type) {
    case "warn":
    case "kick":
      return { cmd: type, args: [tid, reason] };
    case "mute":
      return { cmd: "mute", args: dur ? [tid, dur, reason] : [tid, reason] };
    case "ban":
      if (dur) return { cmd: "ban", args: [tid, dur, reason] };
      return { cmd: "ban", args: [tid, reason] };
    default:
      return null;
  }
}

function formatSanctionPreview(resolved?, reason?, durationOverride?) {
  const type = String(resolved?.step?.type || "").toLowerCase();
  const dur = String(durationOverride || resolved?.step?.duration || "").trim();
  const labels = { warn: "Warn", mute: "Mute", ban: "Ban", kick: "Kick" };
  const label = labels[type] || type;
  const n = Number(resolved?.stepIndex || 0) + 1;
  const total = Number(resolved?.stepsLength || 0);
  const stepNote = total > 1 ? ` (${n}°/${total})` : "";
  if (type === "mute" && dur) return `${label} ${dur}${stepNote}`;
  if (type === "ban" && dur) return `${label} ${dur}${stepNote}`;
  return `${label}${stepNote}`;
}

export = {
  STAFF_REGOLA_STEPS,
  KNOWN_RULE_DOTS,
  normalizeRuleDot,
  countPreviousRuleCases,
  resolveStaffRegolaSanction,
  buildDefaultReason,
  buildDynoArgs,
  formatSanctionPreview,
  isMatchingRuleCase,
};
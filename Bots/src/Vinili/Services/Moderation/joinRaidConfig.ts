const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

const HIGH_STAFF_ROLE_ID = String(IDs.roles?.HighStaff || "");
const HIGH_STAFF_MENTION = HIGH_STAFF_ROLE_ID ? `<@&${HIGH_STAFF_ROLE_ID}>` : null;

const JOIN_RAID_CONFIG = {
  enabled: true,
  lockCommands: true,
  triggerAction: "quarantine",
  triggerType: "unique",
  accountType: "young_or_no_pfp",
  punishOnActiveRaid: true,
  triggerCount: 18,
  triggerWindowMs: 3 * 60 * 60_000,
  raidDurationMs: 30 * 60_000,
  warnedRoleIds: [
    IDs.roles.Founder,
    IDs.roles.Manager,
    IDs.roles.Admin,
    IDs.roles.Director,
    IDs.roles.HighStaff,
    IDs.roles.SeniorModerator,
    IDs.roles.Mod,
    IDs.roles.Helper,
  ]
    .filter(Boolean)
    .map(String),
  idFlag: {
    enabled: true,
    categorization: "adaptive",
    minimumMatches: 4,
    compareWindowMs: 3 * 60 * 60_000,
    createdAtDeltaMs: 20 * 60_000,
  },
  noPfpFlag: { enabled: true },
  ageFlag: { enabled: true, minimumAgeMs: 3 * 24 * 60 * 60_000 },
};

const JOIN_RAID_CONFIG_PATH = path.resolve(
  __dirname,
  "../../Utils/Config/joinRaidConfig.json",
);

function readJsonSafe(filePath?, fallback?) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath?, value?) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function applyPersistentJoinRaidConfig(raw?) {
  if (!raw || typeof raw !== "object") return;
  const clamp = (value?, min?, max?, fallback?) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  if (typeof raw.enabled === "boolean") {
    JOIN_RAID_CONFIG.enabled = raw.enabled;
  }
  if (typeof raw.lockCommands === "boolean") {
    JOIN_RAID_CONFIG.lockCommands = raw.lockCommands;
  }
  if (typeof raw.triggerAction === "string") {
    const action = String(raw.triggerAction || "").toLowerCase();
    if (["ban", "kick", "timeout", "quarantine", "log"].includes(action)) {
      JOIN_RAID_CONFIG.triggerAction = action;
    }
  }
  if (typeof raw.triggerType === "string") {
    const triggerType = String(raw.triggerType || "").toLowerCase();
    if (["unique", "events"].includes(triggerType)) {
      JOIN_RAID_CONFIG.triggerType = triggerType;
    }
  }
  if (typeof raw.accountType === "string") {
    const accountType = String(raw.accountType || "").toLowerCase();
    if (
      ["any", "young", "no_pfp", "young_or_no_pfp", "id_flag"].includes(
        accountType,
      )
    ) {
      JOIN_RAID_CONFIG.accountType = accountType;
    }
  }
  if (typeof raw.punishOnActiveRaid === "boolean") {
    JOIN_RAID_CONFIG.punishOnActiveRaid = raw.punishOnActiveRaid;
  }
  JOIN_RAID_CONFIG.triggerCount = clamp(
    raw.triggerCount,
    1,
    500,
    JOIN_RAID_CONFIG.triggerCount,
  );
  JOIN_RAID_CONFIG.triggerWindowMs = clamp(
    raw.triggerWindowMs,
    10_000,
    24 * 60 * 60_000,
    JOIN_RAID_CONFIG.triggerWindowMs,
  );
  JOIN_RAID_CONFIG.raidDurationMs = clamp(
    raw.raidDurationMs,
    60_000,
    24 * 60 * 60_000,
    JOIN_RAID_CONFIG.raidDurationMs,
  );
  if (Array.isArray(raw.warnedRoleIds)) {
    const ids = raw.warnedRoleIds
      .map((x?) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 20);
    JOIN_RAID_CONFIG.warnedRoleIds = ids.length
      ? ids
      : [HIGH_STAFF_ROLE_ID].filter(Boolean);
  }
  Object.assign(JOIN_RAID_CONFIG.idFlag, raw.idFlag || {});
  Object.assign(JOIN_RAID_CONFIG.noPfpFlag, raw.noPfpFlag || {});
  Object.assign(JOIN_RAID_CONFIG.ageFlag, raw.ageFlag || {});
  JOIN_RAID_CONFIG.idFlag.enabled =
    typeof JOIN_RAID_CONFIG.idFlag.enabled === "boolean"
      ? JOIN_RAID_CONFIG.idFlag.enabled
      : true;
  JOIN_RAID_CONFIG.idFlag.categorization =
    typeof JOIN_RAID_CONFIG.idFlag.categorization === "string"
      ? String(JOIN_RAID_CONFIG.idFlag.categorization || "").toLowerCase()
      : "adaptive";
  if (
    !["static", "algorithm", "adaptive"].includes(
      JOIN_RAID_CONFIG.idFlag.categorization,
    )
  ) {
    JOIN_RAID_CONFIG.idFlag.categorization = "adaptive";
  }
  JOIN_RAID_CONFIG.idFlag.minimumMatches = clamp(
    JOIN_RAID_CONFIG.idFlag.minimumMatches,
    1,
    100,
    4,
  );
  JOIN_RAID_CONFIG.idFlag.compareWindowMs = clamp(
    JOIN_RAID_CONFIG.idFlag.compareWindowMs,
    60_000,
    24 * 60 * 60_000,
    3 * 60 * 60_000,
  );
  JOIN_RAID_CONFIG.idFlag.createdAtDeltaMs = clamp(
    JOIN_RAID_CONFIG.idFlag.createdAtDeltaMs,
    60_000,
    24 * 60 * 60_000,
    20 * 60_000,
  );
  JOIN_RAID_CONFIG.noPfpFlag.enabled =
    typeof JOIN_RAID_CONFIG.noPfpFlag.enabled === "boolean"
      ? JOIN_RAID_CONFIG.noPfpFlag.enabled
      : true;
  JOIN_RAID_CONFIG.ageFlag.enabled =
    typeof JOIN_RAID_CONFIG.ageFlag.enabled === "boolean"
      ? JOIN_RAID_CONFIG.ageFlag.enabled
      : true;
  JOIN_RAID_CONFIG.ageFlag.minimumAgeMs = clamp(
    JOIN_RAID_CONFIG.ageFlag.minimumAgeMs,
    60_000,
    365 * 24 * 60 * 60_000,
    3 * 24 * 60 * 60_000,
  );
}

function saveJoinRaidPersistentConfig() {
  return writeJsonSafe(JOIN_RAID_CONFIG_PATH, {
    enabled: Boolean(JOIN_RAID_CONFIG.enabled),
    lockCommands: Boolean(JOIN_RAID_CONFIG.lockCommands),
    triggerAction: String(JOIN_RAID_CONFIG.triggerAction || "log"),
    triggerType: String(JOIN_RAID_CONFIG.triggerType || "unique"),
    accountType: String(JOIN_RAID_CONFIG.accountType || "any"),
    punishOnActiveRaid: Boolean(JOIN_RAID_CONFIG.punishOnActiveRaid),
    triggerCount: Number(JOIN_RAID_CONFIG.triggerCount || 0),
    triggerWindowMs: Number(JOIN_RAID_CONFIG.triggerWindowMs || 0),
    raidDurationMs: Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
    warnedRoleIds: [
      ...new Set(
        (JOIN_RAID_CONFIG.warnedRoleIds || []).map(String).filter(Boolean),
      ),
    ],
    idFlag: { ...JOIN_RAID_CONFIG.idFlag },
    noPfpFlag: { ...JOIN_RAID_CONFIG.noPfpFlag },
    ageFlag: { ...JOIN_RAID_CONFIG.ageFlag },
  });
}

function getJoinRaidConfigSnapshot() {
  return JSON.parse(
    JSON.stringify({
      enabled: Boolean(JOIN_RAID_CONFIG.enabled),
      lockCommands: Boolean(JOIN_RAID_CONFIG.lockCommands),
      triggerAction: String(JOIN_RAID_CONFIG.triggerAction || "log"),
      triggerType: String(JOIN_RAID_CONFIG.triggerType || "unique"),
      accountType: String(JOIN_RAID_CONFIG.accountType || "any"),
      punishOnActiveRaid: Boolean(JOIN_RAID_CONFIG.punishOnActiveRaid),
      triggerCount: Number(JOIN_RAID_CONFIG.triggerCount || 0),
      triggerWindowMs: Number(JOIN_RAID_CONFIG.triggerWindowMs || 0),
      raidDurationMs: Number(JOIN_RAID_CONFIG.raidDurationMs || 0),
      warnedRoleIds: [
        ...new Set(
          (JOIN_RAID_CONFIG.warnedRoleIds || []).map(String).filter(Boolean),
        ),
      ],
      idFlag: { ...JOIN_RAID_CONFIG.idFlag },
      noPfpFlag: { ...JOIN_RAID_CONFIG.noPfpFlag },
      ageFlag: { ...JOIN_RAID_CONFIG.ageFlag },
    }),
  );
}

function setJoinRaidConfigSnapshot(rawConfig?) {
  try {
    applyPersistentJoinRaidConfig(rawConfig || {});
    const saved = saveJoinRaidPersistentConfig();
    if (!saved) return { ok: false, reason: "save_failed" };
    return { ok: true, config: getJoinRaidConfigSnapshot() };
  } catch {
    return { ok: false, reason: "apply_failed" };
  }
}

applyPersistentJoinRaidConfig(readJsonSafe(JOIN_RAID_CONFIG_PATH, null));

export = {
  JOIN_RAID_CONFIG,
  HIGH_STAFF_ROLE_ID,
  HIGH_STAFF_MENTION,
  getJoinRaidConfigSnapshot,
  setJoinRaidConfigSnapshot,
};

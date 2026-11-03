import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "src", "Caffè", "core", "officialPrefixDispatcher.ts");
const dst = path.join(__dirname, "..", "src", "shared", "prefix", "createOfficialPrefixDispatcher.ts");

let body = fs.readFileSync(src, "utf8");
const strip = [
  /^const path = require\("path"\).*?\r?\n/,
  /^const \{ readSnapshotWithMeta.*?snapshotStore"\);\r?\n/,
  /^const \{ registerShutdownFlush.*?shutdownCheckpoint"\);\r?\n/,
  /^const \{ applyDefaultFooterToEmbeds.*?defaultFooter"\);\r?\n/,
  /^const \{ checkPrefixPermission.*?commandPermissions"\);\r?\n/,
  /^const \{ buildCooldownErrorEmbed.*?commandErrorEmbeds"\);\r?\n/,
  /^const \{ buildErrorLogEmbed.*?errorLogEmbed"\);\r?\n/,
  /^const \{ showPrefixUsageGuide.*?prefixUsageGuide"\);\r?\n/,
  /^const IDs: any = require.*?Config\/ids"\);\r?\n/,
  /^const \{ getCentralChannel.*?commandUsageLogger"\);\r?\n/,
  /^const \{ EPHEMERAL_TTL_SHORT_MS.*?ephemeralMessageTtl"\);\r?\n/,
  /^const PREFIX_COOLDOWN_BYPASS_ROLE_ID = .*?\r?\n/,
  /^const PREFIX_PRECHECK_TIMEOUT_MS = .*?\r?\n/,
  /^const PREFIX_EXECUTION_TIMEOUT_MS = .*?\r?\n/,
  /^const COFFEE_PREFIX_COOLDOWN_MS = .*?\r?\n/,
  /^const prefixCooldownHitAt = new Map\(\);\r?\n/,
  /^const PREFIX_QUEUE_SNAPSHOT_PATH = .*?\r?\n/,
  /^const PREFIX_QUEUE_MAX_ITEMS_PER_LOCK = .*?\r?\n/,
  /^const PREFIX_QUEUE_MAX_AGE_MS = .*?\r?\n/,
];
for (const re of strip) body = body.replace(re, "");

body = body.replace(
  /export = \{ handleOfficialPrefixMessage, ensurePrefixQueueLoaded \};\s*$/m,
  "return { handleOfficialPrefixMessage, ensurePrefixQueueLoaded };\n}",
);
body = body.replace(/applyDefaultFooterToEmbeds\(/g, "finalizeOutgoingPayload(");
body = body.replace(/COFFEE_PREFIX_COOLDOWN_MS/g, "mapCooldownMs");
body = body.replace(/key: "coffee_prefix_queue"/g, "key: snapshotKey");
body = body.replace(
  /registerShutdownFlush\("coffee_prefix_queue"/g,
  "registerShutdownFlush(snapshotKey",
);

const header = `const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../recovery/snapshotStore") as typeof import("../recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../recovery/shutdownCheckpoint") as typeof import("../recovery/shutdownCheckpoint");
const { applyDefaultFooterToEmbeds } = require("../embeds/defaultFooter") as typeof import("../embeds/defaultFooter");
const { showPrefixUsageGuide } = require("./prefixUsageGuide") as typeof import("./prefixUsageGuide");
const { buildErrorLogEmbed } = require("../discord/errorLogEmbed") as typeof import("../discord/errorLogEmbed");
const { EPHEMERAL_TTL_SHORT_MS } = require("../utils/ephemeralMessageTtl") as typeof import("../utils/ephemeralMessageTtl");

/**
 * Shared official prefix engine (queue + permission precheck + execute).
 * @param {object} options
 */
function createOfficialPrefixDispatcher(options: Record<string, any> = {}) {
  const IDs = options.ids || {};
  const checkPrefixPermission = options.checkPrefixPermission;
  const getPrefixRequiredRoles = options.getPrefixRequiredRoles;
  const buildGlobalPermissionDeniedEmbed = options.buildGlobalPermissionDeniedEmbed;
  const buildGlobalChannelDeniedEmbed = options.buildGlobalChannelDeniedEmbed;
  const buildCooldownErrorEmbed = options.buildCooldownErrorEmbed;
  const buildBusyCommandErrorEmbed = options.buildBusyCommandErrorEmbed;
  const buildMissingArgumentsErrorEmbed = options.buildMissingArgumentsErrorEmbed;
  const buildInternalCommandErrorEmbed = options.buildInternalCommandErrorEmbed;
  const getCentralChannel = options.getCentralChannel;
  const finalizeOutgoingPayload =
    typeof options.finalizeOutgoingPayload === "function"
      ? options.finalizeOutgoingPayload
      : (payload?, guild?) => applyDefaultFooterToEmbeds(payload, guild);
  const PREFIX_COOLDOWN_BYPASS_ROLE_ID = options.cooldownBypassRoleId || null;
  const PREFIX_PRECHECK_TIMEOUT_MS = Math.max(1000, Number(options.precheckTimeoutMs || 4000));
  const PREFIX_EXECUTION_TIMEOUT_MS = Math.max(
    15_000,
    Number(options.executionTimeoutMs || process.env.PREFIX_EXECUTION_TIMEOUT_MS || 120_000),
  );
  const mapCooldownMs = Math.max(0, Number(options.mapCooldownMs || 0));
  const prefixCooldownHitAt = new Map();
  const snapshotKey = String(options.snapshotKey || "prefix_queue");
  const PREFIX_QUEUE_SNAPSHOT_PATH =
    options.snapshotPath ||
    path.join(String(options.botDataDir || process.cwd()), "prefixQueueSnapshot.json");
  const PREFIX_QUEUE_MAX_ITEMS_PER_LOCK = 100;
  const PREFIX_QUEUE_MAX_AGE_MS = 20 * 60 * 1000;

`;

fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, header + body + "\n\nexport = { createOfficialPrefixDispatcher };\n");
console.log("OK", dst, fs.statSync(dst).size);

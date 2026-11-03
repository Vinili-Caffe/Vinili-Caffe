/**
 * One-shot: move Vinili/Caffè Events into <Module>/events and Handlers into core/handlers.
 * Rewrites relative requires for moved files + known external consumers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "src");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function moveFile(from, to) {
  if (!fs.existsSync(from)) {
    console.warn("SKIP missing", path.relative(SRC, from));
    return false;
  }
  if (fs.existsSync(to)) {
    console.warn("SKIP exists", path.relative(SRC, to));
    return false;
  }
  ensureDir(path.dirname(to));
  fs.renameSync(from, to);
  console.log("MOVE", path.relative(SRC, from), "->", path.relative(SRC, to));
  return true;
}

/** Count path segments from botRoot to file dir */
function depthFromBot(botRoot, filePath) {
  const rel = path.relative(botRoot, path.dirname(filePath)).replace(/\\/g, "/");
  if (!rel || rel === ".") return 0;
  return rel.split("/").filter(Boolean).length;
}

function rewriteRequiresInFile(filePath, botRoot, oldFilePath) {
  let text = fs.readFileSync(filePath, "utf8");
  const oldDepth = depthFromBot(botRoot, oldFilePath);
  const newDepth = depthFromBot(botRoot, filePath);
  const delta = newDepth - oldDepth;
  if (delta === 0) return;

  const prefixUp = (n) => (n <= 0 ? "./" : "../".repeat(n));

  text = text.replace(
    /require\((["'])(\.\.[\/\\][^"']+)\1\)/g,
    (full, quote, relPath) => {
      const normalized = relPath.replace(/\\/g, "/");
      // Count leading ../
      let ups = 0;
      let rest = normalized;
      while (rest.startsWith("../")) {
        ups += 1;
        rest = rest.slice(3);
      }
      if (ups === 0) return full;
      const newUps = ups + delta;
      if (newUps < 0) return full;
      const rewritten = `${prefixUp(newUps)}${rest}`.replace(/\/+/g, "/");
      return `require(${quote}${rewritten}${quote})`;
    },
  );

  // Also rewrite typeof import("...") parallel annotations that mirror requires
  text = text.replace(
    /typeof import\((["'])(\.\.[\/\\][^"']+)\1\)/g,
    (full, quote, relPath) => {
      const normalized = relPath.replace(/\\/g, "/");
      let ups = 0;
      let rest = normalized;
      while (rest.startsWith("../")) {
        ups += 1;
        rest = rest.slice(3);
      }
      if (ups === 0) return full;
      const newUps = ups + delta;
      if (newUps < 0) return full;
      const rewritten = `${prefixUp(newUps)}${rest}`.replace(/\/+/g, "/");
      return `typeof import(${quote}${rewritten}${quote})`;
    },
  );

  fs.writeFileSync(filePath, text);
}

function toRequireRel(fromFile, targetAbs) {
  let rel = path.relative(path.dirname(fromFile), targetAbs).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.replace(/\.ts$/, "");
}

function rewriteExternalRefs(botRoot, replacements) {
  // replacements: [{ fromRel: 'Events/foo.ts', toRel: 'Community/events/foo.ts' }, ...]
  const byOldPosix = new Map();
  for (const { fromRel, toRel } of replacements) {
    const key = fromRel.replace(/\\/g, "/").replace(/\.ts$/, "");
    byOldPosix.set(key, path.join(botRoot, toRel));
  }

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === "archivio") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|js|mjs|cjs)$/i.test(ent.name)) continue;

      let text = fs.readFileSync(full, "utf8");
      let changed = false;

      text = text.replace(
        /(require|typeof import)\((["'])([^"']+)\2\)/g,
        (match, kind, quote, reqPath) => {
          const normalized = String(reqPath || "").replace(/\\/g, "/");
          if (!normalized.includes("/Events/") && !normalized.startsWith("../Events/") && !normalized.startsWith("./Events/")) {
            // also plain Events/ from bot root depth
            if (!/(^|\/)Events\//.test(normalized)) return match;
          }
          let resolved;
          try {
            resolved = path.resolve(path.dirname(full), normalized);
          } catch {
            return match;
          }
          // Strip extension for map lookup
          const relFromBot = path.relative(botRoot, resolved).replace(/\\/g, "/").replace(/\.(ts|js)$/i, "");
          // Try Events/... keys
          let targetAbs = byOldPosix.get(relFromBot);
          if (!targetAbs) {
            // If file already moved, resolved may point at missing Events path — match by suffix
            for (const [oldKey, abs] of byOldPosix.entries()) {
              if (relFromBot.endsWith(oldKey) || relFromBot === oldKey) {
                targetAbs = abs;
                break;
              }
              if (normalized.replace(/\\/g, "/").endsWith(oldKey) || normalized.replace(/\\/g, "/").includes("/" + oldKey)) {
                targetAbs = abs;
                break;
              }
            }
          }
          if (!targetAbs) return match;
          const nextRel = toRequireRel(full, targetAbs);
          if (nextRel === normalized.replace(/\.ts$/, "")) return match;
          changed = true;
          return `${kind}(${quote}${nextRel}${quote})`;
        },
      );

      if (changed) {
        fs.writeFileSync(full, text);
        console.log("REF", path.relative(botRoot, full));
      }
    }
  };
  walk(botRoot);
}

const VINILI_EVENT_MAP = {
  // core
  "ready.ts": "core/events/ready.ts",
  "clientError.ts": "core/events/clientError.ts",
  "interactionCreate.ts": "core/events/interactionCreate.ts",
  "interactionCreateCommandLogging.ts": "core/events/interactionCreateCommandLogging.ts",
  "prefixCommandLogging.ts": "core/events/prefixCommandLogging.ts",
  "voiceStateUpdate.ts": "core/events/voiceStateUpdate.ts",
  "interaction/buttonHandlers.ts": "core/events/interaction/buttonHandlers.ts",
  "interaction/commandHandlers.ts": "core/events/interaction/commandHandlers.ts",
  "interaction/commandUsageLogger.ts": "core/events/interaction/commandUsageLogger.ts",
  "interaction/interactionErrorHandler.ts": "core/events/interaction/interactionErrorHandler.ts",
  "interaction/interactionRuntimeGuards.ts": "core/events/interaction/interactionRuntimeGuards.ts",

  // Community
  "messageCreate.ts": "Community/events/messageCreate.ts",
  "messageUpdate.ts": "Community/events/messageUpdate.ts",
  "messageReactionAdd.ts": "Community/events/messageReactionAdd.ts",
  "presenceUpdate.ts": "Community/events/presenceUpdate.ts",
  "joinWelcome.ts": "Community/events/joinWelcome.ts",
  "joinInvites.ts": "Community/events/joinInvites.ts",
  "joinRecovery.ts": "Community/events/joinRecovery.ts",
  "joinRestore.ts": "Community/events/joinRestore.ts",
  "guildMemberAdd.ts": "Community/events/guildMemberAdd.ts",
  "guildMemberRemove.ts": "Community/events/guildMemberRemove.ts",
  "guildScheduledEventCreate.ts": "Community/events/guildScheduledEventCreate.ts",
  "guildScheduledEventUpdate.ts": "Community/events/guildScheduledEventUpdate.ts",
  "guildScheduledEventDelete.ts": "Community/events/guildScheduledEventDelete.ts",
  "stageInstanceDelete.ts": "Community/events/stageInstanceDelete.ts",
  "threadMembersUpdate.ts": "Community/events/threadMembersUpdate.ts",
  "interaction/customRoleHandlers.ts": "Community/events/interaction/customRoleHandlers.ts",
  "interaction/customRoleHelpers.ts": "Community/events/interaction/customRoleHelpers.ts",
  "interaction/customRoleGrants.ts": "Community/events/interaction/customRoleGrants.ts",
  "interaction/customRoleRequests.ts": "Community/events/interaction/customRoleRequests.ts",
  "interaction/customRolePending.ts": "Community/events/interaction/customRolePending.ts",

  // Moderation
  "autoModerationActionExecution.ts": "Moderation/events/autoModerationActionExecution.ts",
  "joinGateActions.ts": "Moderation/events/joinGateActions.ts",
  "joinSuspicious.ts": "Moderation/events/joinSuspicious.ts",
  "joinBots.ts": "Moderation/events/joinBots.ts",
  "messageDelete.ts": "Moderation/events/messageDelete.ts",
  "messageDeleteBulk.ts": "Moderation/events/messageDeleteBulk.ts",
  "guildBanAdd.ts": "Moderation/events/guildBanAdd.ts",
  "guildBanRemove.ts": "Moderation/events/guildBanRemove.ts",
  "channelCreate.ts": "Moderation/events/channelCreate.ts",
  "channelUpdate.ts": "Moderation/events/channelUpdate.ts",
  "channelDelete.ts": "Moderation/events/channelDelete.ts",
  "channelPinsUpdate.ts": "Moderation/events/channelPinsUpdate.ts",
  "roleCreate.ts": "Moderation/events/roleCreate.ts",
  "roleUpdate.ts": "Moderation/events/roleUpdate.ts",
  "roleDelete.ts": "Moderation/events/roleDelete.ts",
  "threadCreate.ts": "Moderation/events/threadCreate.ts",
  "threadUpdate.ts": "Moderation/events/threadUpdate.ts",
  "threadDelete.ts": "Moderation/events/threadDelete.ts",
  "guildUpdate.ts": "Moderation/events/guildUpdate.ts",
  "emojiCreate.ts": "Moderation/events/emojiCreate.ts",
  "emojiUpdate.ts": "Moderation/events/emojiUpdate.ts",
  "emojiDelete.ts": "Moderation/events/emojiDelete.ts",
  "stickerCreate.ts": "Moderation/events/stickerCreate.ts",
  "stickerUpdate.ts": "Moderation/events/stickerUpdate.ts",
  "stickerDelete.ts": "Moderation/events/stickerDelete.ts",
  "inviteDelete.ts": "Moderation/events/inviteDelete.ts",
  "userUpdate.ts": "Moderation/events/userUpdate.ts",
  "interaction/sanzionaHandlers.ts": "Moderation/events/interaction/sanzionaHandlers.ts",

  // Security
  "webhookUpdate.ts": "Security/events/webhookUpdate.ts",
  "inviteCreate.ts": "Security/events/inviteCreate.ts",
  "guildAuditLogEntryCreate.ts": "Security/events/guildAuditLogEntryCreate.ts",

  // Staff
  "interaction/resocontoHandlers.ts": "Staff/events/interaction/resocontoHandlers.ts",

  // Stats
  "interaction/topPaginationHandlers.ts": "Stats/events/interaction/topPaginationHandlers.ts",

  // MultiGuild
  "guildDelete.ts": "MultiGuild/events/guildDelete.ts",
};

const CAFFE_EVENT_MAP = {
  "ready.ts": "core/events/ready.ts",
  "interactionCreate.ts": "core/events/interactionCreate.ts",
  "interactionCreateCommandLogging.ts": "core/events/interactionCreateCommandLogging.ts",
  "prefixCommandLogging.ts": "core/events/prefixCommandLogging.ts",
  "interaction/buttonHandlers.ts": "core/events/interaction/buttonHandlers.ts",
  "interaction/commandUsageLogger.ts": "core/events/interaction/commandUsageLogger.ts",
  "messageCreate.ts": "Community/events/messageCreate.ts",
  "messageUpdate.ts": "Community/events/messageUpdate.ts",
  "voiceStateUpdate.ts": "Voice/events/voiceStateUpdate.ts",
  "channelUpdate.ts": "Voice/events/channelUpdate.ts",
};

const HANDLER_FILES = [
  "bootTablesHandler.ts",
  "buttonHandler.ts",
  "commandHandler.ts",
  "eventHandler.ts",
  "prefixHandler.ts",
  "processHandler.ts",
  "triggersHandler.ts",
];

function rewriteCrossEventRefs(botRoot, movedPairs) {
  // movedPairs: [{ oldAbs, newAbs }]
  const oldToNew = new Map();
  for (const { oldAbs, newAbs } of movedPairs) {
    oldToNew.set(path.resolve(oldAbs), path.resolve(newAbs));
    oldToNew.set(path.resolve(oldAbs).replace(/\.ts$/i, ".js"), path.resolve(newAbs));
  }

  for (const { newAbs } of movedPairs) {
    if (!fs.existsSync(newAbs)) continue;
    let text = fs.readFileSync(newAbs, "utf8");
    let changed = false;
    text = text.replace(
      /(require|typeof import)\((["'])([^"']+)\2\)/g,
      (match, kind, quote, reqPath) => {
        const normalized = String(reqPath || "");
        if (!normalized.startsWith(".")) return match;
        // Resolve as if still relative from new file — but we need resolve from OLD location
        // because rewriteRequiresInFile already adjusted ../ depths for leaving Events.
        // Prefer: find which old Events file this relative would have pointed to.
        const fromNew = path.resolve(path.dirname(newAbs), normalized);
        // Also try matching by basename among moved files when sibling broke
        let target = oldToNew.get(fromNew) || oldToNew.get(fromNew + ".ts") || oldToNew.get(fromNew + ".js");
        if (!target) {
          // Resolve using the OLD path of this file
          const pair = movedPairs.find((p) => path.resolve(p.newAbs) === path.resolve(newAbs));
          if (pair) {
            const fromOld = path.resolve(path.dirname(pair.oldAbs), normalized);
            // After depth rewrite, ../ counts changed — try stripping/adding
            target = oldToNew.get(fromOld) || oldToNew.get(fromOld + ".ts") || oldToNew.get(fromOld + ".js");
          }
        }
        if (!target) {
          // Basename fallback within Events moves (e.g. ./joinGateActions)
          const base = path.basename(normalized).replace(/\.(ts|js)$/i, "");
          const hits = movedPairs.filter(
            (p) => path.basename(p.oldAbs).replace(/\.ts$/i, "") === base,
          );
          if (hits.length === 1) target = path.resolve(hits[0].newAbs);
        }
        if (!target || path.resolve(target) === path.resolve(newAbs)) return match;
        const nextRel = toRequireRel(newAbs, target);
        if (nextRel === normalized.replace(/\.ts$/, "")) return match;
        changed = true;
        return `${kind}(${quote}${nextRel}${quote})`;
      },
    );
    if (changed) {
      fs.writeFileSync(newAbs, text);
      console.log("XREF", path.relative(botRoot, newAbs));
    }
  }
}

function smistaBot(botName, eventMap) {
  const botRoot = path.join(SRC, botName);
  const eventsRoot = path.join(botRoot, "Events");
  const replacements = [];
  const movedPairs = [];

  for (const [relFrom, relTo] of Object.entries(eventMap)) {
    const from = path.join(eventsRoot, relFrom);
    const to = path.join(botRoot, relTo);
    const oldPath = from;
    if (!fs.existsSync(from)) {
      console.warn("SKIP missing", path.relative(SRC, from));
      continue;
    }
    if (!moveFile(from, to)) continue;
    rewriteRequiresInFile(to, botRoot, oldPath);
    movedPairs.push({ oldAbs: oldPath, newAbs: to });
    replacements.push({
      fromRel: path.join("Events", relFrom).replace(/\\/g, "/"),
      toRel: relTo.replace(/\\/g, "/"),
    });
  }

  rewriteCrossEventRefs(botRoot, movedPairs);

  // Handlers → core/handlers, leave thin re-export in Handlers/
  for (const file of HANDLER_FILES) {
    const from = path.join(botRoot, "Handlers", file);
    const to = path.join(botRoot, "core", "handlers", file);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) continue;
    // Skip if already a thin wrapper
    const cur = fs.readFileSync(from, "utf8");
    if (/core\/handlers\//.test(cur) && cur.length < 200) continue;
    const oldPath = from;
    moveFile(from, to);
    rewriteRequiresInFile(to, botRoot, oldPath);
    const wrapper = `export = require("../core/handlers/${file.replace(/\.ts$/, "")}");\n`;
    fs.writeFileSync(from, wrapper);
    console.log("WRAP Handlers/" + file);
  }

  rewriteExternalRefs(botRoot, replacements);

  function rmEmpty(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) rmEmpty(path.join(dir, ent.name));
    }
    const left = fs.readdirSync(dir);
    if (left.length === 0) {
      fs.rmdirSync(dir);
      console.log("RMDIR", path.relative(botRoot, dir));
    }
  }
  rmEmpty(eventsRoot);
}

smistaBot("Vinili", VINILI_EVENT_MAP);
smistaBot("Caffè", CAFFE_EVENT_MAP);
console.log("DONE");

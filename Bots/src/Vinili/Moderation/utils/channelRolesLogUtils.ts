const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const format = require("../../../shared/logging/auditLogFormat") as typeof import("../../../shared/logging/auditLogFormat");

const {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  channelDisplay,
  channelTypeLabel,
  formatAuditActor,
  permissionList,
  permissionDiff,
  buildAuditExtraLines,
} = format;

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveChannelRolesLogChannel(guild?) {
  const channelId = IDs.channels?.channelRolesLogs || IDs.channels?.logCanaliRuoli || null;
  if (!guild || !channelId) return null;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.()) return null;
  return channel;
}

async function resolveResponsible(guild?, actionType?, matcher?) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return { executor: null, reason: null, entry: null };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: actionType, limit: 20 }).catch(() => null);
    if (!logs?.entries?.size) {
      if (attempt < 2) {
        await wait(700);
      }
      continue;
    }

    const now = Date.now();
    const candidates = [];
    logs.entries.forEach((item?) => {
      const created = Number(item?.createdTimestamp || 0);
      if (!created || now - created > 120 * 1000) return;

      let score = 1;
      if (typeof matcher === "function") {
        const result = matcher(item);
        if (!result) return;
        if (typeof result === "number" && Number.isFinite(result)) {
          score += result;
        } else {
          score += 3;
        }
      }

      score += Math.max(0, 120000 - (now - created)) / 120000;
      candidates.push({ item, score, created });
    });

    candidates.sort((a?, b?) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.created - a.created;
    });

    const entry = candidates[0]?.item || null;
    if (entry || attempt === 2) {
      return {
        executor: entry?.executor || null,
        reason: entry?.reason || null,
        entry,
      };
    }

    await wait(700);
  }

  return { executor: null, reason: null, entry: null };
}

export = {
  ARROW,
  toDiscordTimestamp,
  yesNo,
  channelDisplay,
  channelTypeLabel,
  formatAuditActor,
  permissionList,
  permissionDiff,
  buildAuditExtraLines,
  resolveChannelRolesLogChannel,
  resolveResponsible,
};

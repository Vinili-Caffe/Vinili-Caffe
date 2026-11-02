/** Community ops: rename canali/categorie con retry, gap e backoff Discord. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { categoryNumberingBotRenames, categoryRenameBackoffUntil } = require("./communityOpsRuntime") as typeof import("./communityOpsRuntime");

const VOICE_RENAME_GAP_MS = 1500;
const CATEGORY_RENAME_GAP_MS = 2500;
const CATEGORY_RENAME_BACKOFF_MS = 10 * 60 * 1000;

function markCategoryNumberingBotRename(channelId?, ttlMs = 10_000) {
  const id = String(channelId || "");
  if (!id) return;
  categoryNumberingBotRenames.set(id, Date.now() + Math.max(1000, Number(ttlMs || 0)));
}

function isCategoryNumberingBotRename(channelId?) {
  const id = String(channelId || "");
  if (!id) return false;
  const expiresAt = categoryNumberingBotRenames.get(id);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    categoryNumberingBotRenames.delete(id);
    return false;
  }
  return true;
}

function readDiscordRetryAfterMs(err?) {
  const raw = err?.rawError?.retry_after ?? err?.retryAfter ?? err?.retry_after;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n * 1000) : 0;
}

function memberHasManageChannels(me?) {
  if (!me) return false;
  try {
    return Boolean(me.permissions?.has(PermissionsBitField.Flags.ManageChannels));
  } catch {
    return false;
  }
}

async function resolveGuildMembersMe(guild?) {
  if (!guild?.members) return null;
  let me = guild.members.me;
  if (!me && typeof guild.members.fetchMe === "function") {
    me = await guild.members.fetchMe().catch(() => null);
  }
  if (!me?.id) return me;
  if (memberHasManageChannels(me)) return me;
  return guild.members.fetch(me.id, { force: true }).catch(() => me);
}

function pauseMs(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, ms));
}

async function renameChannelNameForNumbering(channel?, expectedName?, context = "") {
  if (!channel?.setName || !expectedName || channel.name === expectedName) return true;
  const channelId = String(channel.id || "");
  const backoffUntil = categoryRenameBackoffUntil.get(channelId) || 0;
  if (backoffUntil > Date.now()) return false;

  markCategoryNumberingBotRename(channel.id);
  const gapAfterSuccessMs = context === "category" ? CATEGORY_RENAME_GAP_MS : VOICE_RENAME_GAP_MS;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ok = await channel.setName(expectedName).then(() => true).catch((err?) => {
      const retryAfterMs = readDiscordRetryAfterMs(err);
      if (retryAfterMs > 0 && attempt < 3) return retryAfterMs;
      categoryRenameBackoffUntil.set(channelId, Date.now() + CATEGORY_RENAME_BACKOFF_MS);
      global.logger?.warn?.(
        "[CATEGORY NUMBERING] rename failed:",
        channel.id,
        channel.name,
        "->",
        expectedName,
        context,
        err?.code ?? err?.status ?? "",
        err?.message || err,
      );
      return false;
    });
    if (ok === true) {
      categoryRenameBackoffUntil.delete(channelId);
      await pauseMs(gapAfterSuccessMs);
      return true;
    }
    if (typeof ok === "number") {
      await pauseMs(ok + 500);
      continue;
    }
    return false;
  }
  return false;
}

async function renameVoiceChannelWithGap(channel?, expectedName?, context = "") {
  if (!channel?.manageable || !expectedName || channel.name === expectedName) {
    if (channel && expectedName && channel.name !== expectedName && !channel.manageable) {
      global.logger?.warn?.(
        "[CATEGORY NUMBERING] channel not manageable:",
        channel.id,
        channel.name,
        "->",
        expectedName,
        context,
      );
    }
    return false;
  }
  return renameChannelNameForNumbering(channel, expectedName, context);
}

export = {
  CATEGORY_RENAME_GAP_MS,
  isCategoryNumberingBotRename,
  pauseMs,
  renameChannelNameForNumbering,
  renameVoiceChannelWithGap,
  resolveGuildMembersMe,
};

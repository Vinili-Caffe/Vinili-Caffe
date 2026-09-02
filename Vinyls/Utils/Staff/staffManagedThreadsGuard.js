const { getStaffChatThreadIds, getStaffCmdsThreadIds } = require("../Global/globalSettingsBucket");
const {
  getStaffCmdsThreadIdsCache,
  staffCmdsChannelId,
  resolveStaffCmdsThreadSpecKeySync,
} = require("./staffCmdsChannelUtils");
const { staffChatChannelId } = require("./staffChatChannelUtils");
const { STAFF_CHAT_THREAD_SPECS, memberQualifiesForSpec: chatMemberQualifiesForSpec } = require("../../Services/Staff/staffChatThreadsService");
const { STAFF_CMDS_THREAD_SPECS, memberQualifiesForSpec: cmdsMemberQualifiesForSpec } = require("../../Services/Staff/staffCmdsThreadsService");
const {
  memberHasStaffThreadAccess,
  resolveStaffThreadQualifyingRoleIds,
} = require("./staffThreadQualification");

async function resolveManagedStaffThreadContext(channel) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return null;

  const parentId = String(channel.parentId || "");
  const threadId = String(channel.id);

  const chatParent = staffChatChannelId();
  if (chatParent && parentId === chatParent) {
    const ids = await getStaffChatThreadIds();
    for (const spec of STAFF_CHAT_THREAD_SPECS) {
      if (threadId === String(ids?.[spec.key] || "")) {
        return { zone: "chat", spec, memberQualifiesForSpec: chatMemberQualifiesForSpec };
      }
    }
    return null;
  }

  const cmdsParent = staffCmdsChannelId();
  if (!cmdsParent || parentId !== cmdsParent) return null;

  const cached = getStaffCmdsThreadIdsCache();
  let fetched = { pm: null, high: null };
  try {
    fetched = await getStaffCmdsThreadIds();
  } catch (_) {}
  const ids = {
    pm: cached.pm || fetched.pm || null,
    high: cached.high || fetched.high || null,
  };
  for (const spec of STAFF_CMDS_THREAD_SPECS) {
    if (threadId === String(ids?.[spec.key] || "")) {
      return { zone: "cmds", spec, memberQualifiesForSpec: cmdsMemberQualifiesForSpec };
    }
  }
  const specKey = resolveStaffCmdsThreadSpecKeySync(channel, ids);
  if (specKey) {
    const spec = STAFF_CMDS_THREAD_SPECS.find((s) => s.key === specKey);
    if (spec) return { zone: "cmds", spec, memberQualifiesForSpec: cmdsMemberQualifiesForSpec };
  }
  return null;
}

function buildAllowedStaffThreadMentionRoleIds(spec) {
  const allowed = new Set(resolveStaffThreadQualifyingRoleIds(spec));
  return allowed;
}

function areRoleMentionsAllowedForStaffThread(ctx, mentionedRoles) {
  if (!ctx?.spec || !mentionedRoles?.size) return false;
  const allowed = buildAllowedStaffThreadMentionRoleIds(ctx.spec);
  for (const role of mentionedRoles.values()) {
    if (!allowed.has(String(role.id))) return false;
  }
  return true;
}

function stripRoleMentionsFromContent(content, roleCollection) {
  let text = String(content || "");
  if (!roleCollection?.forEach) return text;
  for (const role of roleCollection.values()) {
    const ping = `<@&${role.id}>`;
    const plain = `@${role.name}`;
    text = text.split(ping).join(plain);
  }
  return text.replace(/\s+/g, " ").trim();
}

const DISCORD_MESSAGE_CONTENT_MAX = 2000;

function buildStaffThreadRepostContent(author, strippedBody) {
  const mention = author?.toString?.() || (author?.id ? `<@${author.id}>` : "");
  const body = String(strippedBody || "").trim();
  if (!mention) {
    return body.length <= DISCORD_MESSAGE_CONTENT_MAX
      ? body || undefined
      : `${body.slice(0, DISCORD_MESSAGE_CONTENT_MAX - 1)}…`;
  }
  if (!body) return mention;
  const prefix = `${mention} `;
  const maxBody = DISCORD_MESSAGE_CONTENT_MAX - prefix.length;
  if (maxBody <= 0) return mention.slice(0, DISCORD_MESSAGE_CONTENT_MAX);
  if (body.length <= maxBody) return `${prefix}${body}`;
  if (maxBody <= 1) return `${prefix}…`.slice(0, DISCORD_MESSAGE_CONTENT_MAX);
  return `${prefix}${body.slice(0, maxBody - 1)}…`;
}

function buildRoleMentionRepostPayload(message, content) {
  const attachments = [...(message.attachments?.values?.() || [])].map((item) => item.url).filter(Boolean);
  const stickers = [...(message.stickers?.values?.() || [])].map((item) => item.id).filter(Boolean);
  const embeds = [...(message.embeds || [])].filter((embed) => embed?.data || embed?.title || embed?.description);
  const safeContent = String(content || "");
  const payload = {
    content: safeContent
      ? safeContent.slice(0, DISCORD_MESSAGE_CONTENT_MAX) || undefined
      : undefined,
    allowedMentions: { parse: [] },
  };
  if (attachments.length) payload.files = attachments;
  if (stickers.length) payload.stickers = stickers;
  if (embeds.length) payload.embeds = embeds;
  return payload;
}

async function pruneUnauthorizedStaffThreadMembers(thread, ctx, addedMembers = null) {
  if (!thread?.members?.remove || !ctx?.spec || !thread.guild) return;
  const targets = [];

  if (addedMembers?.forEach) {
    for (const threadMember of addedMembers.values()) {
      const userId = String(threadMember?.id || threadMember?.user?.id || "").trim();
      if (/^\d{17,22}$/.test(userId)) targets.push(userId);
    }
  } else if (thread.members?.cache?.forEach) {
    for (const threadMember of thread.members.cache.values()) {
      const userId = String(threadMember?.id || threadMember?.user?.id || "").trim();
      if (/^\d{17,22}$/.test(userId)) targets.push(userId);
    }
  }

  for (const userId of targets) {
    const member = await thread.guild.members.fetch({ user: userId, force: true }).catch(() => null);
    if (!member || member.user?.bot) continue;
    const access = memberHasStaffThreadAccess(member, ctx.spec);
    if (access !== false) continue;
    await thread.members.remove(userId).catch(() => {});
  }
}

async function handleStaffManagedThreadRoleMentionMessage(message) {
  if (!message || message.author?.bot || message.system || message.webhookId) return false;
  if (!message.mentions?.roles?.size) return false;

  const ctx = await resolveManagedStaffThreadContext(message.channel);
  if (!ctx) return false;

  if (areRoleMentionsAllowedForStaffThread(ctx, message.mentions.roles)) {
            await pruneUnauthorizedStaffThreadMembers(message.channel, ctx, null);
    return false;
  }

  const stripped = stripRoleMentionsFromContent(message.content, message.mentions.roles);
  const repostBody = buildStaffThreadRepostContent(message.author, stripped);

  await message.delete().catch(() => {});

  if (stripped || message.attachments?.size || message.stickers?.size || message.embeds?.length) {
    await message.channel
      .send(buildRoleMentionRepostPayload(message, repostBody))
      .catch((err) => global.logger?.warn?.("[STAFF THREAD GUARD] Repost fallito:", err?.message || err));
  }

  await pruneUnauthorizedStaffThreadMembers(message.channel, ctx, null);
  return true;
}

module.exports = {
  resolveManagedStaffThreadContext,
  handleStaffManagedThreadRoleMentionMessage,
  pruneUnauthorizedStaffThreadMembers,
};

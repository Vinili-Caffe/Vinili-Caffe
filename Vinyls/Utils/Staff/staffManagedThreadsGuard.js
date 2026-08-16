const { getStaffChatThreadIds } = require("../Global/globalSettingsBucket");
const { getStaffCmdsThreadIds, getStaffCmdsThreadIdsCache } = require("../Staff/staffCmdsChannelUtils");
const { staffChatChannelId } = require("./staffChatChannelUtils");
const { staffCmdsChannelId } = require("./staffCmdsChannelUtils");
const { STAFF_CHAT_THREAD_SPECS, memberQualifiesForSpec: chatMemberQualifiesForSpec } = require("../../Services/Staff/staffChatThreadsService");
const { STAFF_CMDS_THREAD_SPECS, memberQualifiesForSpec: cmdsMemberQualifiesForSpec } = require("../../Services/Staff/staffCmdsThreadsService");
const IDs = require("../Config/ids");
const {
  memberHasStaffThreadAccess,
  resolveStaffThreadQualifyingRoleIds,
} = require("./staffThreadQualification");

/**
 * @param {import("discord.js").AnyThreadChannel} channel
 * @returns {Promise<{ zone: "chat" | "cmds", spec: object, memberQualifiesForSpec: Function } | null>}
 */
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
  const ids = cached.pm && cached.high ? cached : await getStaffCmdsThreadIds();
  for (const spec of STAFF_CMDS_THREAD_SPECS) {
    if (threadId === String(ids?.[spec.key] || "")) {
      return { zone: "cmds", spec, memberQualifiesForSpec: cmdsMemberQualifiesForSpec };
    }
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

function buildRoleMentionRepostPayload(message, content) {
  const attachments = [...(message.attachments?.values?.() || [])].map((item) => item.url).filter(Boolean);
  const stickers = [...(message.stickers?.values?.() || [])].map((item) => item.id).filter(Boolean);
  const embeds = [...(message.embeds || [])].filter((embed) => embed?.data || embed?.title || embed?.description);
  const payload = {
    content: content || undefined,
    allowedMentions: { parse: [] },
  };
  if (attachments.length) payload.files = attachments;
  if (stickers.length) payload.stickers = stickers;
  if (embeds.length) payload.embeds = embeds;
  return payload;
}

/**
 * Rimuove dal thread i membri che non appartengono al ruolo previsto per quel thread.
 * @param {import("discord.js").AnyThreadChannel} thread
 * @param {{ spec: object, memberQualifiesForSpec: Function }} ctx
 * @param {Iterable<import("discord.js").ThreadMember>} [addedMembers]
 */
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
    global.logger?.info?.(
      `[STAFF THREAD GUARD] Rimozione ${userId} da thread ${thread.id} (${ctx.zone}/${ctx.spec?.key || "?"})`,
    );
    await thread.members.remove(userId).catch(() => {});
  }
}

/**
 * Discord aggiunge automaticamente i membri di un ruolo menzionato nei thread privati.
 * Blocca solo menzioni di ruoli non previsti per quel thread (es. @Helper nel thread High Staff).
 * @param {import("discord.js").Message} message
 * @returns {Promise<boolean>} true se gestito
 */
async function handleStaffManagedThreadRoleMentionMessage(message) {
  if (!message || message.author?.bot || message.system || message.webhookId) return false;
  if (!message.mentions?.roles?.size) return false;

  const ctx = await resolveManagedStaffThreadContext(message.channel);
  if (!ctx) return false;

  if (areRoleMentionsAllowedForStaffThread(ctx, message.mentions.roles)) {
    // Discord aggiunge da solo i membri del ruolo pingato (es. @HighStaff):
    // ripulisci subito chi non dovrebbe stare in quel thread (es. Director con HS residuo).
    await pruneUnauthorizedStaffThreadMembers(message.channel, ctx, null);
    return false;
  }

  const stripped = stripRoleMentionsFromContent(message.content, message.mentions.roles);
  const repostBody = stripped
    ? `${message.author} ${stripped}`.trim()
    : `${message.author}`;

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

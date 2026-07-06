function parseProfilePanelOwnerIdFromCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (!String(parts[0] || "").startsWith("profile_panel")) return null;
  const ownerId = String(parts[2] || "");
  return /^\d{16,20}$/.test(ownerId) ? ownerId : null;
}

async function resolveProfileCommandTargetUserId(client, commandMessage) {
  if (!commandMessage?.author) return null;
  const mentioned = commandMessage.mentions?.users?.first?.();
  if (mentioned?.id) return String(mentioned.id);
  const content = String(commandMessage.content || "").trim();
  const parts = content.split(/\s+/);
  if (parts.length <= 1) return String(commandMessage.author.id);
  const raw = parts.slice(1).join(" ").trim();
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    const fetched = await client?.users?.fetch?.(id).catch(() => null);
    return fetched ? String(fetched.id) : String(commandMessage.author.id);
  }
  return String(commandMessage.author.id);
}

async function resolveProfilePanelControl(interaction, ownerIdFromCustomId = null) {
  const userId = String(interaction?.user?.id || "");
  if (!userId) return { ok: false, ownerId: ownerIdFromCustomId };

  const ownerFromCustomId =
    ownerIdFromCustomId || parseProfilePanelOwnerIdFromCustomId(interaction?.customId);
  if (ownerFromCustomId && userId === String(ownerFromCustomId)) {
    return { ok: true, ownerId: String(ownerFromCustomId) };
  }

  const refId = interaction?.message?.reference?.messageId;
  const channel = interaction?.channel;
  if (!refId || !channel?.messages?.fetch) {
    return { ok: false, ownerId: ownerFromCustomId || null };
  }

  const cmdMsg = await channel.messages.fetch(refId).catch(() => null);
  if (!cmdMsg || String(cmdMsg.author?.id || "") !== userId) {
    return { ok: false, ownerId: ownerFromCustomId || null };
  }

  const targetId = await resolveProfileCommandTargetUserId(interaction?.client, cmdMsg);
  if (targetId && userId === String(targetId)) {
    return { ok: true, ownerId: String(targetId) };
  }

  return { ok: false, ownerId: ownerFromCustomId || targetId || null };
}

module.exports = {
  parseProfilePanelOwnerIdFromCustomId,
  resolveProfileCommandTargetUserId,
  resolveProfilePanelControl,
};

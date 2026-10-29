function parseProfilePanelPartsFromCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (!String(parts[0] || "").startsWith("profile_panel")) {
    return { viewerId: null, ownerId: null };
  }
  const a = String(parts[2] || "");
  const b = String(parts[3] || "");
    if (/^\d{16,20}$/.test(a) && /^\d{16,20}$/.test(b)) {
    return { viewerId: a, ownerId: b };
  }
    if (/^\d{16,20}$/.test(a)) {
    return { viewerId: null, ownerId: a };
  }
  return { viewerId: null, ownerId: null };
}

function parseProfilePanelOwnerIdFromCustomId(customId?) {
  return parseProfilePanelPartsFromCustomId(customId).ownerId;
}

function parseProfilePanelViewerIdFromCustomId(customId?) {
  return parseProfilePanelPartsFromCustomId(customId).viewerId;
}

async function resolveProfileCommandTargetUserId(client?, commandMessage?) {
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

async function resolveProfilePanelControl(interaction?, ownerIdFromCustomId = null) {
  const userId = String(interaction?.user?.id || "");
  if (!userId) {
    return { ok: false, ownerId: ownerIdFromCustomId || null, canManage: false };
  }

  const parsed = parseProfilePanelPartsFromCustomId(interaction?.customId);
  const profileOwnerId = ownerIdFromCustomId || parsed.ownerId;
  const profileOwner = profileOwnerId ? String(profileOwnerId) : null;
  const viewerId = parsed.viewerId ? String(parsed.viewerId) : null;

  if (profileOwner && userId === profileOwner) {
    return { ok: true, ownerId: profileOwner, canManage: true };
  }

    if (viewerId && userId === viewerId) {
    return {
      ok: true,
      ownerId: profileOwner || userId,
      canManage: Boolean(profileOwner && profileOwner === userId),
    };
  }

  const refId = interaction?.message?.reference?.messageId;
  const channel = interaction?.channel;
  if (!refId || !channel?.messages?.fetch) {
    return { ok: false, ownerId: profileOwner, canManage: false };
  }

  const cmdMsg = await channel.messages.fetch(refId).catch(() => null);
  if (cmdMsg && String(cmdMsg.author?.id || "") === userId) {
    return {
      ok: true,
      ownerId: profileOwner || userId,
      canManage: Boolean(profileOwner && profileOwner === userId),
    };
  }

  return { ok: false, ownerId: profileOwner, canManage: false };
}

export = {
  parseProfilePanelOwnerIdFromCustomId,
  parseProfilePanelViewerIdFromCustomId,
  parseProfilePanelPartsFromCustomId,
  resolveProfileCommandTargetUserId,
  resolveProfilePanelControl,
};

/** Chat del workflow: nome, avatar e ruolo di chi scrive. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { guildMemberDisplayAvatarUrlStatic, userAvatarUrlStatic, discordDefaultAvatarUrl, accountUsername } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { resolveStaffProfileDisplayRoleId } = require("../../Staff/utils/staffProfilePanelRuntime") as typeof import("../../Staff/utils/staffProfilePanelRuntime");
const { stripDiscordDecorations } = require("../staff/siteStaffRosterCache") as typeof import("../staff/siteStaffRosterCache");

async function resolveMainGuild(client?) {
  const guildId = String(IDs.guilds.main || "").trim();
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

function avatarForMember(member?) {
  return (
    guildMemberDisplayAvatarUrlStatic(member, { size: 128 }) ||
    userAvatarUrlStatic(member?.user, { size: 128 }) ||
    userAvatarUrlStatic(member, { size: 128 }) ||
    discordDefaultAvatarUrl(member?.user || member, { size: 128 }) ||
    ""
  );
}

async function resolveAuthorAvatarUrl(client?, member?) {
  let url = avatarForMember(member);
  if (url && !/embed\/avatars\//.test(url)) return url;
  const uid = String(member?.id || member?.user?.id || "").trim();
  if (!uid || !/^\d{17,20}$/.test(uid)) return url || "";
  try {
    const cached = client?.users?.cache?.get?.(uid) || null;
    const user = cached || (await client.users.fetch(uid).catch(() => null));
    if (user) {
      const fresh =
        guildMemberDisplayAvatarUrlStatic(member, { size: 128 }) ||
        userAvatarUrlStatic(user, { size: 128 }) ||
        "";
      if (fresh && !/embed\/avatars\//.test(fresh)) return fresh;
    }
  } catch (_) {}
  return avatarForMember(member);
}

async function loadAuthorAvatarOverrides(client?, docs?) {
  const need = new Set();
  for (const d of docs || []) {
    const id = String(d?.authorId || "").trim();
    if (!id || id === "system") continue;
    const stored = String(d?.authorAvatarUrl || "").trim();
    if (!stored || /embed\/avatars\//.test(stored)) need.add(id);
  }
  if (!need.size) return new Map();
  const out = new Map();
  await Promise.all(
    [...need].map(async (id?) => {
      try {
        const user = client?.users?.cache?.get?.(id) || (await client.users.fetch(id).catch(() => null));
        if (!user) return;
        const url = userAvatarUrlStatic(user, { size: 128 }) || discordDefaultAvatarUrl(user, { size: 128 });
        if (url) out.set(id, url);
      } catch (_) {}
    }),
  );
  return out;
}

async function loadAuthorRoleOverrides(guild?, docs?) {
  const out = new Map();
  const need = new Set();
  for (const d of docs || []) {
    const id = String(d?.authorId || "").trim();
    if (!id || id === "system") continue;
    if (String(d?.authorKind || "staff").toLowerCase() !== "staff") continue;
    if (String(d?.authorRoleLabel || "").trim()) continue;
    need.add(id);
  }
  if (!need.size || !guild?.members) return out;
  await Promise.all(
    [...need].map(async (uid?) => {
      try {
        const member =
          guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
        if (!member) return;
        const label = authorRoleLabelForMember(member, "staff");
        if (label) out.set(uid, label);
      } catch (_) {}
    }),
  );
  return out;
}

function displayNameForMember(member?) {
  return String(
    member?.displayName || member?.user?.globalName || member?.user?.username || accountUsername(member?.user) || "",
  ).trim();
}

function authorRoleLabelForMember(member?, authorKind?) {
  const kind = String(authorKind || "").toLowerCase();
  if (kind === "system") return "Sistema";
  if (kind === "user") return "";
  try {
    const roleId = resolveStaffProfileDisplayRoleId(member);
    if (roleId) {
      const role =
        member?.roles?.cache?.get?.(String(roleId)) ||
        member?.guild?.roles?.cache?.get?.(String(roleId)) ||
        null;
      const cleaned = stripDiscordDecorations(role?.name || "") || String(role?.name || "").trim();
      if (cleaned) return cleaned.slice(0, 48);
    }
  } catch (_) {}
  return "Staff";
}

export = { resolveMainGuild, resolveAuthorAvatarUrl, loadAuthorAvatarOverrides, loadAuthorRoleOverrides, displayNameForMember, authorRoleLabelForMember };

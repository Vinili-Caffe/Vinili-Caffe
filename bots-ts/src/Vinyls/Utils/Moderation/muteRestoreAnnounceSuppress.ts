const DEFAULT_RESTORE_ANNOUNCE_SUPPRESS_MS = 90_000;
const muteRestoreAnnounceSuppressByMember = new Map();

function memberSuppressKey(guildId?, userId?) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function cleanupMuteRestoreAnnounceSuppress(now = Date.now()) {
  for (const [key, entry] of muteRestoreAnnounceSuppressByMember.entries()) {
    if (!entry || now >= Number(entry.until || 0)) muteRestoreAnnounceSuppressByMember.delete(key);
  }
}

function isSocialRoleAnnounceGloballySuppressed() {
  return String(process.env.VC_SUPPRESS_SOCIAL_ROLE_ANNOUNCES || "").trim() === "1";
}

function registerMuteMirrorRestoreRoleSuppress(guildId?, userId?, roleIds?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  const ids = (Array.isArray(roleIds) ? roleIds : [])
    .map((x?) => String(x || "").trim())
    .filter(Boolean);
  if (!ids.length) return;
  const now = Date.now();
  cleanupMuteRestoreAnnounceSuppress(now);
  const ttlMs = Math.max(
    1000,
    Number(opts.ttlMs || DEFAULT_RESTORE_ANNOUNCE_SUPPRESS_MS) || DEFAULT_RESTORE_ANNOUNCE_SUPPRESS_MS,
  );
  const key = memberSuppressKey(gid, uid);
  const prev = muteRestoreAnnounceSuppressByMember.get(key);
  const merged = new Set(prev?.roleIds instanceof Set ? [...prev.roleIds] : []);
  for (const id of ids) merged.add(id);
  muteRestoreAnnounceSuppressByMember.set(key, {
    until: now + ttlMs,
    roleIds: merged,
  });
}

function registerBulkRoleRestoreAnnounceSuppress(guildId?, userId?, roleIds?, opts: Record<string, any> = {}) {
  registerMuteMirrorRestoreRoleSuppress(guildId, userId, roleIds, {
    ttlMs: opts.ttlMs || 7 * 24 * 60 * 60 * 1000,
  });
}

function wasRoleRestoredByMuteMirror(guildId?, userId?, roleId?) {
  if (isSocialRoleAnnounceGloballySuppressed()) return true;
  const rid = String(roleId || "").trim();
  if (!rid) return false;
  const now = Date.now();
  cleanupMuteRestoreAnnounceSuppress(now);
  const entry = muteRestoreAnnounceSuppressByMember.get(memberSuppressKey(guildId, userId));
  if (!entry || now >= Number(entry.until || 0)) return false;
  return entry.roleIds instanceof Set && entry.roleIds.has(rid);
}

export = {
  DEFAULT_RESTORE_ANNOUNCE_SUPPRESS_MS,
  registerMuteMirrorRestoreRoleSuppress,
  registerBulkRoleRestoreAnnounceSuppress,
  isSocialRoleAnnounceGloballySuppressed,
  wasRoleRestoredByMuteMirror,
};

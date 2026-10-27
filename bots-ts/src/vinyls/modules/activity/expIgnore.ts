/** Canali/ruoli ignorati per EXP — CSV env. */
export function ignoredChannelIds(): Set<string> {
  return new Set(
    String(process.env.VC_TS_EXP_IGNORE_CHANNELS || "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function ignoredRoleIds(): Set<string> {
  return new Set(
    String(process.env.VC_TS_EXP_IGNORE_ROLES || "")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function shouldIgnoreExp(opts: {
  channelId?: string | null;
  roleIds?: string[];
}): boolean {
  if (opts.channelId && ignoredChannelIds().has(opts.channelId)) return true;
  const roles = ignoredRoleIds();
  if (roles.size && opts.roleIds?.some((id) => roles.has(id))) return true;
  return false;
}

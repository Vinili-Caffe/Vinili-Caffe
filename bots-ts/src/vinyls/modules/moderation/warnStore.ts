import {
  addCase,
  clearCasesOfType,
  listCasesForUser,
  type ModCase,
} from "./modCaseStore";

/** Compat thin: warn → ModCase type=warn. */
export interface WarnEntry {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  at: number;
}

function asWarn(c: ModCase): WarnEntry {
  return {
    id: c.id,
    guildId: c.guildId,
    userId: c.userId,
    moderatorId: c.moderatorId,
    reason: c.reason,
    at: c.at,
  };
}

export function addWarn(entry: Omit<WarnEntry, "id" | "at"> & { at?: number }): WarnEntry {
  return asWarn(
    addCase({
      guildId: entry.guildId,
      userId: entry.userId,
      moderatorId: entry.moderatorId,
      type: "warn",
      reason: entry.reason,
      at: entry.at,
    }),
  );
}

export function listWarns(guildId: string, userId: string): WarnEntry[] {
  return listCasesForUser(guildId, userId, "warn").map(asWarn);
}

export function clearWarns(guildId: string, userId: string): number {
  return clearCasesOfType(guildId, userId, "warn");
}

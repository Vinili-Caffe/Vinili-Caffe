import { getDb, isMongoConnected, TS_COLLECTIONS } from "../../../shared/mongo";
import { logger } from "../../../shared";

export interface GuildSetupState {
  guildId: string;
  modlogChannelId: string | null;
  levelUpChannelId: string | null;
  verifyRoleId: string | null;
  joinGateRoleId: string | null;
  updatedAt: number;
}

const store = new Map<string, GuildSetupState>();

export function getGuildSetup(guildId: string): GuildSetupState {
  let s = store.get(guildId);
  if (!s) {
    s = {
      guildId,
      modlogChannelId: process.env.VC_TS_MODLOG_CHANNEL || null,
      levelUpChannelId: process.env.VC_TS_LEVEL_UP_CHANNEL || null,
      verifyRoleId: process.env.VC_TS_VERIFY_ROLE || null,
      joinGateRoleId: process.env.VC_TS_JOIN_GATE_ROLE || null,
      updatedAt: Date.now(),
    };
    store.set(guildId, s);
  }
  return { ...s };
}

export function patchGuildSetup(
  guildId: string,
  patch: Partial<Omit<GuildSetupState, "guildId">>,
): GuildSetupState {
  const cur = getGuildSetup(guildId);
  const next: GuildSetupState = {
    ...cur,
    ...patch,
    guildId,
    updatedAt: Date.now(),
  };
  store.set(guildId, next);
  if (isMongoConnected()) {
    void getDb()
      ?.collection("bots_ts_guild_setup")
      .updateOne(
        { guildId },
        { $set: next, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      )
      .catch((err) => logger.warn("[setup] mongo", err));
  }
  // apply to process env for modules that read env (best-effort session)
  if (patch.modlogChannelId) process.env.VC_TS_MODLOG_CHANNEL = patch.modlogChannelId;
  if (patch.levelUpChannelId) process.env.VC_TS_LEVEL_UP_CHANNEL = patch.levelUpChannelId;
  if (patch.verifyRoleId) process.env.VC_TS_VERIFY_ROLE = patch.verifyRoleId;
  if (patch.joinGateRoleId) process.env.VC_TS_JOIN_GATE_ROLE = patch.joinGateRoleId;
  return next;
}

void TS_COLLECTIONS;

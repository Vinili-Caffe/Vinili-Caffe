import type { Client, Message } from "discord.js";
import { logger } from "../../../shared";
import { getDb, isMongoConnected, TS_COLLECTIONS } from "../../../shared/mongo";
import { registerPrefixCommand } from "../../prefix/registry";
import { mstatsCommand, rankCommand } from "./commands";
import { bumpGuildMessageCount } from "./counters";
import { flushExpToMongo, hydrateExpFromMongo, tryAwardMessageExp } from "./exp";
import { shouldIgnoreExp } from "./expIgnore";
import { registerLevelUpAnnounce } from "./levelUp";
import { registerVoiceActivity } from "./voice";

export { getGuildMessageCount } from "./counters";
export {
  getLevelInfo,
  getUserExpStats,
  getUserRank,
  listTopExp,
  MESSAGE_EXP,
  VOICE_EXP_PER_MINUTE,
} from "./exp";

/**
 * Activity + EXP: memory, voice tick, optional `bots_ts_*` mongo.
 * Non scrive ActivityUserProfile / GuildHourly del JS live.
 */
const dirtyHours = new Map<string, number>();

function hourKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}${m}${day}${h}`;
}

function bumpDirty(guildId: string): void {
  if (!isMongoConnected()) return;
  const k = `${guildId}:${hourKey()}`;
  dirtyHours.set(k, (dirtyHours.get(k) || 0) + 1);
}

async function flushHourly(): Promise<void> {
  if (!dirtyHours.size || !isMongoConnected()) return;
  const database = getDb();
  if (!database) return;
  const col = database.collection(TS_COLLECTIONS.activityHourly);
  const entries = [...dirtyHours.entries()];
  dirtyHours.clear();
  for (const [composite, delta] of entries) {
    const idx = composite.indexOf(":");
    const guildId = composite.slice(0, idx);
    const hk = composite.slice(idx + 1);
    if (!guildId || !hk) continue;
    try {
      await col.updateOne(
        { guildId, hourKey: hk },
        {
          $inc: { messages: delta },
          $set: { updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    } catch (err) {
      logger.error("[activity] flush hour", err);
      dirtyHours.set(composite, (dirtyHours.get(composite) || 0) + delta);
    }
  }
}

export async function registerActivityModule(client: Client): Promise<void> {
  await hydrateExpFromMongo();

  registerPrefixCommand(rankCommand);
  registerPrefixCommand(mstatsCommand);
  registerVoiceActivity(client);
  registerLevelUpAnnounce(client);

  client.on("messageCreate", (message: Message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (message.content.startsWith(process.env.BOT_PREFIX || "+")) return;
      bumpGuildMessageCount(message.guild.id);
      bumpDirty(message.guild.id);
      const roleIds = message.member?.roles.cache.map((r) => r.id) || [];
      if (
        shouldIgnoreExp({
          channelId: message.channel.id,
          roleIds,
        })
      ) {
        return;
      }
      tryAwardMessageExp(message.guild.id, message.author.id);
    } catch (err) {
      logger.error("[activity] tick", err);
    }
  });

  const flushMs = Math.max(5_000, Number(process.env.VC_TS_ACTIVITY_FLUSH_MS) || 30_000);
  const timer = setInterval(() => {
    void flushHourly();
    void flushExpToMongo();
  }, flushMs);
  timer.unref?.();

  const mode = isMongoConnected()
    ? "memory+mongo bots_ts_activity_hourly/user_exp"
    : "in-memory only";
  logger.info(`[activity] module on (${mode}; +rank/+mstats; voice EXP)`);
}

export async function flushActivityNow(): Promise<void> {
  await flushHourly();
  await flushExpToMongo();
}

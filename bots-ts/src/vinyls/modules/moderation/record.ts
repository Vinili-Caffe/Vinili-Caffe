import type { Message } from "discord.js";
import { addCase, type ModCase, type ModCaseType } from "./modCaseStore";
import { logModCase } from "./modlog";

/** Helper: crea caso + modlog in un colpo. */
export async function recordModAction(
  message: Message,
  opts: {
    type: ModCaseType;
    userId: string;
    reason: string;
    durationMs?: number;
    targetTag?: string;
  },
): Promise<ModCase> {
  const guild = message.guild!;
  const c = addCase({
    guildId: guild.id,
    userId: opts.userId,
    moderatorId: message.author.id,
    type: opts.type,
    reason: opts.reason,
    durationMs: opts.durationMs,
    context: {
      channelId: message.channel.id,
      messageId: message.id,
    },
  });
  await logModCase(c, opts.targetTag);
  return c;
}

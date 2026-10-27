import type { Client, VoiceBasedChannel, VoiceState } from "discord.js";
import { logger } from "../../../shared";
import { awardVoiceMinute } from "./exp";

/**
 * Voice EXP: 1 tick/minuto se in canale vocale non-AFK, non server-deaf, ≥2 umani.
 */
const joinedAt = new Map<string, number>();
const accruedMs = new Map<string, number>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function isEligible(state: VoiceState): boolean {
  const ch = state.channel;
  if (!ch || ch.id === state.guild.afkChannelId) return false;
  if (state.deaf || state.serverDeaf) return false;
  if (state.member?.user.bot) return false;
  const humans = ch.members.filter((m) => !m.user.bot);
  return humans.size >= 2;
}

function applyState(state: VoiceState): void {
  const k = key(state.guild.id, state.id);
  if (isEligible(state)) {
    if (!joinedAt.has(k)) joinedAt.set(k, Date.now());
  } else {
    joinedAt.delete(k);
    accruedMs.delete(k);
  }
}

function refreshChannel(ch: VoiceBasedChannel | null | undefined): void {
  if (!ch) return;
  for (const m of ch.members.values()) {
    applyState(m.voice);
  }
}

export function registerVoiceActivity(client: Client): void {
  client.on("voiceStateUpdate", (before: VoiceState, after: VoiceState) => {
    try {
      if (before.channelId && before.channelId !== after.channelId) {
        joinedAt.delete(key(before.guild.id, before.id));
        accruedMs.delete(key(before.guild.id, before.id));
      }
      refreshChannel(before.channel);
      refreshChannel(after.channel);
      applyState(after);
    } catch (err) {
      logger.error("[activity/voice] state", err);
    }
  });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, since] of [...joinedAt.entries()]) {
      const elapsed = now - since + (accruedMs.get(k) || 0);
      const minutes = Math.floor(elapsed / 60_000);
      if (minutes < 1) {
        accruedMs.set(k, elapsed);
        joinedAt.set(k, now);
        continue;
      }
      const rem = elapsed - minutes * 60_000;
      accruedMs.set(k, rem);
      joinedAt.set(k, now);
      const sep = k.indexOf(":");
      const guildId = k.slice(0, sep);
      const userId = k.slice(sep + 1);
      if (!guildId || !userId) continue;
      for (let i = 0; i < minutes; i += 1) awardVoiceMinute(guildId, userId);
    }
  }, 30_000);
  timer.unref?.();

  logger.info("[activity/voice] tick on (EXP/min se ≥2 umani, non deaf/AFK)");
}

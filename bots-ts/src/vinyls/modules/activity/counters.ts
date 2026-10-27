const messageCounts = new Map<string, number>();

export function bumpGuildMessageCount(guildId: string): number {
  const n = (messageCounts.get(guildId) || 0) + 1;
  messageCounts.set(guildId, n);
  return n;
}

export function getGuildMessageCount(guildId: string): number {
  return messageCounts.get(guildId) || 0;
}

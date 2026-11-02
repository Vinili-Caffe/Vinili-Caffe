/** Scan canale compito settimanale: messaggi attivi per utente (usato dai reward reviewer). */
const COMPITO_SETTIMANALE_REASON = "Compito settimanale completato.";
const CHANNEL_SCAN_PAGE = 100;
const CHANNEL_SCAN_MAX = 1500;

function parseCompitoValutazioneMessage(message?) {
  if (!message) return null;
  const embed = message.embeds?.[0];
  if (!embed) return null;
  const title = String(embed.title || "");
  if (/RIMOSSA/i.test(title)) return null;
  const blob = [
    title,
    String(embed.description || ""),
    ...(Array.isArray(embed.fields)
      ? embed.fields.flatMap((field?) => [String(field?.name || ""), String(field?.value || "")])
      : []),
  ].join("\n");
  if (!blob.includes(COMPITO_SETTIMANALE_REASON)) return null;
  const content = String(message.content || "");
  const mention = content.match(/<@!?(\d{17,20})>/);
  const userId = mention ? String(mention[1]) : null;
  if (!userId) return null;
  return {
    userId,
    messageId: String(message.id || ""),
    createdAt: Number(message.createdTimestamp || 0),
  };
}

async function collectActiveCompitoMessagesFromChannel(channel?, sinceMs = 0) {
  const byUser = new Map();
  if (!channel?.messages?.fetch) return byUser;

  let before = null;
  let scanned = 0;
  while (scanned < CHANNEL_SCAN_MAX) {
    const batch = await channel.messages
      .fetch({
        limit: CHANNEL_SCAN_PAGE,
        ...(before ? { before } : {}),
      })
      .catch(() => null);
    if (!batch?.size) break;

    for (const message of batch.values()) {
      scanned += 1;
      const created = Number(message.createdTimestamp || 0);
      if (sinceMs && created && created < sinceMs) continue;
      const parsed = parseCompitoValutazioneMessage(message);
      if (!parsed?.messageId) continue;
      if (!byUser.has(parsed.userId)) byUser.set(parsed.userId, []);
      byUser.get(parsed.userId).push(parsed);
    }

    const oldest = batch.last();
    if (sinceMs && oldest && Number(oldest.createdTimestamp || 0) < sinceMs) break;
    before = oldest?.id || null;
    if (!before || batch.size < CHANNEL_SCAN_PAGE) break;
  }

  for (const entries of byUser.values()) {
    entries.sort((a?, b?) => a.createdAt - b.createdAt || a.messageId.localeCompare(b.messageId));
  }
  return byUser;
}

export = {
  COMPITO_SETTIMANALE_REASON,
  collectActiveCompitoMessagesFromChannel,
};

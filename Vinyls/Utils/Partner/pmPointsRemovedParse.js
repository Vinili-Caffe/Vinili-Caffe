function stripEmojiPrefix(line) {
  return String(line || "").replace(/^<a?:[\w~]+:\d+>\s*/, "").trim();
}

function extractUserId(line) {
  const m = String(line || "").match(/<@!?(\d{16,22})>/);
  return m?.[1] || null;
}

function parseReviewButtonIds(components) {
  const rows = Array.isArray(components) ? components : [];
  for (const row of rows) {
    const comps = Array.isArray(row?.components) ? row.components : Array.isArray(row?.data?.components) ? row.data.components : [];
    for (const c of comps) {
      const cid = String(c?.customId || c?.custom_id || "");
      const m = cid.match(/^partner_pt_(ok|no):(\d{16,22}):(\d{16,22})$/);
      if (m) return { pmUserId: m[2], reporterUserId: m[3] };
    }
  }
  return null;
}

function hasActiveReviewButtons(components) {
  const rows = Array.isArray(components) ? components : [];
  for (const row of rows) {
    const comps = Array.isArray(row?.components) ? row.components : Array.isArray(row?.data?.components) ? row.data.components : [];
    for (const c of comps) {
      if (c?.disabled) continue;
      const cid = String(c?.customId || c?.custom_id || "");
      if (cid.startsWith("partner_pt_ok:") || cid.startsWith("partner_pt_no:")) return true;
    }
  }
  return false;
}

function resolveEntryStatus(content, components) {
  const text = String(content || "");
  if (/Segnalazione \*\*negata\*\*/i.test(text) || /:cancel:.*negata/i.test(text)) return "denied";
  if (/Rimozione \*\*confermata\*\*/i.test(text) || /:success:.*confermata/i.test(text)) return "confirmed";
  if (/In attesa di conferma High Staff/i.test(text) || hasActiveReviewButtons(components)) return "pending";
  return "logged";
}

function parsePuntiToltiDiscordMessage(message, guildId, channelId) {
  const content = String(message?.content || "");
  if (!content.trim()) return null;

  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  let i = 0;
  if (/^<@&\d{16,22}>$/.test(lines[0] || "")) i += 1;
  if (!lines[i]) return null;

  const pmUserId = extractUserId(lines[i]);
  if (!pmUserId) return null;

  const rule = stripEmojiPrefix(lines[i + 1] || "");
  let messageLink = null;
  let invite = null;
  let reporterUserId = null;
  let actorUserId = null;

  for (let j = i + 2; j < lines.length; j += 1) {
    const line = lines[j];
    if (/Messaggio:/i.test(line)) {
      const linkMatch = line.match(/https:\/\/discord\.com\/channels\/[^\s>]+/);
      messageLink = linkMatch?.[0] || null;
    } else if (/Invite:/i.test(line)) {
      invite = stripEmojiPrefix(line).replace(/^Invite:\s*/i, "").trim();
    } else if (/Segnalato da:/i.test(line)) {
      reporterUserId = extractUserId(line);
    } else if (/Rimosso da:/i.test(line)) {
      actorUserId = extractUserId(line);
    }
  }

  const buttonIds = parseReviewButtonIds(message?.components);
  const status = resolveEntryStatus(content, message?.components);

  return {
    discordMessageId: String(message.id || ""),
    discordChannelId: String(channelId || ""),
    createdAt: message.createdAt ? new Date(message.createdAt) : new Date(),
    pmUserId,
    rule,
    messageLink,
    invite: invite && invite !== "N/D" ? invite : null,
    reporterUserId: reporterUserId || buttonIds?.reporterUserId || null,
    actorUserId,
    status,
    source: reporterUserId || buttonIds?.reporterUserId ? "report" : "backfill",
    guildId: String(guildId || ""),
  };
}

module.exports = {
  parsePuntiToltiDiscordMessage,
};

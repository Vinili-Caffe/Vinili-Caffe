/** Repost: clip vocali e quote (chi è l'autore vero). */
function resolveQuotedAuthorIdFromQuoteMessage(targetMessage?) {
  const embeds = Array.isArray(targetMessage?.embeds) ? targetMessage.embeds : [];
  for (const emb of embeds) {
    const fields = Array.isArray(emb?.fields) ? emb.fields : [];
    for (const field of fields) {
      if (!/messaggio di/i.test(String(field?.name || ""))) continue;
      const match = String(field?.value || "").match(/<@!?(\d{16,20})>/);
      if (match?.[1]) return match[1];
    }
    const desc = String(emb?.description || "");
    const descMatch = desc.match(/Autore del messaggio:\s*<@!?(\d{16,20})>/i);
    if (descMatch?.[1]) return descMatch[1];
  }
  return null;
}

function isClipBoardMessage(targetMessage?) {
  const title = String(targetMessage?.embeds?.[0]?.title || "");
  return title.includes("Clip vocale");
}

function resolveClipAuthorIdFromMessage(targetMessage?) {
  const embeds = Array.isArray(targetMessage?.embeds) ? targetMessage.embeds : [];
  for (const emb of embeds) {
    const fields = Array.isArray(emb?.fields) ? emb.fields : [];
    for (const field of fields) {
      if (!/clip di/i.test(String(field?.name || ""))) continue;
      const match = String(field?.value || "").match(/<@!?(\d{16,20})>/);
      if (match?.[1]) return match[1];
    }
  }
  if (targetMessage?.mentions?.users?.size === 1) {
    return String(targetMessage.mentions.users.first()?.id || "");
  }
  return null;
}

function extractClipRepostPayload(targetMessage?) {
  const embed = targetMessage?.embeds?.[0];
  let text = "";
  const desc = String(embed?.description || "");
  const transMatch = desc.match(/\*\*Trascrizione\*\*\s*\n([\s\S]*)/i);
  if (transMatch) {
    text = String(transMatch[1] || "")
      .replace(/^»\s*/, "")
      .replace(/^\*|\*$/g, "")
      .replace(/^_|_$/g, "")
      .trim();
  }
  const files = [];
  for (const att of targetMessage.attachments?.values() || []) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    const name = String(att?.name || "").trim();
    const ct = String(att?.contentType || "").toLowerCase();
    if (name.toLowerCase() === "clip.mp3" || ct.startsWith("audio/")) {
      files.push({ attachment: url, name: name || "clip.mp3" });
      break;
    }
  }
  return { text, imageUrl: "", files, hasContent: files.length > 0 };
}

function isClipRepostDoc(doc?) {
  if (!doc) return false;
  if (String(doc.boardKind || doc.kind || "").trim().toLowerCase() === "clip") return true;
  const sc = String(doc.sourceChannelId || "").trim();
  const sm = String(doc.sourceMessageId || "").trim();
  const bc = String(doc.boardChannelId || "").trim();
  const bm = String(doc.boardMessageId || "").trim();
    if (sc && sc === sm && bc === bm && sc === bc) return true;
    if (sc && bc && sc === bc && sm && (sm === "pending" || (bm && sm === bm))) {
    return true;
  }
  const files = Array.isArray(doc.mediaFiles) ? doc.mediaFiles : [];
  for (const entry of files) {
    const name = String(entry?.name || "").trim().toLowerCase();
    if (name === "clip.mp3") return true;
  }
  return false;
}

export = { resolveQuotedAuthorIdFromQuoteMessage, isClipBoardMessage, resolveClipAuthorIdFromMessage, extractClipRepostPayload, isClipRepostDoc };

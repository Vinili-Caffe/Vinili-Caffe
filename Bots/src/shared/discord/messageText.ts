/**
 * Tutto il testo leggibile di un messaggio: contenuto, embed e componenti
 * (anche i messaggi "a blocchi" di Discord, Components V2, dove il testo sta nei TextDisplay).
 * Serve ai riconoscimenti automatici (bump di Disboard/Discadia, voti…) che leggono i messaggi dei bot.
 */
function collectComponentText(node?, out: string[] = [], depth = 0) {
  if (!node || depth > 8) return out;
  if (Array.isArray(node)) {
    for (const x of node) collectComponentText(x, out, depth + 1);
    return out;
  }
  if (typeof node !== "object") return out;
  const data = node.data && typeof node.data === "object" ? node.data : node;
  /* TextDisplay (10) e qualsiasi componente con "content" testuale */
  const content = typeof node.content === "string" ? node.content : typeof data.content === "string" ? data.content : "";
  if (content) out.push(content);
  const label = typeof data.label === "string" ? data.label : "";
  if (label) out.push(label);
  collectComponentText(node.components ?? data.components, out, depth + 1);
  collectComponentText(node.accessory ?? data.accessory, out, depth + 1);
  return out;
}

function collectEmbedText(embed?) {
  const out: string[] = [];
  if (!embed) return out;
  const e = embed.data && typeof embed.data === "object" ? embed.data : embed;
  for (const t of [e.title, e.description, e.footer?.text, e.author?.name]) if (t) out.push(String(t));
  for (const f of e.fields || []) {
    if (f?.name) out.push(String(f.name));
    if (f?.value) out.push(String(f.value));
  }
  return out;
}

/** Pezzi di testo separati (contenuto, ogni embed, componenti). */
function messageTextParts(message?): string[] {
  const parts: string[] = [];
  if (message?.content) parts.push(String(message.content));
  for (const embed of message?.embeds || []) {
    const t = collectEmbedText(embed).join("\n");
    if (t) parts.push(t);
  }
  const comp = collectComponentText(message?.components || []).join("\n");
  if (comp) parts.push(comp);
  return parts;
}

export = { messageTextParts, collectComponentText };

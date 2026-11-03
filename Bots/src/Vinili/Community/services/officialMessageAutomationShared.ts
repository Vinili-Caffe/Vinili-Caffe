const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");

function getRandomExp() {
  const min = 100;
  const max = 250;
  const step = 5;
  const count = Math.floor((max - min) / step) + 1;
  return min + Math.floor(Math.random() * count) * step;
}

function extractUserIdFromText(text?) {
  if (!text) return null;
  const match = text.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function extractNameFromText(text?) {
  if (!text) return null;
  const match = text.match(/(?:^|[\r\n])\s*!?\s*([^\s]+)\s+has voted/i) || text.match(/!?\s*([^\s]+)\s+has voted/i);
  return match?.[1] || null;
}

function sanitizeName(name?) {
  if (!name) return null;
  return name.replace(/^[!@#:_*`~\\-\\.]+|[!@#:_*`~\\-\\.]+$/g, "");
}

function flattenEmbedText(embed?) {
  if (!embed) return "";
  const parts = [];
  const push = (value?) => { if (typeof value === "string" && value.trim()) parts.push(value); };
  push(embed.title);
  push(embed.description);
  push(embed.url);
  push(embed.author?.name);
  push(embed.footer?.text);
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      push(field?.name);
      push(field?.value);
    }
  }
  const data = embed.data || embed._data;
  if (data) {
    push(data.title);
    push(data.description);
    push(data.url);
    push(data.author?.name);
    push(data.footer?.text);
    if (Array.isArray(data.fields)) {
      for (const field of data.fields) {
        push(field?.name);
        push(field?.value);
      }
    }
  }
  return parts.join("\n");
}

function getMessageTextParts(message?) {
  const embed0 = message.embeds?.[0];
  let embedText = "";
  if (Array.isArray(message.embeds) && message.embeds.length) {
    embedText = message.embeds.map((e?) => flattenEmbedText(e)).filter(Boolean).join("\n");
  }
  return {
    content: message.content || "",
    embedText,
    embedTitle: embed0?.title || "",
    fieldsText: "",
  };
}

async function hydrateAutomationMessage(message?) {
  if (!message?.channel?.messages?.fetch) return message;
  try {
    if (message.partial) {
      return (await message.fetch().catch(() => null)) || message;
    }
    const { content, embedText } = getMessageTextParts(message);
    const hasEmbedsArray = Array.isArray(message.embeds) && message.embeds.length > 0;
    if (!content && !embedText && !hasEmbedsArray) {
      const fresh = await message.channel.messages.fetch(message.id).catch(() => null);
      if (fresh) return fresh;
    }
    return message;
  } catch {
    return message;
  }
}

async function resolveUserFromMessage(message?) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;

  const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
  const idFromContent = extractUserIdFromText(content) || extractUserIdFromText(embedText) || extractUserIdFromText(fieldsText);
  if (idFromContent) {
    return getGuildMemberCached(message.guild, idFromContent).then((m?) => m?.user ?? null);
  }

  const nameRaw = extractNameFromText(content) || extractNameFromText(embedText) || extractNameFromText(embedTitle) || extractNameFromText(fieldsText);
  const nameClean = sanitizeName(nameRaw);
  if (nameClean) {
    const name = nameClean.toLowerCase();
    const cached = message.guild.members.cache.find((m?) => m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name,);
    if (cached) return cached.user;
    const searched = await message.guild.members.fetch({ query: nameClean, limit: 5 }).catch(() => null);
    if (searched?.size) {
      const exact = searched.find((m?) => m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name,);
      return (exact || searched.first()).user || null;
    }
  }

  return null;
}

export = {
  getRandomExp,
  extractUserIdFromText,
  extractNameFromText,
  sanitizeName,
  flattenEmbedText,
  getMessageTextParts,
  hydrateAutomationMessage,
  resolveUserFromMessage,
};

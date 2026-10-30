const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");

const pendingVerify = new Map();
const PENDING_TTL_MS = 60_000;

function pendingKey(authorId?, promptMessageId?) {
  return `${String(authorId)}:${String(promptMessageId)}`;
}

function storePendingVerify(authorId?, promptMessageId?, data?) {
  pendingVerify.set(pendingKey(authorId, promptMessageId), {
    ...data,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
}

function takePendingVerify(authorId?, promptMessageId?) {
  const key = pendingKey(authorId, promptMessageId);
  const entry = pendingVerify.get(key);
  pendingVerify.delete(key);
  if (!entry) return null;
  if (Date.now() > Number(entry.expiresAt || 0)) return null;
  return entry;
}

function parseVerifyCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  if (parts[0] !== "verify_yes" && parts[0] !== "verify_no") return null;
  if (!/^\d{16,20}$/.test(parts[2])) return null;
  return { action: parts[0] === "verify_yes" ? "yes" : "no", promptMessageId: parts[1], authorId: parts[2] };
}

export = {
  pendingVerify,
  storePendingVerify,
  takePendingVerify,
  parseVerifyCustomId,
  PENDING_TTL_MS,
};

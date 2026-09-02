"use strict";

function sanitizeEmbedFooterText(text) {
  const raw = String(text || "");
  if (!raw) return raw;
  return raw.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1: $2");
}

module.exports = { sanitizeEmbedFooterText };

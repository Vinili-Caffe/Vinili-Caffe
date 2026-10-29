function sanitizeDiscordChannelName(raw?) {
  let s = String(raw || "");
  if (!s) return "";
  const original = s;
  try {
    s = s.normalize("NFKC");
  } catch (_) {}

    s = s.replace(/[\uFE30-\uFE4F]/g, "·");
    s = s.replace(/[\u0F00-\u0FFF]/g, "");
    s = s.replace(/[\u1C90-\u1CBF]/g, " ");
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "");

  s = s.replace(/[·\u00B7\u2022\u2219]{2,}/g, "·");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[·\-\s|_]+|[·\-\s|_]+$/g, "").trim();

  return s || String(original).trim();
}

export = {
  sanitizeDiscordChannelName,
};

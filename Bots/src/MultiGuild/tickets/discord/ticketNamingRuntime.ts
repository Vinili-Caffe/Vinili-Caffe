function sanitizeTicketChannelTail(rawValue?, fallback = "utente", maxLength = 32) {
  const safe = String(rawValue || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[\/\\#@:`*?"<>|]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .slice(0, maxLength);
  return safe || fallback;
}

function buildTicketChannelName(panelConfig?, rawValue?, fallbackValue = "utente") {
  const safeTail = sanitizeTicketChannelTail(rawValue, fallbackValue);
  return `༄${String(panelConfig?.emoji || "")}︲${String(panelConfig?.name || "supporto")}᲼${safeTail}`.slice(0, 100);
}

export = { buildTicketChannelName, sanitizeTicketChannelTail };

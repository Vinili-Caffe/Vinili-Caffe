const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { E } = require("../emojis/emojiCatalog") as typeof import("../emojis/emojiCatalog");
const ARROW = E.VC_right_arrow;

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function nowDiscordTs() {
  return `<t:${Math.floor(Date.now() / 1000)}:F>`;
}

function yesNo(value?) {
  return value ? "Si" : "No";
}

function channelDisplay(channel?) {
  if (!channel) return "#sconosciuto";
  if (typeof channel.toString === "function") return `${channel}`;
  return `#${String(channel.name || "sconosciuto")}`;
}

function channelTypeLabel(channelOrType?) {
  const value = typeof channelOrType === "number" ? channelOrType : Number(channelOrType?.type || 0);
  if (value === 0) return "Canale Testuale";
  if (value === 2) return "Canale Vocale";
  if (value === 4) return "Categoria";
  if (value === 5) return "Canale Annuncio";
  if (value === 10) return "Thread annuncio";
  if (value === 11) return "Thread pubblico";
  if (value === 12) return "Thread privato";
  if (value === 13) return "Stage";
  if (value === 15) return "Canale Forum";
  if (value === 16) return "Canale Media";
  return `Sconosciuto (${value})`;
}

function formatAuditActor(actor?, fallback = "sconosciuto") {
  if (!actor) return fallback;
  const flags = [];
  if (actor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  const id = String(actor?.id || "").trim();
  if (!id) return `${actor}${suffix}`;
  return `${actor}${suffix} \`${id}\``;
}

function formatResponsible(executor?) {
  if (!executor) return "sconosciuto";
  const flags = [];
  if (executor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${executor}${suffix} \`${executor.id}\``;
}

function permissionList(bitfield?) {
  const bits = new PermissionsBitField(bitfield ?? 0n);
  const names = bits.toArray();
  if (!names.length) return "Nessuno";
  return names.join(", ");
}

function permissionDiff(oldBitfield?, newBitfield?) {
  const oldBits = new PermissionsBitField(oldBitfield ?? 0n);
  const newBits = new PermissionsBitField(newBitfield ?? 0n);
  const oldSet = new Set(oldBits.toArray());
  const newSet = new Set(newBits.toArray());

  const additions = [];
  const removals = [];

  for (const name of newSet) {
    if (!oldSet.has(name)) additions.push(name);
  }
  for (const name of oldSet) {
    if (!newSet.has(name)) removals.push(name);
  }

  additions.sort((a?, b?) => a.localeCompare(b));
  removals.sort((a?, b?) => a.localeCompare(b));

  return {
    additions: additions.length ? additions.join(", ") : "Nessuno",
    removals: removals.length ? removals.join(", ") : "Nessuno",
  };
}

function toLabel(key?) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c?) => c.toUpperCase());
}

function serializeAuditValue(value?) {
  if (value === null || value === undefined) return E.cancel;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return value || E.cancel;
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value.map((v?) => serializeAuditValue(v)).join(", ");
  }
  if (typeof value === "object") {
    if (value.id && value.name) return `${value.name} (\`${value.id}\`)`;
    if (value.id && value.tag) return `${value.tag} (\`${value.id}\`)`;
    if (value.id) return `\`${value.id}\``;
    if (value.name) return String(value.name);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function buildAuditExtraLines(entry?, knownChangeKeys = []) {
  const lines = [];
  if (!entry) return lines;

  const known = new Set((knownChangeKeys || []).map((k?) => String(k).toLowerCase()));
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  const extra = entry?.extra && typeof entry.extra === "object" ? entry.extra : null;

  const changeLines = [];
  for (const change of changes) {
    const key = String(change?.key || "");
    if (!key) continue;
    if (known.has(key.toLowerCase())) continue;
    const oldVal = serializeAuditValue(change?.old);
    const newVal = serializeAuditValue(change?.new);
    if (oldVal === newVal) continue;
    changeLines.push(`${ARROW} **${toLabel(key)}**`);
    changeLines.push(`  ${oldVal} ${ARROW} ${newVal}`);
  }

  const extraLines = [];
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === null) continue;
      extraLines.push(`${ARROW} **${toLabel(key)}:** ${serializeAuditValue(value)}`);
    }
  }

  if (!changeLines.length && !extraLines.length) return lines;

  lines.push("", "**Informazioni aggiuntive**");
  lines.push(...changeLines);
  lines.push(...extraLines);
  return lines;
}

export = {
  ARROW,
  toDiscordTimestamp,
  nowDiscordTs,
  yesNo,
  channelDisplay,
  channelTypeLabel,
  formatAuditActor,
  formatResponsible,
  permissionList,
  permissionDiff,
  buildAuditExtraLines,
};

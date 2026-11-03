/** Stanze vocali: nome, emoji, limite e stato del canale. */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { stanzaChannelMeta, STANZA_NAME_LEAD, STANZA_CONNECTOR, parseStanzaVoiceName } = require("./stanzaPlacement") as typeof import("./stanzaPlacement");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const stanzaVoiceStatusByChannelId = new Map();

const stanzaRenamePending = new Map();
const stanzaEmojiPending = new Map();
const stanzaLimitPending = new Map();
const stanzaDescPending = new Map();
const stanzaVicePending = new Map();
const stanzaUsersMemberPending = new Map();
const stanzaBotRenameUntil = new Map();
const STANZA_DEFAULT_EMOJI = "🏠";
const STANZA_CREATE_MIDDLE = `${STANZA_CONNECTOR}Stanza di `;
const STANZA_ANCHOR = STANZA_CREATE_MIDDLE;
const STANZA_VC_NAME_MAX = 100;
const STANZA_VC_VOICE_STATUS_MAX = 500;
const STANZA_SNAPSHOT_VERSION = 1;
const STANZA_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "stanzaVoiceRoomsSnapshot.json");

function normalizeStanzaDiscordUserId(val?) {
  const s = String(val ?? "").trim();
  if (!s || s === "null" || s === "undefined") return "";
  if (!/^\d{5,30}$/.test(s)) return "";
  return s;
}

function sanitizeStanzaMetaViceUserId(meta?) {
  if (!meta) return;
  meta.viceUserId = normalizeStanzaDiscordUserId(meta.viceUserId) || null;
}

function sanitizeStanzaLabel(raw?) {
  const s = String(raw || "utente")
    .replace(/[\n\r\t]/g, " ")
    .replace(/[#[\]|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "utente").slice(0, 32);
}

function sanitizeStanzaNamePart(raw?, maxLen?) {
  const s = String(raw || "")
    .replace(/[\n\r\t]/g, " ")
    .replace(/[#[\]|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  const cap = Math.max(
    1,
    Number(maxLen) > 0
      ? Number(maxLen)
      : STANZA_VC_NAME_MAX - STANZA_NAME_LEAD.length - STANZA_DEFAULT_EMOJI.length - STANZA_ANCHOR.length,
  );
  return s.slice(0, cap);
}

function isStanzaBotRename(channelId?) {
  const id = String(channelId || "");
  if (!id) return false;
  const until = stanzaBotRenameUntil.get(id);
  if (!until) return false;
  if (Date.now() > until) {
    stanzaBotRenameUntil.delete(id);
    return false;
  }
  return true;
}

function buildStanzaCreateName(emojiPart?, labelPart?) {
  return `${STANZA_NAME_LEAD}${String(emojiPart || STANZA_DEFAULT_EMOJI)}${STANZA_CREATE_MIDDLE}${String(labelPart || "")}`.slice(
    0,
    STANZA_VC_NAME_MAX,
  );
}

/** Rename / emoji / enforce — never inject "Stanza di". */
function buildStanzaFullName(emojiPart?, labelPart?) {
  return `${STANZA_NAME_LEAD}${String(emojiPart || STANZA_DEFAULT_EMOJI)}${STANZA_CONNECTOR}${String(labelPart || "")}`.slice(
    0,
    STANZA_VC_NAME_MAX,
  );
}

function isCanonicalStanzaVoiceName(name?) {
  const parsed = parseStanzaVoiceName(name);
  if (!parsed?.hasAnchor) return false;
  const label = normalizeStanzaUserLabel(parsed.labelPart);
  if (!label) return false;
  const n = String(name || "");
  // Create form (with Stanza di) OR renamed form (connector only) are both OK.
  return buildStanzaCreateName(parsed.emojiPart, label) === n || buildStanzaFullName(parsed.emojiPart, label) === n;
}

/** Strip connector / legacy "Stanza di" so rename never duplicates the prefix middle. */
function normalizeStanzaUserLabel(raw?) {
  let s = String(raw || "")
    .replace(/[\n\r\t]/g, " ")
    .replace(/[#[\]|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.startsWith(STANZA_NAME_LEAD)) s = s.slice(STANZA_NAME_LEAD.length).trimStart();
  const emojiOnly = s.match(/^((?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)+\uFE0F?)/u);
  if (emojiOnly) s = s.slice(emojiOnly[1].length).trimStart();
  while (s.startsWith(STANZA_CONNECTOR) || s.startsWith("╵") || s.startsWith("｜") || s.startsWith("|")) {
    s = s.slice(1).trimStart();
  }
  if (/^stanza di\s+/i.test(s)) {
    s = s.replace(/^stanza di\s+/i, "").trimStart();
  }
  while (s.startsWith(STANZA_CONNECTOR) || s.startsWith("╵") || s.startsWith("｜") || s.startsWith("|")) {
    s = s.slice(1).trimStart();
  }
  return s;
}

function buildStanzaVoiceNameFromUserPart(userInput?, currentVoiceName?) {
  const parsed = parseStanzaVoiceName(String(currentVoiceName || ""));
  const emojiPart = parsed?.emojiPart || STANZA_DEFAULT_EMOJI;
  const maxLabel = Math.max(
    1,
    STANZA_VC_NAME_MAX - STANZA_NAME_LEAD.length - String(emojiPart).length - STANZA_CONNECTOR.length,
  );
  const part = sanitizeStanzaNamePart(normalizeStanzaUserLabel(userInput), maxLabel);
  if (!part) return null;
  // Rename: ༄ + emoji + ︲ + label (no "Stanza di").
  return buildStanzaFullName(emojiPart, part);
}

/**
 * Recompute required channel name after any rename (panel or Discord UI).
 * Enforces ༄{emoji}︲{label} — never injects "Stanza di" on rename.
 * Returns null when newName is already canonical (create or renamed form).
 */
function resolveEnforcedStanzaVoiceName(oldName?, newName?) {
  const next = String(newName || "");
  if (isCanonicalStanzaVoiceName(next)) return null;
  const oldParsed = parseStanzaVoiceName(oldName);
  const newParsed = parseStanzaVoiceName(next);
  const emojiPart = oldParsed?.emojiPart || newParsed?.emojiPart || STANZA_DEFAULT_EMOJI;
  const labelSource = newParsed ? newParsed.labelPart : next;
  const maxLabel = Math.max(
    1,
    STANZA_VC_NAME_MAX - STANZA_NAME_LEAD.length - String(emojiPart).length - STANZA_CONNECTOR.length,
  );
  const part = sanitizeStanzaNamePart(normalizeStanzaUserLabel(labelSource), maxLabel);
  if (!part) {
    // Empty/invalid strip: restore previous label if possible (renamed form, no Stanza di).
    const fallbackLabel = sanitizeStanzaNamePart(
      normalizeStanzaUserLabel(oldParsed?.labelPart || "utente"),
      maxLabel,
    );
    if (!fallbackLabel) return null;
    const restored = buildStanzaFullName(emojiPart, fallbackLabel);
    return restored === next ? null : restored;
  }
  const enforced = buildStanzaFullName(emojiPart, part);
  return enforced === next ? null : enforced;
}

function buildStanzaVoiceNameWithNewEmoji(currentVoiceName?, newEmoji?) {
  const parsed = parseStanzaVoiceName(String(currentVoiceName || ""));
  if (!parsed) return null;
  const label = normalizeStanzaUserLabel(parsed.labelPart);
  if (!label) return null;
  return buildStanzaFullName(newEmoji, label);
}

function extractExactUnicodeEmojiLine(raw?) {
  const line = String(raw || "")
    .split("\n")[0]
    .trim();
  if (!line) return null;
  const m = line.match(/^((?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)+\uFE0F?)/u);
  const seq = m ? m[1] : null;
  if (!seq || seq !== line) return null;
  return seq;
}

function parseStanzaLimitUserInput(raw?) {
  const line = String(raw || "")
    .split("\n")[0]
    .trim();
  if (!/^\d{1,2}$/.test(line)) return null;
  const n = Number(line);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  return n;
}

function sanitizeStanzaVoiceStatus(raw?) {
  const t = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\0/g, "")
    .trim();
  if (!t) return null;
  return t.slice(0, STANZA_VC_VOICE_STATUS_MAX);
}

async function setStanzaVoiceChannelStatus(client?, channelId?, status?, reason?) {
  const cid = String(channelId || "").trim();
  if (!cid) return;
  const normalized = status == null || status === "" ? null : String(status).trim();
  await client.rest.put(`/channels/${cid}/voice-status`, {
    body: { status: normalized },
    reason,
  });
  if (normalized) stanzaVoiceStatusByChannelId.set(cid, normalized);
  else stanzaVoiceStatusByChannelId.delete(cid);
  const meta = stanzaChannelMeta.get(cid);
  if (meta) {
    meta.voiceStatus = normalized;
    persistStanzaSnapshotNow();
  }
}

function rememberStanzaVoiceChannelStatus(channelId?, status?) {
  const cid = String(channelId || "").trim();
  if (!cid) return;
  const normalized = status == null || status === "" ? null : String(status).trim();
  if (normalized) stanzaVoiceStatusByChannelId.set(cid, normalized);
  else stanzaVoiceStatusByChannelId.delete(cid);
  const meta = stanzaChannelMeta.get(cid);
  if (meta) meta.voiceStatus = normalized;
}

async function fetchVoiceChannelStatusText(client?, channelId?, meta = null) {
  const id = String(channelId || "").trim();
  if (!id) return null;
  const cached =
    (meta && typeof meta.voiceStatus === "string" ? meta.voiceStatus.trim() : "") ||
    stanzaVoiceStatusByChannelId.get(id) ||
    (typeof stanzaChannelMeta.get(id)?.voiceStatus === "string" ? stanzaChannelMeta.get(id).voiceStatus.trim() : "");
  if (cached) return cached;
  if (!client?.rest) return null;
  try {
    const raw = await client.rest.get(`/channels/${id}/voice-status`);
    const s = raw && typeof raw.status === "string" ? raw.status.trim() : "";
    if (s) {
      rememberStanzaVoiceChannelStatus(id, s);
      return s;
    }
  } catch {
      }
  return null;
}

function ensureStanzaSilencedUserIds(meta?) {
  if (!meta || typeof meta !== "object") return [];
  if (!Array.isArray(meta.silencedUserIds)) meta.silencedUserIds = [];
  meta.silencedUserIds = meta.silencedUserIds
    .map((id?) => String(id || "").trim())
    .filter((id?) => /^\d{5,30}$/.test(id));
  return meta.silencedUserIds;
}

function persistStanzaSnapshotNow() {
  if (!MAIN_GUILD_ID) return;
  try {
    const rooms: Record<string, any> = {};
    const pending = {
      rename: {},
      emoji: {},
      limit: {},
      desc: {},
      vice: {},
      usersMember: {},
    };
    for (const [channelId, meta] of stanzaChannelMeta) {
      sanitizeStanzaMetaViceUserId(meta);
      rooms[channelId] = {
        ownerId: meta.ownerId,
        viceUserId: meta.viceUserId ?? null,
        panelMessageId: meta.panelMessageId,
        textChannelId: meta.textChannelId ?? null,
        guildId: meta.guildId,
        startedAt: meta.startedAt,
        voiceStatus: typeof meta.voiceStatus === "string" ? meta.voiceStatus : null,
        silencedUserIds: ensureStanzaSilencedUserIds(meta).slice(),
      };
    }
    for (const [key, row] of stanzaRenamePending.entries()) {
      pending.rename[key] = {
        voiceChannelId: String(row?.voiceChannelId || ""),
        expiresAt: Number(row?.expiresAt || 0),
      };
    }
    for (const [key, row] of stanzaEmojiPending.entries()) {
      pending.emoji[key] = {
        voiceChannelId: String(row?.voiceChannelId || ""),
        expiresAt: Number(row?.expiresAt || 0),
      };
    }
    for (const [key, row] of stanzaLimitPending.entries()) {
      pending.limit[key] = {
        voiceChannelId: String(row?.voiceChannelId || ""),
        expiresAt: Number(row?.expiresAt || 0),
      };
    }
    for (const [key, row] of stanzaDescPending.entries()) {
      pending.desc[key] = {
        voiceChannelId: String(row?.voiceChannelId || ""),
        expiresAt: Number(row?.expiresAt || 0),
      };
    }
    for (const [key, row] of stanzaVicePending.entries()) {
      pending.vice[key] = {
        voiceChannelId: String(row?.voiceChannelId || ""),
        expiresAt: Number(row?.expiresAt || 0),
      };
    }
    for (const [key, row] of stanzaUsersMemberPending.entries()) {
      pending.usersMember[key] = {
        voiceChannelId: String(row?.voiceChannelId || ""),
        action: String(row?.action || ""),
        expiresAt: Number(row?.expiresAt || 0),
        interactionApplicationId: row?.interactionApplicationId ? String(row.interactionApplicationId) : "",
        interactionToken: row?.interactionToken ? String(row.interactionToken) : "",
      };
    }
    const dir = path.dirname(STANZA_SNAPSHOT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify({ version: STANZA_SNAPSHOT_VERSION, rooms, pending });
    const tmp = `${STANZA_SNAPSHOT_PATH}.tmp`;
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, STANZA_SNAPSHOT_PATH);
  } catch (err) {
    global.logger?.warn?.("[stanza] snapshot persist failed:", err?.message || err);
  }
}

export = { MAIN_GUILD_ID, stanzaVoiceStatusByChannelId, stanzaRenamePending, stanzaEmojiPending, stanzaLimitPending, stanzaDescPending, stanzaVicePending, stanzaUsersMemberPending, stanzaBotRenameUntil, STANZA_DEFAULT_EMOJI, STANZA_SNAPSHOT_VERSION, STANZA_SNAPSHOT_PATH, normalizeStanzaDiscordUserId, sanitizeStanzaMetaViceUserId, sanitizeStanzaLabel, isStanzaBotRename, buildStanzaCreateName, isCanonicalStanzaVoiceName, buildStanzaVoiceNameFromUserPart, resolveEnforcedStanzaVoiceName, buildStanzaVoiceNameWithNewEmoji, extractExactUnicodeEmojiLine, parseStanzaLimitUserInput, sanitizeStanzaVoiceStatus, setStanzaVoiceChannelStatus, rememberStanzaVoiceChannelStatus, fetchVoiceChannelStatusText, ensureStanzaSilencedUserIds, persistStanzaSnapshotNow };

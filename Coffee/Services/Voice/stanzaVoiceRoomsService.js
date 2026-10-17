const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, InteractionWebhook, OverwriteType, PermissionsBitField, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const IDs = require("../../Utils/Config/ids");
const { sendUserDirectMessage } = require("../../../shared/discord/dmPrivacyNotice");
const { accountUsername, userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { CustomRole, ActivityUserProfile } = require("../../../Vinyls/Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const STANZA_ALLOWED_GUILD_IDS = new Set([IDs.guilds?.main, IDs.guilds?.test].map((id) => String(id || "").trim()).filter((id) => /^\d{5,30}$/.test(id)));
const STANZA_LOBBY_VOICE_ID = String(IDs.channels?.stanzaLobbyVoice || "").trim();
const STANZA_PANEL_CHANNEL_ID = String(IDs.channels?.commands || "").trim();
const STANZA_MEMBER_ROLE_ID = String(IDs.roles?.Member || "").trim();
const STANZA_TEARDOWN_MOVE_TARGET_VOICE_IDS = [IDs.channels?.vocaleLounge1, IDs.channels?.vocaleLounge2, IDs.channels?.vocaleLounge3].map((id) => String(id || "").trim()).filter((id) => /^\d{5,30}$/.test(id));
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef");
const STANZA_DISCOVERY_EXCLUDE_PARENT_IDS = new Set((Array.isArray(IDs.stanzaDiscoveryExcludeParentIds) ? IDs.stanzaDiscoveryExcludeParentIds : []).map((x) => String(x || "").trim()).filter((x) => /^\d{5,30}$/.test(x)));
const STANZA_CATEGORY_ID = String(IDs.categories?.categoryPublics || "1442569076902989844").trim();

function getStanzaCategoryParentId() {
  return STANZA_CATEGORY_ID || "";
}

function channelCategorySortPosition(ch) {
  if (!ch) return -1;
  const raw = Number(ch.rawPosition);
  if (Number.isFinite(raw)) return raw;
  const pos = Number(ch.position);
  return Number.isFinite(pos) ? pos : -1;
}

/** Marker deploy: stanze sotto hub "crea una stanza", non in coda (sotto squad). */
const STANZA_UNDER_HUB_STACK_MARKER = "stanzaUnderHubCoffee1";

function getKnownPublicHubOrPinIds() {
  const ids = [
    STANZA_LOBBY_VOICE_ID,
    IDs.channels?.vocaleLounge1,
    IDs.channels?.serataFilm,
    IDs.channels?.vocaleDuo1,
    IDs.channels?.vocaleTrio1,
    IDs.channels?.vocaleQuad1,
    IDs.channels?.vocaleSquad1,
    IDs.channels?.vocalePenta1,
    IDs.channels?.vocaleHexa1,
    IDs.channels?.vocaleSetta1,
    IDs.channels?.vocaleOcta1,
  ];
  if (Array.isArray(IDs.publicVoiceHubChannelIds)) {
    for (const x of IDs.publicVoiceHubChannelIds) ids.push(x);
  }
  return new Set(ids.map((x) => String(x || "").trim()).filter(Boolean));
}

function isPublicHubOrPinVoiceChannel(ch) {
  const id = String(ch?.id || "").trim();
  if (!id) return false;
  if (getKnownPublicHubOrPinIds().has(id)) return true;
  if (/crea una\s/i.test(String(ch?.name || ""))) return true;
  return false;
}

function isManagedStanzaRoomChannel(ch, parentId = "") {
  if (!ch?.isVoiceBased?.()) return false;
  if (parentId && String(ch.parentId || "") !== String(parentId)) return false;
  if (isPublicHubOrPinVoiceChannel(ch)) return false;
  if (stanzaChannelMeta.has(String(ch.id))) return true;
  if (/Stanza di\s+/i.test(String(ch.name || ""))) return true;
  try {
    return Boolean(parseStanzaVoiceName(ch.name));
  } catch (_) {
    return false;
  }
}

function resolveStanzaVoiceCreatePlacement(guild, lobbyCh) {
  const parentId = getStanzaCategoryParentId() || String(lobbyCh?.parentId || "").trim() || null;
  const lobby =
    String(lobbyCh?.id || "") === STANZA_LOBBY_VOICE_ID
      ? lobbyCh
      : guild?.channels?.cache?.get(STANZA_LOBBY_VOICE_ID) || lobbyCh;
  if (!guild?.channels?.cache || !parentId || !lobby) {
    return { parentId, position: channelCategorySortPosition(lobby) + 1 };
  }
  const siblings = [...guild.channels.cache.values()]
    .filter((ch) => ch?.isVoiceBased?.() && String(ch.parentId || "") === String(parentId))
    .sort(
      (a, b) =>
        channelCategorySortPosition(a) - channelCategorySortPosition(b) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const lobbyIdx = siblings.findIndex((ch) => String(ch.id) === String(lobby.id));
  if (lobbyIdx < 0) {
    return { parentId, position: channelCategorySortPosition(lobby) + 1 };
  }
  /* Sotto hub crea-una-stanza / ultima stanza del gruppo — mai dopo duo/trio/squad. */
  let insertAt = lobbyIdx + 1;
  for (let i = lobbyIdx + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (isPublicHubOrPinVoiceChannel(ch)) break;
    if (!isManagedStanzaRoomChannel(ch, parentId)) break;
    insertAt = i + 1;
  }
  const prev = siblings[insertAt - 1] || lobby;
  const prevPos = channelCategorySortPosition(prev);
  return { parentId, position: prevPos >= 0 ? prevPos + 1 : 0 };
}

async function placeStanzaAfterGroupTail(created, guild, reason) {
  if (!created?.id || !guild) return false;
  const parentId = getStanzaCategoryParentId() || String(created.parentId || "").trim();
  const lobby = guild.channels.cache.get(STANZA_LOBBY_VOICE_ID);
  if (!lobby || !parentId) return false;
  await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  const freshCreated = guild.channels.cache.get(created.id) || created;
  const siblings = [...guild.channels.cache.values()]
    .filter((ch) => ch?.isVoiceBased?.() && String(ch.parentId || "") === String(parentId))
    .sort(
      (a, b) =>
        channelCategorySortPosition(a) - channelCategorySortPosition(b) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const lobbyIdx = siblings.findIndex((ch) => String(ch.id) === String(lobby.id));
  if (lobbyIdx < 0) return false;
  let anchor = lobby;
  for (let i = lobbyIdx + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (String(ch.id) === String(freshCreated.id)) continue;
    if (isPublicHubOrPinVoiceChannel(ch)) break;
    if (!isManagedStanzaRoomChannel(ch, parentId)) break;
    anchor = ch;
  }
  const anchorPos = channelCategorySortPosition(guild.channels.cache.get(anchor.id) || anchor);
  if (anchorPos < 0) return false;
  return applyStanzaVoiceCreatePosition(
    freshCreated,
    anchorPos + 1,
    reason || "Stanza temporanea sotto hub",
  ).then(() => true);
}

async function applyStanzaVoiceCreatePosition(voiceChannel, position, reason) {
  if (!voiceChannel || position === undefined || position === null) return;
  const target = Number(position);
  if (!Number.isFinite(target)) return;
  const ok = await voiceChannel
    .setPosition(target, { reason: reason || "Stanza temporanea sotto hub crea una stanza" })
    .then(() => true)
    .catch((err) => {
      global.logger?.warn?.("[stanza] setPosition failed:", err?.message || err);
      return false;
    });
  if (!ok && voiceChannel.guild?.channels?.setPositions) {
    await voiceChannel.guild.channels
      .setPositions([{ channel: voiceChannel.id, position: target }])
      .catch((err) => {
        global.logger?.warn?.("[stanza] setPositions failed:", err?.message || err);
      });
  }
}

function getStanzaDiscoveryParentFilter(guild) {
  const fromCategory = getStanzaCategoryParentId();
  if (fromCategory) return fromCategory;
  const lobby = guild?.channels?.cache?.get(STANZA_LOBBY_VOICE_ID);
  return lobby?.parentId ? String(lobby.parentId) : "";
}

function getStanzaMemberRoleId() {
  return STANZA_MEMBER_ROLE_ID || "";
}

function isStanzaGuildAllowed(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  if (STANZA_ALLOWED_GUILD_IDS.size > 0) return STANZA_ALLOWED_GUILD_IDS.has(gid);
  return gid === MAIN_GUILD_ID;
}

const stanzaChannelMeta = new Map();
const stanzaOwnerToChannel = new Map();
const stanzaVoiceStatusByChannelId = new Map();
const stanzaCreateLocks = new Set();
const stanzaPendingOwnerVoiceId = new Map();

const stanzaRenamePending = new Map();
const stanzaEmojiPending = new Map();
const stanzaLimitPending = new Map();
const stanzaDescPending = new Map();
const stanzaVicePending = new Map();
const stanzaUsersMemberPending = new Map();
const stanzaBotRenameUntil = new Map();

const STANZA_NAME_LEAD = "༄";
const STANZA_DEFAULT_EMOJI = "🏠";
/** Create only: ༄emoji︲Stanza di label. Rename/enforce: ༄emoji︲label (no "Stanza di"). */
const STANZA_CONNECTOR = "︲";
const STANZA_CREATE_MIDDLE = `${STANZA_CONNECTOR}Stanza di `;
const STANZA_ANCHOR = STANZA_CREATE_MIDDLE;
const STANZA_LEGACY_MIDDLE_RE = /[︲╵｜|]\s*Stanza di\s+/iu;
const STANZA_VC_NAME_MAX = 100;
const STANZA_VC_VOICE_STATUS_MAX = 500;
const STANZA_RENAME_PROMPT_MS = 90_000;
const STANZA_BOT_RENAME_TTL_MS = 12_000;
const STANZA_EMPTY_TEARDOWN_MS = 10 * 60 * 1000;
const STANZA_SNAPSHOT_VERSION = 1;
const STANZA_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "stanzaVoiceRoomsSnapshot.json");
/** Marker used in deploy/probe asserts — do not remove. */
const STANZA_NAME_ENFORCE_MARKER = "stanzaCreateOnlyStanzaDi1";

const stanzaEmptyTeardownTimers = new Map();

const stanzaVisitorVoiceSession = new Map();

function ownerKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

async function channelIdIsLinkedCustomRolePrivateVoc(guildId, channelId) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!gid || !/^\d{5,30}$/.test(cid)) return false;
  const doc = await CustomRole.findOne({ guildId: gid, customVocChannelId: cid }, { customVocChannelId: 1 })
    .lean()
    .catch(() => null);
  return Boolean(doc?.customVocChannelId && String(doc.customVocChannelId).trim() === cid);
}

function normalizeStanzaDiscordUserId(val) {
  const s = String(val ?? "").trim();
  if (!s || s === "null" || s === "undefined") return "";
  if (!/^\d{5,30}$/.test(s)) return "";
  return s;
}

function sanitizeStanzaMetaViceUserId(meta) {
  if (!meta) return;
  meta.viceUserId = normalizeStanzaDiscordUserId(meta.viceUserId) || null;
}

function clearStanzaEmptyTeardownTimer(channelId) {
  const id = String(channelId || "");
  const row = stanzaEmptyTeardownTimers.get(id);
  if (row?.timerId) clearTimeout(row.timerId);
  stanzaEmptyTeardownTimers.delete(id);
}

function scheduleStanzaEmptyTeardown(guild, channelId) {
  const id = String(channelId || "");
  if (!stanzaChannelMeta.has(id)) return;
  clearStanzaEmptyTeardownTimer(id);
  const guildId = String(guild?.id || "");
  const client = guild?.client;
  const timerId = setTimeout(async () => {
    stanzaEmptyTeardownTimers.delete(id);
    if (!stanzaChannelMeta.has(id)) return;
    if (!client) return;
    const g = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!g) return;
    const ch = g.channels.cache.get(id) || (await g.channels.fetch(id).catch(() => null));
    if (!ch?.isVoiceBased?.()) {
      stanzaChannelMeta.delete(id);
      return;
    }
    const humans = ch.members.filter((m) => !m.user.bot);
    if (humans.size > 0) return;
    await teardownStanza(g, id);
  }, STANZA_EMPTY_TEARDOWN_MS);
  timerId.unref?.();
  stanzaEmptyTeardownTimers.set(id, { timerId });
}

function sanitizeStanzaLabel(raw) {
  const s = String(raw || "utente")
    .replace(/[\n\r\t]/g, " ")
    .replace(/[#[\]|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "utente").slice(0, 32);
}

function sanitizeStanzaNamePart(raw, maxLen) {
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

function markStanzaBotRename(channelId, ttlMs = STANZA_BOT_RENAME_TTL_MS) {
  const id = String(channelId || "");
  if (!id) return;
  stanzaBotRenameUntil.set(id, Date.now() + Math.max(1000, Number(ttlMs) || STANZA_BOT_RENAME_TTL_MS));
}

function isStanzaBotRename(channelId) {
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

function findStanzaAnchorIndex(afterLead) {
  const s = String(afterLead || "");
  // Legacy rooms: ༄emoji︲Stanza di label — consume middle so label is clean.
  const legacy = s.match(STANZA_LEGACY_MIDDLE_RE);
  if (legacy && legacy.index != null) {
    return { idx: legacy.index, len: legacy[0].length };
  }
  // Canonical: emoji then connector ︲ (tolerate lookalike separators).
  const emojiMatch = s.match(/^((?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)+\uFE0F?)/u);
  if (emojiMatch) {
    const rest = s.slice(emojiMatch[1].length);
    const conn = rest.match(/^[︲╵｜|]/);
    if (conn) return { idx: emojiMatch[1].length, len: conn[0].length };
  }
  const exact = s.indexOf(STANZA_CONNECTOR);
  if (exact !== -1) return { idx: exact, len: STANZA_CONNECTOR.length };
  return null;
}

function parseStanzaVoiceName(name) {
  const n = String(name || "");
  if (!n.startsWith(STANZA_NAME_LEAD)) return null;
  const afterLead = n.slice(STANZA_NAME_LEAD.length);
  if (!afterLead) return null;
  const anchor = findStanzaAnchorIndex(afterLead);
  if (anchor) {
    const emojiPart = afterLead.slice(0, anchor.idx);
    if (!emojiPart) return null;
    const labelPart = afterLead.slice(anchor.idx + anchor.len);
    return { emojiPart, labelPart, hasAnchor: true };
  }
  const m = afterLead.match(/^((?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)+\uFE0F?)/u);
  if (!m) return null;
  const emojiPart = m[1];
  const labelPart = afterLead.slice(emojiPart.length);
  return { emojiPart, labelPart, hasAnchor: false };
}

function isVoiceChannelProbablyStanza(voiceChannel) {
  return Boolean(parseStanzaVoiceName(String(voiceChannel?.name || "")));
}

function isVoiceChannelDiscoveryStanzaCandidate(voiceChannel) {
  const n = String(voiceChannel?.name || "");
  if (!n.startsWith(STANZA_NAME_LEAD)) return false;
  return Boolean(findStanzaAnchorIndex(n.slice(STANZA_NAME_LEAD.length)));
}

function isVoiceChannelDiscoveryRenamedStanzaCandidate(voiceChannel) {
  if (!isVoiceChannelProbablyStanza(voiceChannel)) return false;
  if (isVoiceChannelDiscoveryStanzaCandidate(voiceChannel)) return false;
  return true;
}

function buildStanzaCreateName(emojiPart, labelPart) {
  return `${STANZA_NAME_LEAD}${String(emojiPart || STANZA_DEFAULT_EMOJI)}${STANZA_CREATE_MIDDLE}${String(labelPart || "")}`.slice(
    0,
    STANZA_VC_NAME_MAX,
  );
}

/** Rename / emoji / enforce — never inject "Stanza di". */
function buildStanzaFullName(emojiPart, labelPart) {
  return `${STANZA_NAME_LEAD}${String(emojiPart || STANZA_DEFAULT_EMOJI)}${STANZA_CONNECTOR}${String(labelPart || "")}`.slice(
    0,
    STANZA_VC_NAME_MAX,
  );
}

function isCanonicalStanzaVoiceName(name) {
  const parsed = parseStanzaVoiceName(name);
  if (!parsed?.hasAnchor) return false;
  const label = normalizeStanzaUserLabel(parsed.labelPart);
  if (!label) return false;
  const n = String(name || "");
  // Create form (with Stanza di) OR renamed form (connector only) are both OK.
  return buildStanzaCreateName(parsed.emojiPart, label) === n || buildStanzaFullName(parsed.emojiPart, label) === n;
}

/** Strip connector / legacy "Stanza di" so rename never duplicates the prefix middle. */
function normalizeStanzaUserLabel(raw) {
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

function buildStanzaVoiceNameFromUserPart(userInput, currentVoiceName) {
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
function resolveEnforcedStanzaVoiceName(oldName, newName) {
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

function buildStanzaVoiceNameWithNewEmoji(currentVoiceName, newEmoji) {
  const parsed = parseStanzaVoiceName(String(currentVoiceName || ""));
  if (!parsed) return null;
  const label = normalizeStanzaUserLabel(parsed.labelPart);
  if (!label) return null;
  return buildStanzaFullName(newEmoji, label);
}

function extractExactUnicodeEmojiLine(raw) {
  const line = String(raw || "")
    .split("\n")[0]
    .trim();
  if (!line) return null;
  const m = line.match(/^((?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)+\uFE0F?)/u);
  const seq = m ? m[1] : null;
  if (!seq || seq !== line) return null;
  return seq;
}

function parseStanzaLimitUserInput(raw) {
  const line = String(raw || "")
    .split("\n")[0]
    .trim();
  if (!/^\d{1,2}$/.test(line)) return null;
  const n = Number(line);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  return n;
}

function sanitizeStanzaVoiceStatus(raw) {
  const t = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\0/g, "")
    .trim();
  if (!t) return null;
  return t.slice(0, STANZA_VC_VOICE_STATUS_MAX);
}

async function setStanzaVoiceChannelStatus(client, channelId, status, reason) {
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

function rememberStanzaVoiceChannelStatus(channelId, status) {
  const cid = String(channelId || "").trim();
  if (!cid) return;
  const normalized = status == null || status === "" ? null : String(status).trim();
  if (normalized) stanzaVoiceStatusByChannelId.set(cid, normalized);
  else stanzaVoiceStatusByChannelId.delete(cid);
  const meta = stanzaChannelMeta.get(cid);
  if (meta) meta.voiceStatus = normalized;
}

function escapeStanzaEmbedPlainText(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/\|/g, "\\|");
}

function formatStanzaPersonalVoiceDuration(totalSeconds) {
  let sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  sec %= 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

async function incrementStanzaVisitorVoiceSeconds(guildId, userId, deltaSeconds) {
  if (!isValidGuildUserId(guildId, userId)) return;
  const d = Math.max(0, Math.floor(Number(deltaSeconds) || 0));
  if (d <= 0) return;
  const gid = String(guildId);
  const uid = String(userId);
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: gid, userId: uid },
    {
      $inc: { "profile.stanzaVoiceTotalSeconds": d },
      $setOnInsert: { guildId: gid, userId: uid },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => {});
}

async function getStanzaVisitorVoiceTotalSeconds(guildId, userId) {
  if (!isValidGuildUserId(guildId, userId)) return 0;
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.stanzaVoiceTotalSeconds")
    .lean()
    .catch(() => null);
  return Math.max(0, Math.floor(Number(doc?.profile?.stanzaVoiceTotalSeconds) || 0));
}

async function fetchVoiceChannelStatusText(client, channelId, meta = null) {
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

function buildStanzaJoinVisitorDmEmbed(member, voiceChannel, roomNamePlain, ownerId, statusText, totalFormatted) {
  const supportPart = ` aprendo un ${siteTicketsPageDiscordRef("SUPPORTO")}`;
  const ownerMention = `<@${ownerId}>`;
  const safeName = escapeStanzaEmbedPlainText(roomNamePlain);
  const statusLine = statusText
    ? `*${escapeStanzaEmbedPlainText(statusText).slice(0, 400)}*`
    : "*Non impostata*";
  return new EmbedBuilder()
    .setColor(0xdea8e0)
    .setTitle("🏠 · Ingresso nella Stanza")
    .setDescription(
      `Hai effettuato l'accesso alla vocale **${safeName}** (<#${voiceChannel.id}>).\n\n` +
        "**⚠️ Disclaimer responsabilità**\n" +
        `La vocale **${safeName}** è di proprietà di ${ownerMention}: non è moderata dallo staff, salvo casi di doxx e pericolosità estrema.\n` +
        `Se l'ambiente diventa pesante, consigliamo di uscire e, in caso di necessità, di contattare lo staff${supportPart}.\n\n` +
        "**🤍 · Stato della stanza**\n" +
        `| ${statusLine}\n\n` +
        "**⏱️ · Le tue statistiche**\n" +
        `| ⏱️ · ⌛ Tempo personale : ${totalFormatted}`,
    )
    .setThumbnail(userAvatarUrlDynamic(member, { size: 256 }))
    .setTimestamp(new Date());
}

async function notifyStanzaVisitorJoin(member, voiceChannel, meta) {
  const ownerId = String(meta?.ownerId || "").trim();
  if (!ownerId) return;
  const statusText = await fetchVoiceChannelStatusText(member.client, voiceChannel.id, meta);
  const totalSec = await getStanzaVisitorVoiceTotalSeconds(member.guild.id, member.id);
  const totalFormatted = formatStanzaPersonalVoiceDuration(totalSec);
  const embed = buildStanzaJoinVisitorDmEmbed(member, voiceChannel, String(voiceChannel.name || "Stanza"), ownerId, statusText, totalFormatted);
  const tid = String(meta?.textChannelId || "").trim();
  const tch =
    tid && /^\d{5,30}$/.test(tid) ? await fetchStanzaTextChannel(member.guild, tid) : null;
  if (tch?.isTextBased?.()) {
    await tch.send({ content: `<@${member.id}>`, embeds: [embed] }).catch((err) => {
      global.logger?.warn?.("[stanza] ingresso chat stanza fallito:", err?.code || err?.message || err);
    });
    return;
  }
  await sendUserDirectMessage(member.user, { embeds: [embed] }, {
    guildId: member.guild.id,
    commandsChannelId: IDs.channels.commands,
  });
}

async function finalizeStanzaVisitorVoiceSessionIfLeft(oldState, newState) {
  const guild = oldState.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const oldId = String(oldState.channelId || "");
  const newId = String(newState.channelId || "");
  if (!oldId || oldId === newId) return;
  const member = oldState.member;
  if (!member || member.user?.bot) return;
  const userKey = ownerKey(guild.id, member.id);
  const sess = stanzaVisitorVoiceSession.get(userKey);
  if (!sess || sess.voiceChannelId !== oldId) return;
  const deltaSec = Math.max(0, Math.floor((Date.now() - sess.startedAt) / 1000));
  stanzaVisitorVoiceSession.delete(userKey);
  if (deltaSec > 0) await incrementStanzaVisitorVoiceSeconds(guild.id, member.id, deltaSec);
}

async function flushStanzaVisitorVoiceSessionsForChannel(guildId, voiceChannelId) {
  const gid = String(guildId || "");
  const vid = String(voiceChannelId || "");
  if (!gid || !vid) return;
  const prefix = `${gid}:`;
  const batch = [];
  for (const [key, sess] of stanzaVisitorVoiceSession.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (sess.voiceChannelId !== vid) continue;
    stanzaVisitorVoiceSession.delete(key);
    const userId = key.slice(prefix.length);
    const deltaSec = Math.max(0, Math.floor((Date.now() - sess.startedAt) / 1000));
    if (deltaSec > 0) batch.push(incrementStanzaVisitorVoiceSeconds(gid, userId, deltaSec));
  }
  await Promise.all(batch);
}

function pendingRenameKey(guildId, userId) {
  return ownerKey(guildId, userId);
}

function clearStanzaRenamePending(guildId, userId) {
  const key = pendingRenameKey(guildId, userId);
  const old = stanzaRenamePending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaRenamePending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaRenamePendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaRenamePending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaRenamePending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function pendingEmojiKey(guildId, userId) {
  return ownerKey(guildId, userId);
}

function clearStanzaEmojiPending(guildId, userId) {
  const key = pendingEmojiKey(guildId, userId);
  const old = stanzaEmojiPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaEmojiPending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaEmojiPendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaEmojiPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaEmojiPending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function registerStanzaEmojiPending(guildId, userId, voiceChannelId) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  const key = pendingEmojiKey(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaEmojiPending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaEmojiPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function clearStanzaVicePending(guildId, userId) {
  const key = ownerKey(guildId, userId);
  const old = stanzaVicePending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaVicePending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaVicePendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaVicePending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaVicePending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function clearStanzaUsersMemberPending(guildId, userId) {
  const key = ownerKey(guildId, userId);
  const old = stanzaUsersMemberPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaUsersMemberPending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaUsersMemberPendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaUsersMemberPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaUsersMemberPending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function registerStanzaUsersMemberPending(guildId, userId, voiceChannelId, action, interaction = null) {
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  clearStanzaVicePending(guildId, userId);
  const key = ownerKey(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaUsersMemberPending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  const interactionApplicationId = interaction?.applicationId ? String(interaction.applicationId) : "";
  const interactionToken = interaction?.token ? String(interaction.token) : "";
  stanzaUsersMemberPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    action,
    expiresAt,
    timerId,
    ...(interactionApplicationId && interactionToken
      ? { interactionApplicationId, interactionToken }
      : {}),
  });
  persistStanzaSnapshotNow();
}

async function editStanzaUsersMemberFollowup(client, pending, options) {
  const appId = pending?.interactionApplicationId;
  const token = pending?.interactionToken;
  if (!client || !appId || !token) return;
  const hook = new InteractionWebhook(client, appId, token);
  await hook.editMessage("@original", options).catch(() => {});
}

function registerStanzaVicePending(guildId, userId, voiceChannelId) {
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  const key = ownerKey(guildId, userId);
  clearStanzaVicePending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaVicePending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaVicePending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function registerStanzaRenamePending(guildId, userId, voiceChannelId) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  const key = pendingRenameKey(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaRenamePending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaRenamePending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function pendingLimitKey(guildId, userId) {
  return ownerKey(guildId, userId);
}

function clearStanzaLimitPending(guildId, userId) {
  const key = pendingLimitKey(guildId, userId);
  const old = stanzaLimitPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaLimitPending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaLimitPendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaLimitPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaLimitPending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function registerStanzaLimitPending(guildId, userId, voiceChannelId) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  const key = pendingLimitKey(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaLimitPending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaLimitPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function pendingDescKey(guildId, userId) {
  return ownerKey(guildId, userId);
}

function clearStanzaDescPending(guildId, userId) {
  const key = pendingDescKey(guildId, userId);
  const old = stanzaDescPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaDescPending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaDescPendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaDescPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaDescPending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function registerStanzaDescPending(guildId, userId, voiceChannelId) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  const key = pendingDescKey(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaDescPending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaDescPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function buildStanzaChannelName(member) {
  const label = sanitizeStanzaLabel(accountUsername(member?.user) || member?.displayName || member?.user?.username);
  return buildStanzaCreateName(STANZA_DEFAULT_EMOJI, label);
}

function resolveVoicePrivacyLines(voiceChannel, guild) {
  const roleId = getStanzaMemberRoleId();
  if (!voiceChannel?.permissionOverwrites?.cache || !roleId) {
    return { privacy: "🌟 Pubblica", visibility: "👁️ Visibile" };
  }
  const ow = voiceChannel.permissionOverwrites.cache.get(roleId);
  if (!ow) return { privacy: "🌟 Pubblica", visibility: "👁️ Visibile" };
  const denyView = ow?.deny?.has(PermissionsBitField.Flags.ViewChannel);
  const denyConnect = ow?.deny?.has(PermissionsBitField.Flags.Connect);
  if (denyView) return { privacy: "🔒 Privata", visibility: "👻 Invisibile" };
  if (denyConnect) return { privacy: "🔒 Privata", visibility: "👁️ Visibile" };
  return { privacy: "🌟 Pubblica", visibility: "👁️ Visibile" };
}

function isStanzaMemberRoleViewHidden(voiceChannel, guild) {
  const roleId = getStanzaMemberRoleId();
  if (!voiceChannel?.permissionOverwrites?.cache || !roleId) return false;
  const ow = voiceChannel.permissionOverwrites.cache.get(roleId);
  return Boolean(ow?.deny?.has(PermissionsBitField.Flags.ViewChannel));
}

function isStanzaMemberRoleConnectBlocked(voiceChannel, guild) {
  const roleId = getStanzaMemberRoleId();
  if (!voiceChannel?.permissionOverwrites?.cache || !roleId) return false;
  const ow = voiceChannel.permissionOverwrites.cache.get(roleId);
  return Boolean(ow?.deny?.has(PermissionsBitField.Flags.Connect));
}

const STANZA_VOICE_MEMBER_ROLE_PUBLIC = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, Stream: true, UseEmbeddedActivities: true, UseExternalApps: true };
const STANZA_VOICE_MEMBER_ROLE_LOCKED = { ViewChannel: false, Connect: false };
const STANZA_VOICE_OWNER_OVERWRITE = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, Stream: true, UseEmbeddedActivities: true, UseExternalApps: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true, ManageChannels: true };
const STANZA_VOICE_BOT_OVERWRITE = { ViewChannel: true, Connect: true, Speak: true, ManageChannels: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true };
const STANZA_VOICE_MEMBER_WITH_PANEL_CHAT = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, Stream: true, UseEmbeddedActivities: true, UseExternalApps: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };
const STANZA_VOICE_OWNER_WITH_PANEL_CHAT = { ...STANZA_VOICE_OWNER_OVERWRITE, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true, ManageMessages: true };
const STANZA_VOICE_BOT_WITH_PANEL_CHAT = { ...STANZA_VOICE_BOT_OVERWRITE, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, ManageMessages: true };

function stanzaPermissionAllowArrayFromObject(obj) {
  const P = PermissionsBitField.Flags;
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== true) continue;
    const bit = P[k];
    if (bit != null) out.push(bit);
  }
  return out;
}

const STANZA_VOICE_MEMBER_ALLOW = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, Stream: true, UseEmbeddedActivities: true, UseExternalApps: true };
const STANZA_VOICE_MEMBER_EXCLUDE = { ViewChannel: false, Connect: false };
const STANZA_VOICE_MEMBER_SILENCE = { ViewChannel: true, Connect: true, Speak: false, Stream: false, UseVAD: false, UseEmbeddedActivities: false, UseExternalApps: false };
const STANZA_TEXT_MEMBER_ROLE_PUBLIC = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };
const STANZA_TEXT_MEMBER_ROLE_LOCKED = { ViewChannel: false, SendMessages: false };
const STANZA_TEXT_OWNER_OVERWRITE = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true, ManageChannels: true, ManageMessages: true };
const STANZA_TEXT_BOT_OVERWRITE = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, ManageMessages: true, ManageChannels: true };
const STANZA_TEXT_MEMBER_ALLOW = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };
const STANZA_TEXT_MEMBER_EXCLUDE = { ViewChannel: false, SendMessages: false };
const STANZA_TEXT_MEMBER_SILENCE = { ViewChannel: true, SendMessages: false, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };

function stanzaPanelTargetChannelId(meta) {
  const fromMeta = String(meta?.textChannelId || "").trim();
  if (fromMeta && /^\d{5,30}$/.test(fromMeta)) return fromMeta;
  const leg = String(STANZA_PANEL_CHANNEL_ID || "").trim();
  if (leg && /^\d{5,30}$/.test(leg)) return leg;
  return "";
}

async function ensureStanzaOwnerVoiceOverwrite(voiceChannel, ownerId) {
  const id = String(ownerId || "");
  if (!id) return false;
  if (voiceChannel.permissionOverwrites.cache.has(id)) return true;
  return voiceChannel.permissionOverwrites
    .create(id, STANZA_VOICE_OWNER_OVERWRITE, { reason: "Stanza: accesso creatore", type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function setStanzaPrivilegedUserVoiceOverwrite(voiceChannel, userId, reason) {
  const id = String(userId || "").trim();
  if (!id) return false;
  if (voiceChannel.permissionOverwrites.cache.has(id)) {
    return voiceChannel.permissionOverwrites
      .edit(id, STANZA_VOICE_OWNER_OVERWRITE, { reason, type: OverwriteType.Member })
      .then(() => true)
      .catch(() => false);
  }
  return voiceChannel.permissionOverwrites
    .create(id, STANZA_VOICE_OWNER_OVERWRITE, { reason, type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function ensureStanzaBotVoiceOverwrite(voiceChannel, botUserId) {
  const id = String(botUserId || "");
  if (!id) return false;
  try {
    if (voiceChannel.permissionOverwrites.cache.has(id)) {
      await voiceChannel.permissionOverwrites.edit(id, STANZA_VOICE_BOT_OVERWRITE, {
        reason: "Stanza: accesso bot",
        type: OverwriteType.Member,
      });
    } else {
      await voiceChannel.permissionOverwrites.create(id, STANZA_VOICE_BOT_OVERWRITE, {
        reason: "Stanza: accesso bot",
        type: OverwriteType.Member,
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function applyStanzaMemberServerMute(member, voiceChannelId, muted, reason) {
  if (!member?.voice) return false;
  if (String(member.voice.channelId || "") !== String(voiceChannelId || "")) return false;
  if (Boolean(member.voice.serverMute) === Boolean(muted)) return true;
  try {
    await member.voice.setMute(Boolean(muted), reason);
    return true;
  } catch (err) {
    global.logger?.warn?.("[stanza] server mute failed:", err?.message || err);
    return false;
  }
}

async function clearStanzaServerMuteAnywhere(member, reason) {
  if (!member?.voice) return false;
  if (!member.voice.serverMute) return true;
  try {
    await member.voice.setMute(false, reason);
    return true;
  } catch (err) {
    global.logger?.warn?.("[stanza] clear server mute failed:", err?.message || err);
    return false;
  }
}

function ensureStanzaSilencedUserIds(meta) {
  if (!meta || typeof meta !== "object") return [];
  if (!Array.isArray(meta.silencedUserIds)) meta.silencedUserIds = [];
  meta.silencedUserIds = meta.silencedUserIds
    .map((id) => String(id || "").trim())
    .filter((id) => /^\d{5,30}$/.test(id));
  return meta.silencedUserIds;
}

function isStanzaUserSilenced(meta, userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  return ensureStanzaSilencedUserIds(meta).includes(id);
}

function addStanzaSilencedUser(meta, userId) {
  const id = String(userId || "").trim();
  if (!id || !/^\d{5,30}$/.test(id)) return false;
  const arr = ensureStanzaSilencedUserIds(meta);
  if (arr.includes(id)) return false;
  arr.push(id);
  return true;
}

function removeStanzaSilencedUser(meta, userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  const before = ensureStanzaSilencedUserIds(meta);
  meta.silencedUserIds = before.filter((x) => x !== id);
  return meta.silencedUserIds.length !== before.length;
}

function isLegacyStanzaSilenceVoiceOverwrite(ow) {
  if (!ow) return false;
  const P = PermissionsBitField.Flags;
  return Boolean(ow.deny?.has?.(P.Speak) && !ow.deny?.has?.(P.ViewChannel) && !ow.deny?.has?.(P.Connect));
}

function isLegacyStanzaSilenceTextOverwrite(ow) {
  if (!ow) return false;
  const P = PermissionsBitField.Flags;
  return Boolean(ow.deny?.has?.(P.SendMessages) && !ow.deny?.has?.(P.ViewChannel));
}

/** Rimuove overwrite Speak/SendMessages del vecchio silenzio-canale (niente permessi aggiunti). */
async function clearLegacyStanzaSilenceChannelOverwrites(voiceChannel, textChannel, userId, reason) {
  const id = String(userId || "").trim();
  if (!id) return;
  const why = reason || "Stanza: silenzio solo server mute Discord";
  const vow = voiceChannel?.permissionOverwrites?.cache?.get?.(id);
  if (isLegacyStanzaSilenceVoiceOverwrite(vow)) {
    await voiceChannel.permissionOverwrites.delete(id, why).catch(() => {});
  }
  const tow = textChannel?.permissionOverwrites?.cache?.get?.(id);
  if (isLegacyStanzaSilenceTextOverwrite(tow)) {
    await textChannel.permissionOverwrites.delete(id, why).catch(() => {});
  }
}

async function removeStanzaMemberVoiceOverwrite(voiceChannel, userId) {
  const id = String(userId || "").trim();
  if (!id) return true;
  if (!voiceChannel.permissionOverwrites.cache.has(id)) return true;
  return voiceChannel.permissionOverwrites
    .delete(id, "Stanza: revoca vice")
    .then(() => true)
    .catch(() => false);
}

async function applyStanzaMemberVoicePerms(voiceChannel, userId, permsObject, reason) {
  const id = String(userId || "").trim();
  if (!id) return false;
  try {
    if (voiceChannel.permissionOverwrites.cache.has(id)) {
      await voiceChannel.permissionOverwrites.edit(id, permsObject, { reason, type: OverwriteType.Member });
    } else {
      await voiceChannel.permissionOverwrites.create(id, permsObject, { reason, type: OverwriteType.Member });
    }
    return true;
  } catch (err) {
    global.logger?.warn?.("[stanza] member overwrite failed:", err?.message || err);
    return false;
  }
}

async function ensureStanzaViceOverwriteIfAny(voiceChannel, ownerId) {
  const chId = String(voiceChannel?.id || "");
  const viceId = normalizeStanzaDiscordUserId(stanzaChannelMeta.get(chId)?.viceUserId);
  const oid = String(ownerId || "");
  if (!viceId || viceId === oid) return true;
  return setStanzaPrivilegedUserVoiceOverwrite(
    voiceChannel,
    viceId,
    "Stanza: accesso vice",
  );
}

async function ensureStanzaEveryoneNoAccess(voiceChannel, guild) {
  const everyoneId = guild.roles.everyone.id;
  const payload = { ViewChannel: false, Connect: false, Speak: false, UseVAD: false, Stream: false };
  try {
    if (voiceChannel.permissionOverwrites.cache.has(everyoneId)) {
      await voiceChannel.permissionOverwrites.edit(everyoneId, payload, { reason: "Stanza: @everyone senza accesso al canale", type: OverwriteType.Role });
    } else {
      await voiceChannel.permissionOverwrites.create(everyoneId, payload, { reason: "Stanza: @everyone senza accesso al canale", type: OverwriteType.Role });
    }
    return true;
  } catch {
    return false;
  }
}

async function setStanzaMemberRoleChannelOverwrite(voiceChannel, payload, reason) {
  const roleId = getStanzaMemberRoleId();
  if (!roleId) return false;
  try {
    if (voiceChannel.permissionOverwrites.cache.has(roleId)) {
      await voiceChannel.permissionOverwrites.edit(roleId, payload, { reason, type: OverwriteType.Role });
    } else {
      await voiceChannel.permissionOverwrites.create(roleId, payload, { reason, type: OverwriteType.Role });
    }
    return true;
  } catch {
    return false;
  }
}

async function applyStanzaMemberRoleAccessLocked(voiceChannel, guild, ownerId) {
  const botId = String(guild.client?.user?.id || "");
  if (!getStanzaMemberRoleId()) return false;
  if (!(await ensureStanzaOwnerVoiceOverwrite(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaBotVoiceOverwrite(voiceChannel, botId))) return false;
  if (!(await ensureStanzaViceOverwriteIfAny(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaEveryoneNoAccess(voiceChannel, guild))) return false;
  const ok = await setStanzaMemberRoleChannelOverwrite(voiceChannel, STANZA_VOICE_MEMBER_ROLE_LOCKED, "Stanza: blocca accesso");
  if (!ok) return false;
  mirrorStanzaLockedToCompanionText(guild, voiceChannel, ownerId).catch(() => {});
  return true;
}

async function applyStanzaMemberRoleAccessPublic(voiceChannel, guild) {
  if (!getStanzaMemberRoleId()) return false;
  if (!(await ensureStanzaEveryoneNoAccess(voiceChannel, guild))) return false;
  const ok = await setStanzaMemberRoleChannelOverwrite(voiceChannel, STANZA_VOICE_MEMBER_ROLE_PUBLIC, "Stanza: sblocca accesso");
  if (!ok) return false;
  mirrorStanzaPublicToCompanionText(guild, voiceChannel).catch(() => {});
  return true;
}

async function applyStanzaMemberRoleViewHidden(voiceChannel, guild, ownerId) {
  const botId = String(guild.client?.user?.id || "");
  if (!getStanzaMemberRoleId()) return false;
  if (!(await ensureStanzaOwnerVoiceOverwrite(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaBotVoiceOverwrite(voiceChannel, botId))) return false;
  if (!(await ensureStanzaViceOverwriteIfAny(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaEveryoneNoAccess(voiceChannel, guild))) return false;
  const ok = await setStanzaMemberRoleChannelOverwrite(voiceChannel, { ViewChannel: false }, "Stanza: nascondi canale");
  if (!ok) return false;
  mirrorStanzaViewHiddenToCompanionText(guild, voiceChannel).catch(() => {});
  return true;
}

async function applyStanzaMemberRoleViewVisible(voiceChannel, guild) {
  if (!getStanzaMemberRoleId()) return false;
  if (!(await ensureStanzaEveryoneNoAccess(voiceChannel, guild))) return false;
  const ok = await setStanzaMemberRoleChannelOverwrite(voiceChannel, { ViewChannel: true }, "Stanza: mostra canale");
  if (!ok) return false;
  mirrorStanzaViewVisibleToCompanionText(guild, voiceChannel).catch(() => {});
  return true;
}

async function applyStanzaMemberTextPerms(textChannel, userId, permsObject, reason) {
  const id = String(userId || "").trim();
  if (!id) return false;
  try {
    if (textChannel.permissionOverwrites.cache.has(id)) {
      await textChannel.permissionOverwrites.edit(id, permsObject, { reason, type: OverwriteType.Member });
    } else {
      await textChannel.permissionOverwrites.create(id, permsObject, { reason, type: OverwriteType.Member });
    }
    return true;
  } catch (err) {
    global.logger?.warn?.("[stanza] testo member overwrite failed:", err?.message || err);
    return false;
  }
}

async function setStanzaMemberRoleTextChannelOverwrite(textChannel, payload, reason) {
  const roleId = getStanzaMemberRoleId();
  if (!roleId) return false;
  try {
    if (textChannel.permissionOverwrites.cache.has(roleId)) {
      await textChannel.permissionOverwrites.edit(roleId, payload, { reason, type: OverwriteType.Role });
    } else {
      await textChannel.permissionOverwrites.create(roleId, payload, { reason, type: OverwriteType.Role });
    }
    return true;
  } catch {
    return false;
  }
}

async function ensureStanzaOwnerTextOverwrite(textChannel, ownerId) {
  const id = String(ownerId || "");
  if (!id) return false;
  if (textChannel.permissionOverwrites.cache.has(id)) return true;
  return textChannel.permissionOverwrites
    .create(id, STANZA_TEXT_OWNER_OVERWRITE, { reason: "Stanza: accesso creatore (chat)", type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function setStanzaPrivilegedUserTextOverwrite(textChannel, userId, reason) {
  const id = String(userId || "").trim();
  if (!id) return false;
  if (textChannel.permissionOverwrites.cache.has(id)) {
    return textChannel.permissionOverwrites
      .edit(id, STANZA_TEXT_OWNER_OVERWRITE, { reason, type: OverwriteType.Member })
      .then(() => true)
      .catch(() => false);
  }
  return textChannel.permissionOverwrites
    .create(id, STANZA_TEXT_OWNER_OVERWRITE, { reason, type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function ensureStanzaBotTextOverwrite(textChannel, botUserId) {
  const id = String(botUserId || "");
  if (!id) return false;
  if (textChannel.permissionOverwrites.cache.has(id)) return true;
  return textChannel.permissionOverwrites
    .create(id, STANZA_TEXT_BOT_OVERWRITE, { reason: "Stanza: accesso bot (chat)", type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function removeStanzaMemberTextOverwrite(textChannel, userId) {
  const id = String(userId || "").trim();
  if (!id) return true;
  if (!textChannel.permissionOverwrites.cache.has(id)) return true;
  return textChannel.permissionOverwrites
    .delete(id, "Stanza: revoca vice (chat)")
    .then(() => true)
    .catch(() => false);
}

async function ensureStanzaEveryoneNoAccessText(textChannel, guild) {
  const everyoneId = guild.roles.everyone.id;
  const payload = { ViewChannel: false, SendMessages: false };
  try {
    if (textChannel.permissionOverwrites.cache.has(everyoneId)) {
      await textChannel.permissionOverwrites.edit(everyoneId, payload, { reason: "Stanza: @everyone senza accesso alla chat", type: OverwriteType.Role });
    } else {
      await textChannel.permissionOverwrites.create(everyoneId, payload, { reason: "Stanza: @everyone senza accesso alla chat", type: OverwriteType.Role });
    }
    return true;
  } catch {
    return false;
  }
}

async function ensureStanzaViceTextOverwriteIfAny(textChannel, voiceChannelId, ownerId) {
  const viceId = normalizeStanzaDiscordUserId(stanzaChannelMeta.get(String(voiceChannelId || ""))?.viceUserId);
  const oid = String(ownerId || "");
  if (!viceId || viceId === oid) return true;
  return setStanzaPrivilegedUserTextOverwrite(textChannel, viceId, "Stanza: accesso vice");
}

async function fetchStanzaTextChannel(guild, channelId) {
  const ch =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!ch?.isTextBased?.()) return null;
  return ch;
}

async function stanzaCompanionTextChannel(guild, voiceChannelId) {
  const tid = String(stanzaChannelMeta.get(String(voiceChannelId || ""))?.textChannelId || "").trim();
  if (!tid || !/^\d{5,30}$/.test(tid)) return null;
  return fetchStanzaTextChannel(guild, tid);
}

async function mirrorStanzaLockedToCompanionText(guild, voiceChannel, ownerId) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannel.id);
  if (!tch) return;
  const botId = String(guild.client?.user?.id || "");
  await ensureStanzaOwnerTextOverwrite(tch, ownerId);
  await ensureStanzaBotTextOverwrite(tch, botId);
  await ensureStanzaViceTextOverwriteIfAny(tch, voiceChannel.id, ownerId);
  await ensureStanzaEveryoneNoAccessText(tch, guild);
  await setStanzaMemberRoleTextChannelOverwrite(tch, STANZA_TEXT_MEMBER_ROLE_LOCKED, "Stanza: blocca accesso chat");
}

async function mirrorStanzaPublicToCompanionText(guild, voiceChannel) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannel.id);
  if (!tch) return;
  await ensureStanzaEveryoneNoAccessText(tch, guild);
  await setStanzaMemberRoleTextChannelOverwrite(tch, STANZA_TEXT_MEMBER_ROLE_PUBLIC, "Stanza: sblocca accesso chat");
}

async function mirrorStanzaViewHiddenToCompanionText(guild, voiceChannel) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannel.id);
  if (!tch) return;
  await setStanzaMemberRoleTextChannelOverwrite(tch, { ViewChannel: false }, "Stanza: nascondi chat");
}

async function mirrorStanzaViewVisibleToCompanionText(guild, voiceChannel) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannel.id);
  if (!tch) return;
  await setStanzaMemberRoleTextChannelOverwrite(tch, STANZA_TEXT_MEMBER_ROLE_PUBLIC, "Stanza: mostra chat");
}

async function syncStanzaCompanionTextName(guild, voiceChannelId, name) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannelId);
  if (!tch || !name) return;
  if (String(tch.id) === String(voiceChannelId)) return;
  await tch.setName(String(name).slice(0, 100), "Stanza: nome chat allineato").catch(() => {});
}

function displayEmojiFromVoiceName(name) {
  return parseStanzaVoiceName(String(name || ""))?.emojiPart || STANZA_DEFAULT_EMOJI;
}

function buildStanzaHomePanelEmbed(ownerMember, voiceChannel, startedAt, meta = null) {
  const ownerId = String(ownerMember?.id || "");
  const limit = voiceChannel?.userLimit ? String(voiceChannel.userLimit) : "Infinito";
  const { privacy, visibility } = resolveVoicePrivacyLines(voiceChannel, voiceChannel.guild);
  const viceId = normalizeStanzaDiscordUserId(meta?.viceUserId);
  const viceLine = viceId ? `<@${viceId}>` : "Nessuno";
  const chatId = String(meta?.textChannelId || "").trim();
  const voiceId = String(voiceChannel?.id || "").trim();
  const chatLine =
    chatId && chatId !== voiceId ? `**Chat stanza:** <#${chatId}>\n` : "";
  const elapsedSec = Math.max(0, Math.floor((Date.now() - (startedAt || Date.now())) / 1000));
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("🏠 · Pannello Gestione Stanza")
    .setDescription(
      `👋Benvenuto nella stanza, <@${ownerId}>!\n` +
        "🔧 Usa i menu qui sotto per personalizzare la tua stanza.\n\n" +
        "💡 Le stanze sono spazi temporanei gestiti dagli utenti: chi le crea ne definisce le regole e l'accesso.\n\n" +
        `🎤 **Canale:** <#${voiceChannel?.id || "0"}>\n` +
        chatLine +
        `🔊 **Limite:** ${limit}\n` +
        `🔒 **Privacy:** ${privacy}\n` +
        `👁️ **Visibilità:** ${visibility}\n` +
        `🌙 **Vice:** ${viceLine}\n` +
        `⏱️ **Tempo stanza:** ${m}m ${s}s`,
    )
}

function buildStanzaManageSettingsEmbed(voiceChannel, meta = null) {
  const chName = String(voiceChannel?.name || "—");
  const emoji = displayEmojiFromVoiceName(chName);
  const limit = voiceChannel?.userLimit ? String(voiceChannel.userLimit) : "Infinito";
  const { privacy, visibility } = resolveVoicePrivacyLines(voiceChannel, voiceChannel.guild);
  const viceId = normalizeStanzaDiscordUserId(meta?.viceUserId);
  const viceVal = viceId ? `<@${viceId}>` : "Nessuno";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("🎛️ · Impostazioni Stanza")
    .setDescription("🔍 Visualizza e modifica le impostazioni principali della tua stanza.")
    .addFields(
      {
        name: "📋 · Info generali",
        value: [`🔤 **Nome:** ${chName}`, `🌀 **Emoji:** ${emoji}`, `🔊 **Limite:** ${limit}`].join("\n"),
        inline: true,
      },
      {
        name: "⚙️ · Impostazioni",
        value: [`🔒 **Privacy:** ${privacy}`, `👁️ **Visibilità:** ${visibility}`].join("\n"),
        inline: true,
      },
      { name: "🌙 · Vice", value: `👥 ${viceVal}`, inline: false },
    )
}

function buildStanzaHomeRows(channelId) {
  const cid = String(channelId || "");
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stanza_manage:${cid}`)
      .setLabel("Gestisci Stanza")
      .setEmoji("🎛️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`stanza_users:${cid}`)
      .setLabel("Gestisci Utenti")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stanza_delete:${cid}`)
      .setLabel("Cancella")
      .setEmoji("💔")
      .setStyle(ButtonStyle.Danger),
  );
  return [row1];
}

function buildStanzaManageRows(voiceChannel) {
  const cid = String(voiceChannel?.id || "");
  const guild = voiceChannel?.guild;
  const viewHidden = guild ? isStanzaMemberRoleViewHidden(voiceChannel, guild) : false;
  const connectBlocked = guild ? isStanzaMemberRoleConnectBlocked(voiceChannel, guild) : false;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`stanza_nome:${cid}`).setLabel("Nome").setEmoji("✏️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`stanza_emoji:${cid}`).setLabel("Emoji").setEmoji("🌀").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`stanza_limite:${cid}`).setLabel("Limite").setEmoji("🔊").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`stanza_desc:${cid}`).setLabel("Stato").setEmoji("📝").setStyle(ButtonStyle.Secondary),
  );
  const vistaBtn = viewHidden
    ? new ButtonBuilder()
        .setCustomId(`stanza_mostra:${cid}`)
        .setLabel("Mostra")
        .setEmoji("👁️")
        .setStyle(ButtonStyle.Success)
    : new ButtonBuilder()
        .setCustomId(`stanza_nascondi:${cid}`)
        .setLabel("Nascondi")
        .setEmoji("🙈")
        .setStyle(ButtonStyle.Secondary);
  const lockToggleBtn = connectBlocked
    ? new ButtonBuilder()
        .setCustomId(`stanza_sblocca:${cid}`)
        .setLabel("Sblocca")
        .setEmoji("🌟")
        .setStyle(ButtonStyle.Success)
    : new ButtonBuilder()
        .setCustomId(`stanza_blocca:${cid}`)
        .setLabel("Blocca")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);
  const row2 = new ActionRowBuilder().addComponents(vistaBtn, lockToggleBtn, new ButtonBuilder().setCustomId(`stanza_vice:${cid}`).setLabel("Nomina Vice").setEmoji("🌙").setStyle(ButtonStyle.Primary));
  const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stanza_back:${cid}`).setLabel("Indietro").setEmoji("<:1343arrowleft:1525249879151083621>️").setStyle(ButtonStyle.Secondary));
  return [row1, row2, row3];
}

function buildStanzaUsersManageEmbed(voiceChannel) {
  const chLabel = voiceChannel?.id ? `<#${voiceChannel.id}>` : "—";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("👥 · Gestione Membri Stanza")
    .setDescription(
      `🔍 Scegli un'azione per gestire chi può entrare o parlare.\n\n🎤 **Canale:** ${chLabel}`,
    )
}

function buildStanzaUsersManageRows(voiceChannel, meta = null) {
  const cid = String(voiceChannel?.id || voiceChannel || "");
  const ch = voiceChannel && typeof voiceChannel === "object" ? voiceChannel : null;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stanza_users_include:${cid}`)
      .setLabel("Includi")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stanza_users_exclude:${cid}`)
      .setLabel("Escludi")
      .setEmoji("🚫")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`stanza_users_silenzia:${cid}`)
      .setLabel("Silenzia")
      .setEmoji("🔇")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`stanza_users_smuta:${cid}`)
      .setLabel("Smuta")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stanza_users_list:${cid}`)
      .setLabel("Lista Membri")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stanza_users_back:${cid}`)
      .setLabel("Indietro")
      .setEmoji("<:1343arrowleft:1525249879151083621>️")
      .setStyle(ButtonStyle.Primary),
  );
  return [row1, row2];
}

async function postStanzaPanel(guild, member, voiceChannel, textChannel, metaForEmbed = null) {
  if (!textChannel?.isTextBased?.()) return null;
  const startedAt = Date.now();
  const msg = await textChannel
    .send({
      content: `<@${member.id}>`,
      embeds: [buildStanzaHomePanelEmbed(member, voiceChannel, startedAt, metaForEmbed)],
      components: buildStanzaHomeRows(voiceChannel.id),
    })
    .catch(() => null);
  return { panelMessageId: msg?.id || null, startedAt };
}

async function teardownStanza(guild, channelId, opts = {}) {
  const id = String(channelId || "");
  const meta = stanzaChannelMeta.get(id);
  if (!meta) return false;
  const linkedProfileVoc = await channelIdIsLinkedCustomRolePrivateVoc(guild.id, id);
  const preserveVoice = Boolean(opts?.preserveVoiceChannel) || linkedProfileVoc;
  if (linkedProfileVoc) {
    global.logger?.warn?.("[stanza] teardown: vocale collegata a CustomRole; non elimino il canale", id);
  }
  await flushStanzaVisitorVoiceSessionsForChannel(guild.id, id);
  clearStanzaEmptyTeardownTimer(id);
  stanzaVoiceStatusByChannelId.delete(id);
  const silencedIds = ensureStanzaSilencedUserIds(meta);
  for (const uid of silencedIds) {
    const m =
      guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
    if (m?.voice?.serverMute) {
      await clearStanzaServerMuteAnywhere(m, "Stanza: chiusura stanza").catch(() => {});
    }
  }
  stanzaChannelMeta.delete(id);
  stanzaOwnerToChannel.delete(ownerKey(meta.guildId, meta.ownerId));
  clearStanzaRenamePending(meta.guildId, meta.ownerId);
  clearStanzaRenamePendingByVoiceChannel(id);
  clearStanzaEmojiPending(meta.guildId, meta.ownerId);
  clearStanzaEmojiPendingByVoiceChannel(id);
  clearStanzaLimitPending(meta.guildId, meta.ownerId);
  clearStanzaLimitPendingByVoiceChannel(id);
  clearStanzaDescPending(meta.guildId, meta.ownerId);
  clearStanzaDescPendingByVoiceChannel(id);
  clearStanzaVicePending(meta.guildId, meta.ownerId);
  clearStanzaVicePendingByVoiceChannel(id);
  clearStanzaUsersMemberPending(meta.guildId, meta.ownerId);
  clearStanzaUsersMemberPendingByVoiceChannel(id);

  const textId = String(meta.textChannelId || "").trim();
  if (textId && /^\d{5,30}$/.test(textId) && textId !== id) {
    const tch = guild.channels.cache.get(textId) || (await guild.channels.fetch(textId).catch(() => null));
    if (tch?.deletable) await tch.delete("Stanza: chiusura chat").catch(() => {});
  } else if (meta.panelMessageId && STANZA_PANEL_CHANNEL_ID) {
    const panelCh =
      guild.channels.cache.get(STANZA_PANEL_CHANNEL_ID) ||
      (await guild.channels.fetch(STANZA_PANEL_CHANNEL_ID).catch(() => null));
    if (panelCh?.isTextBased?.()) {
      const msg = await panelCh.messages.fetch(meta.panelMessageId).catch(() => null);
      if (msg?.deletable) await msg.delete().catch(() => {});
    }
  }

  const ch = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
  if (!preserveVoice && ch?.deletable) await ch.delete("Stanza vuota o chiusura").catch(() => {});
  else if (preserveVoice) {
    const panelId = String(meta.panelMessageId || "").trim();
    if (panelId && /^\d{5,30}$/.test(panelId) && ch?.messages) {
      const pm = await ch.messages.fetch(panelId).catch(() => null);
      if (pm?.deletable) await pm.delete("Stanza: rimozione pannello").catch(() => {});
    }
  }
  persistStanzaSnapshotNow();
  return preserveVoice;
}

async function handleStanzaVoiceLobbyJoin(oldState, newState, client) {
  if (!STANZA_LOBBY_VOICE_ID) return;
  const guild = newState.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const member = newState.member;
  if (!member || member.user?.bot) return;
  const joinedId = String(newState.channelId || "");
  const leftLobby = String(oldState.channelId || "");
  if (joinedId !== STANZA_LOBBY_VOICE_ID || leftLobby === STANZA_LOBBY_VOICE_ID) return;

  const ok = newState.channel?.isVoiceBased?.();
  if (!ok) return;

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels | PermissionsBitField.Flags.MoveMembers)) {
    global.logger?.warn?.("[stanza] bot missing ManageChannels/MoveMembers permission");
    return;
  }

  const uid = String(member.id);
  if (stanzaCreateLocks.has(uid)) {
    const pendingVid = stanzaPendingOwnerVoiceId.get(uid);
    if (pendingVid) {
      const ch =
        guild.channels.cache.get(pendingVid) || (await guild.channels.fetch(pendingVid).catch(() => null));
      if (ch?.isVoiceBased?.()) await member.voice.setChannel(ch).catch(() => {});
    }
    return;
  }
  const okKey = ownerKey(guild.id, uid);
  if (!stanzaOwnerToChannel.has(okKey)) {
    await tryAttachOwnerStanzaFromSnapshot(guild, uid);
  }
  if (!stanzaOwnerToChannel.has(okKey)) {
    await tryDiscoverOwnerStanzaVoiceInGuild(guild, uid);
  }
  const existingId = stanzaOwnerToChannel.get(okKey);
  if (existingId) {
    const existing =
      guild.channels.cache.get(existingId) || (await guild.channels.fetch(existingId).catch(() => null));
    if (existing?.isVoiceBased?.()) {
      if (await channelIdIsLinkedCustomRolePrivateVoc(guild.id, existingId)) {
        stanzaOwnerToChannel.delete(okKey);
        stanzaChannelMeta.delete(existingId);
        persistStanzaSnapshotNow();
      } else {
        await member.voice.setChannel(existing).catch(() => {});
        return;
      }
    } else {
      stanzaOwnerToChannel.delete(okKey);
      stanzaChannelMeta.delete(existingId);
      persistStanzaSnapshotNow();
    }
  }

  stanzaCreateLocks.add(uid);
  try {
    const memberRoleId = getStanzaMemberRoleId();
    if (!memberRoleId) {
      global.logger?.warn?.("[stanza] creazione stanza impossibile: IDs.roles.Member non configurato");
      return;
    }
    const lobbyCh = newState.channel;
    const { parentId, position } = resolveStanzaVoiceCreatePlacement(guild, lobbyCh);
    const name = buildStanzaChannelName(member);
    const createPayload = {
      name,
      type: ChannelType.GuildVoice,
      parent: parentId || undefined,
      reason: `Stanza temporanea per ${member.user?.tag || uid}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.UseVAD, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.SendMessages],
          },
          {
            id: memberRoleId,
            type: OverwriteType.Role,
            allow: stanzaPermissionAllowArrayFromObject(STANZA_VOICE_MEMBER_WITH_PANEL_CHAT),
          },
          {
            id: uid,
            type: OverwriteType.Member,
            allow: stanzaPermissionAllowArrayFromObject(STANZA_VOICE_OWNER_WITH_PANEL_CHAT),
          },
          {
            id: client.user.id,
            type: OverwriteType.Member,
            allow: stanzaPermissionAllowArrayFromObject(STANZA_VOICE_BOT_WITH_PANEL_CHAT),
          },
        ],
    };
    if (position !== undefined) createPayload.position = position;
    const voiceChannel = await guild.channels.create(createPayload).catch((err) => {
      global.logger?.warn?.("[stanza] create failed:", err?.message || err);
      return null;
    });
    if (!voiceChannel) return;

    await applyStanzaVoiceCreatePosition(
      voiceChannel,
      position,
      `Stanza temporanea sotto hub per ${member.user?.tag || uid}`,
    );
    await placeStanzaAfterGroupTail(
      voiceChannel,
      guild,
      `Stanza temporanea sotto gruppo per ${member.user?.tag || uid}`,
    ).catch((err) => {
      global.logger?.warn?.("[stanza] place under hub failed:", err?.message || err);
    });
    try {
      const { reorderLimitateCategory } = require("../../../Vinyls/Services/Voice/publicVoiceHubService");
      await reorderLimitateCategory(guild, client, {
        parentId: parentId || getStanzaCategoryParentId(),
        forceFetch: true,
      });
      await placeStanzaAfterGroupTail(voiceChannel, guild, "Stanza temporanea ri-ancora sotto hub").catch(
        () => null,
      );
    } catch (eReorder) {
      global.logger?.warn?.("[stanza] hub reorder after create failed:", eReorder?.message || eReorder);
    }

    stanzaPendingOwnerVoiceId.set(uid, voiceChannel.id);

    const movedOk = await member.voice.setChannel(voiceChannel).then(() => true).catch((err) => {
      global.logger?.warn?.("[stanza] move failed:", err?.message || err);
      return false;
    });
    if (!movedOk) {
      stanzaPendingOwnerVoiceId.delete(uid);
      await voiceChannel.delete("Move fallito").catch(() => {});
      return;
    }

    const refreshed =
      (await guild.channels.fetch(voiceChannel.id).catch(() => null)) || voiceChannel;

    const panel = await postStanzaPanel(guild, member, refreshed, refreshed, {
      textChannelId: refreshed.id,
      viceUserId: null,
    });
    if (!panel?.panelMessageId) {
      stanzaPendingOwnerVoiceId.delete(uid);
      await refreshed.delete("Pannello non inviato").catch(() => {});
      return;
    }

    stanzaChannelMeta.set(refreshed.id, {
      ownerId: uid,
      viceUserId: null,
      panelMessageId: String(panel.panelMessageId),
      textChannelId: String(refreshed.id),
      guildId: guild.id,
      startedAt: Number(panel.startedAt) || Date.now(),
    });
    stanzaOwnerToChannel.set(okKey, refreshed.id);
    persistStanzaSnapshotNow();
    mirrorStanzaPublicToCompanionText(guild, refreshed).catch(() => {});
  } finally {
    stanzaPendingOwnerVoiceId.delete(uid);
    stanzaCreateLocks.delete(uid);
  }
}

async function handleStanzaVoiceEmpty(oldState, newState) {
  const guild = oldState.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const prevId = String(oldState.channelId || "");
  if (!prevId || prevId === STANZA_LOBBY_VOICE_ID) return;
  if (!stanzaChannelMeta.has(prevId)) {
    await tryRehydrateStanzaRoomByChannelId(guild, prevId);
  }
  if (!stanzaChannelMeta.has(prevId)) return;
  const nextCh = newState.channelId ? String(newState.channelId) : "";
  if (prevId === nextCh) return;

  const channel =
    guild.channels.cache.get(prevId) || (await guild.channels.fetch(prevId).catch(() => null));
  if (!channel?.isVoiceBased?.()) {
    clearStanzaEmptyTeardownTimer(prevId);
    const goneMeta = stanzaChannelMeta.get(prevId);
    if (goneMeta) stanzaOwnerToChannel.delete(ownerKey(goneMeta.guildId, goneMeta.ownerId));
    stanzaChannelMeta.delete(prevId);
    persistStanzaSnapshotNow();
    return;
  }
  const humans = channel.members.filter((m) => !m.user.bot);
  if (humans.size > 0) {
    clearStanzaEmptyTeardownTimer(prevId);
    return;
  }
  scheduleStanzaEmptyTeardown(guild, prevId);
}

async function handleStanzaVoiceOccupied(oldState, newState) {
  const guild = newState.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const joinedId = String(newState.channelId || "");
  if (!joinedId || joinedId === STANZA_LOBBY_VOICE_ID) return;
  const meta = await getStanzaMetaOrRehydrate(guild, joinedId);
  if (!meta) return;
  const member = newState.member;
  if (!member || member.user?.bot) return;
  const leftId = String(oldState.channelId || "");
  if (leftId === joinedId) return;
  clearStanzaEmptyTeardownTimer(joinedId);
  const userKey = ownerKey(guild.id, member.id);
  stanzaVisitorVoiceSession.set(userKey, { voiceChannelId: joinedId, startedAt: Date.now() });
  const voiceCh =
    newState.channel?.isVoiceBased?.() && String(newState.channel.id) === joinedId
      ? newState.channel
      : await fetchStanzaVoiceChannel(guild, joinedId);
  if (voiceCh && String(member.id) !== String(meta.ownerId || "")) {
    await notifyStanzaVisitorJoin(member, voiceCh, meta);
  }
}

/**
 * Silenzio stanza = solo Discord server mute, scoped al canale:
 * - uscita → smutia (lista resta)
 * - rientro nella stessa stanza → rimuta finché non smutato dal pannello
 */
async function handleStanzaVoiceSilenceSync(oldState, newState) { // stanzaSilenceServerMuteOnly1
  const guild = newState?.guild || oldState?.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const member = newState?.member || oldState?.member;
  if (!member || member.user?.bot) return;
  const leftId = String(oldState?.channelId || "");
  const joinedId = String(newState?.channelId || "");
  if (leftId === joinedId) return;

  if (leftId && leftId !== STANZA_LOBBY_VOICE_ID) {
    const leftMeta = await getStanzaMetaOrRehydrate(guild, leftId);
    if (leftMeta && isStanzaUserSilenced(leftMeta, member.id)) {
      await clearStanzaServerMuteAnywhere(member, "Stanza: uscita (silenzio resta in stanza)").catch(() => {});
    }
  }

  if (joinedId && joinedId !== STANZA_LOBBY_VOICE_ID) {
    const joinedMeta = await getStanzaMetaOrRehydrate(guild, joinedId);
    if (joinedMeta && isStanzaUserSilenced(joinedMeta, member.id)) {
      await applyStanzaMemberServerMute(member, joinedId, true, "Stanza: rientro silenziato").catch(() => {});
    }
  }
}

function parseStanzaButtonId(customId) {
  const raw = String(customId || "");
  const idx = raw.indexOf(":");
  if (idx === -1) return null;
  const head = raw.slice(0, idx);
  const channelId = raw.slice(idx + 1);
  if (!head.startsWith("stanza_")) return null;
  if (!/^\d{5,30}$/.test(channelId)) return null;
  return { head, channelId };
}

function formatStanzaPermListLines(ids, cap = 18) {
  if (!ids?.length) return "_Nessuno_";
  const slice = ids.slice(0, cap);
  const lines = slice.map((id) => `• <@${id}>`);
  if (ids.length > cap) lines.push(`_(+${ids.length - cap} altri)_`);
  return lines.join("\n");
}

function collectStanzaPermissionMemberLists(voiceChannel, meta) {
  const ownerId = String(meta?.ownerId || "");
  const viceId = normalizeStanzaDiscordUserId(meta?.viceUserId);
  const botId = String(voiceChannel.client?.user?.id || "");
  const everyoneId = voiceChannel.guild?.roles?.everyone?.id;
  const P = PermissionsBitField.Flags;
  const included = [];
  const excluded = [];
  const silencedSet = new Set(ensureStanzaSilencedUserIds(meta));
  for (const ow of voiceChannel.permissionOverwrites.cache.values()) {
    if (Number(ow.type) !== OverwriteType.Member) continue;
    const id = String(ow.id);
    if (id === everyoneId || id === botId || id === ownerId || (viceId && id === viceId)) continue;
    if (ow.deny.has(P.ViewChannel) || ow.deny.has(P.Connect)) {
      excluded.push(id);
      continue;
    }
    if (isLegacyStanzaSilenceVoiceOverwrite(ow)) {
      silencedSet.add(id);
      continue;
    }
    if (
      ow.allow.has(P.ViewChannel) &&
      ow.allow.has(P.Connect) &&
      ow.allow.has(P.Speak) &&
      !ow.allow.has(P.ManageChannels)
    ) {
      included.push(id);
    }
  }
  return { included, excluded, silenced: [...silencedSet] };
}

function buildStanzaPermissionsListEmbed(voiceChannel, meta) {
  const ownerId = String(meta?.ownerId || "");
  const viceId = normalizeStanzaDiscordUserId(meta?.viceUserId);
  const lists = collectStanzaPermissionMemberLists(voiceChannel, meta);
  const staffLines = [`👑 <@${ownerId}>`];
  if (viceId) staffLines.push(`⭐ <@${viceId}>`);
  const staffBlock = `🛡️ ${staffLines.join("\n")}`;
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("📜 · Lista Permessi")
    .setDescription(staffBlock)
    .addFields(
      { name: "✅ Inclusi", value: formatStanzaPermListLines(lists.included), inline: true },
      { name: "⛔ Esclusi", value: formatStanzaPermListLines(lists.excluded), inline: true },
      { name: "🔇 Silenziati", value: formatStanzaPermListLines(lists.silenced), inline: true },
    )
}

async function fetchOwnerMember(guild, ownerId) {
  return (
    guild.members.cache.get(ownerId) ||
    (await guild.members.fetch(ownerId).catch(() => null))
  );
}

async function fetchStanzaVoiceChannel(guild, channelId) {
  const ch =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  return ch;
}

async function resolveStanzaTeardownPermissionProbe(guild) {
  const rid = getStanzaMemberRoleId();
  if (!rid || !/^\d{5,30}$/.test(rid)) return guild.roles.everyone;
  let role = guild.roles.cache.get(rid);
  if (!role) role = await guild.roles.fetch(rid).catch(() => null);
  return role || guild.roles.everyone;
}

async function pickRandomTeardownMoveTarget(guild, excludeChannelId) {
  const exclude = new Set([String(excludeChannelId || ""), STANZA_LOBBY_VOICE_ID].filter(Boolean));
  const probe = await resolveStanzaTeardownPermissionProbe(guild);
  const candidates = [];
  for (const id of STANZA_TEARDOWN_MOVE_TARGET_VOICE_IDS) {
    if (exclude.has(id)) continue;
    const ch = await fetchStanzaVoiceChannel(guild, id);
    if (!ch) continue;
    if (guild.afkChannelId && ch.id === guild.afkChannelId) continue;
    const perms = ch.permissionsFor(probe);
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) continue;
    if (!perms.has(PermissionsBitField.Flags.Connect)) continue;
    const limit = Number(ch.userLimit) || 0;
    if (limit > 0 && ch.members.size >= limit) continue;
    candidates.push(ch);
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function moveStanzaOccupantsToChannel(voiceChannel, targetVoice) {
  if (!voiceChannel || !targetVoice) return { moved: 0, attempted: 0 };
  const humans = [...voiceChannel.members.values()].filter((m) => !m.user?.bot);
  if (!humans.length) return { moved: 0, attempted: 0 };
  const results = await Promise.all(
    humans.map((m) => m.voice.setChannel(targetVoice).then(() => true).catch(() => false)),
  );
  const moved = results.filter(Boolean).length;
  return { moved, attempted: humans.length };
}

function persistStanzaSnapshotNow() {
  if (!MAIN_GUILD_ID) return;
  try {
    const rooms = {};
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

function readStanzaSnapshotRaw() {
  try {
    if (!fs.existsSync(STANZA_SNAPSHOT_PATH)) return null;
    const j = JSON.parse(fs.readFileSync(STANZA_SNAPSHOT_PATH, "utf8"));
    if (!j || j.version !== STANZA_SNAPSHOT_VERSION || !j.rooms || typeof j.rooms !== "object") return null;
    return j;
  } catch {
    return null;
  }
}

function readStanzaSnapshotRoomsRaw() {
  const j = readStanzaSnapshotRaw();
  return j?.rooms || null;
}

function restoreStanzaPendingMapFromSnapshot(targetMap, rows, sanitizeRow) {
  if (!rows || typeof rows !== "object") return;
  const now = Date.now();
  for (const [keyRaw, rowRaw] of Object.entries(rows)) {
    const key = String(keyRaw || "").trim();
    if (!key) continue;
    const row = sanitizeRow(rowRaw);
    if (!row) continue;
    const remainingMs = Number(row.expiresAt || 0) - now;
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) continue;
    const timerId = setTimeout(() => {
      targetMap.delete(key);
      persistStanzaSnapshotNow();
    }, remainingMs);
    timerId.unref?.();
    targetMap.set(key, { ...row, timerId });
  }
}

function restoreStanzaPendingFromSnapshot() {
  const raw = readStanzaSnapshotRaw();
  const pending = raw?.pending && typeof raw.pending === "object" ? raw.pending : {};
  const sanitizeBase = (row) => {
    const voiceChannelId = String(row?.voiceChannelId || "").trim();
    const expiresAt = Number(row?.expiresAt || 0);
    if (!voiceChannelId || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;
    return { voiceChannelId, expiresAt };
  };
  restoreStanzaPendingMapFromSnapshot(stanzaRenamePending, pending.rename, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaEmojiPending, pending.emoji, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaLimitPending, pending.limit, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaDescPending, pending.desc, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaVicePending, pending.vice, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaUsersMemberPending, pending.usersMember, (row) => {
    const base = sanitizeBase(row);
    if (!base) return null;
    const action = String(row?.action || "").trim();
    if (!action) return null;
    const interactionApplicationId = row?.interactionApplicationId ? String(row.interactionApplicationId) : "";
    const interactionToken = row?.interactionToken ? String(row.interactionToken) : "";
    return {
      ...base,
      action,
      ...(interactionApplicationId && interactionToken
        ? { interactionApplicationId, interactionToken }
        : {}),
    };
  });
}

function normalizeStanzaRecordFromSnapshot(rec, guildId) {
  const ownerId = normalizeStanzaDiscordUserId(rec?.ownerId);
  if (!ownerId) return null;
  const panelMessageId = String(rec?.panelMessageId || "").trim();
  if (!panelMessageId) return null;
  const gid = String(rec?.guildId || guildId || MAIN_GUILD_ID).trim();
  const viceUserId = normalizeStanzaDiscordUserId(rec?.viceUserId) || null;
  let textChannelId = String(rec?.textChannelId || "").trim();
  if (!textChannelId || !/^\d{5,30}$/.test(textChannelId)) textChannelId = null;
  const voiceStatus = typeof rec?.voiceStatus === "string" && rec.voiceStatus.trim() ? rec.voiceStatus.trim() : null;
  const silencedUserIds = Array.isArray(rec?.silencedUserIds)
    ? rec.silencedUserIds.map((id) => String(id || "").trim()).filter((id) => /^\d{5,30}$/.test(id))
    : [];
  return {
    ownerId,
    viceUserId,
    panelMessageId,
    textChannelId,
    guildId: gid,
    startedAt: Number(rec?.startedAt) || Date.now(),
    voiceStatus,
    silencedUserIds,
  };
}

async function tryRehydrateStanzaRoomFromSnapshotRecord(guild, channelId, rec) {
  const id = String(channelId || "");
  if (!/^\d{5,30}$/.test(id)) return false;
  if (stanzaChannelMeta.has(id)) return true;
  const meta = normalizeStanzaRecordFromSnapshot(rec, guild.id);
  if (!meta || String(meta.guildId) !== String(guild.id)) return false;
  const voiceCh = await fetchStanzaVoiceChannel(guild, id);
  if (!voiceCh?.isVoiceBased?.()) return false;
  if (await channelIdIsLinkedCustomRolePrivateVoc(guild.id, id)) return false;
  const ownerOw = voiceCh.permissionOverwrites.cache.get(meta.ownerId);
  if (!ownerOw?.allow?.has(PermissionsBitField.Flags.ManageChannels)) return false;
  stanzaChannelMeta.set(id, meta);
  if (meta.voiceStatus) rememberStanzaVoiceChannelStatus(id, meta.voiceStatus);
  stanzaOwnerToChannel.set(ownerKey(guild.id, meta.ownerId), id);
  const humans = voiceCh.members.filter((m) => !m.user.bot);
  if (humans.size === 0) {
    scheduleStanzaEmptyTeardown(guild, id);
  } else {
    for (const m of humans.values()) {
      if (isStanzaUserSilenced(meta, m.id)) {
        await applyStanzaMemberServerMute(m, id, true, "Stanza: ripristino silenzio").catch(() => {});
      }
    }
  }
  // Heal stripped names after restart (no channelUpdate until next rename).
  if (!isCanonicalStanzaVoiceName(voiceCh.name)) {
    const enforced = resolveEnforcedStanzaVoiceName(voiceCh.name, voiceCh.name);
    if (enforced && enforced !== String(voiceCh.name || "")) {
      markStanzaBotRename(id);
      await voiceCh.setName(enforced, "Stanza: ripristino prefisso").catch(() => {});
      await syncStanzaCompanionTextName(guild, id, enforced);
    }
  }
  return true;
}

async function tryRehydrateStanzaRoomByChannelId(guild, channelId) {
  const rooms = readStanzaSnapshotRoomsRaw();
  if (!rooms) return false;
  const rec = rooms[channelId];
  if (!rec) return false;
  return tryRehydrateStanzaRoomFromSnapshotRecord(guild, channelId, rec);
}

async function tryAttachOwnerStanzaFromSnapshot(guild, ownerUserId) {
  const rooms = readStanzaSnapshotRoomsRaw();
  if (!rooms) return false;
  const oid = String(ownerUserId);
  let any = false;
  for (const [channelId, rec] of Object.entries(rooms)) {
    if (String(rec?.ownerId || "") !== oid) continue;
    if (String(rec?.guildId || "") !== String(guild.id)) continue;
    if (await tryRehydrateStanzaRoomFromSnapshotRecord(guild, channelId, rec)) any = true;
  }
  return any;
}

function stanzaVoiceMessageHasStanzaPanelForVoice(msg, botId, voiceChannelId) {
  const want = String(voiceChannelId || "").trim();
  if (!msg || String(msg.author?.id || "") !== String(botId || "") || !want) return false;
  for (const row of msg.components || []) {
    for (const comp of row.components || []) {
      const raw = String(comp.customId || "");
      const idx = raw.indexOf(":");
      if (idx === -1) continue;
      const head = raw.slice(0, idx);
      const rest = raw.slice(idx + 1);
      if (rest !== want) continue;
      if (head.startsWith("stanza_")) return true;
    }
  }
  return false;
}

async function voiceChannelHasBoundStanzaPanel(guild, voiceCh) {
  const botId = String(guild.client?.user?.id || "");
  const vid = String(voiceCh?.id || "");
  if (!vid) return false;
  const msgs = await voiceCh.messages.fetch({ limit: 40 }).catch(() => null);
  if (!msgs?.size) return false;
  for (const m of msgs.values()) {
    if (stanzaVoiceMessageHasStanzaPanelForVoice(m, botId, vid)) return true;
  }
  return false;
}

async function ensureStanzaMetaForOwnedVoiceChannel(guild, voiceCh, ownerId) {
  const uid = String(ownerId || "").trim();
  const id = String(voiceCh?.id || "");
  if (!uid || !id) return null;
  if (await channelIdIsLinkedCustomRolePrivateVoc(guild.id, id)) return null;
  const ok = ownerKey(guild.id, uid);
  const existingMeta = stanzaChannelMeta.get(id);
  if (existingMeta && String(existingMeta.ownerId || "") === uid) {
    stanzaOwnerToChannel.set(ok, id);
    return existingMeta;
  }
  if (existingMeta && String(existingMeta.ownerId || "") !== uid) return null;

  const botId = String(guild.client?.user?.id || "");
  let panelMessageId = "";
  const msgs = await voiceCh.messages.fetch({ limit: 50 }).catch(() => null);
  if (msgs?.size) {
    for (const m of msgs.values()) {
      if (stanzaVoiceMessageHasStanzaPanelForVoice(m, botId, id)) {
        panelMessageId = String(m.id || "");
        break;
      }
    }
  }
  let meta;
  if (panelMessageId && /^\d{5,30}$/.test(panelMessageId)) {
    meta = {
      ownerId: uid,
      viceUserId: null,
      panelMessageId,
      textChannelId: String(voiceCh.id),
      guildId: guild.id,
      startedAt: Date.now(),
    };
  } else {
    const member = await guild.members.fetch(uid).catch(() => null);
    if (!member) return null;
    const panel = await postStanzaPanel(guild, member, voiceCh, voiceCh, {
      textChannelId: voiceCh.id,
      viceUserId: null,
    });
    if (!panel?.panelMessageId) return null;
    meta = {
      ownerId: uid,
      viceUserId: null,
      panelMessageId: String(panel.panelMessageId),
      textChannelId: String(voiceCh.id),
      guildId: guild.id,
      startedAt: Number(panel.startedAt) || Date.now(),
    };
  }
  stanzaChannelMeta.set(id, meta);
  stanzaOwnerToChannel.set(ok, id);
  persistStanzaSnapshotNow();
  mirrorStanzaPublicToCompanionText(guild, voiceCh).catch(() => {});
  return meta;
}

function collectOwnerStanzaVoiceCandidatesForDiscovery(guild, ownerUserId, parentIdFilter, predicate) {
  const uid = String(ownerUserId || "").trim();
  if (!uid) return [];
  const out = [];
  const tryCollect = (useParent) => {
    for (const ch of guild.channels.cache.values()) {
      if (!ch?.isVoiceBased?.()) continue;
      if (String(ch.id) === STANZA_LOBBY_VOICE_ID) continue;
      const chParent = String(ch.parentId || "").trim();
      if (chParent && STANZA_DISCOVERY_EXCLUDE_PARENT_IDS.has(chParent)) continue;
      if (useParent && parentIdFilter && String(ch.parentId || "") !== parentIdFilter) continue;
      if (!predicate(ch)) continue;
      const ow = ch.permissionOverwrites.cache.get(uid);
      if (!ow?.allow?.has(PermissionsBitField.Flags.ManageChannels)) continue;
      out.push(ch);
    }
  };
  if (parentIdFilter) tryCollect(true);
  if (!out.length) tryCollect(false);
  return out;
}

const STANZA_DISCOVERY_RENAMED_PANEL_CHECK_CAP = 20;

async function tryDiscoverOwnerStanzaVoiceInGuild(guild, ownerUserId) {
  const uid = String(ownerUserId || "").trim();
  if (!uid || String(guild.id) !== MAIN_GUILD_ID) return false;
  const ok = ownerKey(guild.id, uid);
  if (stanzaOwnerToChannel.has(ok)) return true;
  const parentFilter = getStanzaDiscoveryParentFilter(guild);
  const byAnchor = collectOwnerStanzaVoiceCandidatesForDiscovery(
    guild,
    uid,
    parentFilter,
    isVoiceChannelDiscoveryStanzaCandidate,
  );
  let best = null;
  for (const ch of byAnchor) {
    if (!(await channelIdIsLinkedCustomRolePrivateVoc(guild.id, ch.id))) {
      best = ch;
      break;
    }
  }
  if (!best) {
    const renamed = collectOwnerStanzaVoiceCandidatesForDiscovery(
      guild,
      uid,
      parentFilter,
      isVoiceChannelDiscoveryRenamedStanzaCandidate,
    );
    const slice = renamed.slice(0, STANZA_DISCOVERY_RENAMED_PANEL_CHECK_CAP);
    for (const ch of slice) {
      if (await channelIdIsLinkedCustomRolePrivateVoc(guild.id, ch.id)) continue;
      if (await voiceChannelHasBoundStanzaPanel(guild, ch)) {
        best = ch;
        break;
      }
    }
  }
  if (!best) return false;
  const attached = await ensureStanzaMetaForOwnedVoiceChannel(guild, best, uid);
  return Boolean(attached);
}

async function getStanzaMetaOrRehydrate(guild, channelId) {
  const id = String(channelId || "");
  if (!id || !guild) return null;
  if (String(guild.id) !== MAIN_GUILD_ID) return null;
  const cur = stanzaChannelMeta.get(id);
  if (cur && String(cur.guildId) === String(guild.id)) {
    sanitizeStanzaMetaViceUserId(cur);
    return cur;
  }
  await tryRehydrateStanzaRoomByChannelId(guild, id);
  const meta = stanzaChannelMeta.get(id);
  if (meta && String(meta.guildId) === String(guild.id)) {
    sanitizeStanzaMetaViceUserId(meta);
    return meta;
  }
  return null;
}

function isStanzaRoomController(meta, userId) {
  const uid = String(userId || "").trim();
  if (!uid || !meta) return false;
  if (uid === String(meta.ownerId || "")) return true;
  const vice = normalizeStanzaDiscordUserId(meta.viceUserId);
  return Boolean(vice && uid === vice);
}

async function isStanzaButtonActorAllowed(interaction) {
  if (!interaction?.isButton?.()) return false;
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith("stanza_")) return false;
  const parsed = parseStanzaButtonId(customId);
  if (!parsed) return false;
  const guild = interaction.guild;
  if (!guild) return false;
  if (String(guild.id) !== MAIN_GUILD_ID) return true;
  const meta = await getStanzaMetaOrRehydrate(guild, parsed.channelId);
  if (!meta) return false;
  return isStanzaRoomController(meta, interaction.user?.id);
}

async function restoreStanzaRoomsFromSnapshot(client) {
  restoreStanzaPendingFromSnapshot();
  const rooms = readStanzaSnapshotRoomsRaw();
  if (!rooms) return;
  const allowedGuildIds = STANZA_ALLOWED_GUILD_IDS.size
    ? [...STANZA_ALLOWED_GUILD_IDS]
    : [MAIN_GUILD_ID].filter(Boolean);
  let restored = 0;
  for (const guildId of allowedGuildIds) {
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) continue;
    for (const [channelId, rec] of Object.entries(rooms)) {
      if (String(rec?.guildId || "") !== String(guild.id)) continue;
      if (await tryRehydrateStanzaRoomFromSnapshotRecord(guild, channelId, rec)) restored += 1;
    }
  }
  persistStanzaSnapshotNow();
}

async function handleStanzaButton(interaction) {
  if (!interaction?.isButton?.()) return false;
  const parsed = parseStanzaButtonId(interaction.customId);
  if (!parsed) return false;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Questa azione è disponibile solo nel server.", flags: 64 }).catch(() => {});
    return true;
  }
  const meta = await getStanzaMetaOrRehydrate(guild, parsed.channelId);
  if (!meta) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Questa stanza non è più attiva.", flags: 64 }).catch(() => {});
    return true;
  }
  if (!isStanzaRoomController(meta, interaction.user?.id)) {
    await interaction
      .reply({ content: "<a:VC_Cross:1482532424570376253> Solo il creatore della stanza e il vice possono usare questi pulsanti.", flags: 64 })
      .catch(() => {});
    return true;
  }
  if (
    parsed.head !== "stanza_nome" &&
    parsed.head !== "stanza_emoji" &&
    parsed.head !== "stanza_limite" &&
    parsed.head !== "stanza_desc" &&
    parsed.head !== "stanza_vice"
  ) {
    clearStanzaRenamePending(guild.id, interaction.user.id);
    clearStanzaEmojiPending(guild.id, interaction.user.id);
    clearStanzaLimitPending(guild.id, interaction.user.id);
    clearStanzaDescPending(guild.id, interaction.user.id);
    clearStanzaVicePending(guild.id, interaction.user.id);
    clearStanzaUsersMemberPending(guild.id, interaction.user.id);
  }

  if (parsed.head === "stanza_delete") {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const vid = parsed.channelId;
    const voiceCh = await fetchStanzaVoiceChannel(guild, vid);
    const profileVoc = await channelIdIsLinkedCustomRolePrivateVoc(guild.id, vid);
    await interaction
      .editReply({
        content: profileVoc
          ? "<a:VC_Loading:1482532424570376253> Rimuovo il pannello stanza dalla vocale privata…"
          : "<a:VC_Loading:1482532424570376253> Eliminazione stanza e spostamento...",
      })
      .catch(() => {});
    const me = guild.members.me;
    const canMove = Boolean(me?.permissions?.has(PermissionsBitField.Flags.MoveMembers));
    let moveTarget = null;
    let moveStats = { moved: 0, attempted: 0 };
    if (!profileVoc && voiceCh && canMove) {
      moveTarget = await pickRandomTeardownMoveTarget(guild, vid);
      if (moveTarget) {
        moveStats = await moveStanzaOccupantsToChannel(voiceCh, moveTarget);
      }
    }
    const preservedProfileVoc = await teardownStanza(guild, vid);
    let doneText = preservedProfileVoc
      ? "<a:VC_Verified:1482532479637127188> Pannello rimosso."
      : "<a:VC_Verified:1482532479637127188> Stanza eliminata.";
    if (
      !preservedProfileVoc &&
      voiceCh &&
      !canMove
    ) {
      doneText = "<a:VC_Verified:1482532479637127188> Stanza eliminata.";
    } else if (!preservedProfileVoc && voiceCh && canMove && !moveTarget) {
      doneText =
        "<a:VC_Verified:1482532479637127188> Stanza eliminata.";
    } else if (!preservedProfileVoc && voiceCh && moveTarget && moveStats.attempted > 0 && moveStats.moved === 0) {
      doneText =
        "<a:VC_Verified:1482532479637127188> Stanza eliminata.";
    } else if (!preservedProfileVoc && voiceCh && moveStats.moved > 0) {
      doneText =
        moveStats.moved === moveStats.attempted
          ? "<a:VC_Verified:1482532479637127188> Stanza eliminata."
          : `<a:VC_Verified:1482532479637127188> Stanza eliminata.`;
    }
    await interaction.editReply({ content: doneText }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_nome") {
    registerStanzaRenamePending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content:
          "✏️ Scrivi il nuovo nome della stanza.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_emoji") {
    registerStanzaEmojiPending(guild.id, interaction.user.id, parsed.channelId);
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("🌀 · Cambia Emoji")
      .setDescription("Invia un'emoji Unicode (es: 🫧, 🔥).");
    await interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_limite") {
    registerStanzaLimitPending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content: "🔢 · Scrivi il limite (0-99).",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_desc") {
    registerStanzaDescPending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content:
          "📝 · Scrivi lo stato del canale vocale. Lascia vuoto per cancellarlo.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  const voiceCh = await fetchStanzaVoiceChannel(guild, parsed.channelId);
  if (!voiceCh) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Canale vocale non trovato.", flags: 64 }).catch(() => {});
    return true;
  }

  const ownerMember = await fetchOwnerMember(guild, meta.ownerId);
  if (!ownerMember) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Impossibile caricare il creatore della stanza.", flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_manage") {
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(voiceCh, meta)],
        components: buildStanzaManageRows(voiceCh),
      })
      .catch(async () => {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Non è stato possibile aggiornare il pannello.", flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_users") {
    const updated = (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaUsersManageEmbed(updated)],
        components: buildStanzaUsersManageRows(updated, meta),
      })
      .catch(async () => {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Non è stato possibile aggiornare il pannello.", flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_users_back") {
    const startedAt = Number(meta.startedAt) || Date.now();
    const updatedHome =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaHomePanelEmbed(ownerMember, updatedHome, startedAt, meta)],
        components: buildStanzaHomeRows(parsed.channelId),
      })
      .catch(async () => {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Non è stato possibile aggiornare il pannello.", flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_back") {
    const startedAt = Number(meta.startedAt) || Date.now();
    const updatedHome =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaHomePanelEmbed(ownerMember, updatedHome, startedAt, meta)],
        components: buildStanzaHomeRows(parsed.channelId),
      })
      .catch(async () => {
        await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Non è stato possibile aggiornare il pannello.", flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_nascondi" || parsed.head === "stanza_mostra") {
    const hide = parsed.head === "stanza_nascondi";
    const ok = hide
      ? await applyStanzaMemberRoleViewHidden(voiceCh, guild, meta.ownerId)
      : await applyStanzaMemberRoleViewVisible(voiceCh, guild);
    const updated =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    if (!ok) {
      await interaction
        .reply({
          content:
            "<a:VC_Cross:1482532424570376253> Non è stato possibile aggiornare i permessi del canale.",
          flags: 64,
        })
        .catch(() => {});
      return true;
    }
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(updated, meta)],
        components: buildStanzaManageRows(updated),
      })
      .catch(async () => {
        await interaction
          .reply({
            content: hide
              ? "👻 Canale nascosto per tutti."
              : "👁️ Visibilità ripristinata per tutti.",
            flags: 64,
          })
          .catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_blocca" || parsed.head === "stanza_sblocca") {
    const lock = parsed.head === "stanza_blocca";
    const ok = lock
      ? await applyStanzaMemberRoleAccessLocked(voiceCh, guild, meta.ownerId)
      : await applyStanzaMemberRoleAccessPublic(voiceCh, guild);
    const updated =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    if (!ok) {
      await interaction
        .reply({
          content:
            "<a:VC_Cross:1482532424570376253> Non è stato possibile aggiornare i permessi del canale.",
          flags: 64,
        })
        .catch(() => {});
      return true;
    }
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(updated, meta)],
        components: buildStanzaManageRows(updated),
      })
      .catch(async () => {
        await interaction
          .reply({
            content: lock
              ? "🔒 Accesso bloccato per tutti."
              : "🌟 Accesso ripristinato per tutti.",
            flags: 64,
          })
          .catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_vice") {
    if (String(interaction.user?.id || "") !== String(meta.ownerId || "")) {
      await interaction
        .reply({ content: "<a:VC_Cross:1482532424570376253> Solo il creatore della stanza può nominare o revocare il vice.", flags: 64 })
        .catch(() => {});
      return true;
    }
    registerStanzaVicePending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content:
          "🌙 Menziona l'utente da nominare Vice.\n" +
          "Scrivi `nessuno` o menziona il vice attuale per rimuoverlo.\n\n" +
          "Il vice ottiene sul canale gli stessi permessi del creatore (solo per questa stanza).",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_include") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "include", interaction);
    await interaction
      .reply({
        content: "✏️ Menziona l'utente da includere.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_exclude") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "exclude", interaction);
    await interaction
      .reply({
        content: "✏️ Menziona l'utente da escludere.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_silenzia") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "silenzia", interaction);
    await interaction
      .reply({
        content: "🛡️ Menziona l'utente da silenziare.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_smuta") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "smuta", interaction);
    await interaction
      .reply({
        content: "🔊 Menziona l'utente da smutare.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_list") {
    await interaction
      .reply({ embeds: [buildStanzaPermissionsListEmbed(voiceCh, meta)], flags: 64 })
      .catch(() => {});
    return true;
  }

  await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Azione non disponibile.", flags: 64 }).catch(() => {});
  return true;
}

function getStanzaPanelViewKind(msg) {
  for (const row of msg.components || []) {
    for (const comp of row.components || []) {
      const id = String(comp.customId || "");
      if (
        id.startsWith("stanza_users_include:") ||
        id.startsWith("stanza_users_exclude:") ||
        id.startsWith("stanza_users_silenzia:") ||
        id.startsWith("stanza_users_smuta:") ||
        id.startsWith("stanza_users_list:") ||
        id.startsWith("stanza_users_back:")
      ) {
        return "users";
      }
      if (id.startsWith("stanza_back:")) return "manage";
    }
  }
  return "home";
}

async function refreshStanzaPanelEmbedsIfPossible(guild, voiceChannelId) {
  const vid = String(voiceChannelId || "");
  const meta = await getStanzaMetaOrRehydrate(guild, vid);
  const panelId = stanzaPanelTargetChannelId(meta);
  if (!meta?.panelMessageId || !panelId) return;
  const panelCh =
    guild.channels.cache.get(panelId) || (await guild.channels.fetch(panelId).catch(() => null));
  if (!panelCh?.isTextBased?.()) return;
  const msg = await panelCh.messages.fetch(meta.panelMessageId).catch(() => null);
  if (!msg?.editable) return;
  const voiceCh = await fetchStanzaVoiceChannel(guild, vid);
  if (!voiceCh) return;
  const ownerMember = await fetchOwnerMember(guild, meta.ownerId);
  if (!ownerMember) return;
  const startedAt = Number(meta.startedAt) || Date.now();
  const kind = getStanzaPanelViewKind(msg);
  const embeds =
    kind === "manage"
      ? [buildStanzaManageSettingsEmbed(voiceCh, meta)]
      : kind === "users"
        ? [buildStanzaUsersManageEmbed(voiceCh)]
        : [buildStanzaHomePanelEmbed(ownerMember, voiceCh, startedAt, meta)];
  const components =
    kind === "manage"
      ? buildStanzaManageRows(voiceCh)
      : kind === "users"
        ? buildStanzaUsersManageRows(voiceCh, meta)
        : buildStanzaHomeRows(vid);
  await msg.edit({ embeds, components }).catch(() => {});
}

async function handleStanzaRenameMessageCreate(message) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = pendingRenameKey(message.guild.id, message.author.id);
  const pending = stanzaRenamePending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaRenamePending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const vid = pending.voiceChannelId;
  const meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaRenamePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaRenamePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  const newName = buildStanzaVoiceNameFromUserPart(rawLine, voiceCh.name);
  if (!newName) {
    await message.delete().catch(() => {});
    clearStanzaRenamePending(message.guild.id, message.author.id);
    return true;
  }

  markStanzaBotRename(vid);
  await voiceCh.setName(newName, "Stanza: rinomina").catch(() => {});
  await syncStanzaCompanionTextName(message.guild, vid, newName);
  await message.delete().catch(() => {});
  clearStanzaRenamePending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaEmojiMessageCreate(message) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = pendingEmojiKey(message.guild.id, message.author.id);
  const pending = stanzaEmojiPending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const emojiOnly = extractExactUnicodeEmojiLine(rawLine);
  if (!emojiOnly) return false;

  const vid = pending.voiceChannelId;
  const meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  const newName = buildStanzaVoiceNameWithNewEmoji(voiceCh.name, emojiOnly);
  if (!newName) {
    await message.delete().catch(() => {});
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    return true;
  }

  markStanzaBotRename(vid);
  await voiceCh.setName(newName, "Stanza: emoji").catch(() => {});
  await syncStanzaCompanionTextName(message.guild, vid, newName);
  await message.delete().catch(() => {});
  clearStanzaEmojiPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaLimitMessageCreate(message) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = pendingLimitKey(message.guild.id, message.author.id);
  const pending = stanzaLimitPending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaLimitPending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const limitVal = parseStanzaLimitUserInput(rawLine);
  if (limitVal === null) return false;

  const vid = pending.voiceChannelId;
  const meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaLimitPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaLimitPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  await voiceCh.setUserLimit(limitVal, "Stanza: limite utenti").catch(() => {});
  await message.delete().catch(() => {});
  clearStanzaLimitPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaDescMessageCreate(message) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = pendingDescKey(message.guild.id, message.author.id);
  const pending = stanzaDescPending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaDescPending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const firstLine = String(message.content || "").split("\n")[0];
  if (firstLine.trimStart().startsWith(prefix)) return false;

  const vid = pending.voiceChannelId;
  const meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaDescPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaDescPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  const statusText = sanitizeStanzaVoiceStatus(message.content);
  await setStanzaVoiceChannelStatus(message.client, voiceCh.id, statusText, "Stanza: stato canale vocale").catch(() => {});
  await message.delete().catch(() => {});
  clearStanzaDescPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaUsersMemberMessageCreate(message) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = ownerKey(message.guild.id, message.author.id);
  const pending = stanzaUsersMemberPending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const vid = pending.voiceChannelId;
  let meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: "<a:VC_Cross:1482532424570376253> Questa stanza non è più attiva." });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: "<a:VC_Cross:1482532424570376253> Canale vocale non trovato." });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }

  if (!isStanzaRoomController(meta, message.author.id)) {
    await editStanzaUsersMemberFollowup(message.client, pending, {
      content: "<a:VC_Cross:1482532424570376253> Solo il creatore della stanza e il vice possono usare questa azione.",
    });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned || mentioned.bot) return false;

  const targetId = mentioned.id;
  const botId = String(message.client.user.id);
  const viceId = normalizeStanzaDiscordUserId(meta.viceUserId);
  const failPerm =
    "<a:VC_Cross:1482532424570376253> Non sono riuscito ad aggiornare i permessi sul canale.";

  if (targetId === botId || targetId === String(meta.ownerId) || (viceId && targetId === viceId)) {
    await editStanzaUsersMemberFollowup(message.client, pending, {
      content: "<a:VC_Cross:1482532424570376253> Non puoi usare questa azione su bot, creatore o vice.",
    });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
  if (!targetMember || targetMember.user?.bot) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: "<a:VC_Cross:1482532424570376253> Utente non valido." });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const action = pending.action;
  let ok = false;
  let doneLine = "";

  const tchUsers = await stanzaCompanionTextChannel(message.guild, vid);

  if (action === "include") {
    ok = await applyStanzaMemberVoicePerms(voiceCh, targetId, STANZA_VOICE_MEMBER_ALLOW, "Stanza: includi utente").catch(() => {});
    if (ok && tchUsers) {
      await applyStanzaMemberTextPerms(tchUsers, targetId, STANZA_TEXT_MEMBER_ALLOW, "Stanza: includi utente").catch(() => {});
    }
    doneLine = ok ? `<a:VC_Verified:1482532479637127188> ${targetMember} è stato incluso.` : failPerm;
  } else if (action === "exclude") {
    ok = await applyStanzaMemberVoicePerms(voiceCh, targetId, STANZA_VOICE_MEMBER_EXCLUDE, "Stanza: escludi utente").catch(() => {});
    if (ok && tchUsers) {
      await applyStanzaMemberTextPerms(tchUsers, targetId, STANZA_TEXT_MEMBER_EXCLUDE, "Stanza: escludi utente").catch(() => {});
    }
    if (ok && targetMember.voice?.channelId === voiceCh.id) {
      await targetMember.voice.disconnect("Stanza: escluso dalla stanza").catch(() => {});
    }
    doneLine = ok ? `<a:VC_Verified:1482532479637127188> ${targetMember} è stato escluso.` : failPerm;
  } else if (action === "silenzia") {
    const botId = String(message.client?.user?.id || "");
    if (botId) await ensureStanzaBotVoiceOverwrite(voiceCh, botId).catch(() => {});
    await clearLegacyStanzaSilenceChannelOverwrites(
      voiceCh,
      tchUsers,
      targetId,
      "Stanza: silenzio solo server mute Discord",
    );
    addStanzaSilencedUser(meta, targetId);
    persistStanzaSnapshotNow();
    if (String(targetMember.voice?.channelId || "") === String(voiceCh.id)) {
      ok = await applyStanzaMemberServerMute(targetMember, voiceCh.id, true, "Stanza: silenzia utente");
      doneLine = ok
        ? `<a:VC_Verified:1482532479637127188> ${targetMember} è stato silenziato.`
        : failPerm;
    } else {
      ok = true;
      doneLine = `<a:VC_Verified:1482532479637127188> ${targetMember} è silenziato in questa stanza (mute al prossimo ingresso).`;
    }
  } else if (action === "smuta") {
    const legacyOw = voiceCh.permissionOverwrites.cache.get(targetId);
    const wasSilenced = isStanzaUserSilenced(meta, targetId) || isLegacyStanzaSilenceVoiceOverwrite(legacyOw);
    if (!wasSilenced) {
      doneLine = `<a:VC_Cross:1482532424570376253> ${targetMember} non risulta silenziato in questa stanza.`;
    } else {
      const botId = String(message.client?.user?.id || "");
      if (botId) await ensureStanzaBotVoiceOverwrite(voiceCh, botId).catch(() => {});
      await clearLegacyStanzaSilenceChannelOverwrites(
        voiceCh,
        tchUsers,
        targetId,
        "Stanza: smuta (rimuovi overwrite legacy)",
      );
      removeStanzaSilencedUser(meta, targetId);
      persistStanzaSnapshotNow();
      if (String(targetMember.voice?.channelId || "") === String(voiceCh.id)) {
        ok = await applyStanzaMemberServerMute(targetMember, voiceCh.id, false, "Stanza: smuta utente");
      } else {
        ok = true;
      }
      doneLine = ok ? `<a:VC_Verified:1482532479637127188> ${targetMember} è stato smutato.` : failPerm;
    }
  }

  await editStanzaUsersMemberFollowup(message.client, pending, { content: doneLine });
  await message.delete().catch(() => {});
  clearStanzaUsersMemberPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaViceMessageCreate(message) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = ownerKey(message.guild.id, message.author.id);
  const pending = stanzaVicePending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaVicePending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const vid = pending.voiceChannelId;
  let meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaVicePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    persistStanzaSnapshotNow();
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaVicePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    persistStanzaSnapshotNow();
    return true;
  }

  const ownerId = String(meta.ownerId || "");
  const tchVice = await stanzaCompanionTextChannel(message.guild, vid);

  if (/^nessuno$/i.test(rawLine)) {
    const oldVice = normalizeStanzaDiscordUserId(meta.viceUserId);
    if (oldVice) {
      await removeStanzaMemberVoiceOverwrite(voiceCh, oldVice);
      if (tchVice) await removeStanzaMemberTextOverwrite(tchVice, oldVice);
      meta.viceUserId = null;
    }
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    persistStanzaSnapshotNow();
    return true;
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned || mentioned.bot) return false;

  const targetId = mentioned.id;
  if (targetId === ownerId) {
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    persistStanzaSnapshotNow();
    return true;
  }

  const currentVice = normalizeStanzaDiscordUserId(meta.viceUserId);
  if (currentVice && targetId === currentVice) {
    await removeStanzaMemberVoiceOverwrite(voiceCh, currentVice);
    if (tchVice) await removeStanzaMemberTextOverwrite(tchVice, currentVice);
    meta.viceUserId = null;
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    persistStanzaSnapshotNow();
    return true;
  }

  const prevVice = currentVice;
  if (prevVice) {
    await removeStanzaMemberVoiceOverwrite(voiceCh, prevVice);
    if (tchVice) await removeStanzaMemberTextOverwrite(tchVice, prevVice);
  }

  const ok = await setStanzaPrivilegedUserVoiceOverwrite(voiceCh, targetId, "Stanza: accesso vice").catch(() => {});
  if (!ok) {
    if (prevVice) {
      await setStanzaPrivilegedUserVoiceOverwrite(voiceCh, prevVice, "Stanza: accesso vice").catch(() => {});
      if (tchVice) {
        await setStanzaPrivilegedUserTextOverwrite(tchVice, prevVice, "Stanza: accesso vice").catch(() => {});
      }
    }
    meta.viceUserId = prevVice || null;
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    persistStanzaSnapshotNow();
    return true;
  }
  if (tchVice) {
    await setStanzaPrivilegedUserTextOverwrite(tchVice, targetId, "Stanza: accesso vice").catch(() => {});
  }
  meta.viceUserId = normalizeStanzaDiscordUserId(targetId) || null;
  await message.delete().catch(() => {});
  clearStanzaVicePending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  persistStanzaSnapshotNow();
  return true;
}

async function handleStanzaPanelPromptMessageCreate(message) {
  if (await handleStanzaUsersMemberMessageCreate(message)) return true;
  if (await handleStanzaViceMessageCreate(message)) return true;
  if (await handleStanzaEmojiMessageCreate(message)) return true;
  if (await handleStanzaLimitMessageCreate(message)) return true;
  if (await handleStanzaDescMessageCreate(message)) return true;
  if (await handleStanzaRenameMessageCreate(message)) return true;
  return false;
}

/**
 * Enforce ༄{emoji}︲{label} after manual Discord renames (and any other name edits).
 * Only for tracked stanza rooms (meta/snapshot) — never other ༄ voice/stage channels.
 * Never injects "Stanza di" on rename (create-only).
 * Bot-initiated setName is ignored via stanzaBotRenameUntil to avoid loops.
 */
async function handleStanzaChannelUpdate(oldChannel, newChannel) {
  void STANZA_NAME_ENFORCE_MARKER;
  if (!newChannel?.guild || !isStanzaGuildAllowed(newChannel.guild.id)) return false;
  const isVoice =
    newChannel.type === ChannelType.GuildVoice ||
    (typeof newChannel.isVoiceBased === "function" && newChannel.isVoiceBased());
  if (!isVoice) return false;

  const cid = String(newChannel.id || "");
  if (!cid) return false;
  if (isStanzaBotRename(cid)) return false;

  const oldName = String(oldChannel?.name || "");
  const newName = String(newChannel.name || "");
  if (!oldName || oldName === newName) return false;

  const guild = newChannel.guild;
  const meta = await getStanzaMetaOrRehydrate(guild, cid);
  /* Meta-only: do not infer "stanza" from ༄ prefix (Streaming / duo / stage, etc.). */
  if (!meta) return false;

  const enforced = resolveEnforcedStanzaVoiceName(oldName, newName);
  if (!enforced || enforced === newName) return false;

  markStanzaBotRename(cid);
  const ok = await newChannel.setName(enforced, "Stanza: ripristino prefisso").then(() => true).catch((err) => {
    global.logger?.warn?.("[stanza] name enforce failed:", err?.message || err);
    return false;
  });
  if (!ok) return false;

  await syncStanzaCompanionTextName(guild, cid, enforced);
  await refreshStanzaPanelEmbedsIfPossible(guild, cid).catch(() => {});
  return true;
}

function isStanzaVoiceChannelCached(guild, channelId) {
  const cid = String(channelId || "").trim();
  const gid = String(guild?.id || "").trim();
  if (!cid || !gid) return false;
  if (stanzaChannelMeta.has(cid)) return true;
  for (const meta of stanzaChannelMeta.values()) {
    if (String(meta?.guildId || "") !== gid) continue;
    if (String(meta?.textChannelId || "") === cid) return true;
  }
  return false;
}

async function isStanzaCommandChannel(guild, channel) {
  if (!guild || !channel) return false;
  const cid = String(channel.id || "").trim();
  if (!cid) return false;
  if (isStanzaVoiceChannelCached(guild, cid)) return true;
  const isVoice =
    channel.type === ChannelType.GuildVoice ||
    (typeof channel.isVoiceBased === "function" && channel.isVoiceBased() && !channel.isThread?.());
  if (isVoice) {
    const meta = await getStanzaMetaOrRehydrate(guild, cid);
    if (meta) return true;
    if (STANZA_CATEGORY_ID && String(channel.parentId || "") === STANZA_CATEGORY_ID) return true;
  }
  return false;
}

module.exports = {
  isStanzaButtonActorAllowed,
  isStanzaCommandChannel,
  restoreStanzaRoomsFromSnapshot,
  finalizeStanzaVisitorVoiceSessionIfLeft,
  handleStanzaVoiceLobbyJoin,
  handleStanzaVoiceOccupied,
  handleStanzaVoiceEmpty,
  handleStanzaVoiceSilenceSync,
  handleStanzaButton,
  handleStanzaRenameMessageCreate,
  handleStanzaEmojiMessageCreate,
  handleStanzaLimitMessageCreate,
  handleStanzaDescMessageCreate,
  handleStanzaViceMessageCreate,
  handleStanzaPanelPromptMessageCreate,
  handleStanzaChannelUpdate,
  buildStanzaChannelName,
  resolveEnforcedStanzaVoiceName,
  isCanonicalStanzaVoiceName,
  resolveStanzaVoiceCreatePlacement,
  placeStanzaAfterGroupTail,
  isManagedStanzaRoomChannel,
  STANZA_NAME_ENFORCE_MARKER,
  STANZA_UNDER_HUB_STACK_MARKER,
};
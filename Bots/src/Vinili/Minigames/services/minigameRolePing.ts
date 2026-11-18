/** Minigiochi: menzione ruolo sull’avvio (stesso messaggio dell’embed), con anti-doppione anche dopo un riavvio. */
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const mongoose = require("mongoose") as typeof import("mongoose");

const rolePingSentThisStart = new Set();
/** Ping già claimato, da infilare nel prossimo sendMinigameMessage di start. */
const pendingRolePingByChannel = new Map();
const ROLE_PING_RECENT_MS = 5 * 60 * 1000;
const MINIGAME_ROLE_PING_DOC_TYPE = SITE_DOCUMENT_TYPE.MINIGAME_ROLE_PING;

function clearRolePingSentThisStart(channelId?) {
  const chId = String(channelId || "").trim();
  if (chId) {
    rolePingSentThisStart.delete(chId);
    pendingRolePingByChannel.delete(chId);
  }
}

async function hasRecentPersistedRolePing(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId || mongoose.connection?.readyState !== 1) return false;
  const doc = await SiteDocument.findOne({
    docType: MINIGAME_ROLE_PING_DOC_TYPE,
    dedupeKey: chId,
  })
    .select("rawWebhook cooldownUntil updatedAt")
    .lean()
    .catch(() => null);
  if (!doc) return false;
  const at = Math.floor(Number(doc?.rawWebhook?.at) || 0)
    || Math.floor(Number(doc?.cooldownUntil ? new Date(doc.cooldownUntil).getTime() - ROLE_PING_RECENT_MS : 0) || 0)
    || Math.floor(Number(doc?.updatedAt ? new Date(doc.updatedAt).getTime() : 0) || 0);
  if (!at || Date.now() - at > ROLE_PING_RECENT_MS) {
    await SiteDocument.deleteMany({ docType: MINIGAME_ROLE_PING_DOC_TYPE, dedupeKey: chId }).catch(() => null);
    return false;
  }
  return true;
}

async function persistRolePingSent(channelId?, guildId = "") {
  const chId = String(channelId || "").trim();
  if (!chId || mongoose.connection?.readyState !== 1) return;
  const now = Date.now();
  await SiteDocument.findOneAndUpdate(
    { docType: MINIGAME_ROLE_PING_DOC_TYPE, dedupeKey: chId },
    {
      $set: {
        guildId: String(guildId || IDs.guilds?.main || "").trim(),
        status: "active",
        cooldownUntil: new Date(now + ROLE_PING_RECENT_MS),
        rawWebhook: { at: now },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function clearPersistedRolePing(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId || mongoose.connection?.readyState !== 1) return;
  await SiteDocument.deleteMany({ docType: MINIGAME_ROLE_PING_DOC_TYPE, dedupeKey: chId }).catch(() => null);
}

function buildMinigameRolePingContent(cfg?, extraRoleId?) {
  const roleIds = [];
  const seen = new Set();
  const push = (id?) => {
    const rid = String(id || "").trim();
    if (!rid || seen.has(rid)) return;
    seen.add(rid);
    roleIds.push(rid);
  };
  push(extraRoleId || cfg?.roleId);
  if (!roleIds.length) push(IDs.roles?.Minigames);
  if (!roleIds.length) return "";
  return roleIds.map((id?) => `<@&${id}>`).join(" ");
}

/**
 * Claim del ping per il prossimo messaggio di start (non invia nulla da solo).
 * Restituisce il content menzione, o "" se già pingato di recente.
 */
async function sendMinigameRolePing(channel?, cfg?, extraRoleId?) {
  const content = buildMinigameRolePingContent(cfg, extraRoleId);
  const chId = String(channel?.id || "").trim();
  if (!content || !chId) return null;
  if (rolePingSentThisStart.has(chId)) {
    const pending = pendingRolePingByChannel.get(chId);
    return pending || null;
  }
  if (await hasRecentPersistedRolePing(chId)) {
    rolePingSentThisStart.add(chId);
    return null;
  }
  rolePingSentThisStart.add(chId);
  pendingRolePingByChannel.set(chId, content);
  const guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
  await persistRolePingSent(chId, guildId);
  return content;
}

/** Consuma il ping in attesa per il canale (una sola volta, al send dello start). */
function takePendingMinigameRolePing(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId) return "";
  const ping = pendingRolePingByChannel.get(chId);
  if (!ping) return "";
  pendingRolePingByChannel.delete(chId);
  return String(ping);
}

function peekPendingMinigameRolePing(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId) return "";
  return String(pendingRolePingByChannel.get(chId) || "");
}

export = {
  clearRolePingSentThisStart,
  clearPersistedRolePing,
  buildMinigameRolePingContent,
  sendMinigameRolePing,
  takePendingMinigameRolePing,
  peekPendingMinigameRolePing,
};

/** Minigiochi: menzione del ruolo all'avvio, con anti-doppione anche dopo un riavvio. */
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const mongoose = require("mongoose") as typeof import("mongoose");

const rolePingSentThisStart = new Set();
const ROLE_PING_RECENT_MS = 5 * 60 * 1000;
const MINIGAME_ROLE_PING_DOC_TYPE = SITE_DOCUMENT_TYPE.MINIGAME_ROLE_PING;

function clearRolePingSentThisStart(channelId?) {
  const chId = String(channelId || "").trim();
  if (chId) rolePingSentThisStart.delete(chId);
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
  if (!roleIds.length) return "";
  return roleIds.map((id?) => `<@&${id}>`).join(" ");
}

async function sendMinigameRolePing(channel?, cfg?, extraRoleId?) {
  const content = buildMinigameRolePingContent(cfg, extraRoleId);
  const chId = String(channel?.id || "").trim();
  if (!content || !chId || typeof channel?.send !== "function") return;
      if (rolePingSentThisStart.has(chId)) return;
  if (await hasRecentPersistedRolePing(chId)) {
    rolePingSentThisStart.add(chId);
    return;
  }
  rolePingSentThisStart.add(chId);
  try {
    await channel.send({ content });
    const guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
    await persistRolePingSent(chId, guildId);
  } catch (_) {
    rolePingSentThisStart.delete(chId);
  }
}

export = { clearRolePingSentThisStart, clearPersistedRolePing, sendMinigameRolePing };

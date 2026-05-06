"use strict";

const path = require("path");
const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { isUserInMainGuild } = require("../../Utils/Interaction/verifyUtils");
const { ensureSponsorVerificatoForMember } = require("./communityOpsService");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");

const KICK_DELAY_MS = 24 * 60 * 60 * 1000;
/** Solo questo nome ruolo sul server TAG sponsor attiva il bypass (non altri ruoli booster). */
const SERVER_BOOSTER_ROLE_NAME = "༄ Server Booster";
/** @type {Map<string, { timeoutId: ReturnType<typeof setTimeout> }>} */
const pending = new Map();
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "sponsorVerifiedPendingKickSnapshot.json");
let pendingLoaded = false;
let pendingFlushRegistered = false;

function scheduleKey(sponsorGuildId, userId) {
  return `${String(sponsorGuildId)}:${String(userId)}`;
}

function getSponsorGuildIdsSet() {
  const list = Array.isArray(IDs.guilds?.sponsorGuildIds) ? IDs.guilds.sponsorGuildIds : [];
  return new Set(list.map(String).filter(Boolean));
}

function getVerificatoRoleIdForGuild(guildId) {
  const gid = String(guildId || "");
  const map = IDs.verificatoRoleIds || {};
  return String(map[gid] || map[String(gid)] || "").trim();
}

function memberHasVerificatoRole(member, guildId) {
  const rid = getVerificatoRoleIdForGuild(guildId);
  if (!rid || !member?.roles?.cache) return false;
  return member.roles.cache.has(rid);
}

/**
 * Bypass solo se sul server **TAG sponsor** hanno il ruolo col nome esatto `༄ Server Booster`.
 * @param {import("discord.js").GuildMember} member
 */
function memberHasServerBoosterBypass(member) {
  if (!member?.roles?.cache || !member.guild) return false;
  if (!getSponsorGuildIdsSet().has(String(member.guild.id))) return false;
  for (const role of member.roles.cache.values()) {
    if (String(role?.name || "") === SERVER_BOOSTER_ROLE_NAME) return true;
  }
  return false;
}

function clearPending(sponsorGuildId, userId) {
  const key = scheduleKey(sponsorGuildId, userId);
  const row = pending.get(key);
  if (row?.timeoutId) clearTimeout(row.timeoutId);
  pending.delete(key);
  persistPendingNow();
}

function clearAllPendingForUser(userId) {
  const uid = String(userId || "");
  if (!uid) return;
  const suffix = `:${uid}`;
  for (const key of [...pending.keys()]) {
    if (key.endsWith(suffix)) {
      const guildId = key.slice(0, -suffix.length);
      clearPending(guildId, uid);
    }
  }
}

function mainInviteUrl() {
  const raw = String(IDs.links?.invite || "https://discord.gg/viniliecaffe").trim();
  if (!raw) return "https://discord.gg/viniliecaffe";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

async function sendMustJoinMainDm(user) {
  const invite = mainInviteUrl();
  const text = [
    "**Vinili & Caffè — server partner (TAG)**",
    "",
    "Hai il ruolo **verificato** su questo server partner, ma **non risulti nel server principale** Vinili & Caffè.",
    "",
    "Per **continuare a usare la TAG** devi **entrare nel server principale** entro **24 ore** da questo messaggio.",
    "",
    `Link di invito: ${invite}`,
    "",
    "Se entri in tempo non succede nulla. Se non entri, verrai **rimosso da questo server partner** allo scadere delle 24 ore.",
  ].join("\n");
  await user.send({ content: text }).catch(() => null);
}

async function runScheduledKick(client, sponsorGuildId, userId) {
  const key = scheduleKey(sponsorGuildId, userId);
  pending.delete(key);
  persistPendingNow();

  if (!client || !sponsorGuildId || !userId) return;
  if (await isUserInMainGuild(client, userId)) return;

  const sponsorGuild = await getClientGuildCached(client, sponsorGuildId).catch(() => null);
  if (!sponsorGuild) return;

  const member = await getGuildMemberCached(sponsorGuild, userId).catch(() => null);
  if (!member) return;

  const rid = getVerificatoRoleIdForGuild(sponsorGuildId);
  if (!rid || !member.roles?.cache?.has(rid)) return;
  if (memberHasServerBoosterBypass(member)) return;

  await member
    .kick(
      "Ruolo verificato su TAG senza membership nel server principale Vinili & Caffè entro 24h.",
    )
    .catch((err) => {
      global.logger?.warn?.(
        "[sponsorVerifiedRequiresMain] kick fallito:",
        sponsorGuildId,
        userId,
        err?.message || err,
      );
    });
}

function persistPendingNow() {
  const now = Date.now();
  const payload = {};
  for (const [key, row] of pending.entries()) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!key || !Number.isFinite(expiresAt) || expiresAt <= now) continue;
    payload[key] = { expiresAt };
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_sponsor_pending_kick",
    version: 1,
    payload,
  });
}

function ensurePendingLoaded(client) {
  if (pendingLoaded) return;
  pendingLoaded = true;
  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_sponsor_pending_kick",
    version: 1,
    fallback: {},
  });
  const now = Date.now();
  for (const [key, row] of Object.entries(raw || {})) {
    const expiresAt = Number(row?.expiresAt || 0);
    if (!key || !Number.isFinite(expiresAt) || expiresAt <= now) continue;
    const [guildId, userId] = String(key).split(":");
    if (!guildId || !userId) continue;
    const timeoutId = setTimeout(() => {
      runScheduledKick(client, guildId, userId).catch(() => null);
    }, Math.max(1_000, expiresAt - now));
    timeoutId.unref?.();
    pending.set(key, { timeoutId, expiresAt });
  }
  armShutdownCheckpoint();
  if (!pendingFlushRegistered) {
    pendingFlushRegistered = true;
    registerShutdownFlush("vinyls_sponsor_pending_kick", () => persistPendingNow());
  }
}

/**
 * @param {import("discord.js").GuildMember} member
 * @param {import("discord.js").Client} [client]
 */
async function maybeScheduleEnforcement(member, client) {
  const gid = String(member?.guild?.id || "");
  if (!gid || !getSponsorGuildIdsSet().has(gid)) return;

  const resolvedClient = client || member.client;
  if (!resolvedClient) return;
  ensurePendingLoaded(resolvedClient);

  const uid = String(member.id || "");
  if (!uid) return;

  const verificatoRid = getVerificatoRoleIdForGuild(gid);
  if (!verificatoRid) return;

  let m = member;
  if (!m.roles?.cache?.size && m.partial) {
    m = (await getGuildMemberCached(member.guild, uid, { preferFresh: true }).catch(() => null)) || m;
  }
  if (!memberHasVerificatoRole(m, gid)) {
    clearPending(gid, uid);
    return;
  }

  if (memberHasServerBoosterBypass(m)) {
    clearPending(gid, uid);
    return;
  }

  if (await isUserInMainGuild(resolvedClient, uid)) {
    clearPending(gid, uid);
    return;
  }

  const key = scheduleKey(gid, uid);
  if (pending.has(key)) return;

  await sendMustJoinMainDm(m.user);

  const timeoutId = setTimeout(() => {
    runScheduledKick(resolvedClient, gid, uid).catch((err) =>
      global.logger?.warn?.(
        "[sponsorVerifiedRequiresMain] timer kick:",
        err?.message || err,
      ),
    );
  }, KICK_DELAY_MS);
  timeoutId.unref?.();
  pending.set(key, { timeoutId, expiresAt: Date.now() + KICK_DELAY_MS });
  persistPendingNow();
}

/**
 * @param {import("discord.js").GuildMember} member
 */
async function handleGuildMemberAdd(member) {
  if (!member?.guild || member.user?.bot) return;
  const gid = String(member.guild.id);
  const mainId = String(IDs.guilds?.main || "").trim();

  if (gid === mainId) {
    clearAllPendingForUser(member.id);
    return;
  }

  if (getSponsorGuildIdsSet().has(gid)) {
    await maybeScheduleEnforcement(member, member.client);
  }
}

/**
 * @param {import("discord.js").GuildMember} oldMember
 * @param {import("discord.js").GuildMember} newMember
 * @param {import("discord.js").Client} [client]
 */
async function handleGuildMemberUpdate(_oldMember, newMember, client) {
  if (!newMember?.guild || newMember.user?.bot) return;
  const gid = String(newMember.guild.id);
  if (!getSponsorGuildIdsSet().has(gid)) return;

  const verificatoRid = getVerificatoRoleIdForGuild(gid);
  if (!verificatoRid) return;

  const has = newMember.roles.cache.has(verificatoRid);

  if (!has) {
    clearPending(gid, String(newMember.id));
    return;
  }

  await ensureSponsorVerificatoForMember(newMember).catch(() => {});
  await maybeScheduleEnforcement(newMember, client || newMember.client);
}

/**
 * @param {import("discord.js").GuildMember|import("discord.js").PartialGuildMember} member
 */
function handleGuildMemberRemoveFromSponsor(member) {
  if (!member?.guild || member.user?.bot) return;
  const gid = String(member.guild.id);
  if (!getSponsorGuildIdsSet().has(gid)) return;
  clearPending(gid, String(member.id));
}

module.exports = {
  handleGuildMemberAdd,
  handleGuildMemberUpdate,
  handleGuildMemberRemoveFromSponsor,
  maybeScheduleEnforcement,
  clearAllPendingForUser,
  clearPending,
};
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { EPHEMERAL_TTL_PING_ONLY_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const { resolveSubmissionChannel } = require("./candidatureApplicationHandlers");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");
const {
  isCommunicationTimeoutActive,
  restoreRolesAfterCommunicationTimeoutEnd,
} = require("../../Services/Moderation/mutedMirrorRoleService");

const UNMUTE_VISIONE_REACTIONS = ["<:thumbsup:1471292172145004768>", "<:thumbsdown:1471292163957457013>"];
const UNMUTE_PENDING_COLOR = TENANT_EMBED_COLOR;
const UNMUTE_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;
const cooldownByUser = new Map();
let cooldownLoaded = false;

async function loadCooldowns() {
  if (cooldownLoaded) return;
  cooldownLoaded = true;
  try {
    const parsed = await getBotState("websiteUnmuteCooldowns", null);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [userId, until] of Object.entries(parsed)) {
      const uid = String(userId || "").trim();
      const ts = Number(until || 0);
      if (!uid || !Number.isFinite(ts) || ts <= now) continue;
      cooldownByUser.set(uid, ts);
    }
  } catch (err) {
    global.logger?.warn?.("[site-unmute] load cooldowns:", err?.message || err);
  }
}

async function persistCooldowns() {
  const now = Date.now();
  const out = {};
  for (const [userId, until] of cooldownByUser.entries()) {
    const ts = Number(until || 0);
    if (!Number.isFinite(ts) || ts <= now) continue;
    out[userId] = ts;
  }
  await setBotState("websiteUnmuteCooldowns", out);
}

async function getCooldownUntil(userId) {
  await loadCooldowns();
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  const ts = Number(cooldownByUser.get(uid) || 0);
  if (!Number.isFinite(ts) || ts <= Date.now()) {
    cooldownByUser.delete(uid);
    await persistCooldowns();
    return 0;
  }
  return ts;
}

async function setCooldownUntil(userId, untilTs) {
  await loadCooldowns();
  const uid = String(userId || "").trim();
  const ts = Number(untilTs || 0);
  if (!uid || !Number.isFinite(ts) || ts <= 0) return;
  cooldownByUser.set(uid, ts);
  await persistCooldowns();
}

function normalizeHeaderSecret(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function memberIsMuted(member) {
  if (!member) return false;
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  const hasMutedRole = mutedRoleId ? member.roles.cache.has(mutedRoleId) : false;
  const hasTimeout = isCommunicationTimeoutActive(member);
  return Boolean(hasMutedRole || hasTimeout);
}

async function resolveWebsiteMutedUser(client, accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) return { ok: false, status: 401, error: "missing_token", message: "Token mancante." };

  let meJson;
  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
      };
    }
    meJson = await meRes.json();
  } catch {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord." };
  }

  const userId = String(meJson?.id || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }

  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord temporaneamente non disponibile." };
  }

  const member =
    guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
  const isMuted = memberIsMuted(member);
  return {
    ok: true,
    status: 200,
    guild,
    userId,
    member,
    isMuted,
    inGuild: Boolean(member),
  };
}

async function getWebsiteUnmuteEligibility(client, accessToken) {
  const resolved = await resolveWebsiteMutedUser(client, accessToken);
  if (!resolved.ok) return resolved;
  const until = await getCooldownUntil(resolved.userId);
  return {
    ok: true,
    status: 200,
    is_muted: resolved.isMuted,
    can_submit: resolved.isMuted && !until,
    cooldown_until_ms: until || 0,
    message: resolved.isMuted
      ? until
        ? "Hai già inviato una richiesta unmute di recente: attendi il cooldown di 15 giorni."
        : "Puoi inviare una richiesta unmute."
      : resolved.inGuild
        ? "Non risulti mutato."
        : "Devi essere nel server (e mutato) per richiedere l'unmute.",
  };
}

function sanitizeText(v, maxLen) {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, maxLen);
}

async function submitWebsiteUnmute(client, payload) {
  const accessToken = normalizeHeaderSecret(payload?.accessToken || "");
  const resolved = await resolveWebsiteMutedUser(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!resolved.isMuted) {
    return {
      ok: false,
      status: 403,
      error: "not_muted",
      message: resolved.inGuild
        ? "Non risulti mutato: non puoi inviare richiesta unmute."
        : "Devi essere nel server e mutato per inviare una richiesta unmute.",
    };
  }

  const cooldownUntil = await getCooldownUntil(resolved.userId);
  if (cooldownUntil) {
    return {
      ok: false,
      status: 429,
      error: "cooldown",
      cooldown_until_ms: cooldownUntil,
      message: "Hai già inviato una richiesta unmute: puoi inviarne una ogni 15 giorni.",
    };
  }

  const answers = payload?.answers && typeof payload.answers === "object" ? payload.answers : {};
  const q1 = sanitizeText(answers.reason, 1600);
  const q2 = sanitizeText(answers.apology, 1600);
  const q3 = sanitizeText(answers.extra, 1600);
  const acceptedRules = Boolean(payload?.acceptedRules);

  if (!acceptedRules) {
    return {
      ok: false,
      status: 400,
      error: "rules_not_accepted",
      message: "Devi accettare le regole del server per inviare la richiesta.",
    };
  }
  if (!q1 || !q2) {
    return { ok: false, status: 400, error: "incomplete", message: "Compila tutti i campi obbligatori." };
  }

  const target = await resolveSubmissionChannel(resolved.guild);
  if (!target?.isTextBased?.()) {
    return {
      ok: false,
      status: 500,
      error: "no_channel",
      message: "Impossibile trovare il canale di invio delle richieste unmute.",
    };
  }

  const embed = new EmbedBuilder()
    .setColor(UNMUTE_PENDING_COLOR)
    .setTitle("Richiesta Unmute")
    .setDescription(
      [
        `Utente: <@${resolved.userId}> (\`${resolved.userId}\`)`,
        "",
        `**Come mai sei stato mutato?**`,
        q1,
        "",
        `**Le tue scuse allo staff e alla community**`,
        q2,
        "",
        `**Informazioni aggiuntive (opzionale)**`,
        q3 || "Nessuna",
      ].join("\n"),
    )
    .setTimestamp(new Date());

  const uidBtn = String(resolved.userId || "").trim();
  const decisionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`website_unmute_acc:${uidBtn}`)
      .setLabel("Accetta unmute")
      .setStyle(ButtonStyle.Success)
      .setEmoji("<:success:1461731530333229226>"),
    new ButtonBuilder()
      .setCustomId(`website_unmute_rej:${uidBtn}`)
      .setLabel("Rifiuta")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("<:cancel:1461730653677551691>"),
  );

  const highStaffRoleId = IDs.roles.HighStaff;
  const mention = highStaffRoleId ? `<@&${highStaffRoleId}>` : null;
  const sent = await target
    .send({
      content: mention || undefined,
      embeds: [embed],
      components: [decisionRow],
    })
    .catch(() => null);
  if (!sent) {
    return {
      ok: false,
      status: 500,
      error: "send_failed",
      message: "Impossibile pubblicare la richiesta nel canale di invio. Riprova più tardi.",
    };
  }

  if (typeof sent.startThread === "function") {
    const userDisc = await client.users.fetch(resolved.userId).catch(() => null);
    const threadUserLabel =
      String(userDisc?.globalName || userDisc?.username || resolved.userId)
        .replace(/[\r\n#:@<>`]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 70) || resolved.userId;
    const thread = await sent
      .startThread({
        name: `Richiesta unmute ${threadUserLabel}`,
        autoArchiveDuration: 1440,
        reason: `Richiesta unmute (${resolved.userId})`,
      })
      .catch(() => null);
    if (thread?.isTextBased?.() && highStaffRoleId) {
      const pingMsg = await thread.send({ content: `<@&${highStaffRoleId}>` }).catch(() => null);
      if (pingMsg) scheduleMessageDeletion(pingMsg, EPHEMERAL_TTL_PING_ONLY_MS);
    }
  }

  for (const emoji of UNMUTE_VISIONE_REACTIONS) {
    await sent.react(emoji).catch(() => {});
  }

  const nextAt = Date.now() + UNMUTE_COOLDOWN_MS;
  await setCooldownUntil(resolved.userId, nextAt);
  return {
    ok: true,
    status: 200,
    cooldown_until_ms: nextAt,
    message: "Richiesta unmute inviata con successo.",
  };
}

async function applyWebsiteUnmute(guild, userId, client) {
  const uid = String(userId || "").trim();
  if (!guild || !/^\d{17,20}$/.test(uid)) {
    return { ok: false, reason: "invalid" };
  }
  const member = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
  if (!member) {
    return { ok: false, reason: "not_in_guild" };
  }

  await member.timeout(null, "Richiesta unmute accettata").catch(() => null);

  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  if (mutedRoleId && member.roles.cache.has(mutedRoleId)) {
    await member.roles.remove(mutedRoleId, "Richiesta unmute accettata").catch(() => null);
  }

  try {
    const fresh = (await guild.members.fetch(uid).catch(() => null)) || member;
    await restoreRolesAfterCommunicationTimeoutEnd(fresh, {
      reason: "Richiesta unmute accettata",
      wasUnmuteFlow: true,
      client,
    });
  } catch (err) {
    global.logger?.warn?.("[site-unmute] restore roles:", err?.message || err);
  }

  try {
    const { findOpenCases } = require("../../Utils/Moderation/modCaseStore");
    const { closeCasePersist } = require("../../Utils/Moderation/moderation");
    const openMutes = await findOpenCases(guild.id, uid, "MUTE");
    for (const item of openMutes) {
      await closeCasePersist(item, "Richiesta unmute accettata");
    }
  } catch (err) {
    global.logger?.warn?.("[site-unmute] close mute cases:", err?.message || err);
  }

  return { ok: true };
}

module.exports = {
  getWebsiteUnmuteEligibility,
  submitWebsiteUnmute,
  applyWebsiteUnmute,
  memberIsMuted,
};

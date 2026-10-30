const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  isDiscordWorkflowUiEnabled,
  isDiscordWorkflowChannelPostsEnabled,
  newSiteWorkflowMessageId,
  buildInboxManageLinkRow,
} = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { EPHEMERAL_TTL_PING_ONLY_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl") as typeof import("../../Utils/Config/ephemeralMessageTtl");
const { resolveSubmissionChannel } = require("./candidatureApplicationHandlers") as typeof import("./candidatureApplicationHandlers");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const {
  isCommunicationTimeoutActive,
  restoreRolesAfterCommunicationTimeoutEnd,
} = require("../../Services/Moderation/mutedMirrorRoleService") as typeof import("../../Services/Moderation/mutedMirrorRoleService");
const {
  ensureWebsiteGuild,
  fetchWebsiteGuildMember,
  isOnNegativeCache,
} = require("../../Web/websiteGuildMemberFetch") as typeof import("../../Web/websiteGuildMemberFetch");
const { fetchDiscordOAuthMe } = require("../../Web/discordOauthMe") as typeof import("../../Web/discordOauthMe");

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
  const out: Record<string, any> = {};
  for (const [userId, until] of cooldownByUser.entries()) {
    const ts = Number(until || 0);
    if (!Number.isFinite(ts) || ts <= now) continue;
    out[userId] = ts;
  }
  await setBotState("websiteUnmuteCooldowns", out);
}

async function getCooldownUntil(userId?) {
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

async function setCooldownUntil(userId?, untilTs?) {
  await loadCooldowns();
  const uid = String(userId || "").trim();
  const ts = Number(untilTs || 0);
  if (!uid || !Number.isFinite(ts) || ts <= 0) return;
  cooldownByUser.set(uid, ts);
  await persistCooldowns();
}

function normalizeHeaderSecret(raw?) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

function memberIsMuted(member?) {
  if (!member) return false;
  const mutedRoleId = String(IDs.roles?.Muted || "").trim();
  const hasMutedRole = mutedRoleId ? member.roles?.cache?.has?.(mutedRoleId) : false;
  const hasTimeout = isCommunicationTimeoutActive(member);
  return Boolean(hasMutedRole || hasTimeout);
}

async function resolveWebsiteMutedUser(client?, accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) return { ok: false, status: 401, error: "missing_token", message: "Token mancante." };

  const meOut = await fetchDiscordOAuthMe(token, { timeoutMs: 8000 });
  if (!meOut.ok) {
    return {
      ok: false,
      status: Number(meOut.status) || 502,
      error: meOut.error || "discord_unreachable",
      message: meOut.message || "Impossibile contattare Discord.",
    };
  }
  const meJson = meOut.me;

  const userId = String(meJson?.id || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }

  const displayName = String(meJson?.global_name || meJson?.globalName || meJson?.username || "").trim();
  const username = String(meJson?.username || "").trim();
  const avatarHash = String(meJson?.avatar || "").trim();
  const avatarUrl = avatarHash
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`
    : "";

  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  const guild = await ensureWebsiteGuild(client, guildId);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord temporaneamente non disponibile." };
  }

  /* unmuteElig2: soft member lookup — full 12s+18s retry blew past the browser 15s abort
     and surfaced the generic "Impossibile verificare lo stato unmute" on mobile. */
  let member = guild.members?.cache?.get(userId) || null;
  if (!member) {
    const knownAbsent = isOnNegativeCache(userId);
    member = await fetchWebsiteGuildMember(guild, userId, {
      timeoutMs: 7000,
      retry: false,
      soft: true,
    }).catch(() => null);
    if (!member && !knownAbsent && !isOnNegativeCache(userId)) {
      return {
        ok: false,
        status: 503,
        error: "member_lookup_timeout",
        message: "Verifica mute temporaneamente non disponibile. Riprova tra poco.",
      };
    }
  }

  const isMuted = memberIsMuted(member);
  return {
    ok: true,
    status: 200,
    guild,
    userId,
    member,
    displayName:
      displayName ||
      String(member?.displayName || member?.user?.globalName || member?.user?.username || username || "").trim(),
    username,
    avatarUrl,
    isMuted,
    inGuild: Boolean(member),
  };
}

async function getWebsiteUnmuteEligibility(client?, accessToken?) {
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

function sanitizeText(v?, maxLen?) {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, maxLen);
}

async function submitWebsiteUnmute(client?, payload?) {
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

  const subjectName =
    String(resolved.displayName || resolved.username || "").trim() || String(resolved.userId);
  const bodyText = [
    `Utente: ${subjectName} (\`${resolved.userId}\`)`,
    "",
    `**Come mai sei stato mutato?**`,
    q1,
    "",
    `**Le tue scuse allo staff e alla community**`,
    q2,
    "",
    `**Informazioni aggiuntive (opzionale)**`,
    q3 || "Nessuna",
  ].join("\n");

  if (!isDiscordWorkflowChannelPostsEnabled()) {
    const messageId = newSiteWorkflowMessageId();
    try {
      const { persistAppealWorkflowFromPayload } = require("../../Web/siteStaffWorkflowStore") as typeof import("../../Web/siteStaffWorkflowStore");
      await persistAppealWorkflowFromPayload(resolved.guild, {
        messageId,
        channelId: "site",
        userId: resolved.userId,
        kind: "unmute",
        status: "pending",
        title: "Richiesta Unmute",
        body: bodyText,
        displayName: subjectName,
        avatarUrl: resolved.avatarUrl || "",
        createdAt: new Date(),
      });
    } catch (_) {
      return {
        ok: false,
        status: 500,
        error: "send_failed",
        message: "Impossibile salvare la richiesta unmute. Riprova più tardi.",
      };
    }
    const nextAt = Date.now() + UNMUTE_COOLDOWN_MS;
    await setCooldownUntil(resolved.userId, nextAt);
    try {
      const { notifyInboxStaffNewItem } = require("../../Web/siteStaffWorkflowNotifications") as typeof import("../../Web/siteStaffWorkflowNotifications");
      void notifyInboxStaffNewItem({
        guild: resolved.guild,
        queue: "appelli",
        subjectUserId: String(resolved.userId),
        subjectName,
        title: "Nuovo appello unmute",
        body: `${subjectName} ha inviato una richiesta unmute.`,
        messageId: String(messageId),
        dedupeKey: `inbox:appelli:new:${messageId}`,
      }).catch(() => 0);
    } catch (_) {}
    return {
      ok: true,
      status: 200,
      cooldown_until_ms: nextAt,
      message: "Richiesta unmute inviata con successo.",
    };
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
    .setDescription(bodyText)
    .setTimestamp(new Date());

  const uidBtn = String(resolved.userId || "").trim();
  const decisionRow = isDiscordWorkflowUiEnabled()
    ? new ActionRowBuilder().addComponents(
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
      )
    : buildInboxManageLinkRow("appelli");

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

  if (isDiscordWorkflowUiEnabled() && typeof sent.startThread === "function") {
    const threadUserLabel =
      String(subjectName || resolved.userId)
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

  if (isDiscordWorkflowUiEnabled()) {
    for (const emoji of UNMUTE_VISIONE_REACTIONS) {
      await sent.react(emoji).catch(() => {});
    }
  }

  const nextAt = Date.now() + UNMUTE_COOLDOWN_MS;
  await setCooldownUntil(resolved.userId, nextAt);
  try {
    const { persistAppealWorkflowFromPayload } = require("../../Web/siteStaffWorkflowStore") as typeof import("../../Web/siteStaffWorkflowStore");
    await persistAppealWorkflowFromPayload(resolved.guild, {
      messageId: sent.id,
      channelId: sent.channelId,
      userId: resolved.userId,
      kind: "unmute",
      status: "pending",
      title: "Richiesta Unmute",
      body: bodyText,
      displayName: subjectName,
      avatarUrl: resolved.avatarUrl || "",
      createdAt: sent.createdAt || new Date(),
    });
  } catch (_) {}
  try {
    const { notifyInboxStaffNewItem } = require("../../Web/siteStaffWorkflowNotifications") as typeof import("../../Web/siteStaffWorkflowNotifications");
    void notifyInboxStaffNewItem({
      guild: resolved.guild,
      queue: "appelli",
      subjectUserId: String(resolved.userId),
      subjectName,
      title: "Nuovo appello unmute",
      body: `${subjectName} ha inviato una richiesta unmute.`,
      messageId: String(sent?.id || ""),
      dedupeKey: `inbox:appelli:new:${sent?.id || resolved.userId}`,
    }).catch(() => 0);
  } catch (_) {}
  return {
    ok: true,
    status: 200,
    cooldown_until_ms: nextAt,
    message: "Richiesta unmute inviata con successo.",
  };
}

async function applyWebsiteUnmute(guild?, userId?, client?) {
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
    const { findOpenCases } = require("../../Utils/Moderation/modCaseStore") as typeof import("../../Utils/Moderation/modCaseStore");
    const { closeCasePersist } = require("../../Utils/Moderation/moderation") as typeof import("../../Utils/Moderation/moderation");
    const openMutes = await findOpenCases(guild.id, uid, "MUTE");
    for (const item of openMutes) {
      await closeCasePersist(item, "Richiesta unmute accettata");
    }
  } catch (err) {
    global.logger?.warn?.("[site-unmute] close mute cases:", err?.message || err);
  }

  return { ok: true };
}

export = {
  getWebsiteUnmuteEligibility,
  submitWebsiteUnmute,
  applyWebsiteUnmute,
  memberIsMuted,
};

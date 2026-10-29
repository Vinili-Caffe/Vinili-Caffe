const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  isDiscordWorkflowUiEnabled,
  isDiscordWorkflowChannelPostsEnabled,
  newSiteWorkflowMessageId,
  buildInboxManageLinkRow,
} = require("../../Utils/Web/discordWorkflowUiGate") as typeof import("../../Utils/Web/discordWorkflowUiGate");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { EPHEMERAL_TTL_PING_ONLY_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl") as typeof import("../../Utils/Config/ephemeralMessageTtl");
const { resolveSubmissionChannel } = require("./candidatureApplicationHandlers") as typeof import("./candidatureApplicationHandlers");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { fetchDiscordOAuthMe } = require("../../Utils/Web/discordOauthMe") as typeof import("../../Utils/Web/discordOauthMe");
const UNBAN_VISIONE_REACTIONS = ["<:thumbsup:1471292172145004768>", "<:thumbsdown:1471292163957457013>",];
const UNBAN_PENDING_COLOR = TENANT_EMBED_COLOR;
const UNBAN_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;
const cooldownByUser = new Map();
let cooldownLoaded = false;

async function loadCooldowns() {
  if (cooldownLoaded) return;
  cooldownLoaded = true;
  try {
    const parsed = await getBotState("websiteUnbanCooldowns", null);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [userId, until] of Object.entries(parsed)) {
      const uid = String(userId || "").trim();
      const ts = Number(until || 0);
      if (!uid || !Number.isFinite(ts) || ts <= now) continue;
      cooldownByUser.set(uid, ts);
    }
  } catch (err) {
    global.logger?.warn?.("[site-unban] load cooldowns:", err?.message || err);
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
  await setBotState("websiteUnbanCooldowns", out);
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

async function resolveWebsiteUser(client?, accessToken?) {
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
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord temporaneamente non disponibile." };
  }

  let banEntry = null;
  try {
    banEntry = await Promise.race([
      guild.bans.fetch(userId).catch(() => null),
      new Promise((resolve?) => setTimeout(() => resolve(null), 8000)),
    ]);
  } catch {
    banEntry = null;
  }
  return {
    ok: true,
    status: 200,
    guild,
    userId,
    displayName: displayName || username || "",
    username,
    avatarUrl,
    isBanned: Boolean(banEntry),
  };
}

async function getWebsiteUnbanEligibility(client?, accessToken?) {
  const resolved = await resolveWebsiteUser(client, accessToken);
  if (!resolved.ok) return resolved;
  const until = await getCooldownUntil(resolved.userId);
  return {
    ok: true,
    status: 200,
    is_banned: resolved.isBanned,
    can_submit: resolved.isBanned && !until,
    cooldown_until_ms: until || 0,
    message: resolved.isBanned
      ? until
        ? "Hai già inviato una richiesta unban di recente: attendi il cooldown di 15 giorni."
        : "Puoi inviare una richiesta unban."
      : "Non risulti bannato.",
  };
}

function sanitizeText(v?, maxLen?) {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, maxLen);
}

async function submitWebsiteUnban(client?, payload?) {
  const accessToken = normalizeHeaderSecret(payload?.accessToken || "");
  const resolved = await resolveWebsiteUser(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!resolved.isBanned) {
    return { ok: false, status: 403, error: "not_banned", message: "Non risulti bannato: non puoi inviare richiesta unban." };
  }

  const cooldownUntil = await getCooldownUntil(resolved.userId);
  if (cooldownUntil) {
    return {
      ok: false,
      status: 429,
      error: "cooldown",
      cooldown_until_ms: cooldownUntil,
      message: "Hai già inviato una richiesta unban: puoi inviarne una ogni 15 giorni.",
    };
  }

  const answers = payload?.answers && typeof payload.answers === "object" ? payload.answers : {};
  const q1 = sanitizeText(answers.reason, 1600);
  const q2 = sanitizeText(answers.apology, 1600);
  const q3 = sanitizeText(answers.extra, 1600);
  const acceptedRules = Boolean(payload?.acceptedRules);

  if (!acceptedRules) {
    return { ok: false, status: 400, error: "rules_not_accepted", message: "Devi accettare le regole del server per inviare la richiesta." };
  }
  if (!q1 || !q2) {
    return { ok: false, status: 400, error: "incomplete", message: "Compila tutti i campi obbligatori." };
  }

  const subjectName =
    String(resolved.displayName || resolved.username || "").trim() || String(resolved.userId);
  const bodyText = [
    `Utente: ${subjectName} (\`${resolved.userId}\`)`,
    "",
    `**Come mai sei stato bannato?**`,
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
      const { persistAppealWorkflowFromPayload } = require("../../Utils/Web/siteStaffWorkflowStore") as typeof import("../../Utils/Web/siteStaffWorkflowStore");
      await persistAppealWorkflowFromPayload(resolved.guild, {
        messageId,
        channelId: "site",
        userId: resolved.userId,
        kind: "unban",
        status: "pending",
        title: "Richiesta Unban",
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
        message: "Impossibile salvare la richiesta unban. Riprova più tardi.",
      };
    }
    const nextAt = Date.now() + UNBAN_COOLDOWN_MS;
    await setCooldownUntil(resolved.userId, nextAt);
    try {
      const { notifyInboxStaffNewItem } = require("../../Utils/Web/siteStaffWorkflowNotifications") as typeof import("../../Utils/Web/siteStaffWorkflowNotifications");
      void notifyInboxStaffNewItem({
        guild: resolved.guild,
        queue: "appelli",
        subjectUserId: String(resolved.userId),
        subjectName,
        title: "Nuovo appello unban",
        body: `${subjectName} ha inviato una richiesta unban.`,
        messageId: String(messageId),
        dedupeKey: `inbox:appelli:new:${messageId}`,
      }).catch(() => 0);
    } catch (_) {}
    return {
      ok: true,
      status: 200,
      cooldown_until_ms: nextAt,
      message: "Richiesta unban inviata con successo.",
    };
  }

  const target = await resolveSubmissionChannel(resolved.guild);
  if (!target?.isTextBased?.()) {
    return {
      ok: false,
      status: 500,
      error: "no_channel",
      message: "Impossibile trovare il canale di invio delle richieste unban.",
    };
  }

  const embed = new EmbedBuilder()
    .setColor(UNBAN_PENDING_COLOR)
    .setTitle("Richiesta Unban")
    .setDescription(bodyText)
    .setTimestamp(new Date());

  const uidBtn = String(resolved.userId || "").trim();
  const decisionRow = isDiscordWorkflowUiEnabled()
    ? new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`website_unban_acc:${uidBtn}`)
          .setLabel("Accetta unban")
          .setStyle(ButtonStyle.Success)
          .setEmoji("<:success:1461731530333229226>"),
        new ButtonBuilder()
          .setCustomId(`website_unban_rej:${uidBtn}`)
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
        name: `Richiesta unban ${threadUserLabel}`,
        autoArchiveDuration: 1440,
        reason: `Richiesta unban (${resolved.userId})`,
      })
      .catch(() => null);
    if (thread?.isTextBased?.() && highStaffRoleId) {
      const pingMsg = await thread.send({ content: `<@&${highStaffRoleId}>` }).catch(() => null);
      if (pingMsg) scheduleMessageDeletion(pingMsg, EPHEMERAL_TTL_PING_ONLY_MS);
    }
  }

  if (isDiscordWorkflowUiEnabled()) {
    for (const emoji of UNBAN_VISIONE_REACTIONS) {
      await sent.react(emoji).catch(() => {});
    }
  }

  const nextAt = Date.now() + UNBAN_COOLDOWN_MS;
  await setCooldownUntil(resolved.userId, nextAt);
  try {
    const { persistAppealWorkflowFromPayload } = require("../../Utils/Web/siteStaffWorkflowStore") as typeof import("../../Utils/Web/siteStaffWorkflowStore");
    await persistAppealWorkflowFromPayload(resolved.guild, {
      messageId: sent.id,
      channelId: sent.channelId,
      userId: resolved.userId,
      kind: "unban",
      status: "pending",
      title: "Richiesta Unban",
      body: bodyText,
      displayName: subjectName,
      avatarUrl: resolved.avatarUrl || "",
      createdAt: sent.createdAt || new Date(),
    });
  } catch (_) {}
  try {
    const { notifyInboxStaffNewItem } = require("../../Utils/Web/siteStaffWorkflowNotifications") as typeof import("../../Utils/Web/siteStaffWorkflowNotifications");
    void notifyInboxStaffNewItem({
      guild: resolved.guild,
      queue: "appelli",
      subjectUserId: String(resolved.userId),
      subjectName,
      title: "Nuovo appello unban",
      body: `${subjectName} ha inviato una richiesta unban.`,
      messageId: String(sent?.id || ""),
      dedupeKey: `inbox:appelli:new:${sent?.id || resolved.userId}`,
    }).catch(() => 0);
  } catch (_) {}
  return {
    ok: true,
    status: 200,
    cooldown_until_ms: nextAt,
    message: "Richiesta unban inviata con successo.",
  };
}

export = { getWebsiteUnbanEligibility, submitWebsiteUnban };
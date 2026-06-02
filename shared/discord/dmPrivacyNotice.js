const recentPrivacyNotices = new Map();
const PRIVACY_NOTICE_DEDUPE_MS = 6 * 60 * 60 * 1000;

function isUserDmPrivacyBlockedError(err) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  if ([50007, 50278].includes(code)) return true;
  const msg = String(err?.message || err?.rawError?.message || "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("cannot send messages to this user")) return true;
  if (msg.includes("cannot send messages")) return true;
  return false;
}

function resolveDiscordClient(options = {}, user = null) {
  return (
    options.client ||
    user?.client ||
    global.__vinylsDiscordClient ||
    global.__coffeeDiscordClient ||
    null
  );
}

function buildDmPrivacyBlockedNoticeContent(userId, botLabel) {
  const mention = userId ? `<@${userId}>` : "";
  const botLine = botLabel ? ` (**${botLabel}**)` : "";
  return [
    mention,
    `Non riesco a contattarti in DM: i messaggi diretti risultano **disattivati** per questo server.`,
    "",
    "**Per abilitarli:**",
    "1. Tasto destro sull'icona di **Vinili & Caffè** → **Impostazioni privacy**",
    "2. Attiva **Messaggi diretti** (consenti messaggi dai membri del server)",
    "",
    "In alternativa: **Impostazioni utente** → **Privacy e sicurezza** → abilita i messaggi diretti dai membri del server.",
    "",
    "Dopo averli attivati, usa `+profile` in questo canale per gestire le notifiche del bot.",
  ].filter(Boolean).join("\n");
}

async function notifyDmPrivacyBlockedInCommands(options = {}) {
  const guildId = String(options.guildId || "").trim();
  const userId = String(options.userId || "").trim();
  const commandsChannelId = String(options.commandsChannelId || "").trim();
  if (!guildId || !userId || !commandsChannelId) return false;

  const dedupeKey = `${guildId}:${userId}`;
  const now = Date.now();
  const lastSent = recentPrivacyNotices.get(dedupeKey) || 0;
  if (now - lastSent < PRIVACY_NOTICE_DEDUPE_MS) return false;

  const client = resolveDiscordClient(options);
  if (!client) return false;

  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return false;

  const channel =
    guild.channels.cache.get(commandsChannelId) ||
    (await guild.channels.fetch(commandsChannelId).catch(() => null));
  if (!channel?.isTextBased?.() || typeof channel.send !== "function") return false;

  const botLabel = String(options.botLabel || client.user?.username || "").trim() || null;
  const content = buildDmPrivacyBlockedNoticeContent(userId, botLabel);
  const sent = await channel.send({
    content,
    allowedMentions: { users: [userId], roles: [], parse: [], repliedUser: false },
  }).catch(() => null);
  if (!sent) return false;

  recentPrivacyNotices.set(dedupeKey, now);
  return true;
}

async function sendUserDirectMessage(user, payload, options = {}) {
  if (!user?.send) return null;
  const guildId = String(options.guildId || "").trim();
  const notifyOnPrivacyBlock = options.notifyOnPrivacyBlock !== false;
  try {
    return await user.send(payload);
  } catch (err) {
    if (
      notifyOnPrivacyBlock &&
      isUserDmPrivacyBlockedError(err) &&
      guildId &&
      options.commandsChannelId
    ) {
      let allowNotice = true;
      if (typeof options.shouldNotifyForDiscordPrivacyBlock === "function") {
        allowNotice = await options.shouldNotifyForDiscordPrivacyBlock(err).catch(() => false);
      }
      if (allowNotice) {
        await notifyDmPrivacyBlockedInCommands({
          guildId,
          userId: user.id,
          commandsChannelId: options.commandsChannelId,
          client: resolveDiscordClient(options, user),
          botLabel: options.botLabel,
        }).catch(() => false);
      }
    }
    return null;
  }
}

module.exports = { isUserDmPrivacyBlockedError, buildDmPrivacyBlockedNoticeContent, notifyDmPrivacyBlockedInCommands, sendUserDirectMessage };
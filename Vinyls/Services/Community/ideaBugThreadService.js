const IDEA_CHANNEL_IDS = new Set(
  [
    "1502239449956745247",
    "1502238077303783545",
    "1502238193821552650",
    "1502238107829932104",
    "1502238135185309696",
    "1502257275270594670",
  ].map(String),
);

const BUG_CHANNEL_IDS = new Set(
  [
    "1472009888417845330",
    "1502239086503792713",
    "1502239002084773909",
    "1502239043692265483",
  ].map(String),
);

const REACTIONS = [
  "<a:VC_Verified:1482532479637127188>",
  "<a:VC_Cross:1482532424570376253>",
];
const EVERYONE_PING_DELETE_DELAY_MS = 5000;

function getMessageKind(message) {
  const channelId = String(message?.channelId || message?.channel?.id || "");
  if (IDEA_CHANNEL_IDS.has(channelId)) return "Idea";
  if (BUG_CHANNEL_IDS.has(channelId)) return "Bug";
  return null;
}

function resolveAuthorName(message) {
  const raw =
    message?.member?.displayName ||
    message?.author?.globalName ||
    message?.author?.username ||
    "utente";
  return String(raw || "utente")
    .replace(/[@#:`*_~|<>\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "utente";
}

function buildThreadName(kind, message) {
  const username = `@${resolveAuthorName(message)}`;
  if (kind === "Idea") return `Idea di ${username}`.slice(0, 100);
  if (kind === "Bug") return `Bug segnalato da ${username}`.slice(0, 100);
  return null;
}

async function addIdeaBugReactions(message) {
  for (const reaction of REACTIONS) {
    await message.react(reaction).catch((err) => {
      global.logger?.warn?.("[IDEA BUG THREAD] reaction failed:", message?.id, reaction, err?.message || err);
    });
  }
}

async function createIdeaBugThread(message, kind) {
  if (!message?.startThread || !message?.author?.id) return null;
  const name = buildThreadName(kind, message);
  if (!name) return null;

  const thread = await message
    .startThread({
      name,
      autoArchiveDuration: 10080,
      reason: kind === "Idea" ? "Thread automatico per idea" : "Thread automatico per bug",
    })
    .catch((err) => {
      global.logger?.warn?.("[IDEA BUG THREAD] create failed:", message?.id, err?.message || err);
      return null;
    });

  if (!thread?.isTextBased?.()) return thread;

  const pingMessage = await thread
    .send({
      content: "@everyone",
      allowedMentions: { parse: ["everyone"] },
    })
    .catch((err) => {
      global.logger?.warn?.("[IDEA BUG THREAD] everyone ping failed:", thread?.id, err?.message || err);
      return null;
    });
  if (pingMessage?.deletable !== false) {
    const timer = setTimeout(() => {
      pingMessage.delete().catch(() => null);
    }, EVERYONE_PING_DELETE_DELAY_MS);
    timer.unref?.();
  }

  return thread;
}

async function handleIdeaBugMessage(message) {
  if (!message?.guild || !message?.author || message.author.bot) return false;
  if (message.system || message.webhookId || message.applicationId) return false;

  const kind = getMessageKind(message);
  if (!kind) return false;

  await addIdeaBugReactions(message);
  await createIdeaBugThread(message, kind);
  return true;
}

module.exports = {
  BUG_CHANNEL_IDS,
  IDEA_CHANNEL_IDS,
  EVERYONE_PING_DELETE_DELAY_MS,
  REACTIONS,
  handleIdeaBugMessage,
};

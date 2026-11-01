
const POKETWO_BOT_ID = "716390085896962058";
const POKETWO_BOT_ID_LEGACY = "716390085825232906";

const BLOCKED_BOT_IDS = Object.freeze([POKETWO_BOT_ID, POKETWO_BOT_ID_LEGACY]);

const BLOCKED_BOT_ID_SET = new Set(BLOCKED_BOT_IDS);

const POKETWO_TEXT_RE =
  /pok[eéèêë]two|poke[\s._-]*two|<@!?716390085896962058>|<@!?716390085825232906>/iu;

const POKETWO_COMMAND_RE =
  /(?:^|[\s|@])p\s*--\s*[a-z0-9]{1,16}\b|(?:^|\s)p!\s*[a-z]/iu;

function hasBlockedBotMentionId(text?) {
  const raw = String(text || "");
  if (!raw) return false;
  for (const id of BLOCKED_BOT_IDS) {
    if (raw.includes(`<@${id}>`) || raw.includes(`<@!${id}>`)) return true;
  }
  return false;
}

function isMarkovBotNoiseText(text?) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  if (hasBlockedBotMentionId(raw)) return true;
  if (POKETWO_TEXT_RE.test(raw)) return true;
  if (POKETWO_COMMAND_RE.test(raw)) return true;
  return false;
}

function messageMentionsBlockedBot(message?) {
  const users = message?.mentions?.users;
  if (!users || typeof users.has !== "function") return false;
  for (const id of BLOCKED_BOT_IDS) {
    if (users.has(id)) return true;
  }
    try {
    for (const user of users.values()) {
      if (!user?.bot) continue;
      const name = String(user.username || user.globalName || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "");
      if (name.includes("poketwo") || name.includes("poke two")) return true;
      if (BLOCKED_BOT_ID_SET.has(String(user.id || ""))) return true;
    }
  } catch {
      }
  return false;
}

function isMarkovBotNoiseMessage(message?) {
  if (messageMentionsBlockedBot(message)) return true;
  return isMarkovBotNoiseText(message?.content);
}

function filterBotNoiseLines(lines?) {
  const list = Array.isArray(lines) ? lines : [];
  return list.filter((line?) => !isMarkovBotNoiseText(line));
}

export = {
  isMarkovBotNoiseText,
  isMarkovBotNoiseMessage,
  filterBotNoiseLines,
};

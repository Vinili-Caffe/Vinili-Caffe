const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { checkPrefixPermission } = require("../../Utils/Moderation/commandPermissions");
const {
  buildModerationPanelPayload,
  SECTION_HOME,
  parseNavCustomId,
} = require("../../Utils/Moderation/moderationPanelRuntime");

const PANEL_FETCH_LIMIT = 45;

function navCustomIdFromMessage(msg) {
  const row = msg?.components?.[0];
  const comp = row?.components?.[0];
  const id = comp?.customId;
  return typeof id === "string" && id.startsWith("mpr:nav:") ? id : null;
}

async function findExistingModerationPanelMessage(channel, botUserId, guildId, viewerId, targetId) {
  const gid = String(guildId);
  const vid = String(viewerId);
  const tid = String(targetId);
  const bid = String(botUserId);
  try {
    const coll = await channel.messages.fetch({ limit: PANEL_FETCH_LIMIT });
    const list = [...coll.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const m of list) {
      if (String(m.author?.id) !== bid) continue;
      const navId = navCustomIdFromMessage(m);
      if (!navId) continue;
      const parsed = parseNavCustomId(navId);
      if (!parsed) continue;
      if (String(parsed.viewerId) !== vid || String(parsed.targetId) !== tid) continue;
      if (String(parsed.guildId || gid) !== gid) continue;
      return m;
    }
  } catch (_) {}
  return null;
}

async function resolveTargetUser(message, rawArg) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;
  const raw = String(rawArg || "").trim();
  if (!raw) return null;
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    return message.client.users.fetch(id).catch(() => null);
  }
  const wanted = raw.toLowerCase();
  let member = message.guild.members.cache.find((item) => {
    const username = String(item.user?.username || "").toLowerCase();
    const displayName = String(item.displayName || "").toLowerCase();
    const tag = String(item.user?.tag || "").toLowerCase();
    return username === wanted || displayName === wanted || tag === wanted;
  });
  if (!member && typeof message.guild.members.fetch === "function") {
    try {
      const fetched = await message.guild.members.fetch({ query: raw.slice(0, 32), limit: 10 });
      member =
        fetched.find((m) => {
          const u = String(m.user?.username || "").toLowerCase();
          const d = String(m.displayName || "").toLowerCase();
          return u === wanted || d === wanted;
        }) || fetched.first();
    } catch (_) {}
  }
  return member?.user || null;
}

module.exports = {
  name: "moderazione",
  aliases: ["modpanel"],
  usage: "`+moderazione @utente`",
  examples: ["+moderazione @utente", "+moderazione 123456789012345678"],
  helpDescription: "Pannello interattivo per azioni di moderazione sul target.",

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    const allowed = await checkPrefixPermission(message, "moderazione");
    if (!allowed) return;

    await message.channel.sendTyping().catch(() => {});
    const targetUser = await resolveTargetUser(message, args.join(" "));
    if (!targetUser) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Specifica un utente: `+moderazione @utente` o ID.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (String(targetUser.id) === String(message.author.id)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Scegli un utente diverso da te.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const payload = await buildModerationPanelPayload(
      message.guild,
      message.author.id,
      targetUser.id,
      message.client,
      SECTION_HOME,
    );
    const existing = await findExistingModerationPanelMessage(
      message.channel,
      message.client.user.id,
      message.guild.id,
      message.author.id,
      targetUser.id,
    );
    if (existing?.editable) {
      const edited = await existing.edit(payload).then(() => true).catch(() => false);
      if (edited) return;
    }
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};
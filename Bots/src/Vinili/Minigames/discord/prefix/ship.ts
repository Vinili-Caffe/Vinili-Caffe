const { randomInt } = require("crypto") as typeof import("crypto");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { getGuildMemberCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic, userAvatarUrlDynamic, userAvatarUrlStatic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const renderShipCanvas = require("../../../Community/utils/Render/shipCanvas") as typeof import("../../../Community/utils/Render/shipCanvas");

function extractId(raw?) {
  if (!raw) return null;
  const clean = String(raw).replace(/[<@!>]/g, "");
  return /^\d{16,20}$/.test(clean) ? clean : null;
}

async function resolveUser(guild?, token?) {
  const id = extractId(token);
  if (!id) return null;
  const member = guild.members.cache.get(id) || (await getGuildMemberCached(guild, id));
  return member?.user || null;
}

async function resolveReplyUser(message?) {
  const ref = message.reference?.messageId;
  if (!ref) return null;
  const replied=message.channel?.messages?.cache?.get(ref)||(await message.channel.messages.fetch(ref).catch(() => null));
  return replied?.author || null;
}

async function resolveRandomGuildUser(guild?, excludedIds = []) {
  if (!guild) return null;
  const excluded = new Set(excludedIds.filter(Boolean));
  const pool=guild.members.cache.filter((m?) => !m.user?.bot&&!excluded.has(m.user.id),);
  if (!pool.size) return null;
  const values = Array.from(pool.values());
  const member: any = values[Math.floor(Math.random() * values.length)];
  return member?.user || null;
}

function trimName(name?) {
  const v = String(name || "").trim();
  return v.length > 16 ? `${v.slice(0, 16)}...` : v;
}

function resolveShipAvatarUrls(member?, user?) {
  const target = member || user;
  const staticUrl =
    guildMemberDisplayAvatarUrlStatic(target, { size: 256 }) ||
    userAvatarUrlStatic(user, { size: 256 }) ||
    "";
  const dynamicUrl =
    guildMemberDisplayAvatarUrlDynamic(target, { size: 256 }) ||
    userAvatarUrlDynamic(user, { size: 256 }) ||
    staticUrl;
  return {
    dynamicUrl: dynamicUrl || "",
    staticUrl: staticUrl || dynamicUrl || "",
  };
}

function randomShipPercent(messageId?) {
  const roll = () => randomInt(1, 101);
  const pick = randomInt(0, 100);
  let v;
  if (pick < 45) v = Math.round((roll() + roll() + roll()) / 3);
  else if (pick < 80) v = Math.round((roll() + roll() + roll() + roll()) / 4);
  else if (pick < 93) v = roll();
  else v = Math.round((roll() + roll()) / 2);

  const idSalt =
    typeof messageId === "string" && /^\d{10,30}$/.test(messageId)
      ? Number(BigInt(messageId) % 37n) - 18
      : randomInt(-18, 19);
  const tweak = randomInt(-12, 13) + Math.round(idSalt / 2);
  v = Math.max(0, Math.min(99, v + tweak));

  if (randomInt(1, 121) === 1) return 100;
  return v;
}

export = {
  name: "ship",
  allowEmptyArgs: true,
  async execute(message?, args?) {
    await message.channel.sendTyping();

    const mentioned = message.mentions.users;
    let left = message.author;
    let right = null;

    if (mentioned.size >= 2) {
      const users = Array.from(mentioned.values());
      left = users[0];
      right = users[1];
    } else if (Array.isArray(args) && args.length >= 2) {
      const first = await resolveUser(message.guild, args[0]);
      const second = await resolveUser(message.guild, args[1]);
      if (first && second) {
        left = first;
        right = second;
      }
    } else if (mentioned.size === 1) {
      right = mentioned.first();
      if (Array.isArray(args) && args.length >= 2) {
        const second = await resolveUser(message.guild, args[1]);
        if (second) {
          left = mentioned.first();
          right = second;
        }
      }
    } else {
      right = await resolveReplyUser(message);
      if (!right && Array.isArray(args) && args.length > 0) {
        right = await resolveUser(message.guild, args[0]);
      }
      if (!right) {
        right = await resolveRandomGuildUser(message.guild, [left.id]);
      }
    }

    if (!right) {
      const warn = new EmbedBuilder()
      .setColor("Red")
      .setDescription("<:vegax:1443934876440068179> Non ho trovato un utente valido per la ship.",);
      await safeMessageReply(message, {
        embeds: [warn],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (left.id === right.id) {
      const warn = new EmbedBuilder()
      .setColor("Red")
      .setDescription("<:vegax:1443934876440068179> Scegli due utenti diversi.",);
      await safeMessageReply(message, {
        embeds: [warn],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    try {
      const guild = message.guild;
      const leftMem =
        guild?.members.cache.get(left.id) ||
        (await getGuildMemberCached(guild, left.id, { preferFresh: true }).catch(() => null));
      const rightMem =
        guild?.members.cache.get(right.id) ||
        (await getGuildMemberCached(guild, right.id, { preferFresh: true }).catch(() => null));
      const leftAvatars = resolveShipAvatarUrls(leftMem, left);
      const rightAvatars = resolveShipAvatarUrls(rightMem, right);
      const percent = randomShipPercent(message.id);
      const { buffer, format } = await renderShipCanvas({
        leftAvatarUrl: leftAvatars.dynamicUrl,
        rightAvatarUrl: rightAvatars.dynamicUrl,
        leftAvatarStaticUrl: leftAvatars.staticUrl,
        rightAvatarStaticUrl: rightAvatars.staticUrl,
        leftName: trimName(left.username),
        rightName: trimName(right.username),
        leftId: left.id,
        rightId: right.id,
        percent,
        messageSeed: message.id,
      });

      const file = new AttachmentBuilder(buffer, { name: format === "gif" ? "ship.gif" : "ship.png" });
      await safeMessageReply(message, {
        content: `${left} e ${right}`,
        files: [file],
        allowedMentions: { repliedUser: false, users: [left.id, right.id] },
      });
    } catch (error) {
      global.logger.error("[SHIP COMMAND] Render error:", error);
      const fail = new EmbedBuilder()
      .setColor("Red")
      .setDescription("<:vegax:1443934876440068179> Non sono riuscito a generare l'immagine della ship.",);
      await safeMessageReply(message, {
        embeds: [fail],
        allowedMentions: { repliedUser: false },
      });
    }
  },
};
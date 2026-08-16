const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { resolveEmbedColorForGuild } = require("../../MultiGuild/utils/tenantEmbedBranding");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

const MAX_CODES_SHOWN = 8;
const MAX_FIELD_CHARS = 1024;
const MAX_EMBED_FIELDS = 25;

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim();
}

function memberLikeFromUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    user,
    displayName: user.globalName || user.username,
    displayAvatarURL: (opts) => user.displayAvatarURL(opts),
  };
}

async function resolveMember(message, query) {
  const mentionedUser = message.mentions?.users?.first();
  if (mentionedUser) {
    const member = await getGuildMemberCached(message.guild, mentionedUser.id);
    if (member) return member;
    return memberLikeFromUser(mentionedUser);
  }
  const id = String(query || "").replace(/[<@!>]/g, "");
  if (/^\d{17,22}$/.test(id)) {
    const member = await getGuildMemberCached(message.guild, id);
    if (member) return member;
    const fetched = await message.client.users.fetch(id).catch(() => null);
    return memberLikeFromUser(fetched);
  }
  if (!query) return null;
  const target = normalize(query);
  return (
    message.guild.members.cache.find((member) => {
      const username = normalize(member.user?.username);
      const displayName = normalize(member.displayName);
      const tag = normalize(member.user?.tag);
      return username === target || displayName === target || tag === target;
    }) || null
  );
}

function formatJoinAt(joinedAt) {
  const ms = joinedAt instanceof Date ? joinedAt.getTime() : new Date(joinedAt || 0).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "data sconosciuta";
  const sec = Math.floor(ms / 1000);
  return `<t:${sec}:f>`;
}

function sortJoiners(joiners) {
  return (Array.isArray(joiners) ? joiners : [])
    .slice()
    .sort((a, b) => (Number(b?.joinedAtMs) || 0) - (Number(a?.joinedAtMs) || 0));
}

function formatJoinerLines(joiners) {
  const list = sortJoiners(joiners);
  if (!list.length) return "_nessuno ancora tracciato_";
  return list
    .map((j) => `<:VC_Reply:1482532158080942191> <@${j.userId}> · ${formatJoinAt(j.joinedAt)}`)
    .join("\n");
}

function formatInviteBlock(invite, joiners = []) {
  const code = String(invite?.code || "?").trim();
  return `\`discord.gg/${code}\`\n${formatJoinerLines(joiners)}`;
}

/** Spezza testo lungo in chunk ≤ MAX_FIELD_CHARS (limite Discord per field value). */
function chunkFieldText(text, max = MAX_FIELD_CHARS) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (raw.length <= max) return [raw];
  const parts = [];
  const lines = raw.split("\n");
  let buf = "";
  for (const line of lines) {
    const next = buf ? `${buf}\n${line}` : line;
    if (next.length <= max) {
      buf = next;
      continue;
    }
    if (buf) parts.push(buf);
    if (line.length <= max) {
      buf = line;
    } else {
      let rest = line;
      while (rest.length > max) {
        parts.push(rest.slice(0, max - 1) + "…");
        rest = rest.slice(max - 1);
      }
      buf = rest;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

function buildInvitesEmbedFields(sortedInvites, joinersByCode, unknownJoiners) {
  const blocks = [];
  // Solo link con almeno un join tracciato (niente "nessuno ancora tracciato").
  const withJoins = (Array.isArray(sortedInvites) ? sortedInvites : []).filter((invite) => {
    const code = String(invite?.code || "").trim();
    return code && (joinersByCode.get(code) || []).length > 0;
  });

  for (let i = 0; i < withJoins.length; i += 1) {
    if (i >= MAX_CODES_SHOWN) break;
    const invite = withJoins[i];
    const code = String(invite?.code || "").trim();
    blocks.push(formatInviteBlock(invite, joinersByCode.get(code) || []));
  }

  if (unknownJoiners.length) {
    blocks.push(
      `_Entrati (invito non collegato)_ · **${unknownJoiners.length}**\n${formatJoinerLines(unknownJoiners)}`,
    );
  }

  if (!blocks.length) {
    return [
      {
        name: "<:VC_BlackPin:1482534513400610948> Link e chi è entrato",
        value: "_Nessun ingresso tracciato sui link attivi._",
        inline: false,
      },
    ];
  }

  const extraCodes = Math.max(0, withJoins.length - MAX_CODES_SHOWN);
  if (extraCodes > 0) {
    blocks.push(`_…e altri **${extraCodes}** codici_`);
  }

  const full = blocks.join("\n\n");
  const chunks = chunkFieldText(full, MAX_FIELD_CHARS);
  const fields = [];
  for (let i = 0; i < chunks.length && fields.length < MAX_EMBED_FIELDS; i += 1) {
    fields.push({
      name:
        i === 0
          ? "<:VC_BlackPin:1482534513400610948> Link e chi è entrato"
          : `<:VC_BlackPin:1482534513400610948> Continua (${i + 1})`,
      value: chunks[i],
      inline: false,
    });
  }
  return fields;
}

module.exports = {
  name: "invites",
  aliases: ["inviti"],
  allowEmptyArgs: true,
  description: "Mostra gli inviti Discord attivi di un utente e chi è entrato.",
  usage: "+invites [@utente | id]",
  examples: ["+invites", "+invites @Utente", "+invites 123456789012345678"],

  async execute(message, args = []) {
    if (!message.guild) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa questo comando in un server.",
        allowedMentions: { repliedUser: false },
      });
    }

    await message.channel.sendTyping().catch(() => null);

    const me = message.guild.members.me;
    if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) {
      return safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Mi serve il permesso **Gestisci Server** per leggere gli inviti.",
        allowedMentions: { repliedUser: false },
      });
    }

    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    const target = (await resolveMember(message, query)) || message.member || memberLikeFromUser(message.author);
    if (!target?.id) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Utente non trovato.",
        allowedMentions: { repliedUser: false },
      });
    }

    let invites;
    try {
      invites = await message.guild.invites.fetch();
    } catch {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Non riesco a recuperare gli inviti del server.",
        allowedMentions: { repliedUser: false },
      });
    }

    const all = [...(invites?.values?.() || [])];
    const mine = all.filter((inv) => String(inv?.inviter?.id || "") === String(target.id));
    const sorted = mine
      .slice()
      .sort(
        (a, b) =>
          (Number(b?.uses) || 0) - (Number(a?.uses) || 0) ||
          String(a?.code || "").localeCompare(String(b?.code || "")),
      );

    const tracked = await ActivityUserProfile.find({
      guildId: message.guild.id,
      "profile.inviteTrack.inviterId": String(target.id),
      "profile.inviteTrack.active": true,
    })
      .select("userId profile.inviteTrack.inviteCode profile.inviteTrack.joinedAt")
      .lean()
      .catch(() => []);

    const joinersByCode = new Map();
    const unknownJoiners = [];
    const activeCodes = new Set(sorted.map((inv) => String(inv?.code || "").trim()).filter(Boolean));

    for (const row of tracked) {
      const userId = String(row?.userId || "").trim();
      if (!userId || userId === String(target.id)) continue;
      const joinedAt = row?.profile?.inviteTrack?.joinedAt || null;
      const joinedAtMs = joinedAt ? new Date(joinedAt).getTime() : 0;
      const entry = { userId, joinedAt, joinedAtMs };
      const code = String(row?.profile?.inviteTrack?.inviteCode || "").trim();
      if (code && activeCodes.has(code)) {
        if (!joinersByCode.has(code)) joinersByCode.set(code, []);
        joinersByCode.get(code).push(entry);
      } else {
        unknownJoiners.push(entry);
      }
    }

    const displayName = String(
      target.displayName || target.user?.globalName || target.user?.username || "Utente",
    ).trim();
    const avatarUrl =
      typeof target.displayAvatarURL === "function"
        ? target.displayAvatarURL({ size: 128 })
        : target.user?.displayAvatarURL?.({ size: 128 }) || null;

    const embed = new EmbedBuilder()
      .setColor(resolveEmbedColorForGuild(message.guild.id) || "#6f4e37")
      .setAuthor({
        name: `Inviti · ${displayName}`,
        iconURL: avatarUrl || undefined,
      })
      .addFields(...buildInvitesEmbedFields(sorted, joinersByCode, unknownJoiners));

    return safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};

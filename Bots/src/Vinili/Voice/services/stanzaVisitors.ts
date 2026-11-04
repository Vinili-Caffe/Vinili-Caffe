/** Stanze vocali: visitatori (tempo passato in stanza e DM al proprietario). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { sendUserDirectMessage } = require("../../../shared/discord/dmPrivacyNotice") as typeof import("../../../shared/discord/dmPrivacyNotice");
const { userAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { ActivityUserProfile } = require("../../../shared/community/officialActivityModels") as typeof import("../../../shared/community/officialActivityModels");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { MAIN_GUILD_ID, fetchVoiceChannelStatusText } = require("./stanzaNames") as typeof import("./stanzaNames");
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef") as typeof import("../../../shared/web/siteTicketsPageRef");

const STANZA_ALLOWED_GUILD_IDS = new Set([IDs.guilds?.main, IDs.guilds?.test].map((id?) => String(id || "").trim()).filter((id?) => /^\d{5,30}$/.test(id)));

function isStanzaGuildAllowed(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  if (STANZA_ALLOWED_GUILD_IDS.size > 0) return STANZA_ALLOWED_GUILD_IDS.has(gid);
  return gid === MAIN_GUILD_ID;
}

const stanzaVisitorVoiceSession = new Map();

function ownerKey(guildId?, userId?) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function escapeStanzaEmbedPlainText(s?) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/\|/g, "\\|");
}

function formatStanzaPersonalVoiceDuration(totalSeconds?) {
  let sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  sec %= 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

async function incrementStanzaVisitorVoiceSeconds(guildId?, userId?, deltaSeconds?) {
  if (!isValidGuildUserId(guildId, userId)) return;
  const d = Math.max(0, Math.floor(Number(deltaSeconds) || 0));
  if (d <= 0) return;
  const gid = String(guildId);
  const uid = String(userId);
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: gid, userId: uid },
    {
      $inc: { "profile.stanzaVoiceTotalSeconds": d },
      $setOnInsert: { guildId: gid, userId: uid },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => {});
}

async function getStanzaVisitorVoiceTotalSeconds(guildId?, userId?) {
  if (!isValidGuildUserId(guildId, userId)) return 0;
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.stanzaVoiceTotalSeconds")
    .lean()
    .catch(() => null);
  return Math.max(0, Math.floor(Number(doc?.profile?.stanzaVoiceTotalSeconds) || 0));
}

function buildStanzaJoinVisitorDmEmbed(member?, voiceChannel?, roomNamePlain?, ownerId?, statusText?, totalFormatted?) {
  const supportPart = ` aprendo un ${siteTicketsPageDiscordRef("SUPPORTO")}`;
  const ownerMention = `<@${ownerId}>`;
  const safeName = escapeStanzaEmbedPlainText(roomNamePlain);
  const statusLine = statusText
    ? `*${escapeStanzaEmbedPlainText(statusText).slice(0, 400)}*`
    : "*Non impostata*";
  return new EmbedBuilder()
    .setColor(0xdea8e0)
    .setTitle("🏠 · Ingresso nella Stanza")
    .setDescription(
      `Hai effettuato l'accesso alla vocale **${safeName}** (<#${voiceChannel.id}>).\n\n` +
        "**⚠️ Disclaimer responsabilità**\n" +
        `La vocale **${safeName}** è di proprietà di ${ownerMention}: non è moderata dallo staff, salvo casi di doxx e pericolosità estrema.\n` +
        `Se l'ambiente diventa pesante, consigliamo di uscire e, in caso di necessità, di contattare lo staff${supportPart}.\n\n` +
        "**🤍 · Stato della stanza**\n" +
        `| ${statusLine}\n\n` +
        "**⏱️ · Le tue statistiche**\n" +
        `| ⏱️ · ⌛ Tempo personale : ${totalFormatted}`,
    )
    .setThumbnail(userAvatarUrlDynamic(member, { size: 256 }))
    .setTimestamp(new Date());
}

async function notifyStanzaVisitorJoin(member?, voiceChannel?, meta?) {
  const ownerId = String(meta?.ownerId || "").trim();
  if (!ownerId) return;
  const statusText = await fetchVoiceChannelStatusText(member.client, voiceChannel.id, meta);
  const totalSec = await getStanzaVisitorVoiceTotalSeconds(member.guild.id, member.id);
  const totalFormatted = formatStanzaPersonalVoiceDuration(totalSec);
  const embed = buildStanzaJoinVisitorDmEmbed(member, voiceChannel, String(voiceChannel.name || "Stanza"), ownerId, statusText, totalFormatted);
  const tid = String(meta?.textChannelId || "").trim();
  const tch =
    tid && /^\d{5,30}$/.test(tid) ? await fetchStanzaTextChannel(member.guild, tid) : null;
  if (tch?.isTextBased?.()) {
    await tch.send({ content: `<@${member.id}>`, embeds: [embed] }).catch((err?) => {
      global.logger?.warn?.("[stanza] ingresso chat stanza fallito:", err?.code || err?.message || err);
    });
    return;
  }
  await sendUserDirectMessage(member.user, { embeds: [embed] }, {
    guildId: member.guild.id,
    commandsChannelId: IDs.channels.commands,
  });
}

async function finalizeStanzaVisitorVoiceSessionIfLeft(oldState?, newState?) {
  const guild = oldState.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const oldId = String(oldState.channelId || "");
  const newId = String(newState.channelId || "");
  if (!oldId || oldId === newId) return;
  const member = oldState.member;
  if (!member || member.user?.bot) return;
  const userKey = ownerKey(guild.id, member.id);
  const sess = stanzaVisitorVoiceSession.get(userKey);
  if (!sess || sess.voiceChannelId !== oldId) return;
  const deltaSec = Math.max(0, Math.floor((Date.now() - sess.startedAt) / 1000));
  stanzaVisitorVoiceSession.delete(userKey);
  if (deltaSec > 0) await incrementStanzaVisitorVoiceSeconds(guild.id, member.id, deltaSec);
}

async function flushStanzaVisitorVoiceSessionsForChannel(guildId?, voiceChannelId?) {
  const gid = String(guildId || "");
  const vid = String(voiceChannelId || "");
  if (!gid || !vid) return;
  const prefix = `${gid}:`;
  const batch = [];
  for (const [key, sess] of stanzaVisitorVoiceSession.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (sess.voiceChannelId !== vid) continue;
    stanzaVisitorVoiceSession.delete(key);
    const userId = key.slice(prefix.length);
    const deltaSec = Math.max(0, Math.floor((Date.now() - sess.startedAt) / 1000));
    if (deltaSec > 0) batch.push(incrementStanzaVisitorVoiceSeconds(gid, userId, deltaSec));
  }
  await Promise.all(batch);
}

async function fetchStanzaTextChannel(guild?, channelId?) {
  const ch =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!ch?.isTextBased?.()) return null;
  return ch;
}

export = { STANZA_ALLOWED_GUILD_IDS, isStanzaGuildAllowed, stanzaVisitorVoiceSession, ownerKey, notifyStanzaVisitorJoin, finalizeStanzaVisitorVoiceSessionIfLeft, flushStanzaVisitorVoiceSessionsForChannel, fetchStanzaTextChannel };

/** Join gate: controllo del nome dopo l'ingresso. */
const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getJoinGateConfigSnapshot } = require("../../Moderation/services/joinGateService") as typeof import("../../Moderation/services/joinGateService");
const { resolveJoinGateConfiguredExempt } = require("../../Moderation/services/joinGateExemptUtils") as typeof import("../../Moderation/services/joinGateExemptUtils");
const { ARROW } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { createModCase, getModConfig, logModCase } = require("../../Moderation/utils/moderation") as typeof import("../../Moderation/utils/moderation");
const { buildUnbanRequestRow } = require("../../Moderation/utils/unbanRequestButton") as typeof import("../../Moderation/utils/unbanRequestButton");
const { guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function buildJoinGateTriggeredEmbed(member?, reason?) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${E.VC_User} ${member.user.username} ha attivato il joingate!`)
    .setDescription([`${E.VC_User} **Membro:** ${member.user.username} [\`${member.user.id}\`]`, `${E.VC_reason} **Motivo:** ${reason}`,].join("\n"))
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || null);
}

function getJoinGateNameCandidate(member?) {
  return String(
    member?.user?.globalName ||
    member?.displayName ||
    member?.nickname ||
    member?.user?.username ||
    "",
  );
}

function normalizeText(value?) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function wildcardToRegex(wildcard?) {
  const escaped = String(wildcard || "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchUsernameFilters(candidate?, rules?) {
  if (!rules?.enabled) return null;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  const strictWords = Array.isArray(rules?.strictWords) ? rules.strictWords : [];
  for (const word of strictWords) {
    const normalizedWord = normalizeText(word);
    if (!normalizedWord) continue;
    if (normalized.includes(normalizedWord)) {
      return { type: "strict", value: word };
    }
  }

  const wildcardWords = Array.isArray(rules?.wildcardWords) ? rules.wildcardWords : [];
  for (const wildcard of wildcardWords) {
    const regex = wildcardToRegex(normalizeText(wildcard));
    if (regex.test(normalized)) {
      return { type: "wildcard", value: wildcard };
    }
  }

  return null;
}

async function sendJoinGatePostJoinDm(member?, reason?, extraLines = [], action = "") {
  const embed = new EmbedBuilder().setColor("#ED4245").setTitle("Join Gate").setDescription([`${ARROW} **Azione applicata dopo il join**`,
  `${ARROW} **Motivo:** ${reason}`,
  ...extraLines.filter(Boolean),
  ].join("\n"),
  );
  try {
    const components = String(action || "").toLowerCase() === "ban" ? [buildUnbanRequestRow()] : [];
    await member.send({ embeds: [embed], components });
    return true;
  } catch {
    return false;
  }
}

async function enforceJoinGatePostJoinUsername(oldMember?, newMember?) {
  if (!oldMember?.guild || !newMember?.user) return;
  if (newMember.user.bot) return;
  if (await resolveJoinGateConfiguredExempt(newMember.guild, newMember.id, newMember)) return;

  const cfg = getJoinGateConfigSnapshot();
  if (!cfg?.enabled) return;
  if (!cfg?.usernameFilter?.enabled) return;
  if (!cfg?.usernameFilter?.postJoinEnabled) return;

  const oldCandidate = getJoinGateNameCandidate(oldMember);
  const newCandidate = getJoinGateNameCandidate(newMember);
  if (normalizeText(oldCandidate) === normalizeText(newCandidate)) return;

  const match = matchUsernameFilters(newCandidate, cfg.usernameFilter);
  if (!match) return;

  const action = String(cfg?.usernameFilter?.action || "kick").toLowerCase();
  const me = newMember.guild.members.me;
  const canKick = Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) && Boolean(newMember?.kickable);
  const canBan = Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) && Boolean(newMember?.bannable);
  const canTimeout = Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) && Boolean(newMember?.moderatable);

  let punished = false;
  let appliedAction = action;
  const reason = "JoinGate post-join username filter match.";

  if (action === "kick" && canKick) {
    punished = await newMember.kick(reason).then(() => true).catch(() => false);
  } else if (action === "ban" && canBan) {
    punished = await newMember.guild.members
      .ban(newMember.id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch(() => false);
  } else if (action === "timeout" && canTimeout) {
    try {
      const { captureMuteRoleSnapshot } = require("../../Moderation/services/mutedMirrorRoleService") as typeof import("../../Moderation/services/mutedMirrorRoleService");
      await captureMuteRoleSnapshot(newMember, { reason: "JoinGate post-join (pre-timeout)" });
    } catch (err) {
      global.logger?.warn?.("[JoinGate post-join] pre-timeout snapshot:", newMember.id, err?.message || err);
    }
    punished = await newMember
      .timeout(6 * 60 * 60_000, reason)
      .then(() => true)
      .catch(() => false);
  } else {
    appliedAction = "log";
  }

  if (!punished && appliedAction !== "log" && canTimeout) {
    try {
      const { captureMuteRoleSnapshot } = require("../../Moderation/services/mutedMirrorRoleService") as typeof import("../../Moderation/services/mutedMirrorRoleService");
      await captureMuteRoleSnapshot(newMember, { reason: "JoinGate post-join fallback (pre-timeout)" });
    } catch (err) {
      global.logger?.warn?.("[JoinGate post-join] fallback pre-timeout snapshot:", newMember.id, err?.message || err);
    }
    punished = await newMember
      .timeout(6 * 60 * 60_000, "JoinGate post-join fallback timeout.")
      .then(() => true)
      .catch(() => false);
    if (punished) appliedAction = "timeout";
  }
  if (!punished && appliedAction !== "log") {
    appliedAction = "log";
  }

  let dmSent = false;
  if (punished && appliedAction !== "log" && cfg?.dmPunishedMembers !== false) {
    dmSent = await sendJoinGatePostJoinDm(newMember, reason, [
      `${E.VC_Rules} **Regola:** Filtro username`,
      `${E.VC_Info} **Tipo di match:** ${match.type}`,
      `${E.VC_Modifica} **Match:** ${match.value}`,
      `${E.VC_Modifica} **Nome:** ${newCandidate || "N/A"}`,
    ], appliedAction);
  }

  if (punished && appliedAction !== "log" && newMember.guild?.client) {
    const modAction = appliedAction === "timeout" ? "MUTE" : appliedAction === "ban" ? "BAN" : "KICK";
    const durationMs = appliedAction === "timeout" ? 6 * 60 * 60_000 : null;
    const caseReason = `JoinGate post-join: ${reason}`;
    try {
      const config = await getModConfig(newMember.guild.id);
      const { doc, created } = await createModCase({ guildId: newMember.guild.id, action: modAction, userId: newMember.id, modId: newMember.client.user.id, reason: caseReason, durationMs, context: {}, dedupe: { enabled: true, windowMs: 15_000, matchReason: true }, });
      if (created) {
        await logModCase({ client: newMember.client, guild: newMember.guild, modCase: doc, config });
      }
    } catch (e) {
      global.logger?.warn?.("[JoinGate post-join] ModCase creation failed:", newMember.guild.id, newMember.id, e?.message || e);
    }
  }

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? (newMember.guild.channels.cache.get(modLogId) || (await getGuildChannelCached(newMember.guild, modLogId))) : null;
  if (!logChannel?.isTextBased?.()) return;

  const embed = punished ? new EmbedBuilder().setColor("#A97142").setTitle(`${newMember.user.username} has been ${String(appliedAction || "kick").toLowerCase() === "timeout" ? "timed out" : String(appliedAction || "kick").toLowerCase() === "ban" ? "banned" : "kicked"}!!`,
  )
    .setDescription(
      [
        `${E.VC_User} **Membro:** ${newMember.user.username} [\`${newMember.user.id}\`]`,
        `${E.VC_reason} **Motivo:** Username matches blocked pattern (post-join filter).`,
        `${E.VC_Rules} **Regola:** Filtro username`,
        `${E.VC_Action} **Azione:** ${String(appliedAction || "log").toUpperCase()}`,
        `${E.VC_Info} **Tipo di match:** ${match.type}`,
        `${E.VC_Modifica} **Match:** ${match.value}`,
        `${E.VC_Modifica} **Nome vecchio:** ${oldCandidate || "N/A"}`,
        `${E.VC_Modifica} **Nome nuovo:** ${newCandidate || "N/A"}`,
        "",
        `**${E.VC_tools} Informazioni aggiuntive**`,
        `${E.VC_Info} **Membro messaggio diretto?** ${dmSent ? E.VC_Verified : E.VC_Cross}`,
        `${E.VC_Info} **Membro punito?** ${punished ? E.VC_Verified : E.VC_Cross}`,
      ].join("\n"),
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(newMember, { size: 256 }) || null)
    : buildJoinGateTriggeredEmbed(newMember, "Filtro username matchato.");

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

export = { enforceJoinGatePostJoinUsername };

/** Join gate: controllo del nome dopo l'ingresso. */
const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getJoinGateConfigSnapshot } = require("../Moderation/joinGateService") as typeof import("../Moderation/joinGateService");
const { resolveJoinGateConfiguredExempt, isSponsorJoinGateGuildId } = require("../Moderation/joinGateExemptUtils") as typeof import("../Moderation/joinGateExemptUtils");
const { ARROW } = require("../../Utils/Logging/channelRolesLogUtils") as typeof import("../../Utils/Logging/channelRolesLogUtils");
const { createModCase, getModConfig, logModCase } = require("../../Utils/Moderation/moderation") as typeof import("../../Utils/Moderation/moderation");
const { buildUnbanRequestRow } = require("../../Utils/Moderation/unbanRequestButton") as typeof import("../../Utils/Moderation/unbanRequestButton");
const { guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");

function buildJoinGateTriggeredEmbed(member?, reason?) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`<:VC_User:1482527453586002103> ${member.user.username} ha attivato il joingate!`)
    .setDescription([`<:VC_User:1482527453586002103> **Membro:** ${member.user.username} [\`${member.user.id}\`]`, `<:VC_reason:1478517122929004544> **Motivo:** ${reason}`,].join("\n"))
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
  if (isSponsorJoinGateGuildId(newMember.guild.id)) return;
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
      const { captureMuteRoleSnapshot } = require("../Moderation/mutedMirrorRoleService") as typeof import("../Moderation/mutedMirrorRoleService");
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
      const { captureMuteRoleSnapshot } = require("../Moderation/mutedMirrorRoleService") as typeof import("../Moderation/mutedMirrorRoleService");
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
      `<:VC_Rules:1482527309868040393> **Regola:** Filtro username`,
      `<:VC_Info:1482526956703580372> **Tipo di match:** ${match.type}`,
      `<:VC_Modifica:1478859646587633717> **Match:** ${match.value}`,
      `<:VC_Modifica:1478859646587633717> **Nome:** ${newCandidate || "N/A"}`,
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
        `<:VC_User:1482527453586002103> **Membro:** ${newMember.user.username} [\`${newMember.user.id}\`]`,
        `<:VC_reason:1478517122929004544> **Motivo:** Username matches blocked pattern (post-join filter).`,
        `<:VC_Rules:1482527309868040393> **Regola:** Filtro username`,
        `<:VC_Action:1482527453586002103> **Azione:** ${String(appliedAction || "log").toUpperCase()}`,
        `<:VC_Info:1482526956703580372> **Tipo di match:** ${match.type}`,
        `<:VC_Modifica:1478859646587633717> **Match:** ${match.value}`,
        `<:VC_Modifica:1478859646587633717> **Nome vecchio:** ${oldCandidate || "N/A"}`,
        `<:VC_Modifica:1478859646587633717> **Nome nuovo:** ${newCandidate || "N/A"}`,
        "",
        "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
        `<:VC_Info:1482526956703580372> **Membro messaggio diretto?** ${dmSent ? "<a:VC_Verified:1482532479637127188>" : "<a:VC_Cross:1482532424570376253>"}`,
        `<:VC_Info:1482526956703580372> **Membro punito?** ${punished ? "<a:VC_Verified:1482532479637127188>" : "<a:VC_Cross:1482532424570376253>"}`,
      ].join("\n"),
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(newMember, { size: 256 }) || null)
    : buildJoinGateTriggeredEmbed(newMember, "Filtro username matchato.");

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

export = { enforceJoinGatePostJoinUsername };

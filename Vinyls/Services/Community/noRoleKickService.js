const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached } = require("../../Utils/Interaction/interactionEntityCache");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const NO_ROLE_GRACE_MS = 24 * 60 * 60 * 1000;
const NO_ROLE_SWEEP_INTERVAL_MS = Number(process.env.NO_ROLE_KICK_SWEEP_INTERVAL_MS) || 30 * 60 * 1000;
const NO_ROLE_KICK_REASON = "Membro senza ruoli dopo 24h dall'ingresso.";

function memberHasAnyAssignedRole(member) {
  if (!member?.roles?.cache) return true;
  for (const role of member.roles.cache.values()) {
    if (String(role?.id || "") !== String(member.guild?.id || "")) return true;
  }
  return false;
}

function isNoRoleKickCandidate(member, now = Date.now()) {
  if (!member?.guild || !member?.user || member.user.bot) return false;
  if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return false;
  if (memberHasAnyAssignedRole(member)) return false;
  const joinedMs = Number(member.joinedTimestamp || member.joinedAt?.getTime?.() || 0);
  if (!Number.isFinite(joinedMs) || joinedMs <= 0) return false;
  return now - joinedMs >= NO_ROLE_GRACE_MS;
}

function buildNoRoleKickDm(guild) {
  const invite = String(IDs.links?.invite || "").trim();
  const inviteLine = invite ? `\n\nPuoi rientrare qui: ${invite}` : "";
  return {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(`Inserimento non completato su ${guild?.name || "Vinili & Caffe"}`)
        .setDescription(
          "Sei stato rimosso dal server perché dopo 24 ore non avevi ancora completato l'inserimento e non avevi alcun ruolo.\n\n" +
            "Per restare nel server devi completare la verifica/introduzione e ottenere i ruoli richiesti." +
            inviteLine,
        )
        .setTimestamp(),
    ],
  };
}

async function kickNoRoleMember(member) {
  if (!isNoRoleKickCandidate(member)) return false;
  const me = member.guild?.members?.me || (await member.guild?.members?.fetchMe?.().catch(() => null));
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.KickMembers)) {
    global.logger?.warn?.("[NO ROLE KICK] Missing KickMembers permission", member.guild.id);
    return false;
  }
  if (!member.kickable) {
    global.logger?.warn?.("[NO ROLE KICK] Member not kickable", member.guild.id, member.id);
    return false;
  }
  await member.send(buildNoRoleKickDm(member.guild)).catch(() => null);
  const fresh = await member.guild.members.fetch(member.id).catch(() => member);
  if (!isNoRoleKickCandidate(fresh)) return false;
  await fresh.kick(NO_ROLE_KICK_REASON);
  return true;
}

async function runNoRoleKickSweep(client) {
  if (!client || !MAIN_GUILD_ID) return { scanned: 0, kicked: 0 };
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await getClientGuildCached(client, MAIN_GUILD_ID));
  if (!guild) return { scanned: 0, kicked: 0 };

  const members = await guild.members.fetch().catch((err) => {
    global.logger?.warn?.("[NO ROLE KICK] Fetch members failed:", err?.message || err);
    return guild.members.cache;
  });

  let scanned = 0;
  let kicked = 0;
  for (const member of members.values()) {
    scanned += 1;
    if (!isNoRoleKickCandidate(member)) continue;
    const ok = await kickNoRoleMember(member).catch((err) => {
      global.logger?.warn?.("[NO ROLE KICK] Kick failed:", member.guild.id, member.id, err?.message || err);
      return false;
    });
    if (ok) kicked += 1;
  }
  if (kicked > 0) {
    global.logger?.info?.("[NO ROLE KICK] Sweep completed", { guildId: guild.id, scanned, kicked });
  }
  return { scanned, kicked };
}

function startNoRoleKickLoop(client) {
  if (!client || client._noRoleKickLoopStarted) return;
  client._noRoleKickLoopStarted = true;
  runNoRoleKickSweep(client).catch((err) => {
    global.logger?.warn?.("[NO ROLE KICK] Startup sweep failed:", err?.message || err);
  });
  const timer = setInterval(() => {
    runNoRoleKickSweep(client).catch((err) => {
      global.logger?.warn?.("[NO ROLE KICK] Periodic sweep failed:", err?.message || err);
    });
  }, NO_ROLE_SWEEP_INTERVAL_MS);
  timer.unref?.();
  client._noRoleKickInterval = timer;
  return timer;
}

module.exports = {
  memberHasAnyAssignedRole,
  isNoRoleKickCandidate,
  runNoRoleKickSweep,
  startNoRoleKickLoop,
};
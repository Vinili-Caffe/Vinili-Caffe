/** Mute: timeout di comunicazione di Discord. */
function didCommunicationTimeoutChange(oldMember?, newMember?) {
  const oldTs = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember?.communicationDisabledUntilTimestamp || 0;
  return Number(oldTs) !== Number(newTs);
}

async function resolveCommunicationTimeoutUntilMs(member?, guild?) {
  const local =
    Number(member?.communicationDisabledUntilTimestamp || 0) ||
    (member?.communicationDisabledUntil
      ? new Date(member.communicationDisabledUntil).getTime()
      : 0);
  if (Number.isFinite(local) && local > 0) return local;

  const gid = String(guild?.id || member?.guild?.id || "").trim();
  const uid = String(member?.id || "").trim();
  const rest = guild?.client?._rest || member?.client?._rest || guild?.client?.rest || member?.client?.rest;
      if (!gid || !uid || typeof rest?.get !== "function") return null;
  try {
    const { Routes } = require("discord.js") as typeof import("discord.js");
    const raw = await rest.get(Routes.guildMember(gid, uid));
    if (!raw || typeof raw !== "object") return null;
    if (!raw.communication_disabled_until) return 0;
    const parsed = Date.parse(raw.communication_disabled_until);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export = { didCommunicationTimeoutChange, resolveCommunicationTimeoutUntilMs };

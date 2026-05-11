const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { getGuildChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const INVITE_DELETE_ACTION = AuditLogEvent?.InviteDelete ?? 42;
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;

function formatAuditActor(actor) {
  if (!actor) return "sconosciuto";
  const flags = [];
  if (actor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${actor}${suffix} \`${actor.id}\``;
}

function formatMaxAge(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  if (!safe) return "Mai";
  const days = safe / 86400;
  if (Number.isInteger(days)) return `${days} giorno${days === 1 ? "" : "i"}`;
  const hours = safe / 3600;
  if (Number.isInteger(hours)) return `${hours} ora${hours === 1 ? "" : "e"}`;
  const mins = Math.floor(safe / 60);
  return `${mins} minut${mins === 1 ? "o" : "i"}`;
}

function normalizeCount(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function resolveResponsible(guild, code) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs=await guild.fetchAuditLogs({type:INVITE_DELETE_ACTION,limit:AUDIT_FETCH_LIMIT}).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const entry=logs.entries.find((item) => {const created=Number(item?.createdTimestamp||0);const within=created>0&&now-created<=AUDIT_LOOKBACK_MS;return within&&String(item?.target?.code||"")===String(code||"");});
      if (entry?.executor) return entry.executor;
    }

    if (attempt < 2) await sleep(700);
  }

  return null;
}

module.exports = {
  name: "inviteDelete",
  async execute(invite) {
    try {
      const guild = invite?.guild;
      const code = String(invite?.code || "");
      const client = invite?.client || guild?.client || null;
      if (!guild || !code) return;

      const cache = client?.inviteCache?.get(guild.id);
      if (cache) {
        cache.delete(code);
      }

      const logChannel = await resolveLogChannel(guild);
      if (!logChannel?.isTextBased?.()) return;

      const responsible=(await resolveResponsible(guild,code))||invite?.inviter||null;
      const responsibleText = formatAuditActor(responsible);
      const channelText = invite.channel ? `${invite.channel}` : "#sconosciuto";
      const inviteUrl = invite?.url || (code ? `https://discord.gg/${code}` : null);

      const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setTitle("<a:VC_Verified:1482532479637127188> Invito eliminato")
        .setDescription([`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
            `<:VC_Clock:1473359204189474886> <t:${nowTs}:F>`,
            "",
            "**Impostazioni precedenti**",
            `<:VC_Modifica:1478859646587633717> **Codice:** ${code}`,
            inviteUrl ? `<:VC_Modifica:1478859646587633717> **URL:** ${inviteUrl}` : null,
            `<:VC_Modifica:1478859646587633717> **Canale:** ${channelText}`,
            `<:VC_Modifica:1478859646587633717> **Utilizzi:** ${normalizeCount(invite.maxUses, 0)}`,
            `<:VC_Modifica:1478859646587633717> **Scadenza:** ${formatMaxAge(invite.maxAge)}`,
            `<:VC_Modifica:1478859646587633717> **Temporaneo:** ${Boolean(invite.temporary) ? "Si" : "No"}`,
          ]
            .filter(Boolean)
            .join("\n"));

      await logChannel.send({ embeds: [embed] }).catch(() => null);
    } catch (error) {
      global.logger?.error?.("[inviteDelete] failed:", error);
    }
  },
};
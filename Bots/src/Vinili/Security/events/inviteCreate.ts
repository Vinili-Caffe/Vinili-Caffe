const { AuditLogEvent, EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { handleInviteCreationAction: antiNukeHandleInviteCreationAction, isAntiNukePanicActive, isWhitelistedExecutorAsync, } = require("../../Security/services/antiNukeService") as typeof import("../../Security/services/antiNukeService");
const { getSecurityLockState } = require("../../Security/services/securityOrchestratorService") as typeof import("../../Security/services/securityOrchestratorService");
const { toDiscordTimestamp } = require("../../Moderation/utils/channelRolesLogUtils") as typeof import("../../Moderation/utils/channelRolesLogUtils");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const INVITE_CREATE_ACTION = AuditLogEvent?.InviteCreate ?? 40;
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const SECURITY_LOCK_FALLBACK = { active: false, joinLockActive: false, commandLockActive: false, sources: [], commandSources: [], details: { antiNukePanic: false, autoModPanic: false, joinRaid: false, lockAllCommands: false, joinRaidLockCommands: false, autoModLockCommands: false, commandLockByPanic: false, commandLockByJoinRaid: false, commandLockByAutoModPanic: false } };

function formatAuditActor(actor?) {
  if (!actor) return "sconosciuto";
  const flags = [];
  if (actor?.bot) flags.push("BOT");
  const suffix = flags.length ? ` [${flags.join("/")}]` : "";
  return `${actor}${suffix} \`${actor.id}\``;
}

function formatMaxAge(seconds?) {
  const safe = Math.max(0, Number(seconds || 0));
  if (!safe) return "Mai";
  const days = safe / 86400;
  if (Number.isInteger(days)) return days === 1 ? "1 giorno" : `${days} giorni`;
  const hours = safe / 3600;
  if (Number.isInteger(hours)) return hours === 1 ? "1 ora" : `${hours} ore`;
  const mins = Math.floor(safe / 60);
  return `${mins} minut${mins === 1 ? "o" : "i"}`;
}

function normalizeCount(value?, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function resolveLogChannel(guild?) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveResponsible(guild?, code?) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs=await guild.fetchAuditLogs({type:INVITE_CREATE_ACTION,limit:AUDIT_FETCH_LIMIT}).catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const entry=logs.entries.find((item?) => {const created=Number(item?.createdTimestamp||0);const within=created>0&&now-created<=AUDIT_LOOKBACK_MS;return within&&String(item?.target?.code||"")===String(code||"");});
      if (entry?.executor) return entry.executor;
    }

    if (attempt < 2) await sleep(700);
  }

  return null;
}

export = {
  name: "inviteCreate",
  async execute(invite?) {
    try {
      const guild = invite?.guild;
      const code = String(invite?.code || "");
      const client = invite?.client || guild?.client || null;
      if (!guild || !code || !client) return;

      if (!client.inviteCache) client.inviteCache = new Map();
      if (!client.inviteCache.has(guild.id)) {
        client.inviteCache.set(guild.id, new Map());
      }
      client.inviteCache.get(guild.id).set(code, {
        uses: normalizeCount(invite.uses, 0),
        inviterId: invite.inviter?.id || null,
      });

      if (!isViniliFullFeatureGuild(guild.id)) return;

      const logChannel = await resolveLogChannel(guild);

      const responsible=(await resolveResponsible(guild,code))||invite?.inviter||null;
      const executorId = String(responsible?.id || invite?.inviter?.id || "");

      await antiNukeHandleInviteCreationAction({
        guild,
        executorId,
        inviteCode: code,
        channelId: String(invite?.channel?.id || ""),
      }).catch(() => {});

      const securityState = await getSecurityLockState(guild).catch(() => ({ ...SECURITY_LOCK_FALLBACK }));
      if (
        (isAntiNukePanicActive(guild.id) || securityState.joinLockActive || securityState.commandLockActive) &&
        !(executorId && (await isWhitelistedExecutorAsync(guild, executorId)))
      ) {
        await invite
          .delete("<a:VC_Alert:1482706673176150077> Modulo AntiNuke: creazione invito bloccata")
          .catch(() => {});
      }

      if (logChannel?.isTextBased?.()) {
        const responsibleText = formatAuditActor(responsible);
        const channelText = invite.channel ? `${invite.channel}` : "#sconosciuto";
        const inviteUrl = invite?.url || (code ? `https://discord.gg/${code}` : null);

        const embed = new EmbedBuilder()
            .setColor("#57F287")
            .setTitle("<a:VC_Verified:1482532479637127188> Invito creato")
            .setDescription([`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
              `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
              "",
              "**Impostazioni**",
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
      }
    } catch (error) {
      global.logger?.error?.("[inviteCreate] failed:", error);
    }
  },
};
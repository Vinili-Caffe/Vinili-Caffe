const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { createModCase, getModConfig, getHighestModerationRelevantRolePosition, logModCase, parseDuration } = require("../moderation") as typeof import("../moderation");
const { resolveTarget } = require("../prefixModeration") as typeof import("../prefixModeration");
const { sendDm } = require("../../../Community/utils/noDmList") as typeof import("../../../Community/utils/noDmList");
const { buildUnbanRequestRow } = require("../unbanRequestButton") as typeof import("../unbanRequestButton");
const { buildUnmuteRequestRow } = require("../unmuteRequestButton") as typeof import("../unmuteRequestButton");
const { isViniliProtectedGuild } = require("../../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../../MultiGuild/core/viniliProtectedGuilds");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
function embed(client?, title?, description?, color = null) {
  return new EmbedBuilder()
    .setColor(color || client?.config?.embedModLight || "#6f4e37")
    .setTitle(title != null ? String(title).slice(0, 256) : "")
    .setDescription(description != null ? String(description).slice(0, 4096) : "");
}

function reasonFrom(args?, start = 0, fallback = "Nessun motivo fornito") {
  const value = String(args.slice(start).join(" ") || "").trim();
  return value ? value.slice(0, 512) : fallback;
}

async function reply(message?, client?, title?, description?, color = null) {
  return message.channel
    .send({ embeds: [embed(client, title, description, color)] })
    .catch(() => null);
}

function successText(subject?, verb?, reason?) {
  const safeSubject = String(subject || "unknown").trim();
  const safeVerb = String(verb || "was updated").trim();
  const left = `${E.success} ***${safeSubject} ${safeVerb}.***`;
  if (!reason) return left;
  return `${left} • ${String(reason).trim()}`;
}

function resolveCaseDurationChange(row?, nextDurationMs?) {
  const now = Date.now();
  const next = Math.max(0, Math.floor(Number(nextDurationMs) || 0));
  let startedAt = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
  if (!Number.isFinite(startedAt)) {
    const prevExp = row?.expiresAt ? new Date(row.expiresAt).getTime() : NaN;
    const prevDur = Number(row?.durationMs);
    if (Number.isFinite(prevExp) && Number.isFinite(prevDur) && prevDur > 0) {
      startedAt = prevExp - prevDur;
    }
  }
  if (!Number.isFinite(startedAt) || startedAt <= 0) startedAt = now;
  const elapsedMs = Math.max(0, now - startedAt);
  const remainingMs = Math.max(0, next - elapsedMs);
  const expiresAt = next > 0 ? new Date(startedAt + next) : null;
  return {
    durationMs: next > 0 ? next : null,
    expiresAt,
    remainingMs,
    elapsedMs,
    startedAt,
  };
}

function formatTargetLabel(target?) {
  const id = String(target?.id || target || "").trim();
  const username = String(target?.username || "").trim();
  if (username) return username.toLowerCase();
  if (/^\d{17,20}$/.test(id)) return id;
  return id || "sconosciuto";
}

function isServerOwner(member?, guild?) {
  return Boolean(member && guild && String(member.id) === String(guild.ownerId));
}

function describeBanError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  const raw = String(err?.message || err?.rawError?.message || "").toLowerCase();
  if (code === 50013 || raw.includes("missing permissions")) {
    return "Il bot non può bannare questo utente. Spesso il bersaglio ha il permesso **Amministratore** (non basta avere un ruolo più alto in lista).";
  }
  if (code === 50035 || raw.includes("delete_message")) {
    return "Discord non accetta i parametri del ban (cancellazione messaggi). Riprova con `+ban save <utente> <motivo>`.";
  }
  if (code === 10026 || raw.includes("already banned")) {
    return "Questo utente è **già bannato**.";
  }
  if (raw.includes("owner")) {
    return "Non si può bannare il **proprietario** del server.";
  }
  if (raw.includes("cannot ban") || raw.includes("hierarchy") || raw.includes("role hierarchy")) {
    return "Discord rifiuta il ban per **gerarchia ruoli** o perché il bersaglio ha permessi che il bot non può superare.";
  }
  if (code === 10013 || raw.includes("unknown user")) {
    return "Utente sconosciuto o **ID non valido**.";
  }
  if (code === 30032) {
    return "Raggiunto il **limite massimo** di ban del server.";
  }
  const detail = String(err?.message || err?.rawError?.message || "").trim();
  if (detail) return `Discord: ${detail.slice(0, 240)}`;
  return "Discord ha rifiutato il ban senza ulteriori dettagli.";
}

/** Ruolo mute locale al server (non forzare l’ID Vinili su tenant). */
function resolveGuildMutedRoleId(guild?) {
  if (!guild?.roles?.cache) return null;
  const configured = String(IDs?.roles?.Muted || "").trim();
  if (configured && guild.roles.cache.has(configured)) return configured;
  const byName = guild.roles.cache.find((role?) => {
    const name = String(role?.name || "")
      .trim()
      .toLowerCase();
    return name === "muted" || name === "mute" || name === "silenziato" || name === "silenziati";
  });
  return byName?.id ? String(byName.id) : null;
}

async function executeGuildBan(guild?, userId?, options?) {
  const id = String(userId || "").trim();
  if (!/^\d{17,20}$/.test(id)) return { ok: false, error: "ID utente non valido." };
  let lastErr = null;
  try {
    await guild.members.ban(id, options);
    return { ok: true };
  } catch (err) {
    lastErr = err;
  }
  try {
    await guild.bans.create(id, options);
    return { ok: true };
  } catch (err) {
    lastErr = err;
  }
  global.logger?.warn?.("[moderation] ban failed:", {
    guildId: guild?.id,
    userId: id,
    code: lastErr?.code ?? lastErr?.rawError?.code,
    message: lastErr?.message || lastErr?.rawError?.message,
  });
  return { ok: false, error: describeBanError(lastErr) };
}

async function validateModerationTarget(message?, member?, actionLabel?, targetUserId = "") {
  let targetMember = member || null;
  const fallbackId = String(targetUserId || targetMember?.id || "").trim();
  if (!targetMember && /^\d{17,20}$/.test(fallbackId)) {
    targetMember = await message.guild.members.fetch(fallbackId).catch(() => null);
  }
  if (!targetMember) return { ok: true };
  try {
    const { isExempt } = require("../moderation") as typeof import("../moderation");
    const cfg = await getModConfig(message.guild?.id);
    const channelId = message.invokeChannel?.id || message.channel?.id;
    if (isExempt(targetMember, cfg, channelId)) {
      return { ok: false, error: `${E.VC_Lock} Questo utente (o questo canale) è escluso dalla moderazione.` };
    }
  } catch (_) {}
  if (String(targetMember.id) === String(message.author.id)) {
    return { ok: false, error: `${E.VC_Lock} Non puoi usare \`${actionLabel}\` su te stesso.` };
  }
  if (String(targetMember.id) === String(message.client.user.id)) {
    return { ok: false, error: `${E.VC_Lock} Non puoi moderare il bot.` };
  }
  if (isServerOwner(targetMember, message.guild)) {
    return { ok: false, error: `${E.VC_Lock} Non puoi moderare il proprietario del server.` };
  }
  if (targetMember.permissions?.has(PermissionsBitField.Flags.Administrator)) {
    const botAdmin = message.guild?.members?.me?.permissions?.has(PermissionsBitField.Flags.Administrator);
    if (!botAdmin) {
      return {
        ok: false,
        error: `${E.VC_Lock} Questo utente ha **Amministratore**: il bot non può bannarlo finché non ha anche Amministratore o finché non gli togli quel permesso.`,
      };
    }
  }
  const actorMember = message.member;
  const actorHighest = getHighestModerationRelevantRolePosition(actorMember);
  const targetHighest = getHighestModerationRelevantRolePosition(targetMember);
  if (actorHighest >= 0 && targetHighest >= 0 && targetHighest >= actorHighest) {
    return {
      ok: false,
      error: `${E.VC_Lock} Non puoi moderare un utente con ruolo superiore o uguale al tuo.`,
    };
  }
  const protectedRoleIds = [ IDs?.roles?.Staff, IDs?.roles?.Helper, IDs?.roles?.Mod, IDs?.roles?.SeniorModerator, IDs?.roles?.HighStaff, IDs?.roles?.Director, IDs?.roles?.Admin, IDs?.roles?.Manager, IDs?.roles?.Founder,].map((id?) => String(id || "").trim()).filter(Boolean);
  let configuredProtected = [];
  try {
    const { getTenantModerationExtrasSync } = require("../../../../MultiGuild/core/tenantModerationSettings") as typeof import("../../../../MultiGuild/core/tenantModerationSettings");
    configuredProtected = getTenantModerationExtrasSync(message.guild?.id)?.protectedRoleIds || [];
  } catch (_) {}
  const allProtected = [...new Set([...protectedRoleIds, ...configuredProtected.map(String)])];
  const actorHighStaffBypass = [IDs?.roles?.HighStaff, IDs?.roles?.Director, IDs?.roles?.Admin, IDs?.roles?.Manager, IDs?.roles?.Founder,].map((id?) => String(id || "").trim()).filter(Boolean).some((roleId?) => message.member?.roles?.cache?.has(roleId));
  const targetHasStaffRole = String(IDs?.roles?.Staff || "").trim() && targetMember.roles?.cache?.has(String(IDs?.roles?.Staff || "").trim());
  const targetHasCoreProtectedRole = [IDs?.roles?.HighStaff, IDs?.roles?.Director, IDs?.roles?.Admin, IDs?.roles?.Manager, IDs?.roles?.Founder,].map((id?) => String(id || "").trim()).filter(Boolean).some((roleId?) => targetMember.roles?.cache?.has(roleId));

  if (actorHighStaffBypass && targetHasStaffRole && !targetHasCoreProtectedRole) {
    return { ok: true };
  }
  if (allProtected.some((roleId?) => targetMember.roles?.cache?.has(roleId))) {
    return {
      ok: false,
      error: `${E.VC_Lock} Non puoi moderare un utente con un ruolo protetto.`,
    };
  }
  return { ok: true };
}

function inferActionKeyFromVerb(verb?) {
  const v = String(verb || "").toLowerCase();
  if (v.includes("softban")) return "softban";
  if (v.includes("banned") || v.includes("ban")) return "ban";
  if (v.includes("kicked") || v.includes("kick") || v.includes("espuls")) return "kick";
  if (v.includes("unmuted") || v.includes("unmute") || v.includes("riattivat")) return "unmute";
  if (v.includes("muted") || v.includes("mute") || v.includes("silenziat")) return "mute";
  if (v.includes("unbanned") || v.includes("unban") || v.includes("revocat")) return "unban";
  return "";
}

async function successReply(message?, subject?, verb?, reason = "", actionKey = "") {
  let replyWithReason = true;
  let deleteModCommands = false;
  let template = "";
  const key = String(actionKey || inferActionKeyFromVerb(verb) || "").toLowerCase();
  try {
    const { getTenantModerationExtras } = require("../../../../MultiGuild/core/tenantModerationSettings") as typeof import("../../../../MultiGuild/core/tenantModerationSettings");
    const extras = await getTenantModerationExtras(message?.guild?.id);
    replyWithReason = extras?.replyWithReason !== false;
    deleteModCommands = extras?.deleteModCommands === true;
    template = String(extras?.messages?.[key] || "").trim();
  } catch (_) {}

  let description = "";
  if (template) {
    description = `${E.success} ${template.replace(/\{user\}/gi, String(subject || "utente"))}`;
  } else {
    description = successText(subject, verb, "");
  }
  const safeReason = String(reason || "").trim();
  if (replyWithReason && safeReason) description = `${description} • ${safeReason}`;

  const { PREFIX_DISPATCH_BRANDING_DONE_KEY } = require("../../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../../MultiGuild/utils/tenantEmbedBranding");
  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setDescription(description.slice(0, 4096));
  if (message?.fromSanzionaAppCommand && message?.author) {
    const authorLabel = String(
      message.member?.displayName || message.author.globalName || message.author.username || "Staff",
    ).trim();
    embed.setFooter({ text: `Eseguito da ${authorLabel}`.slice(0, 2048) });
  }
  const payload = {
    embeds: [embed],
    includeAuthor: false,
    includeBanner: false,
    includeThumbnail: false,
    [PREFIX_DISPATCH_BRANDING_DONE_KEY]: true,
  };
  let out = null;
  if (typeof message?.reply === "function") {
    out = await message.reply(payload).catch(() => null);
  }
  if (!out) out = (await message?.channel?.send?.(payload)?.catch?.(() => null)) ?? null;
  if (deleteModCommands && message?.deletable) {
    await message.delete().catch(() => null);
  }
  return out;
}

async function sendModerationDm({ user, guildId, guildName, action, reason = "", durationText = "" }) {
  if (!user) return false;
  try {
    const cfg = await getModConfig(guildId);
    if (cfg && cfg.dmOnAction === false) return false;
  } catch (_) {}
  const safeReason = String(reason || "").trim();
  const safeDuration = String(durationText || "").trim();
      const safeGuildName = String(guildName || "").replace(/\|/g, "•").trim() || "questo server";
  const actionKey = String(action || "").toLowerCase();
  const withReason = safeReason ? ` | **${safeReason}**` : "";
  let baseText = "";
  if (actionKey === "warn") {
    baseText = `${E.VC_Alert} Sei stato warnato in ${safeGuildName}.${withReason}`;
  } else if (actionKey === "ban") {
    baseText = `${E.VC_Alert} Sei stato bannato da ${safeGuildName}.${withReason}`;
  } else if (actionKey === "kick") {
    baseText = `${E.VC_Alert} Sei stato kickato da ${safeGuildName}.${withReason}`;
  } else if (actionKey === "mute") {
    const durationPart = safeDuration ? ` per ${safeDuration}` : "";
    baseText = `${E.VC_Alert} Sei stato mutato in ${safeGuildName}${durationPart}.${withReason}`;
  } else if (actionKey === "unban") {
    baseText = `${E.VC_Alert} Il tuo ban in ${safeGuildName} è stato revocato.${withReason}`;
  } else if (actionKey === "unmute") {
    baseText = `${E.VC_Alert} Il tuo mute in ${safeGuildName} è stato revocato.${withReason}`;
  } else if (actionKey === "delwarn") {
    baseText = `${E.VC_Alert} Un warn ti è stato rimosso in ${safeGuildName}.${withReason}`;
  } else if (actionKey === "clearwarn") {
    baseText = `${E.VC_Alert} Tutti i tuoi warn sono stati rimossi in ${safeGuildName}.${withReason}`;
  } else {
    return false;
  }

  const embed = new EmbedBuilder().setColor("#ED4245").setDescription(baseText);
  let components = undefined;
  const viniliGuild = isViniliProtectedGuild(guildId);
  if (actionKey === "ban" && viniliGuild) {
    components = [buildUnbanRequestRow()];
  } else if (actionKey === "mute" && viniliGuild) {
    components = [buildUnmuteRequestRow()];
  } else if (actionKey === "unban") {
    let rawInvite = viniliGuild ? String(IDs?.links?.invite || "").trim() : "";
    try {
      const {
        getAppealsSettingsFresh,
        resolveAppealInviteUrl,
      } = require("../../../../MultiGuild/core/tenantAppealsRuntime") as typeof import("../../../../MultiGuild/core/tenantAppealsRuntime");
      const appeals = await getAppealsSettingsFresh(guildId).catch(() => null);
      rawInvite = resolveAppealInviteUrl(appeals, rawInvite) || rawInvite;
    } catch (_) {}
    const inviteUrl = /^https?:\/\//i.test(rawInvite) ? rawInvite : rawInvite ? `https://${rawInvite.replace(/^\/+/, "")}` : "";
    if (inviteUrl) {
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("Rientra nel server")
            .setEmoji(E.link)
            .setURL(inviteUrl),
        ),
      ];
    }
  }
  const suppressPrivacyChannelNotice = actionKey === "ban" || actionKey === "kick";
  const sent = await sendDm(user, { embeds: [embed], components }, {
    guildId,
    bypassNoDm: true,
    notifyOnPrivacyBlock: !suppressPrivacyChannelNotice,
  });
  return Boolean(sent);
}

async function makeCase(client?, message?, action?, userId?, reason?, durationMs = null) {
  const config = await getModConfig(message.guild.id);
  const contextChannelId = message.invokeChannel?.id || message.channel?.id;
  const { doc, created } = await createModCase({ guildId: message.guild.id, action, userId: String(userId), modId: message.author.id, reason, durationMs, context: { channelId: contextChannelId, messageId: message.id }, dedupe: { enabled: true, byMessageId: true, matchReason: false }, });
  if (created && doc) {
    await logModCase({ client, guild: message.guild, modCase: doc, config });
  }
  return doc;
}

async function pickUser(message?, args?, index = 0) {
  const target = await resolveTarget(message, args, index);
  return {
    user: target?.user || null,
    member: target?.member || null,
    userId: target?.userId || null,
  };
}

function parseMaybeDuration(raw?) {
  const ms = parseDuration(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function parseDynoMuteDuration(raw?) {
  const token = String(raw || "").trim().toLowerCase();
  if (!token) return null;
  if (/^\d+$/.test(token)) {
    const minutes = Number.parseInt(token, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return minutes * 60 * 1000;
  }
  if (/^\d+s$/.test(token)) return null;
  if (!/^\d+[mhd]$/.test(token)) return null;
  return parseMaybeDuration(token);
}

function formatRemainingWords(ms?) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days > 0) parts.push(days === 1 ? "1 giorno" : `${days} giorni`);
  if (hours > 0) parts.push(hours === 1 ? "1 ora" : `${hours} ore`);
  if (minutes > 0) parts.push(minutes === 1 ? "1 minuto" : `${minutes} minuti`);
  if (seconds > 0 || !parts.length) parts.push(seconds === 1 ? "1 secondo" : `${seconds} secondi`);
  return parts.join(", ");
}

function formatDurationWords(ms?) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (!total) return null;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (days > 0) parts.push(days === 1 ? "1 giorno" : `${days} giorni`);
  if (hours > 0) parts.push(hours === 1 ? "1 ora" : `${hours} ore`);
  if (minutes > 0) parts.push(minutes === 1 ? "1 minuto" : `${minutes} minuti`);
  if (seconds > 0 && !parts.length) parts.push(seconds === 1 ? "1 secondo" : `${seconds} secondi`);
  return parts.join(", ");
}

function formatDynoDate(value?) {
  if (!value) return "Data sconosciuta";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Data sconosciuta";
  const formatted = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, }).format(dt);
  return formatted.replace(",", "").replace(",", "");
}

function parseLockDuration(raw?) {
  const token = String(raw || "").trim().toLowerCase();
  if (!token) return null;
  if (!/^\d+[mhd]$/.test(token)) return null;
  return parseMaybeDuration(token);
}

function normalizeLookupToken(raw?) {
  return String(raw || "").trim().replace(/^@+/, "").toLowerCase();
}

function matchesBanUserToken(user?, token?) {
  if (!user || !token) return false;
  const username = String(user.username || "").toLowerCase();
  const globalName = String(user.globalName || "").toLowerCase();
  const tag = String(user.tag || "").toLowerCase();
  return (
    username === token ||
    globalName === token ||
    tag === token
  );
}

async function resolveBanTarget(message?, raw?) {
  const token = String(raw || "").trim();
  if (!token) return { userId: null, banInfo: null };
  const idLike = token.replace(/[<@!>]/g, "").trim();
  if (/^\d{17,20}$/.test(idLike)) {
    const banInfoById = await message.guild.bans.fetch(idLike).catch(() => null);
    return { userId: idLike, banInfo: banInfoById };
  }

  const lookup = normalizeLookupToken(token);
  if (!lookup) return { userId: null, banInfo: null };
  const bans = await message.guild.bans.fetch().catch(() => null);
  if (!bans?.size) return { userId: null, banInfo: null };
  const banInfo = bans.find((entry?) => matchesBanUserToken(entry?.user, lookup)) || null;
  return { userId: banInfo?.user?.id || null, banInfo };
}

export = {
  embed,
  reasonFrom,
  reply,
  successText,
  resolveCaseDurationChange,
  formatTargetLabel,
  resolveGuildMutedRoleId,
  isServerOwner,
  describeBanError,
  executeGuildBan,
  validateModerationTarget,
  successReply,
  sendModerationDm,
  makeCase,
  pickUser,
  parseMaybeDuration,
  parseDynoMuteDuration,
  formatRemainingWords,
  formatDurationWords,
  formatDynoDate,
  parseLockDuration,
  normalizeLookupToken,
  matchesBanUserToken,
  resolveBanTarget,
};

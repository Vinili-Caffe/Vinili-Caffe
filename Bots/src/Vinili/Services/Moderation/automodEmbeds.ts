/** Automod: messaggi nel canale, log per lo staff e casi di moderazione. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const path = require("path") as typeof import("path");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { pickPrimaryAutomodRegolaBucket, formatRegolaDotFromBucket, buildAutomodRegolaSummaryLine, violationKeyLabelIt, MOD_RULE_DETAIL } = require("../../Utils/Moderation/modRegolamentoConstants") as typeof import("../../Utils/Moderation/modRegolamentoConstants");
const { formatItalianMinutesPlain } = require("../../Utils/Text/italianDurationLabels") as typeof import("../../Utils/Text/italianDurationLabels");
const { createModCase, getModConfig, logModCase, formatDuration } = require("../../Utils/Moderation/moderation") as typeof import("../../Utils/Moderation/moderation");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { memberDisplayName } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { readJsonSafe, writeJsonSafe } = require("./automodConfigSanitize") as typeof import("./automodConfigSanitize");
const { nowMs, stripQuotedAndCodeText, extractUrls, filterUrlsForAttachmentLinkRule } = require("./automodText") as typeof import("./automodText");
const { pickSortedViolations, firstViolationLabel } = require("./automodBadUser") as typeof import("./automodBadUser");

const ACTION_CHANNEL_LOG_COOLDOWN = new Map();
const NATIVE_STAFF_PING_COOLDOWN = new Map();
const GUILD_PANIC_STATE = new Map();
const ACTION_CHANNEL_LOG_COOLDOWN_MS = 6_000;
const ACTION_CHANNEL_NOTICE_DELETE_MS = 10_000;
const NATIVE_STAFF_PING_COOLDOWN_MS = 8_000;
const PANIC_MODE = { enabled: true, considerActivityHistory: true, useGlobalBadUsersDb: true, triggerCount: 3, triggerWindowMs: 10 * 60_000, durationMs: 10 * 60_000, raidWindowMs: 120_000, raidUserThreshold: 6, raidYoungThreshold: 4, lockCommands: false, };
const AUTOMOD_METRICS_PATH = path.resolve(__dirname, "../../Utils/Config/automodMetrics.json",);
const automodMetrics = readJsonSafe(AUTOMOD_METRICS_PATH, { guilds: {} });
let metricsSaveTimer = null;

function scheduleMetricsSave() {
  if (metricsSaveTimer) clearTimeout(metricsSaveTimer);
  metricsSaveTimer = setTimeout(() => {
    metricsSaveTimer = null;
    writeJsonSafe(AUTOMOD_METRICS_PATH, automodMetrics);
  }, 1200);
  if (typeof metricsSaveTimer?.unref === "function") metricsSaveTimer.unref();
}

function dayKeyFromMs(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getGuildMetricsBucket(guildId?, dayKey?) {
  const gid = String(guildId || "noguild");
  if (!automodMetrics.guilds || typeof automodMetrics.guilds !== "object") {
    automodMetrics.guilds = {};
  }
  if (!automodMetrics.guilds[gid]) automodMetrics.guilds[gid] = { days: {} };
  if (!automodMetrics.guilds[gid].days[dayKey]) {
    automodMetrics.guilds[gid].days[dayKey] = {
      actions: {},
      rules: {},
      channels: {},
      users: {},
      panicEnabled: 0,
    };
  }
  return automodMetrics.guilds[gid].days[dayKey];
}

function recordPanicEnabledMetric(guildId?) {
  const gid = String(guildId || "");
  if (!gid) return;
  const bucket = getGuildMetricsBucket(gid, dayKeyFromMs());
  bucket.panicEnabled = Number(bucket.panicEnabled || 0) + 1;
  scheduleMetricsSave();
}

function getPanicState(guildId?) {
  const key = String(guildId || "");
  const existing = GUILD_PANIC_STATE.get(key);
  if (existing) {
    if (!Array.isArray(existing.panicSignals)) existing.panicSignals = [];
    return existing;
  }
  const initial = { activeUntil: 0, triggerAccounts: new Map(), panicSignals: [], };
  GUILD_PANIC_STATE.set(key, initial);
  return initial;
}

async function resolveLogChannel(guild?) {
  const channelId = IDs.channels.modLogs || IDs.channels.activityLogs;
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function resolveDiscordNativeAutomodAlertChannel(guild?) {
  const channelId = String(IDs.channels?.sanzioniUtenti || "").trim();
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function pingStaffAutomodAlert(message?) {
  const roleId = String(IDs.roles?.Staff || "").trim();
  if (!message?.guild || !roleId) {
    global.logger?.warn?.("[automod] staff ping skipped: missing Staff role id");
    return false;
  }
  const authorId = String(message.author?.id || "").trim() || "unknown";
  const cdKey = `${message.guild.id}:${authorId}`;
  const last = NATIVE_STAFF_PING_COOLDOWN.get(cdKey) || 0;
  if (nowMs() - last < NATIVE_STAFF_PING_COOLDOWN_MS) return false;
  NATIVE_STAFF_PING_COOLDOWN.set(cdKey, nowMs());

  const channel = await resolveDiscordNativeAutomodAlertChannel(message.guild);
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[automod] staff ping skipped: sanzioniUtenti channel missing");
    return false;
  }

  const who = message.author ? `${message.author}` : "un utente";
  const where = message.channel ? `${message.channel}` : "un canale";
  try {
    const sent = await channel.send({
      content: `<@&${roleId}> AutoMod Discord ha bloccato un messaggio di ${who} in ${where}.`,
      allowedMentions: { parse: [], roles: [roleId], users: [] },
    });
    return Boolean(sent);
  } catch (err) {
    global.logger?.warn?.(
      "[automod] staff ping failed:",
      err?.message || err,
      `| channel=${channel.id} role=${roleId}`,
    );
    return false;
  }
}

function scheduleAutomodSanzioniStickyReposition(client?, delayMs = 2500) {
  if (!client) return;
  try {
    const { maybeRepositionModerationSticky } = require("../../Utils/Moderation/moderationStickyPanelRuntime") as typeof import("../../Utils/Moderation/moderationStickyPanelRuntime");
    void maybeRepositionModerationSticky(null, client, { delayMs }).catch(() => null);
  } catch (_) {}
}

function truncateText(input?, max = 700) {
  const text = String(input || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function escapeDiscordTripleBackticks(text?) {
  return String(text || "").replace(/```/g, "`\u200b``");
}

function buildAutomodAttachmentLinkEvidenceLine(message?, violations = []) {
  if (!violations.some((v?) => String(v?.key || "") === "attachment_link")) return null;
  const mod = stripQuotedAndCodeText(String(message?.content || ""));
  const urls = filterUrlsForAttachmentLinkRule(extractUrls(mod));
  if (!urls.length) {
    return "🔗 **Link conteggiati (2.4):** nessun URL estraibile dopo i filtri AutoMod (citazioni `>` o testo in code block esclusi dal conteggio). Se il messaggio era lungo, controlla anche oltre l’anteprima qui sotto.";
  }
  const joined = urls
    .map((u?) => truncateText(String(u), 96))
    .join("\n");
  return `🔗 **Link conteggiati (2.4):**\n${truncateText(joined, 900)}`;
}

function automodEmbedColor(action?) {
  const a = String(action || "").toLowerCase();
  if (a === "ban") return 0x992f22;
  if (a === "timeout") return 0xe67e22;
  if (a === "delete" || a === "delete_webhook") return 0xf59e0b;
  return 0x5865f2;
}

function automodActionLabelIt(action?) {
  const a = String(action || "").toLowerCase();
  if (a === "timeout") return "Timeout";
  if (a === "ban") return "Ban";
  if (a === "delete" || a === "delete_webhook") return "Messaggio rimosso";
  return "Avviso";
}

function formatAutomodViolationTechnical(info?, { publicSafe = false } = {}) {
  const raw = String(info || "").trim();
  if (!raw) return null;
  if (publicSafe) {
    if (/racist list|word_blacklist|blacklist|custom_token|profane|vulgar/i.test(raw)) {
      return "Corrispondenza in lista parole vietate.";
    }
    const invite = raw.match(/discord\.gg\/(\S+)/i);
    if (invite) return `Invito rilevato: \`discord.gg/${truncateText(invite[1], 32)}\``;
    return truncateText(raw, 100);
  }
  const racist = raw.match(/racist list\s*\(([^:]+):\s*.+\)/i);
  if (racist) {
    const src =
      String(racist[1] || "").trim() === "custom_token"
        ? "lista personalizzata server"
        : String(racist[1] || "").replace(/_/g, " ");
    return `Blacklist (${src}) · termine non mostrato nel log`;
  }
  return truncateText(raw, 180);
}

function buildAutomodRegolaFieldValue(violations = []) {
  const bucket = pickPrimaryAutomodRegolaBucket(violations);
  const dot = formatRegolaDotFromBucket(bucket);
  if (!dot) return "Nessun riferimento regolamento automatico.";
  const detail = MOD_RULE_DETAIL[dot];
  if (!detail) return `Regola **${dot}**`;
  const plain = detail
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return `**${dot}** — ${truncateText(plain, 220)}`;
}

function buildAutomodChannelEmbed(message?, action?, violations?, context: Record<string, any> = {}) {
  const who = memberDisplayName(message.member || message.author);
  const sorted = pickSortedViolations(violations);
  const primary = sorted[0];
  const durationLabel = context.timeoutMs ? formatDurationShort(context.timeoutMs) : null;
  const actionIt = automodActionLabelIt(action);
  const title =
    action === "timeout"
      ? `${actionIt}${durationLabel ? ` · ${durationLabel}` : ""}`
      : actionIt;
  const fields = [
    {
      name: "Utente",
      value: `${message.author}\n\`${message.author.id}\``,
      inline: true,
    },
    {
      name: "Violazione",
      value: primary ? violationKeyLabelIt(primary.key) : "Violazione regolamento",
      inline: true,
    },
  ];
  if (durationLabel) {
    fields.push({ name: "Durata", value: durationLabel, inline: true });
  }
  fields.push({
    name: "Regolamento",
    value: buildAutomodRegolaFieldValue(violations),
    inline: false,
  });
  const tech = primary ? formatAutomodViolationTechnical(primary.info, { publicSafe: true }) : null;
  if (tech) {
    fields.push({ name: "Dettaglio", value: tech, inline: false });
  }
  return new EmbedBuilder()
    .setColor(automodEmbedColor(action))
    .setTitle(`${title} · ${who}`)
    .addFields(fields)
    .setFooter({ text: "AutoMod · Vinili & Caffè" });
}

function formatDurationShort(ms?) {
  const totalMinutes = Math.max(1, Math.round(Number(ms || 0) / 60_000));
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60}h`;
  return `${totalMinutes}m`;
}

function buildAutoModCaseReason(action?, violations = [], context: Record<string, any> = {}) {
  const keys = Array.isArray(violations) ? violations.map((v?) => String(v?.key || "").trim()).filter(Boolean).slice(0, 6) : [];
  const rules = keys.length ? keys.join(", ") : "sconosciuto";
  const timeoutText = context?.timeoutMs ? ` | timeout ${formatDuration(context.timeoutMs)}`
    : "";
  const snippetRaw = String(context?.content || "").trim();
  const snippet = snippetRaw ? ` | msg: ${truncateText(snippetRaw, 120)}` : "";
  const regolaLine = truncateText(buildAutomodRegolaSummaryLine(violations), 280);
  const regolaBit = regolaLine ? ` | regolamento: ${regolaLine}` : "";
  return `[AUTOMOD] ${String(action || "azione").toUpperCase()} | filtri: ${rules}${timeoutText}${regolaBit}${snippet}`;
}

async function registerAutoModCase(message?, action?, violations = [], context: Record<string, any> = {}) {
  try {
    const guild = message?.guild;
    const userId = String(message?.author?.id || "");
    const modId = String(message?.client?.user?.id || "");
    if (!guild?.id || !userId || !modId) return null;
    const normalizedAction = String(action || "").trim().toLowerCase();
    const mappedAction = normalizedAction === "timeout" ? "MUTE" : normalizedAction === "ban" ? "BAN" : normalizedAction === "warn" ? "WARN" : "DELETE";
    const durationMs = mappedAction === "MUTE" && Number(context?.timeoutMs) > 0 ? Number(context.timeoutMs) : null;
    const reason = buildAutoModCaseReason(action, violations, { timeoutMs: durationMs, content: message?.content || "", });
    const config = await getModConfig(guild.id);
    const { doc, created } = await createModCase({ guildId: guild.id, action: mappedAction, userId, modId, reason, durationMs, context: { channelId: String(message?.channelId || message?.channel?.id || ""), messageId: String(message?.id || ""), }, dedupe: { enabled: true, byMessageId: true, windowMs: 90_000, matchReason: true, }, });
    if (created) {
      await logModCase({
        client: message.client,
        guild,
        modCase: doc,
        config,
      });
    }
    return doc;
  } catch {
    return null;
  }
}

async function sendAutomodActionInChannel(message?, action?, violations?, context: Record<string, any> = {}) {
  if (!message?.channel?.isTextBased?.()) return;
  const reason = firstViolationLabel(violations);
  const cooldownKey = [String(message.guildId || "noguild"), String(message.channelId || "nochannel"), String(message.author?.id || "nouser"), String(action || "action"), reason,].join(":");
  const lastSentAt = ACTION_CHANNEL_LOG_COOLDOWN.get(cooldownKey) || 0;
  if (nowMs() - lastSentAt < ACTION_CHANNEL_LOG_COOLDOWN_MS) return;
  ACTION_CHANNEL_LOG_COOLDOWN.set(cooldownKey, nowMs());
  const embed = buildAutomodChannelEmbed(message, action, violations, context);
  const sent = await message.channel.send({ embeds: [embed] }).catch(() => null);
  if (sent) {
    const timer = setTimeout(() => {
      sent.delete().catch(() => { });
    }, ACTION_CHANNEL_NOTICE_DELETE_MS);
    timer.unref?.();
  }
  return sent;
}

async function sendPanicModeLog(message?, event?, count?, activeUntil?) {
  const channel = await resolveLogChannel(message.guild);
  if (!channel?.isTextBased?.()) return;
  const when = Math.floor(activeUntil / 1000);
  const state = getPanicState(message.guildId);
  const triggerAccountIds = Array.from(state?.triggerAccounts?.keys?.() || []).filter(Boolean).slice(-10);
  const embed = new EmbedBuilder()
    .setColor(event === "panic_enabled" ? "#ED4245" : "#5865F2")
    .setTitle(event === "panic_enabled" ? "AutoMod Panic Mode enabled!" : "AutoMod Panic Mode update",)
    .setDescription([
      `<a:VC_Alert:1482706673176150077> **Automod Filter:** Panic Mode`, `<:channeltext:1443247596922470551> **Channel:** ${message.channel}[\`${message.channelId}\`]`, `<:member_role_icon:1330530086792728618> **Member:** ${message.author}[\`${message.author.id}\`]`, `<a:VC_Alert:1482706673176150077> **Event:** ${event}`,
      `<a:VC_Alert:1482706673176150077> **Panic signals (window):** ${count}/${PANIC_MODE.triggerCount}`,
      triggerAccountIds.length
        ? `<a:VC_Alert:1482706673176150077> **Trigger IDs:** ${triggerAccountIds.map((id?) => `\`${id}\``).join(", ")}`
        : null,
      `<a:VC_Alert:1482706673176150077> **Duration:** ${formatItalianMinutesPlain(Math.round(PANIC_MODE.durationMs / 60_000))}`,
      `<a:VC_Alert:1482706673176150077> **Active Until:** <t:${when}:F>`,
    ].join("\n"),
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => { });
  if (event === "panic_enabled") {
    recordPanicEnabledMetric(message.guildId);
  }
}

export = { ACTION_CHANNEL_LOG_COOLDOWN, NATIVE_STAFF_PING_COOLDOWN, GUILD_PANIC_STATE, ACTION_CHANNEL_LOG_COOLDOWN_MS, NATIVE_STAFF_PING_COOLDOWN_MS, PANIC_MODE, scheduleMetricsSave, dayKeyFromMs, getGuildMetricsBucket, getPanicState, resolveLogChannel, pingStaffAutomodAlert, scheduleAutomodSanzioniStickyReposition, truncateText, escapeDiscordTripleBackticks, buildAutomodAttachmentLinkEvidenceLine, automodEmbedColor, automodActionLabelIt, formatAutomodViolationTechnical, buildAutomodRegolaFieldValue, formatDurationShort, registerAutoModCase, sendAutomodActionInChannel, sendPanicModeLog };

/** Log staff, spiegazione decisioni e azioni warn/delete AutoMod. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { memberDisplayName } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { buildAutomodRegolaSummaryLine, violationKeyLabelIt } = require("../../Utils/Moderation/modRegolamentoConstants") as typeof import("../../Utils/Moderation/modRegolamentoConstants");
const { pickSortedViolations } = require("./automodBadUser") as typeof import("./automodBadUser");
const {
  resolveLogChannel,
  truncateText,
  escapeDiscordTripleBackticks,
  buildAutomodAttachmentLinkEvidenceLine,
  automodEmbedColor,
  automodActionLabelIt,
  formatAutomodViolationTechnical,
  buildAutomodRegolaFieldValue,
  formatDurationShort,
  registerAutoModCase,
  sendAutomodActionInChannel,
} = require("./automodEmbeds") as typeof import("./automodEmbeds");
const {
  recordAutomodMetric,
  isAutomodPublicNoticeCooldownClear,
  touchAutomodPublicNoticeCooldown,
  deleteRelatedViolationMessages,
} = require("./automodActions") as typeof import("./automodActions");

type ThresholdsGetter = (profile?: Record<string, any> | null) => {
  warn: number;
  delete: number;
  timeout: number;
};

let getThresholdsForProfileRef: ThresholdsGetter | null = null;

function bindAutomodDecisionDeps(deps: { getThresholdsForProfile: ThresholdsGetter }) {
  getThresholdsForProfileRef = deps.getThresholdsForProfile;
}

function buildAutoModDecisionExplain(
  action?,
  heatValue?,
  violations = [],
  context: Record<string, any> = {},
) {
  const getThresholdsForProfile =
    getThresholdsForProfileRef ||
    (() => ({ warn: 35, delete: 65, timeout: 100 }));
  const normalizedAction = String(action || "").toLowerCase();
  const heat = Number(heatValue || 0);
  const topRules = (Array.isArray(violations) ? violations : [])
    .map((v?) => ({
      key: String(v?.key || "unknown"),
      heat: Number(v?.heat || 0),
    }))
    .sort((a?, b?) => b.heat - a.heat)
    .slice(0, 3)
    .map((v?) =>
      Number.isFinite(v.heat) && v.heat > 0 ? `${v.key}:${v.heat.toFixed(1)}` : v.key,
    );
  const topRulesText = topRules.length ? topRules.join(" | ") : "n/d";
  const thresholds = getThresholdsForProfile(context?.profile || null);
  const reason =
    normalizedAction === "timeout"
      ? `heat ≥ soglia timeout (${heat.toFixed(1)} ≥ ${Number(thresholds.timeout || 0).toFixed(1)})`
      : normalizedAction === "ban"
        ? `ban (regolamento / severità; heat ${heat.toFixed(1)})`
        : normalizedAction === "delete" || normalizedAction === "delete_webhook"
          ? `heat ≥ soglia rimozione (${heat.toFixed(1)} ≥ ${Number(thresholds.delete || 0).toFixed(1)})`
          : normalizedAction === "warn"
            ? `heat ≥ soglia avviso (${heat.toFixed(1)} ≥ ${Number(thresholds.warn || 0).toFixed(1)})`
            : `azione=${normalizedAction || "sconosciuta"} heat=${heat.toFixed(1)}`;
  const regolaLine = truncateText(buildAutomodRegolaSummaryLine(violations), 240);
  const regolaBit = regolaLine ? ` | regolamento: ${regolaLine}` : "";
  return `${reason}; pesi violazioni: ${topRulesText}${regolaBit}`;
}

function buildAutomodStaffLogEmbed(
  message?,
  action?,
  violations?,
  heatValue?,
  context: Record<string, any> = {},
) {
  const whoLog = memberDisplayName(message.member || message.author);
  const sorted = pickSortedViolations(violations);
  const violationDetail = sorted
    .slice(0, 6)
    .map((v?) => {
      const label = violationKeyLabelIt(v.key);
      const tech = formatAutomodViolationTechnical(v.info, { publicSafe: false });
      const heatBit = Number.isFinite(v.heat) && v.heat > 0 ? ` · heat ${v.heat.toFixed(1)}` : "";
      return tech ? `• **${label}**${heatBit}\n　↳ ${tech}` : `• **${label}**${heatBit}`;
    })
    .join("\n");
  const timeoutLabel = context.timeoutMs ? formatDurationShort(context.timeoutMs) : null;
  const title =
    action === "timeout"
      ? `AutoMod · timeout${timeoutLabel ? ` (${timeoutLabel})` : ""}`
      : action === "ban"
        ? "AutoMod · ban"
        : action === "delete" || action === "delete_webhook"
          ? "AutoMod · messaggio rimosso"
          : "AutoMod · avviso";
  const fields = [
    {
      name: "Utente",
      value: `${message.author}\n\`${message.author.id}\``,
      inline: true,
    },
    {
      name: "Canale",
      value: `${message.channel}\n\`${message.channelId}\``,
      inline: true,
    },
    {
      name: "Heat / azione",
      value: `**${Number(heatValue || 0).toFixed(1)}** · ${automodActionLabelIt(action)}${timeoutLabel ? `\nDurata: **${timeoutLabel}**` : ""}`,
      inline: true,
    },
    {
      name: "Regolamento",
      value: buildAutomodRegolaFieldValue(violations),
      inline: false,
    },
  ];
  if (violationDetail) {
    fields.push({
      name: "Filtri attivati",
      value: truncateText(violationDetail, 1020),
      inline: false,
    });
  }
  fields.push({
    name: "Decisione automatica",
    value: truncateText(buildAutoModDecisionExplain(action, heatValue, violations, context), 1020),
    inline: false,
  });
  const linkEvidenceLine = buildAutomodAttachmentLinkEvidenceLine(message, violations);
  if (linkEvidenceLine) {
    const linksBody = linkEvidenceLine
      .replace(/^🔗\s*\*\*Link conteggiati \(2\.4\):\*\*\s*/i, "")
      .replace(/^🔗[^\n]*\n?/, "")
      .trim();
    if (linksBody) {
      fields.push({
        name: "Link nel messaggio (2.4)",
        value: truncateText(linksBody, 1020),
        inline: false,
      });
    }
  }
  const embed = new EmbedBuilder()
    .setColor(automodEmbedColor(action))
    .setTitle(`${title} · ${whoLog}`)
    .addFields(fields)
    .setTimestamp();
  const rawMsg = String(message?.content || "").trim();
  if (rawMsg) {
    embed.addFields({
      name: "Testo del messaggio",
      value: `\`\`\`\n${escapeDiscordTripleBackticks(truncateText(rawMsg, 980))}\n\`\`\``,
      inline: false,
    });
  }
  return embed;
}

async function sendAutomodLog(
  message?,
  action?,
  violations?,
  heatValue?,
  context: Record<string, any> = {},
) {
  const channel = await resolveLogChannel(message.guild);
  if (!channel?.isTextBased?.()) return;
  const embed = buildAutomodStaffLogEmbed(message, action, violations, heatValue, context);
  await channel.send({ embeds: [embed] }).catch(() => {});
}

function createAutomodUserActions(deps: {
  markBadUserAction: (
    message?,
    action?,
    violations?,
  ) => Promise<void>;
}) {
  async function warnUser(message?, state?, violations?, options: Record<string, any> = {}) {
    if (!options?.alreadyBlocked) {
      const deleted = await message.delete().then(() => true).catch(() => false);
      if (!deleted) return false;
    }
    await deleteRelatedViolationMessages(message, violations);
    await deps.markBadUserAction(message, "warn", violations);
    await registerAutoModCase(message, "warn", violations);
    await sendAutomodLog(message, "warn", violations, state.heat);
    recordAutomodMetric(message, "warn", violations);
    if (isAutomodPublicNoticeCooldownClear(message)) {
      touchAutomodPublicNoticeCooldown(message);
      await sendAutomodActionInChannel(message, "warn", violations);
    }
    return true;
  }

  async function deleteMessage(message?, state?, violations?, options: Record<string, any> = {}) {
    if (!options?.alreadyBlocked) {
      const deleted = await message.delete().then(() => true).catch(() => false);
      if (!deleted) return false;
    }
    await deleteRelatedViolationMessages(message, violations);
    await deps.markBadUserAction(message, "delete", violations);
    await registerAutoModCase(message, "delete", violations);
    await sendAutomodLog(message, "delete", violations, state.heat);
    recordAutomodMetric(message, "delete", violations);
    if (isAutomodPublicNoticeCooldownClear(message)) {
      touchAutomodPublicNoticeCooldown(message);
      await sendAutomodActionInChannel(message, "delete", violations);
    }
    return true;
  }

  return { warnUser, deleteMessage };
}

export = {
  bindAutomodDecisionDeps,
  buildAutomodStaffLogEmbed,
  buildAutoModDecisionExplain,
  sendAutomodLog,
  createAutomodUserActions,
};

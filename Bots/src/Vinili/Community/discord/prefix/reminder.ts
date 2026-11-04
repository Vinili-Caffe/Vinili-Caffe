const { escapeMarkdown } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { parseEventDateMs } = require("../../utils/eventDates") as typeof import("../../utils/eventDates");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  MAX_PENDING_PER_USER,
  MAX_REASON_LENGTH,
  createChannelReminder,
  listPendingForUser,
  cancelByShortId,
} = require("../../../Community/services/channelReminderService") as typeof import("../../../Community/services/channelReminderService");

const DATE_TIME_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;

function formatRomeDateTime(date?) {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date instanceof Date ? date : new Date(date));
  } catch {
    return String(date || "");
  }
}

function parseCreateArgs(args?) {
  const list = Array.isArray(args) ? args.map((a?) => String(a || "").trim()).filter(Boolean) : [];
  if (list.length < 3) return null;
  const datePart = list[0];
  const timePart = list[1];
  const reason = list.slice(2).join(" ").trim();
  const combined = `${datePart} ${timePart}`;
  const m = combined.match(DATE_TIME_RE);
  if (!m || !reason) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { error: "invalid_datetime" };
  }

  const isoLocal = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const ms = parseEventDateMs(isoLocal, "Europe/Rome");
  if (ms == null || !Number.isFinite(ms)) return { error: "invalid_datetime" };
  return { sendAt: new Date(ms), reason };
}

function usageText() {
  return [
    "Uso:",
    "`+reminder DD/MM/YYYY HH:mm <motivo>`",
    "`+reminder list`",
    "`+reminder cancel <id>`",
  ].join("\n");
}

export = {
  name: "reminder",
  aliases: ["remind"],
  allowEmptyArgs: true,
  description: "Imposta un reminder nel canale con data/ora (Europe/Rome) e motivo.",
  usage: "+reminder DD/MM/YYYY HH:mm <motivo>",
  examples: [
    "+reminder 31/12/2026 18:30 Controlla i giveaway",
    "+reminder list",
    "+reminder cancel a1b2c3",
  ],
  subcommands: ["list", "cancel"],
  subcommandDescriptions: {
    list: "Elenca i tuoi reminder in attesa.",
    cancel: "Annulla un reminder con il suo id corto.",
  },

  async execute(message?, args = []) {
    await message.channel.sendTyping().catch(() => {});
    if (!message.guild || !message.channel) {
      return safeMessageReply(
        message,
        `${E.vegax} Questo comando si usa solo in un server.`,
      );
    }

    const rawArgs = Array.isArray(args) ? args : [];
    const head = String(rawArgs[0] || "")
      .trim()
      .toLowerCase();

    if (!head) {
      return safeMessageReply(message, `${E.vegax} ${usageText()}`);
    }

    if (head === "list" || head === "lista") {
      const pending = await listPendingForUser(message.author.id);
      if (!pending.length) {
        return safeMessageReply(
          message,
          `${E.vegacheckmark} Non hai reminder in attesa.`,
        );
      }
      const lines = pending.map((row?) => {
        const when = formatRomeDateTime(row.sendAt);
        const preview = String(row.reason || "").slice(0, 80);
        const more = String(row.reason || "").length > 80 ? "…" : "";
        return `\`${row.shortId}\` · ${when} · ${escapeMarkdown(preview)}${more}`;
      });
      return safeMessageReply(
        message,
        [
          `I tuoi reminder (${pending.length}/${MAX_PENDING_PER_USER}):`,
          ...lines,
        ].join("\n"),
      );
    }

    if (head === "cancel" || head === "cancella" || head === "delete" || head === "remove") {
      const shortId = String(rawArgs[1] || "").trim();
      if (!shortId) {
        return safeMessageReply(
          message,
          `${E.vegax} Specifica l'id: \`+reminder cancel <id>\``,
        );
      }
      const result = await cancelByShortId({ userId: message.author.id, shortId });
      if (!result.ok) {
        return safeMessageReply(
          message,
          `${E.vegax} Reminder non trovato (o già inviato).`,
        );
      }
      return safeMessageReply(
        message,
        `${E.vegacheckmark} Reminder \`${result.reminder.shortId}\` annullato.`,
      );
    }

    const parsed = parseCreateArgs(rawArgs);
    if (!parsed || (parsed as any).error === "invalid_datetime") {
      return safeMessageReply(
        message,
        `${E.vegax} Data/ora non valida. Formato: \`DD/MM/YYYY HH:mm\` (Europe/Rome).\n${usageText()}`,
      );
    }
    if (!parsed.reason) {
      return safeMessageReply(
        message,
        `${E.vegax} Specifica un motivo per il reminder.`,
      );
    }
    if (parsed.reason.length > MAX_REASON_LENGTH) {
      return safeMessageReply(
        message,
        `${E.vegax} Motivo troppo lungo (max ${MAX_REASON_LENGTH} caratteri).`,
      );
    }
    if (parsed.sendAt.getTime() <= Date.now()) {
      return safeMessageReply(
        message,
        `${E.vegax} L'orario deve essere nel futuro (Europe/Rome).`,
      );
    }

    const created = await createChannelReminder({
      guildId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      reason: parsed.reason,
      sendAt: parsed.sendAt,
    });

    if (!created.ok) {
      if (created.error === "limit") {
        return safeMessageReply(
          message,
          `${E.vegax} Hai già ${created.max} reminder in attesa. Annullane uno con \`+reminder cancel <id>\`.`,
        );
      }
      if (created.error === "reason_too_long") {
        return safeMessageReply(
          message,
          `${E.vegax} Motivo troppo lungo (max ${created.max} caratteri).`,
        );
      }
      if (created.error === "not_future") {
        return safeMessageReply(
          message,
          `${E.vegax} L'orario deve essere nel futuro (Europe/Rome).`,
        );
      }
      return safeMessageReply(
        message,
        `${E.vegax} Non riesco a salvare il reminder. Riprova.`,
      );
    }

    const whenLabel = formatRomeDateTime(created.reminder.sendAt);
    return safeMessageReply(
      message,
      `${E.vegacheckmark} Reminder impostato (\`${created.reminder.shortId}\`) per **${whenLabel}** (Europe/Rome) in questo canale.\nMotivo: ${escapeMarkdown(String(created.reminder.reason || ""))}`,
    );
  },
};

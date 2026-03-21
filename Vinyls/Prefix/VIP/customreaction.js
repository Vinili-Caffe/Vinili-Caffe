const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { MentionReaction } = require("../../Schemas/Community/autoInteractionSchemas");
const { resolveCustomRoleState, buildExpiryText } = require("../../Utils/Community/customRoleState");

const MAX_REACTIONS = 3;

function parseReactionTokens(input, max = MAX_REACTIONS) {
  const text = String(input || "").trim();
  if (!text) return [];
  const out = [];
  const customRegex = /<a?:[a-zA-Z0-9_]{2,}:(\d{16,20})>/g;
  let match;
  while ((match = customRegex.exec(text)) !== null) {
    out.push(`custom:${match[1]}`);
  }
  const cleaned = text.replace(customRegex, " ");
  for (const part of cleaned.split(/\s+/).filter(Boolean)) {
    if (/^\d{16,20}$/.test(part)) out.push(`custom:${part}`);
    else out.push(`unicode:${part}`);
  }
  return Array.from(new Set(out)).slice(0, max);
}

function toDisplay(token) {
  if (String(token).startsWith("custom:")) {
    const id = token.slice("custom:".length);
    return `<:emoji:${id}>`;
  }
  if (String(token).startsWith("unicode:")) {
    return token.slice("unicode:".length);
  }
  return token;
}

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Custom reaction (menzioni)")
    .setDescription(
      [
        "`+customreaction` / `+customreaction show` — mostra le reaction attuali",
        "`+customreaction set 😀 <:emoji:id>` — imposta fino a 3 reaction",
        "`+customreaction add 😀` — aggiunge una reaction",
        "`+customreaction remove 😀` — rimuove una reaction",
        "`+customreaction clear` — rimuove tutte",
        "",
        `Massimo **${MAX_REACTIONS}** reaction. Il bot le applica **solo** quando qualcuno ti menziona nel messaggio (non in altri casi).`,
      ].join("\n"),
    );
}

async function ensureActiveCustomRole(message) {
  const state = await resolveCustomRoleState({
    guild: message.guild,
    userId: message.author.id,
    client: message.client,
    cleanupExpired: true,
  });

  if (state.status === "none") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Non hai un ruolo personalizzato. Usa prima `+customrole create`.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  if (state.status === "expired") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            [
              "<:vegax:1443934876440068179> Il tuo custom role temporaneo è scaduto.",
              `Scadenza: ${buildExpiryText(state.doc)}`,
              "Usa `+customrole create` per crearne uno nuovo.",
            ].join("\n"),
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  if (state.status === "missing_role") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Il tuo ruolo personalizzato non esiste più. Ricrealo con `+customrole create`.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  if (state.status !== "active") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription("<:vegax:1443934876440068179> Stato custom role non valido."),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  return state;
}

module.exports = {
  name: "customreaction",
  aliases: ["customreact", "creaction"],
  subcommands: ["show", "set", "add", "remove", "clear", "help"],
  subcommandAliases: {
    list: "show",
    view: "show",
    del: "remove",
    rm: "remove",
    delete: "remove",
    off: "clear",
    reset: "clear",
  },
  allowEmptyArgs: true,

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;

    const ok = await ensureActiveCustomRole(message);
    if (!ok) return;

    await message.channel.sendTyping().catch(() => {});

    const guildId = message.guild.id;
    const userId = message.author.id;

    const sub = String(args[0] || "").trim().toLowerCase();
    const rest = args.slice(1).join(" ");

    if (!sub || sub === "show") {
      const doc = await MentionReaction.findOne({ guildId, userId }).catch(() => null);
      const current = Array.isArray(doc?.reactions) ? doc.reactions : [];
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Reaction alle menzioni")
        .setDescription(
          current.length
            ? `Le tue reaction: ${current.map(toDisplay).join(" ")}`
            : "Non hai reaction configurate.",
        )
        .setFooter({ text: `Massimo ${MAX_REACTIONS} · Solo su menzioni esplicite` });
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "help") {
      await safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "clear") {
      await MentionReaction.deleteOne({ guildId, userId }).catch(() => {});
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription("<:vegacheckmark:1443666279058772028> Reaction alle menzioni disattivate."),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!["set", "add", "remove"].includes(sub)) {
      await safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const doc = await MentionReaction.findOne({ guildId, userId }).catch(() => null);
    const current = Array.isArray(doc?.reactions) ? doc.reactions : [];

    const tokens = parseReactionTokens(rest, MAX_REACTIONS);
    if (!tokens.length) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Devi indicare almeno una reaction valida.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    let next = [...current];
    if (sub === "set") {
      next = tokens.slice(0, MAX_REACTIONS);
    } else if (sub === "add") {
      next = Array.from(new Set([...current, ...tokens])).slice(0, MAX_REACTIONS);
    } else {
      const removeSet = new Set(tokens);
      next = current.filter((token) => !removeSet.has(token));
    }

    if (!next.length) {
      await MentionReaction.deleteOne({ guildId, userId }).catch(() => {});
    } else {
      await MentionReaction.findOneAndUpdate(
        { guildId, userId },
        { $set: { reactions: next } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Reaction alle menzioni aggiornate")
      .setDescription(
        next.length
          ? `Nuove reaction: ${next.map(toDisplay).join(" ")}`
          : "Nessuna reaction attiva.",
      )
      .setFooter({ text: `Massimo ${MAX_REACTIONS} reaction.` });
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};
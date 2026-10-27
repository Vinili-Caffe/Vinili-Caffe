import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import { baseEmbed } from "../../../shared/embeds";
import { logger } from "../../../shared";
import { listPrefixCommands } from "../../prefix/registry";
import { registerInteractionHandler } from "../../interactions/registry";
import type { PrefixCommand } from "../../prefix/types";

const PREFIX = "help_nav";
const PAGE = 12;
const CATEGORY_ORDER = [
  "utility",
  "tts",
  "level",
  "stats",
  "music",
  "economy",
  "staff",
  "moderation",
  "admin",
  "dev",
  "partner",
  "event",
  "minigames",
];

function cats(): string[] {
  const set = new Set(listPrefixCommands().map((c) => c.category));
  return CATEGORY_ORDER.filter((c) => set.has(c)).concat(
    [...set].filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
  );
}

function pageCmds(category: string, page: number): { cmds: PrefixCommand[]; pages: number } {
  const all = listPrefixCommands().filter((c) => c.category === category);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const p = Math.min(pages - 1, Math.max(0, page));
  return { cmds: all.slice(p * PAGE, p * PAGE + PAGE), pages };
}

function rows(category: string, page: number, pages: number): ActionRowBuilder<ButtonBuilder>[] {
  const catRow = new ActionRowBuilder<ButtonBuilder>();
  for (const c of cats().slice(0, 5)) {
    catRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:cat:${c}:0`)
        .setLabel(c.slice(0, 12))
        .setStyle(c === category ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }
  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:cat:${category}:${Math.max(0, page - 1)}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:noop`)
      .setLabel(`${page + 1}/${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:cat:${category}:${Math.min(pages - 1, page + 1)}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );
  const more = cats().slice(5, 10);
  const out = [catRow, nav];
  if (more.length) {
    const r2 = new ActionRowBuilder<ButtonBuilder>();
    for (const c of more) {
      r2.addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}:cat:${c}:0`)
          .setLabel(c.slice(0, 12))
          .setStyle(c === category ? ButtonStyle.Primary : ButtonStyle.Secondary),
      );
    }
    out.splice(1, 0, r2);
  }
  return out;
}

export async function sendHelpPanel(message: Message, prefix: string, category?: string): Promise<void> {
  const cat = category && cats().includes(category) ? category : cats()[0] || "utility";
  const { cmds, pages } = pageCmds(cat, 0);
  const lines = cmds.map((c) => `\`${prefix}${c.name}\` — ${c.description}`).join("\n") || "_vuoto_";
  await message.reply({
    embeds: [
      baseEmbed()
        .setTitle(`Help · ${cat}`)
        .setDescription(lines)
        .setFooter({ text: `${prefix}help <comando> · bots-ts` }),
    ],
    components: rows(cat, 0, pages),
    allowedMentions: { repliedUser: false },
  });
}

export function registerHelpNavInteractions(): void {
  registerInteractionHandler({
    name: "helpNav",
    match: (i) => i.isButton() && String(i.customId).startsWith(`${PREFIX}:`),
    execute: async (i) => {
      if (!i.isButton()) return;
      if (i.customId === `${PREFIX}:noop`) {
        await i.deferUpdate();
        return;
      }
      const parts = i.customId.split(":");
      const category = parts[2] || "utility";
      const page = Math.max(0, Number(parts[3]) || 0);
      const prefix = process.env.BOT_PREFIX || "+";
      const { cmds, pages } = pageCmds(category, page);
      const lines = cmds.map((c) => `\`${prefix}${c.name}\` — ${c.description}`).join("\n") || "_vuoto_";
      await (i as ButtonInteraction).update({
        embeds: [
          baseEmbed()
            .setTitle(`Help · ${category}`)
            .setDescription(lines)
            .setFooter({ text: `${prefix}help <comando> · bots-ts` }),
        ],
        components: rows(category, Math.min(page, pages - 1), pages),
      });
    },
  });
  logger.info("[help] category nav buttons on");
}

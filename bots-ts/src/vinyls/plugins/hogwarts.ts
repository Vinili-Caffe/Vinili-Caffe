import type { Client, Message } from "discord.js";
import { logger } from "../../shared";
import { replyOk } from "../../shared/embeds";
import {
  addHousePoints,
  cupTotals,
  getMemberPoints,
  logHogwartsReady,
} from "./hogwartsHouses";
import { definePlugin } from "./registry";

definePlugin({
  id: "hogwarts",
  register(client: Client) {
    logHogwartsReady();
    // Passive: piccoli house points su messaggi (no prefix inventati)
    client.on("messageCreate", (message: Message) => {
      if (message.author.bot || !message.guild) return;
      if (message.content.startsWith(process.env.BOT_PREFIX || "+")) return;
      if (Math.random() > 0.05) return;
      addHousePoints({
        guildId: message.guild.id,
        userId: message.author.id,
        points: 1,
        eventKey: process.env.VC_TS_HOGWARTS_EVENT_KEY || "default",
      });
    });

    // Debug interno via mention bot + "housecup" (non è un prefix inventato)
    client.on("messageCreate", async (message: Message) => {
      if (message.author.bot || !message.guild || !client.user) return;
      if (!message.mentions.has(client.user)) return;
      if (!/\bhousecup\b/i.test(message.content)) return;
      const totals = cupTotals(message.guild.id, process.env.VC_TS_HOGWARTS_EVENT_KEY || "default");
      const mine = getMemberPoints(
        message.guild.id,
        message.author.id,
        process.env.VC_TS_HOGWARTS_EVENT_KEY || "default",
      );
      await replyOk(
        message,
        [
          "**House Cup (TS plugin)**",
          `🦁 ${totals.gryffindor} · 🐍 ${totals.slytherin} · 🦅 ${totals.ravenclaw} · 🦡 ${totals.hufflepuff}`,
          `Tu: ${mine.houseId || "unsorted"} · ${mine.periodPoints} pt periodo · ${mine.totalPoints} totali`,
        ].join("\n"),
      );
    });

    logger.info("[plugin:hogwarts] houses/points + @bot housecup");
  },
});

import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { extractUserId } from "../moderation/resolveTarget";
import {
  openBlackjackGui,
  openRouletteGui,
  openRpsGui,
  openScratchGui,
  openTrisGui,
} from "./simpleGuis";
import { addCoins, getBalance } from "./wallet";

function parseBet(args: string[], fallback = 50): number {
  const n = Math.floor(Number(args.find((a) => /^\d+$/.test(a)) || fallback));
  return Math.max(1, Math.min(50_000, n));
}

function takeBet(
  guildId: string,
  userId: string,
  bet: number,
): { ok: true } | { ok: false; error: string } {
  if (getBalance(guildId, userId) < bet) return { ok: false, error: "Saldo insufficiente." };
  addCoins(guildId, userId, -bet);
  return { ok: true };
}

/** Live names — GUI panel dove esiste customId live; rob resta testo. */

export const robCommand: PrefixCommand = {
  name: "rob",
  description: "Tenta un furto verso un utente.",
  usage: "+rob <@utente> [importo]",
  category: "economy",
  aliases: ["ruba"],
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const targetId = extractUserId(args[0]) || message.mentions.users.first()?.id;
    if (!targetId || targetId === message.author.id) {
      await replyErr(message, "Uso: `+rob <@utente> [importo]`");
      return;
    }
    const bet = parseBet(args.slice(1), 75);
    const take = takeBet(guild.id, message.author.id, bet);
    if (!take.ok) {
      await replyErr(message, take.error);
      return;
    }
    const targetBal = getBalance(guild.id, targetId);
    const steal = Math.min(targetBal, Math.floor(bet * (0.4 + Math.random() * 0.8)));
    const success = Math.random() < 0.45 && steal > 0;
    if (success) {
      addCoins(guild.id, targetId, -steal);
      addCoins(guild.id, message.author.id, bet + steal);
      await replyOk(message, `Furto riuscito: **+${steal}** da <@${targetId}> (puntata ${bet} recuperata).`);
      return;
    }
    await replyOk(message, `Furto fallito: hai perso **${bet}**.`);
  },
};

export const slotsCommand: PrefixCommand = {
  name: "slots",
  description: "Apri la slot interattiva (panel + bottoni live customId).",
  usage: "+slots [bet]",
  category: "economy",
  aliases: ["slot"],
  async execute({ message, args }) {
    if (!message.guild) return;
    const { openSlotsGui } = await import("./slotsGui.js");
    await openSlotsGui(message, args[0]);
  },
};

export const rouletteCommand: PrefixCommand = {
  name: "roulette",
  description: "Roulette (GUI bottoni).",
  usage: "+roulette [bet]",
  category: "economy",
  async execute({ message, args }) {
    if (!message.guild) return;
    await openRouletteGui(message, parseBet(args));
  },
};

export const rpsCommand: PrefixCommand = {
  name: "rps",
  description: "Sasso carta forbici (GUI).",
  usage: "+rps [bet]",
  category: "economy",
  async execute({ message, args }) {
    if (!message.guild) return;
    await openRpsGui(message, parseBet(args));
  },
};

export const blackjackCommand: PrefixCommand = {
  name: "blackjack",
  description: "Blackjack (GUI hit/stand).",
  usage: "+blackjack [bet]",
  category: "economy",
  aliases: ["bj"],
  async execute({ message, args }) {
    if (!message.guild) return;
    await openBlackjackGui(message, parseBet(args));
  },
};

export const scratchCommand: PrefixCommand = {
  name: "scratch",
  description: "Gratta e vinci (GUI).",
  usage: "+scratch [bet]",
  category: "economy",
  async execute({ message, args }) {
    if (!message.guild) return;
    await openScratchGui(message, parseBet(args, 25));
  },
};

export const trisCommand: PrefixCommand = {
  name: "tris",
  description: "Tris vs bot (GUI).",
  usage: "+tris [bet]",
  category: "economy",
  async execute({ message, args }) {
    if (!message.guild) return;
    await openTrisGui(message, parseBet(args, 30));
  },
};

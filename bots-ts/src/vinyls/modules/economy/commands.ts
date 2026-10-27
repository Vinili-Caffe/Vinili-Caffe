import { baseEmbed, replyEmbed, replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { extractUserId } from "../moderation/resolveTarget";
import { listShopItems } from "./shop";
import {
  claimDaily,
  claimMonthly,
  claimWeekly,
  getBalance,
  tryWork,
} from "./wallet";

function claimReply(
  label: string,
  res: { ok: true; amount: number; balance: number } | { ok: false; error: string; retryInMs: number },
): string {
  if (!res.ok) {
    const mins = Math.ceil(res.retryInMs / 60_000);
    return `${res.error} Riprova tra ~${mins} min.`;
  }
  return `${label} **+${res.amount}** · saldo **${res.balance}**.`;
}

/** Live name: `bal` (Vinyls/Prefix/Economy/bal.js). */
export const balCommand: PrefixCommand = {
  name: "bal",
  description: "Mostra il saldo coins.",
  usage: "+bal [@utente]",
  category: "economy",
  aliases: ["balance", "soldi"],
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const uid = extractUserId(args[0]) || message.author.id;
    let bal = getBalance(guild.id, uid);
    try {
      const { tryReadLiveWallet } = await import("../../../shared/liveMongo.js");
      const live = await tryReadLiveWallet(guild.id, uid);
      if (live && live.balance > bal) bal = live.balance;
    } catch {
      /* ignore */
    }
    const who = uid === message.author.id ? "Hai" : `<@${uid}> ha`;
    await replyOk(message, `${who} **${bal}** coins.`);
  },
};

export const dailyCommand: PrefixCommand = {
  name: "daily",
  description: "Premio giornaliero.",
  usage: "+daily",
  category: "economy",
  async execute({ message }) {
    if (!message.guild) return;
    const res = claimDaily(message.guild.id, message.author.id);
    if (!res.ok) await replyErr(message, claimReply("Daily", res));
    else await replyOk(message, claimReply("Daily", res));
  },
};

export const weeklyCommand: PrefixCommand = {
  name: "weekly",
  description: "Premio settimanale.",
  usage: "+weekly",
  category: "economy",
  async execute({ message }) {
    if (!message.guild) return;
    const res = claimWeekly(message.guild.id, message.author.id);
    if (!res.ok) await replyErr(message, claimReply("Weekly", res));
    else await replyOk(message, claimReply("Weekly", res));
  },
};

export const monthlyCommand: PrefixCommand = {
  name: "monthly",
  description: "Premio mensile.",
  usage: "+monthly",
  category: "economy",
  async execute({ message }) {
    if (!message.guild) return;
    const res = claimMonthly(message.guild.id, message.author.id);
    if (!res.ok) await replyErr(message, claimReply("Monthly", res));
    else await replyOk(message, claimReply("Monthly", res));
  },
};

export const workCommand: PrefixCommand = {
  name: "work",
  description: "Lavora (cooldown 1h).",
  usage: "+work",
  category: "economy",
  async execute({ message }) {
    if (!message.guild) return;
    const res = tryWork(message.guild.id, message.author.id);
    if (!res.ok) await replyErr(message, claimReply("Work", res));
    else await replyOk(message, `Hai lavorato: **+${res.amount}** · saldo **${res.balance}**.`);
  },
};

/** Live: +shop (GUI). Qui solo elenco finché non si porta il panel. */
export const shopCommand: PrefixCommand = {
  name: "shop",
  description: "Negozio coins.",
  usage: "+shop",
  category: "economy",
  aliases: ["negozio", "store"],
  async execute({ message }) {
    const lines = listShopItems()
      .map((i) => `**${i.id}** — ${i.name} · **${i.price}** — ${i.description}`)
      .join("\n");
    await replyEmbed(message, baseEmbed().setTitle("Shop").setDescription(lines));
  },
};

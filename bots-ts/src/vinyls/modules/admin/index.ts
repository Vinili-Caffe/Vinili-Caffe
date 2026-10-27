import { ChannelType, PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import { logger } from "../../../shared";
import { registerPrefixCommand } from "../../prefix/registry";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "../moderation/permissions";
import { getGuildSetup, patchGuildSetup } from "./guildSetup";

const setupCommand: PrefixCommand = {
  name: "setup",
  description: "Setup canali/ruoli guild TS.",
  usage: "+setup [modlog|levelup|verify|joingate] [#canale|@ruolo|status]",
  category: "admin",
  async execute({ message, args }) {
    if (!message.guild || !memberHas(message, PermissionFlagsBits.Administrator)) {
      await replyErr(message, "Solo admin.");
      return;
    }
    const sub = String(args[0] || "status").toLowerCase();
    const cur = getGuildSetup(message.guild.id);
    if (sub === "status" || !args[0]) {
      await replyOk(
        message,
        [
          "**Setup TS**",
          `modlog: ${cur.modlogChannelId ? `<#${cur.modlogChannelId}>` : "_off_"}`,
          `levelup: ${cur.levelUpChannelId ? `<#${cur.levelUpChannelId}>` : "_off_"}`,
          `verify: ${cur.verifyRoleId ? `<@&${cur.verifyRoleId}>` : "_off_"}`,
          `joingate: ${cur.joinGateRoleId ? `<@&${cur.joinGateRoleId}>` : "_off_"}`,
          `_Uso: +setup modlog|#canale · levelup|#canale · verify|@ruolo · joingate|@ruolo_`,
        ].join("\n"),
      );
      return;
    }
    if (sub === "modlog" || sub === "levelup") {
      const ch =
        message.mentions.channels.first() ||
        (args[1] && message.guild.channels.cache.get(args[1]));
      if (!ch || ch.type !== ChannelType.GuildText) {
        await replyErr(message, `Uso: \`+setup ${sub} #canale\``);
        return;
      }
      const patch =
        sub === "modlog" ? { modlogChannelId: ch.id } : { levelUpChannelId: ch.id };
      patchGuildSetup(message.guild.id, patch);
      await replyOk(message, `Setup **${sub}** → <#${ch.id}>`);
      return;
    }
    if (sub === "verify" || sub === "joingate") {
      const role = message.mentions.roles.first() || (args[1] && message.guild.roles.cache.get(args[1]));
      if (!role) {
        await replyErr(message, `Uso: \`+setup ${sub} @ruolo\``);
        return;
      }
      const patch = sub === "verify" ? { verifyRoleId: role.id } : { joinGateRoleId: role.id };
      patchGuildSetup(message.guild.id, patch);
      await replyOk(message, `Setup **${sub}** → <@&${role.id}>`);
      return;
    }
    await replyErr(message, "Sub: status|modlog|levelup|verify|joingate");
  },
};

const securityCommand: PrefixCommand = {
  name: "security",
  description: "Stato antinuke / automod TS.",
  usage: "+security",
  category: "admin",
  async execute({ message }) {
    if (!memberHas(message, PermissionFlagsBits.Administrator)) {
      await replyErr(message, "Solo admin.");
      return;
    }
    await replyOk(
      message,
      [
        "**Security TS**",
        `AUTOMOD: \`${process.env.VC_TS_AUTOMOD || "on"}\``,
        `ANTINUKE: \`${process.env.VC_TS_ANTINUKE || "on"}\` enforce=\`${process.env.VC_TS_ANTINUKE_ENFORCE || "0"}\``,
        `JOIN_GATE_ROLE: \`${process.env.VC_TS_JOIN_GATE_ROLE || "off"}\``,
        "_Profili live securityProfiles = deepen Mongo_",
      ].join("\n"),
    );
  },
};

const backupCommand: PrefixCommand = {
  name: "backup",
  description: "Backup (Later worker).",
  usage: "+backup",
  category: "admin",
  async execute({ message }) {
    if (!memberHas(message, PermissionFlagsBits.Administrator)) {
      await replyErr(message, "Solo admin.");
      return;
    }
    await replyOk(message, "`+backup` → worker Later JS (`auto-backup`). Non eseguito in bots-ts.");
  },
};

const levelAdminCommand: PrefixCommand = {
  name: "level",
  description: "Admin level / EXP channels.",
  usage: "+level [channel|#canale]",
  category: "admin",
  async execute({ message, args }) {
    if (!message.guild || !memberHas(message, PermissionFlagsBits.Administrator)) {
      await replyErr(message, "Solo admin.");
      return;
    }
    if (String(args[0] || "").toLowerCase() === "channel") {
      const ch = message.mentions.channels.first();
      if (!ch) {
        await replyErr(message, "Uso: `+level channel #canale`");
        return;
      }
      patchGuildSetup(message.guild.id, { levelUpChannelId: ch.id });
      await replyOk(message, `Level-up channel → <#${ch.id}>`);
      return;
    }
    const s = getGuildSetup(message.guild.id);
    await replyOk(
      message,
      `Level-up: ${s.levelUpChannelId ? `<#${s.levelUpChannelId}>` : "_off_"} · EXP TS attivo (+rank/+mstats).`,
    );
  },
};

const notifyCommand: PrefixCommand = {
  name: "notify",
  description: "Broadcast testo (admin).",
  usage: "+notify <testo>",
  category: "dev",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.Administrator)) {
      await replyErr(message, "Solo admin.");
      return;
    }
    const text = args.join(" ").trim();
    if (!text) {
      await replyErr(message, "Uso: `+notify <testo>`");
      return;
    }
    if (message.channel.isSendable()) {
      await message.channel.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } });
    }
    await replyOk(message, "Inviato.");
  },
};

const quitCommand: PrefixCommand = {
  name: "quit",
  description: "Spegne il processo bot TS.",
  usage: "+quit",
  category: "dev",
  async execute({ message }) {
    if (!memberHas(message, PermissionFlagsBits.Administrator)) {
      await replyErr(message, "Solo admin.");
      return;
    }
    await replyOk(message, "Shutting down bots-ts…");
    setTimeout(() => process.exit(0), 500);
  },
};

export function registerAdminModule(): void {
  registerPrefixCommand(setupCommand);
  registerPrefixCommand(securityCommand);
  registerPrefixCommand(backupCommand);
  registerPrefixCommand(levelAdminCommand);
  registerPrefixCommand(notifyCommand);
  registerPrefixCommand(quitCommand);
  logger.info("[admin/dev] setup/security/backup/level/notify/quit on");
}

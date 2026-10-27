import { PermissionFlagsBits } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import { logger } from "../../../shared";
import { registerPrefixCommand } from "../../prefix/registry";
import type { PrefixCommand } from "../../prefix/types";
import { memberHas } from "../moderation/permissions";

/** Live Partner-related prefix: description, blacklist, settings (shell). */

const descriptions = new Map<string, string>();
const blacklist = new Set<string>();

const descriptionCommand: PrefixCommand = {
  name: "description",
  description: "Imposta/mostra description partnership.",
  usage: "+description [testo]",
  category: "partner",
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    const text = args.join(" ").trim();
    if (!text) {
      await replyOk(message, descriptions.get(guild.id) || "_Nessuna description impostata._");
      return;
    }
    if (!memberHas(message, PermissionFlagsBits.ManageGuild)) {
      await replyErr(message, "Serve Gestisci server.");
      return;
    }
    descriptions.set(guild.id, text.slice(0, 500));
    await replyOk(message, "Description aggiornata.");
  },
};

const blacklistCommand: PrefixCommand = {
  name: "blacklist",
  description: "Blacklist partnership guildId.",
  usage: "+blacklist <guildId>",
  category: "partner",
  async execute({ message, args }) {
    if (!memberHas(message, PermissionFlagsBits.Administrator)) {
      await replyErr(message, "Solo admin.");
      return;
    }
    const id = String(args[0] || "").trim();
    if (!/^\d{17,20}$/.test(id)) {
      await replyErr(message, "Uso: `+blacklist <guildId>`");
      return;
    }
    blacklist.add(id);
    await replyOk(message, `Blacklist: \`${id}\``);
  },
};

const settingsCommand: PrefixCommand = {
  name: "settings",
  description: "Impostazioni partnership / tenant.",
  usage: "+settings",
  category: "partner",
  async execute({ message }) {
    if (!memberHas(message, PermissionFlagsBits.ManageGuild)) {
      await replyErr(message, "Permesso insufficiente.");
      return;
    }
    const guild = message.guild;
    if (!guild) return;
    const { getTenant, listTenants } = await import("../multiguild/registry.js");
    const tenant = getTenant(guild.id);
    const desc = descriptions.get(guild.id) || "_nessuna_";
    await replyOk(
      message,
      [
        `**Settings partnership** · \`${guild.id}\``,
        `Description: ${desc}`,
        `Blacklist size: **${blacklist.size}**`,
        tenant
          ? `Tenant: **${tenant.label}** · features: \`${tenant.features.join(",") || "*"}\``
          : "_Guild non in VC_TS_TENANTS (main mode)_",
        `Tenants caricati: **${listTenants().length}**`,
        "_Componenti Discord panel live = deepen buttons tenant_",
      ].join("\n"),
    );
  },
};

export function registerPartnerModule(): void {
  registerPrefixCommand(descriptionCommand);
  registerPrefixCommand(blacklistCommand);
  registerPrefixCommand(settingsCommand);
  logger.info("[partner] description/blacklist/settings on (shell)");
}

export function isPartnerBlacklisted(guildId: string): boolean {
  return blacklist.has(guildId);
}

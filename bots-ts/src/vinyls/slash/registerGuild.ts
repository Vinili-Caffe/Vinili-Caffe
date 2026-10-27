import { REST, Routes, type Client } from "discord.js";
import { logger } from "../../shared";
import { listSlashCommands } from "./registry";

/** Registra slash Keep sulla guild di test se VC_TS_SLASH_GUILD + token. */
export async function registerSlashCommandsIfConfigured(client: Client): Promise<void> {
  const token = String(process.env.DISCORD_TOKEN || "").trim();
  const guildId = String(process.env.VC_TS_SLASH_GUILD || "").trim();
  const cmds = listSlashCommands();
  if (!token || !guildId || !cmds.length || !client.user) {
    logger.info(`[slash] skip register (cmds=${cmds.length}, guild=${guildId || "off"})`);
    return;
  }
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
      body: cmds.map((c) => c.data),
    });
    logger.info(`[slash] registered ${cmds.length} on guild ${guildId}`);
  } catch (err) {
    logger.warn("[slash] register failed", err);
  }
}

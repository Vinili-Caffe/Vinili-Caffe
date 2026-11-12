/**
 * Comandi personalizzati creati dalla dashboard (+regole, +ip …): risposta fissa (testo/embed/pulsanti).
 * Chiamato dal dispatcher prefisso quando il comando non è uno del bot.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

const cooldown = new Map<string, number>();

async function runCustomCommand(message?, cmd?): Promise<boolean> {
  const gid = message?.guild?.id;
  if (!gid || !cmd || message.author?.bot) return false;
  if (!(require("../core/moduleSwitches") as typeof import("../core/moduleSwitches")).isModuleOn(gid, "comandipers")) return false;
  const command = await T.findCustomCommand(gid, String(cmd));
  if (!command) return false;

  if (command.allowedRoleIds.length) {
    const roles = message.member?.roles?.cache;
    const allowed = roles && command.allowedRoleIds.some((id) => roles.has(id));
    if (!allowed) return true;
  }

  /* anti-spam: 3s per utente e comando */
  const key = `${gid}:${message.author.id}:${command.id}`;
  const last = cooldown.get(key) || 0;
  if (Date.now() - last < 3_000) return true;
  cooldown.set(key, Date.now());
  if (cooldown.size > 5000) cooldown.clear();

  const parts = String(message.content || "").trim().split(/\s+/);
  const vars = T.memberVars(message.guild, message.author, {
    channel: `<#${message.channelId}>`,
    args: parts.slice(1).join(" ").slice(0, 500),
  });
  const body: Record<string, any> = T.buildMessageBody(command.draft, vars);
  if (command.reply && !command.deleteTrigger) {
    body.message_reference = { message_id: message.id, fail_if_not_exists: false };
  }
  const rest = message.client?.rest;
  try {
    await rest.post(Routes.channelMessages(message.channelId), { body });
    /* incrementa usi dopo risposta ok (best-effort) */
    void (async () => {
      try {
        const rows = await T.listCommands(gid, true);
        const idx = rows.findIndex((r) => r.id === command.id);
        if (idx < 0) return;
        rows[idx] = { ...rows[idx], uses: Math.max(0, Number(rows[idx].uses) || 0) + 1 };
        await T.writeCommands(gid, rows);
      } catch (_) {
        /* ignore */
      }
    })();
  } catch (err) {
    global.logger?.warn?.(`[CUSTOM CMD] ${gid} ${command.name}:`, err?.message || err);
  }
  if (command.deleteTrigger) await message.delete().catch(() => null);
  return true;
}

export = { runCustomCommand };

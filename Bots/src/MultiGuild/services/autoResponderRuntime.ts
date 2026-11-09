/**
 * Risposte automatiche della dashboard: trigger su messaggio → reazione e/o reply.
 * Chiamato dal messageCreate Vinili (sempre attivo) e dal layer MultiGuild.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

const lastFired = new Map<string, number>();

async function runAutoResponders(message?): Promise<boolean> {
  if (!message?.guild || message.author?.bot || message.webhookId || message.system) return false;
  if (message.__autoResponderHandled) return false;
  const content = String(message.content || "");
  if (!content.trim()) return false;

  const rows = await T.listRows("autoResponders", message.guild.id).catch(() => []);
  if (!rows.length) return false;

  /* claim dopo il load, prima del match: Vinili e MultiGuild condividono lo stesso message */
  if (message.__autoResponderHandled) return false;
  message.__autoResponderHandled = true;

  const parentId = message.channel?.parentId ? String(message.channel.parentId) : "";
  const roles = message.member?.roles?.cache;

  for (const ar of rows) {
    if (!ar?.enabled) continue;
    if (
      ar.channelIds?.length &&
      !ar.channelIds.includes(String(message.channelId)) &&
      !(parentId && ar.channelIds.includes(parentId))
    ) {
      continue;
    }
    if (ar.requiredRoleIds?.length) {
      if (!roles || !ar.requiredRoleIds.some((id: string) => roles.has(id))) continue;
    }
    if (ar.ignoredRoleIds?.length && roles && ar.ignoredRoleIds.some((id: string) => roles.has(id))) {
      continue;
    }
    if (!T.matchesAutoResponder(ar, content)) continue;

    const key = `${message.guild.id}:${ar.id}:${message.channelId}`;
    const cd = Math.max(0, Number(ar.cooldownSeconds) || 0) * 1000;
    if (cd && Date.now() - (lastFired.get(key) || 0) < cd) continue;
    lastFired.set(key, Date.now());
    if (lastFired.size > 5000) lastFired.clear();

    let didSomething = false;
    for (const r of ar.reactions || []) {
      const em = T.parseEmoji(r);
      const id = em?.id ? `${em.name || "e"}:${em.id}` : em?.name;
      if (!id) continue;
      const ok = await message.react(id).then(() => true).catch(() => false);
      if (ok) didSomething = true;
    }

    if (ar.replyEnabled && !T.draftIsEmpty(ar.draft)) {
      const vars = T.memberVars(message.guild, message.author, { channel: `<#${message.channelId}>` });
      const body: Record<string, any> = T.buildMessageBody(ar.draft, vars);
      if (ar.reply && !ar.deleteTrigger) {
        body.message_reference = { message_id: message.id, fail_if_not_exists: false };
      }
      const rest = message.client?.rest || message.client?._rest;
      try {
        if (!rest) throw new Error("rest_missing");
        await rest.post(Routes.channelMessages(message.channelId), { body });
        didSomething = true;
      } catch (err: any) {
        global.logger?.warn?.(
          "[AUTO RESPONDER]",
          message.guild.id,
          ar.id || ar.name,
          err?.rawError?.message || err?.message || err,
        );
      }
    }

    /* cancella il trigger solo se abbiamo davvero risposto/reagito */
    if (ar.deleteTrigger && didSomething) await message.delete().catch(() => null);
    return didSomething;
  }

  return false;
}

export = { runAutoResponders };

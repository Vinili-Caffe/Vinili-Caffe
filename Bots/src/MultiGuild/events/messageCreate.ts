/**
 * Risposte automatiche configurate dalla dashboard: quando un messaggio contiene certe parole
 * il bot risponde e/o mette una reazione.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

const lastFired = new Map<string, number>();

export = {
  name: "messageCreate",
  async execute(message?) {
    if (!message?.guild || message.author?.bot || message.webhookId || message.system) return;
    const content = String(message.content || "");
    if (!content.trim()) return;
    const rows = await T.listRows("autoResponders", message.guild.id).catch(() => []);
    if (!rows.length) return;
    const parentId = message.channel?.parentId ? String(message.channel.parentId) : "";
    const roles = message.member?.roles?.cache;
    for (const ar of rows) {
      if (!ar?.enabled) continue;
      if (ar.channelIds?.length && !ar.channelIds.includes(String(message.channelId)) && !(parentId && ar.channelIds.includes(parentId))) continue;
      if (ar.ignoredRoleIds?.length && roles && ar.ignoredRoleIds.some((id: string) => roles.has(id))) continue;
      if (!T.matchesAutoResponder(ar, content)) continue;

      const key = `${message.guild.id}:${ar.id}:${message.channelId}`;
      const cd = Math.max(0, Number(ar.cooldownSeconds) || 0) * 1000;
      if (cd && Date.now() - (lastFired.get(key) || 0) < cd) return;
      lastFired.set(key, Date.now());
      if (lastFired.size > 5000) lastFired.clear();

      for (const r of ar.reactions || []) {
        const em = T.parseEmoji(r);
        const id = em?.id ? `${em.name || "e"}:${em.id}` : em?.name;
        if (id) await message.react(id).catch(() => null);
      }
      if (ar.replyEnabled && !T.draftIsEmpty(ar.draft)) {
        const vars = T.memberVars(message.guild, message.author, { channel: `<#${message.channelId}>` });
        const body: Record<string, any> = T.buildMessageBody(ar.draft, vars);
        if (ar.reply && !ar.deleteTrigger) body.message_reference = { message_id: message.id, fail_if_not_exists: false };
        await message.client.rest.post(Routes.channelMessages(message.channelId), { body }).catch((err?) => global.logger?.warn?.("[AUTO RESPONDER]", message.guild.id, err?.message || err));
      }
      if (ar.deleteTrigger) await message.delete().catch(() => null);
      return; /* una sola risposta per messaggio */
    }
  },
};

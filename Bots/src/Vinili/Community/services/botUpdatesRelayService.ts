const {
  ChannelType,
  MessageFlagsBitField,
  Routes,
} = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const {
  listTenantUpdatesTargetsSync,
  setTenantUpdatesWebhook,
  ensureTenantGuildSettingsCacheFresh,
} = require("../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../MultiGuild/core/tenantGuildSettings");

const SOURCE_CHANNEL_ID = String(IDs.channels?.botUpdatesSource || "1525817647210561711");
const WEBHOOK_NAME_FALLBACK = "Vinili";
const RELAY_REASON = "Canale aggiornamenti Vinili";
const RELAY_DEDUPE_TTL_MS = 6 * 60 * 60 * 1000;
const recentlyRelayedMessageIds = new Map();

function getRest(client?) {
  return client?.rest || client?._rest || null;
}

function appDisplayName(client?) {
  const u = client?.user;
  return String(u?.globalName || u?.username || WEBHOOK_NAME_FALLBACK).trim() || WEBHOOK_NAME_FALLBACK;
}

function appAvatarDataUriOrUrl(client?) {
  const u = client?.user;
  if (!u) return { url: null };
  try {
    if (typeof u.displayAvatarURL === "function") {
      return {
        url: u.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }),
      };
    }
  } catch (_) {}
  return { url: null };
}

async function fetchAvatarAsDataUri(url?) {
  const src = String(url || "").trim();
  if (!src) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ctype = String(res.headers.get("content-type") || "image/png").split(";")[0].trim() || "image/png";
    return `data:${ctype};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function isSupportedUpdatesChannel(channel?) {
  if (!channel) return false;
  const t = Number(channel.type);
  return t === ChannelType.GuildText || t === ChannelType.GuildAnnouncement;
}

function pruneRelayDedupe(now = Date.now()) {
  for (const [id, ts] of recentlyRelayedMessageIds) {
    if (now - ts > RELAY_DEDUPE_TTL_MS) recentlyRelayedMessageIds.delete(id);
  }
}

function markMessageRelayed(messageId?) {
  const id = String(messageId || "").trim();
  if (!id) return;
  pruneRelayDedupe();
  recentlyRelayedMessageIds.set(id, Date.now());
}

function wasMessageRelayed(messageId?) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const ts = recentlyRelayedMessageIds.get(id);
  if (!ts) return false;
  if (Date.now() - ts > RELAY_DEDUPE_TTL_MS) {
    recentlyRelayedMessageIds.delete(id);
    return false;
  }
  return true;
}

function readCrossposted(message?) {
  const cross = MessageFlagsBitField.Flags.Crossposted;
  if (!message) return false;
  if (message.flags && typeof message.flags.has === "function") {
    return Boolean(message.flags.has(cross));
  }
  return Boolean(Number(message.flags?.bitfield ?? message.flags) & Number(cross));
}

function messageBecamePublished(previous?, updated?) {
  if (!updated) return false;
  if (!readCrossposted(updated)) return false;
      if (previous?.partial) return true;
  return !readCrossposted(previous);
}

function isSourceUpdatesMessage(message?) {
  const chId = String(message?.channelId || message?.channel?.id || "").trim();
  return chId === SOURCE_CHANNEL_ID;
}

async function resolveChannel(client?, guildId?, channelId?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!cid) return null;
  try {
    const guild =
      (gid && client.guilds?.cache?.get(gid)) ||
      (gid && typeof client.guilds?.fetch === "function" ? await client.guilds.fetch(gid).catch(() => null) : null);
    if (guild?.channels?.fetch) {
      const ch = await guild.channels.fetch(cid).catch(() => null);
      if (ch) return ch;
    }
  } catch (_) {}
  try {
    if (typeof client.channels?.fetch === "function") {
      return await client.channels.fetch(cid).catch(() => null);
    }
  } catch (_) {}
  return null;
}

async function listChannelWebhooks(client?, channelId?) {
  const rest = getRest(client);
  if (!rest || !channelId) return [];
  try {
    const rows = await rest.get(Routes.channelWebhooks(channelId));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function deleteWebhookQuiet(client?, webhookId?) {
  const rest = getRest(client);
  const id = String(webhookId || "").trim();
  if (!rest || !id) return;
  try {
    await rest.delete(Routes.webhook(id));
  } catch (_) {}
}

async function ensureTenantUpdatesWebhook(client?, guildId?, channelId?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!gid || !cid) return { ok: false, reason: "invalid_channel" };

  const channel = await resolveChannel(client, gid, cid);
  if (!channel || !isSupportedUpdatesChannel(channel)) {
    return { ok: false, reason: "invalid_channel" };
  }

  await ensureTenantGuildSettingsCacheFresh().catch(() => null);
  const targets = listTenantUpdatesTargetsSync().filter((t?) => t.guildId === gid);
  const prevWebhookId = targets[0]?.webhookId || null;

  const name = appDisplayName(client).slice(0, 80);
  const { url: avatarUrl } = appAvatarDataUriOrUrl(client);
  const avatarDataUri = avatarUrl ? await fetchAvatarAsDataUri(avatarUrl) : null;

  const existing = await listChannelWebhooks(client, cid);
  let hook =
    (prevWebhookId && existing.find((w?) => String(w?.id) === String(prevWebhookId))) ||
    existing.find(
      (w?) =>
        String(w?.name || "") === name &&
        String(w?.application_id || w?.applicationId || "") === String(client?.user?.id || ""),
    ) ||
    existing.find((w?) => String(w?.name || "") === name) ||
    null;

  const rest = getRest(client);
  if (!rest) return { ok: false, reason: "rest_unavailable" };

  if (hook?.id) {
    try {
      const body: Record<string, any> = { name };
      if (avatarDataUri) body.avatar = avatarDataUri;
      hook = await rest.patch(Routes.webhook(String(hook.id)), { body });
    } catch (err) {
      global.logger?.warn?.("[botUpdatesRelay] patch webhook:", err?.message || err);
    }
    await setTenantUpdatesWebhook(gid, String(hook.id)).catch(() => null);
    return { ok: true, webhookId: String(hook.id), channelId: cid };
  }

  if (prevWebhookId) {
    await deleteWebhookQuiet(client, prevWebhookId);
  }

  try {
    const body: Record<string, any> = { name };
    if (avatarDataUri) body.avatar = avatarDataUri;
    const created = await rest.post(Routes.channelWebhooks(cid), {
      body,
      reason: RELAY_REASON,
    });
    const wid = String(created?.id || "").trim();
    if (!wid) return { ok: false, reason: "webhook_create_failed" };
    await setTenantUpdatesWebhook(gid, wid);
    return { ok: true, webhookId: wid, channelId: cid };
  } catch (err) {
    global.logger?.warn?.("[botUpdatesRelay] create webhook:", err?.message || err);
    return { ok: false, reason: "webhook_create_failed" };
  }
}

async function clearTenantUpdatesWebhook(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return { ok: true };
  await ensureTenantGuildSettingsCacheFresh().catch(() => null);
  const targets = listTenantUpdatesTargetsSync().filter((t?) => t.guildId === gid);
  const wid = targets[0]?.webhookId || null;
  if (wid) await deleteWebhookQuiet(client, wid);
  await setTenantUpdatesWebhook(gid, null).catch(() => null);
  return { ok: true };
}

function collectRelayFiles(message?) {
  const files = [];
  const attachments = message?.attachments;
  if (!attachments) return files;
  for (const att of attachments.values()) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    files.push({
      attachment: url,
      name: String(att.name || "file").slice(0, 256),
    });
  }
  return files;
}

function buildRelayPayload(message?, client?) {
  const content = String(message?.content || "");
  const embeds = Array.isArray(message?.embeds)
    ? message.embeds.map((e?) => (typeof e?.toJSON === "function" ? e.toJSON() : e)).filter(Boolean)
    : [];
  const files = collectRelayFiles(message);
  const payload: Record<string, any> = {
    allowedMentions: { parse: [] },
    username: appDisplayName(client).slice(0, 80),
  };
  const { url } = appAvatarDataUriOrUrl(client);
  if (url) payload.avatarURL = url;
  if (content.trim()) payload.content = content.slice(0, 2000);
  if (embeds.length) payload.embeds = embeds.slice(0, 10);
  if (files.length) payload.files = files.slice(0, 10);
  if (!payload.content && !payload.embeds?.length && !payload.files?.length) {
    payload.content = "<:VC_update:1478721333096349817> Aggiornamento";
  }
  return payload;
}

function isMissingWebhookError(err?, reason?) {
  const code = Number(err?.code ?? err?.rawError?.code ?? 0);
  if (code === 10015) return true;
  const msg = String(reason || err?.message || "").toLowerCase();
  return (
    msg.includes("unknown webhook") ||
    msg.includes("invalid webhook") ||
    msg.includes("no_token") ||
    msg.includes("404")
  );
}

async function sendViaWebhook(client?, webhookId?, payload?) {
  const rest = getRest(client);
  const id = String(webhookId || "").trim();
  if (!rest || !id) return { ok: false, reason: "invalid_webhook" };
  try {
    const hook = await rest.get(Routes.webhook(id));
    const token = String(hook?.token || "").trim();
    if (!token) return { ok: false, reason: "no_token" };

    const body = {
      content: payload.content,
      username: payload.username,
      avatar_url: payload.avatarURL || undefined,
      embeds: payload.embeds,
      allowed_mentions: payload.allowedMentions || { parse: [] },
    };

    if (payload.files?.length) {
      return { ok: false, reason: "needs_files" };
    }

    await rest.post(Routes.webhook(id, token), {
      body,
      query: new URLSearchParams({ wait: "true" }),
    });
    return { ok: true };
  } catch (err) {
    const reason = err?.message || "send_failed";
    if (isMissingWebhookError(err, reason)) {
      return { ok: false, reason: "webhook_missing" };
    }
    return { ok: false, reason };
  }
}

async function sendViaWebhookWithFiles(client?, guildId?, channelId?, webhookId?, payload?) {
  const channel = await resolveChannel(client, guildId, channelId);
  if (channel && typeof channel.fetchWebhooks === "function") {
    try {
      const hooks = await channel.fetchWebhooks();
      const hook =
        hooks.get(String(webhookId)) ||
        [...hooks.values()].find((h?) => String(h.id) === String(webhookId));
      if (hook && typeof hook.send === "function") {
        await hook.send({
          content: payload.content,
          username: payload.username,
          avatarURL: payload.avatarURL,
          embeds: payload.embeds,
          files: payload.files,
          allowedMentions: payload.allowedMentions || { parse: [] },
        });
        return { ok: true };
      }
    } catch (err) {
      global.logger?.warn?.("[botUpdatesRelay] hook.send files:", err?.message || err);
    }
  }

  const slim = { ...payload };
  delete slim.files;
  if (!slim.content && !slim.embeds?.length) {
    slim.content = String(payload.content || "<:VC_update:1478721333096349817> Aggiornamento");
  }
  return sendViaWebhook(client, webhookId, slim);
}

async function relayPublishedBotUpdate(client?, message?) {
  if (!client || !message || !isSourceUpdatesMessage(message)) return { ok: true, relayed: 0 };
  if (message.system) return { ok: true, relayed: 0 };
  const messageId = String(message.id || "").trim();
  if (messageId && wasMessageRelayed(messageId)) return { ok: true, relayed: 0, deduped: true };

  await ensureTenantGuildSettingsCacheFresh().catch(() => null);
  const targets = listTenantUpdatesTargetsSync();
  if (!targets.length) return { ok: true, relayed: 0 };

  const payload: any = buildRelayPayload(message, client);
  let relayed = 0;

  for (const target of targets) {
    try {
      const deliver = async (webhookId?) => {
        if (payload.files?.length) {
          return sendViaWebhookWithFiles(
            client,
            target.guildId,
            target.channelId,
            webhookId,
            payload,
          );
        }
        const result = await sendViaWebhook(client, webhookId, payload);
        if (result?.reason === "needs_files") {
          return sendViaWebhookWithFiles(
            client,
            target.guildId,
            target.channelId,
            webhookId,
            payload,
          );
        }
        return result;
      };

      let webhookId = target.webhookId;
      if (!webhookId) {
        const ensured = await ensureTenantUpdatesWebhook(client, target.guildId, target.channelId);
        if (!ensured.ok) continue;
        webhookId = ensured.webhookId;
      }

      let result = await deliver(webhookId);
            if (!result?.ok) {
        const ensured = await ensureTenantUpdatesWebhook(client, target.guildId, target.channelId);
        if (ensured.ok && ensured.webhookId && ensured.webhookId !== webhookId) {
          result = await deliver(ensured.webhookId);
        } else if (ensured.ok && !result?.ok) {
          result = await deliver(ensured.webhookId);
        }
      }
      if (result?.ok) relayed += 1;
    } catch (err) {
      global.logger?.warn?.(
        `[botUpdatesRelay] relay guild=${target.guildId}:`,
        err?.message || err,
      );
    }
  }

  if (relayed > 0 && messageId) markMessageRelayed(messageId);
  return { ok: true, relayed };
}

async function handlePossiblePublishedBotUpdate(client?, previous?, updated?) {
  if (!isSourceUpdatesMessage(updated)) return false;
  if (!messageBecamePublished(previous, updated)) return false;
  await relayPublishedBotUpdate(client, updated);
  return true;
}

export = {
  ensureTenantUpdatesWebhook,
  clearTenantUpdatesWebhook,
  handlePossiblePublishedBotUpdate,
};

/** Anteprima strutturale di uno snapshot (senza corpi messaggio). */
const fs = require("fs/promises") as typeof import("fs/promises");
const path = require("path") as typeof import("path");
const {
  getBackupFolder,
  writeFileAtomic,
  readBackupByIdGlobal,
} = require("./serverBackupIo") as typeof import("./serverBackupIo");

function previewPath(guildId?, backupId?) {
  return path.join(getBackupFolder(guildId), `${String(backupId || "").toUpperCase()}.preview.json`);
}

function countMessages(payload?) {
  const channels = payload?.messages?.channels || {};
  const threads = payload?.messages?.threads || {};
  let total = 0;
  const byChannel: { channelId: string; count: number }[] = [];
  for (const [channelId, list] of Object.entries(channels)) {
    const n = Array.isArray(list) ? list.length : 0;
    total += n;
    if (n) byChannel.push({ channelId: String(channelId), count: n });
  }
  for (const list of Object.values(threads)) {
    total += Array.isArray(list) ? list.length : 0;
  }
  byChannel.sort((a, b) => b.count - a.count);
  return { total, byChannelTop: byChannel.slice(0, 12) };
}

function buildPreviewFromPayload(payload?, meta: Record<string, any> = {}) {
  const guild = payload?.guild || {};
  const rolesRaw = Array.isArray(payload?.roles) ? payload.roles : [];
  const channelsRaw = Array.isArray(payload?.channels) ? payload.channels : [];
  const threadsRaw = Array.isArray(payload?.threads) ? payload.threads : [];
  const emojisRaw = Array.isArray(payload?.emojis) ? payload.emojis : [];
  const stickersRaw = Array.isArray(payload?.stickers) ? payload.stickers : [];
  const bansRaw = Array.isArray(payload?.bans) ? payload.bans : [];
  const invitesRaw = Array.isArray(payload?.invites) ? payload.invites : [];
  const webhooksRaw = Array.isArray(payload?.webhooks) ? payload.webhooks : [];
  const eventsRaw = Array.isArray(payload?.scheduledEvents) ? payload.scheduledEvents : [];
  const membersRaw = Array.isArray(payload?.members) ? payload.members : [];
  const automodRaw = Array.isArray(payload?.autoModerationRules) ? payload.autoModerationRules : [];
  const msg = countMessages(payload);

  const channelNameById = new Map(channelsRaw.map((c?) => [String(c?.id || ""), String(c?.name || "")]));

  const roles = rolesRaw
    .map((r?) => ({
      id: String(r?.id || ""),
      name: String(r?.name || ""),
      color: Number(r?.color || 0),
      position: Number(r?.position || 0),
      hoist: Boolean(r?.hoist),
      managed: Boolean(r?.managed),
      mentionable: Boolean(r?.mentionable),
      iconURL: r?.iconURL || null,
    }))
    .filter((r) => r.id)
    .sort((a, b) => b.position - a.position);

  const channels = channelsRaw
    .map((c?) => ({
      id: String(c?.id || ""),
      name: String(c?.name || ""),
      type: Number(c?.type ?? -1),
      parentId: c?.parentId ? String(c.parentId) : null,
      position: Number(c?.position || 0),
      nsfw: Boolean(c?.nsfw),
      topic: c?.topic ? String(c.topic).slice(0, 160) : null,
      bitrate: c?.bitrate != null ? Number(c.bitrate) : null,
      userLimit: c?.userLimit != null ? Number(c.userLimit) : null,
    }))
    .filter((c) => c.id)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  const categories = channels.filter((c) => c.type === 4);
  const categoryIds = new Set(categories.map((c) => c.id));
  const underCategory = new Set(
    channels.filter((c) => c.type !== 4 && c.parentId && categoryIds.has(c.parentId)).map((c) => c.id),
  );
  // Canali senza parent, o con parent mancante/non-categoria: restano in radice (non spariscono).
  const rootChannels = channels.filter((c) => c.type !== 4 && !underCategory.has(c.id));
  const tree = [
    ...rootChannels.map((c) => ({ ...c, children: [] as any[] })),
    ...categories.map((cat) => ({
      ...cat,
      children: channels
        .filter((c) => c.parentId === cat.id)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    })),
  ].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  return {
    version: 3,
    backupId: String(payload?.backupId || meta.backupId || "").toUpperCase(),
    guildId: String(guild?.id || meta.guildId || ""),
    createdAt: payload?.createdAt || meta.createdAt || null,
    source: String(payload?.source || meta.source || "manual"),
    sizeBytes: Number(meta?.file?.sizeBytes || 0) || null,
    guild: {
      name: String(guild?.name || meta.guildName || ""),
      iconURL: guild?.iconURL || null,
      bannerURL: guild?.bannerURL || null,
      description: guild?.description ? String(guild.description).slice(0, 300) : null,
      memberCount: Number(guild?.memberCount || membersRaw.length || 0),
      verificationLevel: Number(guild?.verificationLevel ?? 0),
      premiumTier: Number(guild?.premiumTier ?? 0),
      features: Array.isArray(guild?.features) ? guild.features.slice(0, 40).map(String) : [],
      preferredLocale: guild?.preferredLocale || null,
      ownerId: guild?.ownerId ? String(guild.ownerId) : null,
    },
    roles,
    channels,
    channelTree: tree,
    threads: {
      count: threadsRaw.length,
      sample: threadsRaw.slice(0, 20).map((t?) => ({
        id: String(t?.id || ""),
        name: String(t?.name || ""),
        parentId: t?.parentId ? String(t.parentId) : null,
        parentName: t?.parentId ? channelNameById.get(String(t.parentId)) || null : null,
      })),
    },
    emojis: emojisRaw.map((e?) => {
      const id = String(e?.id || "");
      const animated = Boolean(e?.animated);
      const cdn = id
        ? `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=64&quality=lossless`
        : null;
      return {
        id,
        name: String(e?.name || ""),
        animated,
        // Preferisci CDN stabile: gli URL del payload scadono.
        url: cdn || e?.url || null,
      };
    }),
    stickers: stickersRaw.map((s?) => {
      const id = String(s?.id || "");
      const format = Number(s?.format ?? 0);
      // 3 = Lottie: non è un'immagine statica.
      const isLottie = format === 3;
      const ext = format === 4 ? "gif" : "png";
      const cdn = id && !isLottie ? `https://media.discordapp.net/stickers/${id}.${ext}?size=160` : null;
      return {
        id,
        name: String(s?.name || ""),
        format,
        url: cdn || (!isLottie ? s?.url || null : null),
      };
    }),
    bans: {
      count: bansRaw.length,
      sample: bansRaw.slice(0, 15).map((b?) => ({
        tag: String(b?.user?.tag || b?.user?.username || b?.user?.id || "?"),
        reason: b?.reason ? String(b.reason).slice(0, 120) : null,
      })),
    },
    invites: { count: invitesRaw.length },
    webhooks: { count: webhooksRaw.length },
    events: eventsRaw.slice(0, 20).map((ev?) => ({
      name: String(ev?.name || ""),
      scheduledStartAt: ev?.scheduledStartAt || null,
      status: Number(ev?.status ?? 0),
    })),
    automodRules: { count: automodRaw.length },
    members: { count: membersRaw.length },
    messages: {
      total: msg.total,
      byChannelTop: msg.byChannelTop.map((row) => ({
        ...row,
        channelName: channelNameById.get(row.channelId) || row.channelId,
      })),
    },
    stats: meta?.stats || null,
  };
}

async function writeBackupPreview(guildId?, backupId?, preview?) {
  const gid = String(guildId || "");
  const id = String(backupId || "").toUpperCase();
  if (!gid || !id || !preview) return;
  await fs.mkdir(getBackupFolder(gid), { recursive: true });
  await writeFileAtomic(previewPath(gid, id), JSON.stringify(preview), "utf8");
}

async function readBackupPreview(guildId?, backupId?) {
  const raw = await fs.readFile(previewPath(guildId, backupId), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function deleteBackupPreview(guildId?, backupId?) {
  await fs.unlink(previewPath(guildId, backupId)).catch(() => null);
}

async function getOrBuildBackupPreview(guildId?, backupId?, meta: Record<string, any> = {}) {
  const existing = await readBackupPreview(guildId, backupId);
  // v3: tutte le emoji/sticker + URL CDN stabili.
  if (existing?.version >= 3) return { preview: existing, cached: true };

  const data = await readBackupByIdGlobal(`${guildId}:${backupId}`);
  const preview = buildPreviewFromPayload(data.payload, { ...meta, ...(data.meta || {}) });
  await writeBackupPreview(guildId, backupId, preview).catch(() => null);
  return { preview, cached: false };
}

export = {
  buildPreviewFromPayload,
  writeBackupPreview,
  readBackupPreview,
  deleteBackupPreview,
  getOrBuildBackupPreview,
  previewPath,
};

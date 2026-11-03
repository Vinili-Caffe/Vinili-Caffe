/** Immagini attività: scheda di un canale. */
const { STATS_TITLE, sanitizeDisplayLabel, prepareCanvasHeaderText, dateTextCompact, formatHours, compactNumber, computeWrappedTitleLines, drawLabel } = require("./canvasText") as typeof import("./canvasText");
const { STATS_PANEL_GLYPH, fillRoundRect, strokeRoundRect, drawBackground, strokeAvatarRing, drawImageCover, drawDateBadgeStat } = require("./canvasShapes") as typeof import("./canvasShapes");
const { STATS_MUTED, drawMetricPanel, drawTopCard } = require("./canvasPanels") as typeof import("./canvasPanels");
const { drawChart } = require("./canvasCharts") as typeof import("./canvasCharts");
const decodeGif = require("decode-gif") as typeof import("decode-gif");
const { safeLoadImage, fetchHttpImageBuffer } = require("./safeLoadImage") as typeof import("./safeLoadImage");
const { drawActivityGlyph } = require("./canvasIconGlyphs") as typeof import("./canvasIconGlyphs");
const { prepareVisibleText, drawLabelWithEmoji } = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");

let _canvasModule = null;
function getCanvasModule() { if (!_canvasModule) _canvasModule = require("canvas"); return _canvasModule; }
const STATS_GAP = 22;
const STATS_HEADER_BADGE_W = 340;
const STATS_AVATAR_CACHE_TTL_MS = Math.max(
  0,
  Math.min(600_000, Number(process.env.STATS_AVATAR_CACHE_TTL_MS ?? 300_000)),
);
const statsAvatarCache = new Map();

function getStatsAvatarCache(url?) {
  if (!STATS_AVATAR_CACHE_TTL_MS) return null;
  const key = String(url || "");
  if (!key) return null;
  const entry = statsAvatarCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) statsAvatarCache.delete(key);
    return null;
  }
  return entry.value;
}

function setStatsAvatarCache(url?, value?) {
  if (!STATS_AVATAR_CACHE_TTL_MS || !value) return;
  const key = String(url || "");
  if (!key) return;
  statsAvatarCache.set(key, { value, expiresAt: Date.now() + STATS_AVATAR_CACHE_TTL_MS });
  if (statsAvatarCache.size > 250) {
    const oldest = statsAvatarCache.keys().next().value;
    if (oldest) statsAvatarCache.delete(oldest);
  }
}

async function loadAvatarForStatsCanvas(url?) {
  if (!url) return null;
  const cached = getStatsAvatarCache(url);
  if (cached) return cached;
  const buf = await fetchHttpImageBuffer(url, { timeoutMs: 4000 }).catch(() => null);
  if (!buf?.length) return null;
  const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
  let resolved = null;
  if (isGif) {
    try {
      const decoded = decodeGif(buf);
      if (decoded?.frames?.length) {
        resolved = { kind: "gif", width: decoded.width, height: decoded.height, frames: decoded.frames };
      }
    } catch {
    }
    if (!resolved) {
      try {
        const image = await getCanvasModule().loadImage(buf);
        resolved = { kind: "static", image };
      } catch {
        const image = await safeLoadImage(url, { timeoutMs: 4000 }).catch(() => null);
        resolved = image ? { kind: "static", image } : null;
      }
    }
  } else {
    try {
      const image = await getCanvasModule().loadImage(buf);
      resolved = { kind: "static", image };
    } catch {
      const image = await safeLoadImage(url, { timeoutMs: 10000 }).catch(() => null);
      resolved = image ? { kind: "static", image } : null;
    }
  }
  if (resolved) setStatsAvatarCache(url, resolved);
  return resolved;
}

async function drawAvatarCircle(ctx?, avatarUrl?, x?, y?, size?, animationPhase = null, resolved = null) {
  let r = resolved;
  if (!r && avatarUrl) r = await loadAvatarForStatsCanvas(avatarUrl);
  if (!r) return;

  if (r.kind === "gif") {
    const { width: fw, height: fh, frames } = r;
    const fi = 0;
    const frame = frames[fi];
    if (!frame?.data?.length) return;
    if (!r._scratch) {
      r._scratch = getCanvasModule().createCanvas(fw, fh);
      r._frameImgData = r._scratch.getContext("2d").createImageData(fw, fh);
    }
    const sctx = r._scratch.getContext("2d");
    sctx.clearRect(0, 0, fw, fh);
    r._frameImgData.data.set(frame.data);
    sctx.putImageData(r._frameImgData, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    drawImageCover(ctx, r._scratch, x, y, size);
    ctx.restore();
    strokeAvatarRing(ctx, x, y, size, animationPhase);
    return;
  }

  const image = r.image;
  if (!image) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  drawImageCover(ctx, image, x, y, size);
  ctx.restore();
  strokeAvatarRing(ctx, x, y, size, animationPhase);
}

async function paintChannelActivityCanvas(
  ctx,
  {
    channelName,
    channelIconUrl,
    createdOn,
    joinedOn,
    lookbackDays,
    windows,
    topUsersText,
    topUsersVoice,
    chart,
    isTextChannel,
    guildName,
  },
  animationPhase = 0,
  channelIconResolved = null,
) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const lookbackWindow = windows?.[`d${safeLookback}`] || windows?.d14 || {};
  const width = 1280;
  const height = 900;

  const M = 20;
  const GAP = STATS_GAP;
  const topRowH = 248;
  const contentW = width - M * 2;
  const topPanelW = Math.floor((contentW - GAP * 2) / 3);
  const topX2 = M + topPanelW + GAP;
  const topX3 = topX2 + topPanelW + GAP;
  const bottomPanelW = Math.floor((contentW - GAP) / 2);
  const bottomX2 = M + bottomPanelW + GAP;

  drawBackground(ctx, width, height);

  const avatarSize = 96;
  const avatarX = M + 8;
  const textLeft = avatarX + avatarSize + 20;
  const statBadgeW = STATS_HEADER_BADGE_W;
  const badgeX = width - M - statBadgeW;
  const nameMaxW = Math.max(320, badgeX - textLeft - 16);
  const chTitleRaw = sanitizeDisplayLabel(
    prepareVisibleText(String(channelName || "").replace(/^#+\s*/, "").trim() || "channel"),
  );
  const chLayout = computeWrappedTitleLines(ctx, chTitleRaw, nameMaxW, {
    startSize: 54,
    minSize: 20,
    weight: "700",
    maxLines: 2,
    fallback: "channel",
  });
  const guildPrepared = prepareVisibleText(prepareCanvasHeaderText(guildName, "Server"));
  const guildLayout = computeWrappedTitleLines(ctx, guildPrepared, nameMaxW, {
    startSize: 24,
    minSize: 14,
    weight: "600",
    maxLines: 3,
    fallback: "Server",
  });
  const chLineH = Math.max(22, Math.round(chLayout.size * 1.08));
  const chBlockH = chLayout.lines.length * chLineH;
  const guildGap = 4;
  const guildLineH = Math.max(18, Math.round(guildLayout.size * 1.06));
  const guildBlockH = guildLayout.lines.length * guildLineH;
  const textBlockH = chBlockH + guildGap + guildBlockH;
  const badgeH = 58;
  const badgeGap = 8;
  const badgeStackH = badgeH + badgeGap + badgeH;
  const headerPadY = 10;
  const headerBandH = Math.max(textBlockH + headerPadY * 2, badgeStackH + headerPadY * 2, avatarSize + headerPadY * 2);
  const textBlockTop = 16 + headerPadY;
  const avatarY = 16 + Math.max(0, (headerBandH - avatarSize) / 2);
  const badgeColY = 16 + headerPadY;
  const contentTop = 16 + headerBandH + 14;
  const bottomRowH = 220;
  const bottomTop = contentTop + topRowH + GAP;
  const channelDateBadgeOpts = {
    h: badgeH,
    pillH: 22,
    padX: 10,
    padY: 8,
    pillRx: 8,
    outerRx: 12,
    titleSize: 14,
    valueSize: 22,
    titleY: 19,
    valueY: 42,
    labelPadX: 14,
  };

  fillRoundRect(ctx, M, 16, contentW, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, M, 16, contentW, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  if (channelIconUrl && !isTextChannel) {
    await drawAvatarCircle(ctx, channelIconUrl, avatarX, avatarY, avatarSize, animationPhase, channelIconResolved);
  } else {
    fillRoundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2, "rgba(50, 60, 75, 0.95)");
    drawActivityGlyph(ctx, "hash", avatarX + avatarSize / 2, avatarY + avatarSize / 2, 38, STATS_PANEL_GLYPH);
  }
  for (let li = 0; li < chLayout.lines.length; li += 1) {
    const y = textBlockTop + chLineH / 2 + li * chLineH;
    await drawLabelWithEmoji(ctx, chLayout.lines[li], textLeft, y, {
      size: chLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  for (let li = 0; li < guildLayout.lines.length; li += 1) {
    const y = textBlockTop + chBlockH + guildGap + guildLineH / 2 + li * guildLineH;
    await drawLabelWithEmoji(ctx, guildLayout.lines[li], textLeft, y, {
      size: guildLayout.size,
      weight: "600",
      color: "#d2dce8",
      forcePrimaryFont: true,
    });
  }
  drawDateBadgeStat(ctx, "Created", dateTextCompact(createdOn), badgeX, badgeColY, statBadgeW, channelDateBadgeOpts);
  drawDateBadgeStat(ctx, "Joined", dateTextCompact(joinedOn), badgeX, badgeColY + badgeH + badgeGap, statBadgeW, channelDateBadgeOpts);

  if (isTextChannel) {
    drawMetricPanel(
      ctx,
      "Channel Lookback",
      [
        { label: "1d", value: `${compactNumber(windows?.d1?.text || 0)} messages` },
        { label: "7d", value: `${compactNumber(windows?.d7?.text || 0)} messages` },
        { label: `${safeLookback}d`, value: `${compactNumber(lookbackWindow?.text || 0)} messages` },
      ],
      M,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "message" },
    );
    drawMetricPanel(
      ctx,
      "Contributors",
      [
        { label: "1d", value: `${Number(windows?.d1?.contributors || 0)} members` },
        { label: "7d", value: `${Number(windows?.d7?.contributors || 0)} members` },
        { label: `${safeLookback}d`, value: `${Number(lookbackWindow?.contributors || 0)} members` },
      ],
      topX2,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "users" },
    );
    drawMetricPanel(
      ctx,
      "Messages",
      [
        { label: "1d", value: `${compactNumber(windows?.d1?.text || 0)} messages` },
        { label: "7d", value: `${compactNumber(windows?.d7?.text || 0)} messages` },
        { label: "30d", value: `${compactNumber(windows?.d30?.text || 0)} messages` },
      ],
      topX3,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "message" },
    );
    const topText = topUsersText || [];
    await drawTopCard(
      ctx,
      "Top Members",
      {
        label: topText[0]?.label || "-",
        value: compactNumber(topText[0]?.value || 0),
        unit: "msg",
      },
      {
        label: topText[1]?.label || "-",
        value: compactNumber(topText[1]?.value || 0),
        unit: "msg",
      },
      M,
      bottomTop,
      bottomPanelW,
      bottomRowH,
      { showRank: false, dense: true, glyph: "message" },
    );
    drawChart(ctx, chart, bottomX2, bottomTop, bottomPanelW, bottomRowH, { animationPhase, glyph: "chart" });
  } else {
    drawMetricPanel(
      ctx,
      "Channel Lookback",
      [
        { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds || 0)} hours` },
        { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds || 0)} hours` },
        { label: `${safeLookback}d`, value: `${formatHours(lookbackWindow?.voiceSeconds || 0)} hours` },
      ],
      M,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "voice" },
    );
    drawMetricPanel(
      ctx,
      "Contributors",
      [
        { label: "1d", value: `${Number(windows?.d1?.contributors || 0)} members` },
        { label: "7d", value: `${Number(windows?.d7?.contributors || 0)} members` },
        { label: `${safeLookback}d`, value: `${Number(lookbackWindow?.contributors || 0)} members` },
      ],
      topX2,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "users" },
    );
    drawMetricPanel(
      ctx,
      "Voice Activity",
      [
        { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds || 0)} hours` },
        { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds || 0)} hours` },
        { label: "30d", value: `${formatHours(windows?.d30?.voiceSeconds || 0)} hours` },
      ],
      topX3,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "voice" },
    );
    const topVoice = topUsersVoice || [];
    await drawTopCard(
      ctx,
      "Top Members",
      {
        label: topVoice[0]?.label || "-",
        value: formatHours(topVoice[0]?.value || 0),
        unit: "h",
      },
      {
        label: topVoice[1]?.label || "-",
        value: formatHours(topVoice[1]?.value || 0),
        unit: "h",
      },
      M,
      bottomTop,
      bottomPanelW,
      bottomRowH,
      { showRank: false, dense: true, glyph: "voice" },
    );
    drawChart(ctx, chart, bottomX2, bottomTop, bottomPanelW, bottomRowH, { animationPhase, glyph: "chart" });
  }

  drawLabel(ctx, `Lookback: Last ${safeLookback} days`, M, height - 20, {
    size: 18,
    weight: "700",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });
}

export = { getCanvasModule, STATS_GAP, STATS_HEADER_BADGE_W, loadAvatarForStatsCanvas, drawAvatarCircle, paintChannelActivityCanvas };

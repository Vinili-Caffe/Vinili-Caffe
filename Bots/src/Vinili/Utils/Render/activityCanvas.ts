
const { STATS_TITLE, stripBrokenReplacementChars, drawSolidStatTitle, formatCanvasChannelLabel, formatHours, compactNumber, computeWrappedTitleLines, drawLabel } = require("./canvasText") as typeof import("./canvasText");
const { fillRoundRect, strokeRoundRect, drawBackground } = require("./canvasShapes") as typeof import("./canvasShapes");
const { STATS_MUTED, drawTopListCard, drawTopRowsColumn } = require("./canvasPanels") as typeof import("./canvasPanels");
const { registerCanvasFonts } = require("./canvasFonts") as typeof import("./canvasFonts");
const {
  drawLabelWithEmoji,
} = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");
const { getCanvasModule, loadAvatarForStatsCanvas, drawAvatarCircle, paintChannelActivityCanvas } = require("./canvasChannel") as typeof import("./canvasChannel");
const { paintUserActivityCanvas } = require("./canvasUser") as typeof import("./canvasUser");
const { paintServerActivityCanvas } = require("./canvasServer") as typeof import("./canvasServer");




const ACTIVITY_CANVAS_GIF = String(process.env.VC_ACTIVITY_CANVAS_GIF ?? "0").trim() === "1";
const ACTIVITY_CANVAS_ANIM_FRAMES = Math.max(
  2,
  Math.min(30, Math.floor(Number(process.env.VC_ACTIVITY_CANVAS_ANIM_FRAMES ?? 12))),
);
const ACTIVITY_CANVAS_STATIC_TAIL_DELAY_MS = Math.max(
  100,
  Math.min(20000, Math.floor(Number(process.env.VC_ACTIVITY_CANVAS_STATIC_TAIL_DELAY_MS ?? 2800))),
);
const ACTIVITY_CHANNEL_ANIM_FRAMES = Math.max(
  2,
  Math.min(30, Math.floor(Number(process.env.VC_ACTIVITY_CHANNEL_ANIM_FRAMES ?? 12))),
);

async function renderChannelActivityCanvas(props?) {
  registerCanvasFonts(getCanvasModule());
  const width = 1280;
  const height = 900;
  const channelIconResolved =
    props.channelIconPrefetch ??
    (props.channelIconUrl ? await loadAvatarForStatsCanvas(props.channelIconUrl) : null);
  let GIFEncoder = null;
  try {
    GIFEncoder = require("gif-encoder-2");
  } catch {
    GIFEncoder = null;
  }

  if (!GIFEncoder || !ACTIVITY_CANVAS_GIF) {
    const canvas = getCanvasModule().createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await paintChannelActivityCanvas(ctx, props, null, channelIconResolved);
    return canvas.toBuffer("image/png");
  }

  const frameCount = ACTIVITY_CHANNEL_ANIM_FRAMES;
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(72);
  encoder.setQuality(12);
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  for (let f = 0; f < frameCount; f += 1) {
    await paintChannelActivityCanvas(ctx, props, frameCount > 1 ? f / (frameCount - 1) : 1, channelIconResolved);
    encoder.addFrame(ctx.getImageData(0, 0, width, height).data);
  }
  encoder.finish();
  return Buffer.from(encoder.out.getData());
}

async function renderUserActivityCanvas(props?) {
  registerCanvasFonts(getCanvasModule());
  const width = 1280;
  const height = 740;
  const avatarResolved =
    props.avatarPrefetch ?? (props.avatarUrl ? await loadAvatarForStatsCanvas(props.avatarUrl) : null);
  let GIFEncoder = null;
  try {
    GIFEncoder = require("gif-encoder-2");
  } catch {
    GIFEncoder = null;
  }

  if (!GIFEncoder || !ACTIVITY_CANVAS_GIF) {
    const canvas = getCanvasModule().createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await paintUserActivityCanvas(ctx, props, null, avatarResolved);
    return canvas.toBuffer("image/png");
  }

  const animFrames = ACTIVITY_CANVAS_ANIM_FRAMES;
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(72);
  encoder.setQuality(12);
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  for (let f = 0; f < animFrames; f += 1) {
    const phase = animFrames > 1 ? f / (animFrames - 1) : 1;
    await paintUserActivityCanvas(ctx, props, phase, avatarResolved);
    encoder.addFrame(ctx.getImageData(0, 0, width, height).data);
  }
  encoder.setDelay(ACTIVITY_CANVAS_STATIC_TAIL_DELAY_MS);
  await paintUserActivityCanvas(ctx, props, 1, avatarResolved);
  encoder.addFrame(ctx.getImageData(0, 0, width, height).data);
  encoder.finish();
  return Buffer.from(encoder.out.getData());
}

async function renderServerActivityCanvas(props?) {
  registerCanvasFonts(getCanvasModule());
  const width = 1280;
  const height = 940;
  const forceStatic = Boolean(props?.forceStatic);
  const guildIconResolved =
    props.guildIconPrefetch ??
    (props.guildIconUrl ? await loadAvatarForStatsCanvas(props.guildIconUrl) : null);
  let GIFEncoder = null;
  try {
    GIFEncoder = require("gif-encoder-2");
  } catch {
    GIFEncoder = null;
  }

  if (!GIFEncoder || !ACTIVITY_CANVAS_GIF || forceStatic) {
    const canvas = getCanvasModule().createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await paintServerActivityCanvas(ctx, props, null, guildIconResolved);
    return canvas.toBuffer("image/png", { compressionLevel: 1 });
  }

  const animFrames = ACTIVITY_CANVAS_ANIM_FRAMES;
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(72);
  encoder.setQuality(10);
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  for (let f = 0; f < animFrames; f += 1) {
    const phase = animFrames > 1 ? f / (animFrames - 1) : 1;
    await paintServerActivityCanvas(ctx, props, phase, guildIconResolved);
    encoder.addFrame(ctx);
  }
  encoder.setDelay(ACTIVITY_CANVAS_STATIC_TAIL_DELAY_MS);
  await paintServerActivityCanvas(ctx, props, 1, guildIconResolved);
  encoder.addFrame(ctx);
  encoder.finish();
  return Buffer.from(encoder.out.getData());
}

async function renderTopStatisticsCanvas({ guildName, guildIconUrl, lookbackDays = 14, topUsersText = [], topChannelsText = [], topUsersVoice = [], topChannelsVoice = [] }) {
  registerCanvasFonts(getCanvasModule());
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const width = 1280;
  const height = 900;
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  const topGuildLine = stripBrokenReplacementChars(guildName || "Server") || "Server";
  const topLayout = computeWrappedTitleLines(ctx, topGuildLine, 820, {
    startSize: 42,
    minSize: 18,
    weight: "700",
    maxLines: 2,
    fallback: "Server",
  });
  const nameLine1Y = 38;
  const topSubtitleY = nameLine1Y + topLayout.lines.length * topLayout.lineHeight + 12;
  const headerBandH = Math.max(96, Math.min(130, topSubtitleY + 22 - 16));
  const headerDelta = headerBandH - 96;

  fillRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  const topGuildIconResolved = guildIconUrl ? await loadAvatarForStatsCanvas(guildIconUrl) : null;
  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80, null, topGuildIconResolved);
  for (let li = 0; li < topLayout.lines.length; li += 1) {
    await drawLabelWithEmoji(ctx, topLayout.lines[li], 124, nameLine1Y + li * topLayout.lineHeight, {
      size: topLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  drawLabel(ctx, "Top Statistics", 124, topSubtitleY, {
    size: 24,
    weight: "600",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  drawSolidStatTitle(ctx, "Messaggi", 24, 146 + headerDelta, 900, 26, 15, STATS_MUTED);

  await drawTopListCard(
    ctx,
    "Top Users",
    topUsersText.map((x?) => ({
      label: x?.label || "N/A",
      value: compactNumber(x?.value || 0),
    })),
    20,
    168 + headerDelta,
    610,
    296,
    { unit: "msg", glyph: "message" },
  );

  await drawTopListCard(
    ctx,
    "Top Channels",
    topChannelsText.map((x?) => ({
      label: x?.label || "N/A",
      value: compactNumber(x?.value || 0),
    })),
    650,
    168 + headerDelta,
    610,
    296,
    { unit: "msg", glyph: "chart" },
  );

  drawSolidStatTitle(ctx, "Voice Activity", 24, 478 + headerDelta, 900, 26, 15, STATS_MUTED);

  await drawTopListCard(
    ctx,
    "Top Users",
    topUsersVoice.map((x?) => ({
      label: x?.label || "N/A",
      value: formatHours(x?.value || 0),
    })),
    20,
    500 + headerDelta,
    610,
    296,
    { unit: "h", glyph: "voice" },
  );

  await drawTopListCard(
    ctx,
    "Top Channels",
    topChannelsVoice.map((x?) => ({
      label: x?.label || "N/A",
      value: formatHours(x?.value || 0),
    })),
    650,
    500 + headerDelta,
    610,
    296,
    { unit: "h", glyph: "voice" },
  );

  drawLabel(
    ctx,
    `Lookback: Last ${safeLookback} days | Timezone: Europe/Rome`,
    24,
    844 + headerDelta,
    {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      forcePrimaryFont: true,
    },
  );

  return canvas.toBuffer("image/png");
}

async function renderTopLeaderboardPageCanvas({
  guildName,
  guildIconUrl,
  lookbackDays = 14,
  title = "Top Statistics",
  page = 1,
  totalPages = 1,
  rows = [],
  unit = "msg",
  mode = "messages",
  allTime = false,
  customFooterLine = null,
}) {
  registerCanvasFonts(getCanvasModule());
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const safePage = Math.max(1, Number(page || 1));
  const safeTotalPages = Math.max(1, Number(totalPages || 1));
  const mappedRows = (Array.isArray(rows) ? rows : []).map((row?) => ({ label: row?.label || "N/A", value: mode === "voice" ? formatHours(row?.value || 0) : compactNumber(row?.value || 0), }));
  const totalRows = mappedRows.length;
  const forceSingleWideColumn = safePage === safeTotalPages && totalRows > 0 && totalRows < 5;
  const splitAt = totalRows > 5 ? 5 : Math.ceil(totalRows / 2);
  const leftRows = forceSingleWideColumn ? mappedRows : mappedRows.slice(0, splitAt);
  const rightRows = forceSingleWideColumn ? [] : mappedRows.slice(splitAt, 10);
  const panelHeight = 560;
  const width = 1280;
  const height = 900;
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  const lbGuildLine = stripBrokenReplacementChars(guildName || "Server") || "Server";
  const lbLayout = computeWrappedTitleLines(ctx, lbGuildLine, 820, {
    startSize: 42,
    minSize: 18,
    weight: "700",
    maxLines: 2,
    fallback: "Server",
  });
  const nameLine1Y = 38;
  const lbSubtitleY = nameLine1Y + lbLayout.lines.length * lbLayout.lineHeight + 12;
  const headerBandH = Math.max(96, Math.min(130, lbSubtitleY + 22 - 16));
  const headerDelta = headerBandH - 96;
  const panelY = 216 + headerDelta;
  const footerY = 824 + headerDelta;

  fillRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  const lbGuildIconResolved = guildIconUrl ? await loadAvatarForStatsCanvas(guildIconUrl) : null;
  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80, null, lbGuildIconResolved);
  for (let li = 0; li < lbLayout.lines.length; li += 1) {
    await drawLabelWithEmoji(ctx, lbLayout.lines[li], 124, nameLine1Y + li * lbLayout.lineHeight, {
      size: lbLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  drawLabel(ctx, "Top Statistics", 124, lbSubtitleY, {
    size: 24,
    weight: "600",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  drawSolidStatTitle(ctx, title, 24, 160 + headerDelta, 1220, 32, 18, STATS_MUTED);

  fillRoundRect(ctx, 20, panelY, 1240, panelHeight, 18, "rgba(46, 55, 70, 0.92)");
  strokeRoundRect(ctx, 20, panelY, 1240, panelHeight, 18, "rgba(255,255,255,0.05)", 1);

  const panelInnerTop = panelY + 20;
  const panelInnerBottom = panelY + panelHeight - 20;
  const panelInnerHeight = panelInnerBottom - panelInnerTop;
  const computeColumnLayout = (count?) => { const safeCount = Math.max(1, Number(count || 0)); const rowGap = safeCount > 1 ? 7 : 0; const rowHeight = Math.max(46, Math.floor((panelInnerHeight - rowGap * (safeCount - 1)) / safeCount),); return { rowHeight, rowGap }; }; if (forceSingleWideColumn) {
    const singleLayout = computeColumnLayout(leftRows.length);
    await drawTopRowsColumn(ctx, leftRows, {
      x: 34,
      y: panelInnerTop,
      w: 1212,
      rankStart: (safePage - 1) * 10 + 1,
      unit,
      rowHeight: singleLayout.rowHeight,
      rowGap: singleLayout.rowGap,
    });
  } else {
    const leftLayout = computeColumnLayout(leftRows.length);
    const rightLayout = computeColumnLayout(rightRows.length);

    await drawTopRowsColumn(ctx, leftRows, {
      x: 34,
      y: panelInnerTop,
      w: 600,
      rankStart: (safePage - 1) * 10 + 1,
      unit,
      rowHeight: leftLayout.rowHeight,
      rowGap: leftLayout.rowGap,
    });
    await drawTopRowsColumn(ctx, rightRows, {
      x: 646,
      y: panelInnerTop,
      w: 600,
      rankStart: (safePage - 1) * 10 + leftRows.length + 1,
      unit,
      rowHeight: rightLayout.rowHeight,
      rowGap: rightLayout.rowGap,
    });
  }

  if (!leftRows.length && !rightRows.length) {
    drawLabel(ctx, "Nessun dato disponibile", width / 2, panelY + panelHeight / 2, {
      size: 34,
      weight: "700",
      color: STATS_MUTED,
      align: "center",
      forcePrimaryFont: true,
    });
  }

  const footerText =
    typeof customFooterLine === "string" && customFooterLine.trim()
      ? customFooterLine.trim()
      : allTime
        ? `Page ${safePage}/${safeTotalPages} | All-time | Timezone: Europe/Rome`
        : `Page ${safePage}/${safeTotalPages} | Lookback: Last ${safeLookback} days | Timezone: Europe/Rome`;
  drawLabel(ctx, footerText, 24, footerY, {
    size: 20,
    weight: "700",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  return canvas.toBuffer("image/png");
}

export = { renderUserActivityCanvas, renderServerActivityCanvas, renderChannelActivityCanvas, renderTopStatisticsCanvas, renderTopLeaderboardPageCanvas, formatCanvasChannelLabel, prefetchStatsCanvasAvatar: loadAvatarForStatsCanvas };

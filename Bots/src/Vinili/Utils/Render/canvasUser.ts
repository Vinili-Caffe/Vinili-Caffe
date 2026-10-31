/** Immagini attività: scheda di un utente. */
const { STATS_TITLE, sanitizeDisplayLabel, prepareCanvasHeaderText, dateTextCompact, formatHours, compactNumber, computeWrappedTitleLines, drawLabel } = require("./canvasText") as typeof import("./canvasText");
const { fillRoundRect, strokeRoundRect, drawBackground, drawDateBadgeStat } = require("./canvasShapes") as typeof import("./canvasShapes");
const { drawMetricPanel, drawTopCard } = require("./canvasPanels") as typeof import("./canvasPanels");
const { drawChart } = require("./canvasCharts") as typeof import("./canvasCharts");
const { prepareVisibleText, drawLabelWithEmoji } = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");
const { STATS_GAP, STATS_HEADER_BADGE_W, drawAvatarCircle } = require("./canvasChannel") as typeof import("./canvasChannel");

async function paintUserActivityCanvas(
  ctx,
  {
    guildName,
    userTag,
    displayName,
    avatarUrl,
    createdOn,
    joinedOn,
    lookbackDays,
    windows,
    ranks,
    topChannelsText,
    topChannelsVoice,
    chart,
  },
  animationPhase = 0,
  avatarResolved = null,
) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const lookbackKey = `d${safeLookback}`;
  const lookbackWindow = windows?.[lookbackKey] || windows?.d14 || {};
  const width = 1280;
  const height = 740;
  const rightColW = STATS_HEADER_BADGE_W;
  const rightColX = width - 20 - rightColW;
  const avatarSize = 96;
  const avatarX = 28;
  const textLeft = avatarX + avatarSize + 20;
  const guildTitleMax = Math.max(320, rightColX - textLeft - 16);

  drawBackground(ctx, width, height);

  const displayFull = sanitizeDisplayLabel(String(displayName || userTag || "").trim()) || "—";
  const displayLayout = computeWrappedTitleLines(ctx, displayFull, guildTitleMax, {
    startSize: 58,
    minSize: 20,
    weight: "700",
    maxLines: 2,
    fallback: "—",
  });
  const guildPrepared = prepareVisibleText(prepareCanvasHeaderText(guildName, "Server"));
  const guildLayout = computeWrappedTitleLines(ctx, guildPrepared, guildTitleMax, {
    startSize: 26,
    minSize: 14,
    weight: "600",
    maxLines: 3,
    fallback: "Server",
  });
  const displayLineH = Math.max(22, Math.round(displayLayout.size * 1.06));
  const guildGap = 3;
  const guildLineH = Math.max(18, Math.round(guildLayout.size * 1.06));
  const displayBlockH = displayLayout.lines.length * displayLineH;
  const guildBlockH = guildLayout.lines.length * guildLineH;
  const textBlockH = displayBlockH + guildGap + guildBlockH;
  const badgeH = 58;
  const badgeGap = 8;
  const badgeStackH = badgeH + badgeGap + badgeH;
  const headerPadY = 10;
  const headerBarH = Math.max(textBlockH + headerPadY * 2, badgeStackH + headerPadY * 2, avatarSize + headerPadY * 2);
  const textBlockTop = 16 + headerPadY;
  const avatarY = 16 + Math.max(0, (headerBarH - avatarSize) / 2);
  const userDateBadgeOpts = {
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

  fillRoundRect(ctx, 20, 16, 1240, headerBarH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBarH, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, avatarUrl, avatarX, avatarY, avatarSize, animationPhase, avatarResolved);
  for (let li = 0; li < displayLayout.lines.length; li += 1) {
    const y = textBlockTop + displayLineH / 2 + li * displayLineH;
    await drawLabelWithEmoji(ctx, displayLayout.lines[li], textLeft, y, {
      size: displayLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  for (let li = 0; li < guildLayout.lines.length; li += 1) {
    const y = textBlockTop + displayBlockH + guildGap + guildLineH / 2 + li * guildLineH;
    await drawLabelWithEmoji(ctx, guildLayout.lines[li], textLeft, y, {
      size: guildLayout.size,
      weight: "600",
      color: "#d2dce8",
      forcePrimaryFont: true,
    });
  }

  const badgeColY = 16 + Math.max(4, (headerBarH - badgeStackH) / 2);
  drawDateBadgeStat(ctx, "Created", dateTextCompact(createdOn), rightColX, badgeColY, rightColW, userDateBadgeOpts);
  drawDateBadgeStat(ctx, "Joined", dateTextCompact(joinedOn), rightColX, badgeColY + badgeH + badgeGap, rightColW, userDateBadgeOpts);

  const userMetricsTop = 16 + headerBarH + 14;
  const userTopRowY = userMetricsTop + 236 + STATS_GAP;

  drawMetricPanel(
    ctx,
    "Server Ranks",
    [
      { label: "Text", value: `#${ranks?.text || "-"}` },
      { label: "Voice", value: `#${ranks?.voice || "-"}` },
    ],
    20,
    userMetricsTop,
    400,
    236,
    { glyph: "trophy", denseRows: true },
  );

  drawMetricPanel(
    ctx,
    "Messaggi",
    [
      { label: "1d", value: `${compactNumber(windows?.d1?.text)} msg` },
      { label: "7d", value: `${compactNumber(windows?.d7?.text)} msg` },
      {
        label: `${safeLookback}d`,
        value: `${compactNumber(lookbackWindow?.text)} msg`,
      },
    ],
    440,
    userMetricsTop,
    400,
    236,
    { glyph: "message", denseRows: true },
  );

  drawMetricPanel(
    ctx,
    "Voice Activity",
    [
      { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds)} h` },
      { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds)} h` },
      {
        label: `${safeLookback}d`,
        value: `${formatHours(lookbackWindow?.voiceSeconds)} h`,
      },
    ],
    860,
    userMetricsTop,
    400,
    236,
    { glyph: "voice", denseRows: true },
  );

  await drawTopCard(
    ctx,
    "Top Channels",
    {
      label: topChannelsText?.[0]?.label || "#-",
      value: compactNumber(topChannelsText?.[0]?.value || 0),
      unit: "msg",
    },
    {
      label: topChannelsVoice?.[0]?.label || "#-",
      value: formatHours(topChannelsVoice?.[0]?.value || 0),
      unit: "h",
    },
    20,
    userTopRowY,
    610,
    242,
    { showRank: false, glyph: "chart", dense: true },
  );

  drawChart(ctx, chart, 650, userTopRowY, 610, 242, {
    glyph: "chart",
    animationPhase,
  });
  drawLabel(ctx, `Lookback: Last ${safeLookback} days`, 32, height - 22, {
    size: 22,
    weight: "700",
    color: "#b9c7d9",
    forcePrimaryFont: true,
  });
}

export = { paintUserActivityCanvas };

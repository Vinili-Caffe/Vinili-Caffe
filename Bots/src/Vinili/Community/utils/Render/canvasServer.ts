/** Immagini attività: scheda del server. */
const { prepareCanvasHeaderText, dateTextCompact, formatHours, compactNumber, getFittedFontSize, computeWrappedTitleLines, drawLabel } = require("./canvasText") as typeof import("./canvasText");
const { fillRoundRect, strokeRoundRect, drawBackground, drawDateBadgeStat } = require("./canvasShapes") as typeof import("./canvasShapes");
const { drawMetricPanel, drawTopCard } = require("./canvasPanels") as typeof import("./canvasPanels");
const { drawChart } = require("./canvasCharts") as typeof import("./canvasCharts");
const { prepareVisibleText, drawLabelWithEmoji } = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");
const { STATS_HEADER_BADGE_W, drawAvatarCircle } = require("./canvasChannel") as typeof import("./canvasChannel");

async function paintServerActivityCanvas(
  ctx,
  {
    guildName,
    guildIconUrl,
    createdOn,
    invitedBotOn,
    lookbackDays,
    windows,
    topUsersText,
    topUsersVoice,
    topChannelsText,
    topChannelsVoice,
    chart,
  },
  animationPhase = 0,
  guildIconResolved = null,
) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const lookbackKey = `d${safeLookback}`;
  const lookbackWindow = windows?.[lookbackKey] || windows?.d14 || {};
  const width = 1280;
  const height = 940;

  drawBackground(ctx, width, height);

  const avatarSize = 96;
  const avatarX = 28;
  const textLeft = avatarX + avatarSize + 20;
  const statBadgeW = STATS_HEADER_BADGE_W;
  const badgeX = width - 20 - statBadgeW;
  const nameMaxW = Math.max(320, badgeX - textLeft - 16);
  const guildPrepared = prepareVisibleText(prepareCanvasHeaderText(guildName, "Server"));
  const guildLayout = computeWrappedTitleLines(ctx, guildPrepared, nameMaxW, {
    startSize: 50,
    minSize: 16,
    weight: "700",
    maxLines: 3,
    fallback: "Server",
  });
  const subtitleStr = "Server Overview";
  const subSize = getFittedFontSize(ctx, subtitleStr, nameMaxW, 22, 14, "600");
  const guildLineH = Math.max(20, Math.round(guildLayout.size * 1.06));
  const guildBlockH = guildLayout.lines.length * guildLineH;
  const titleSubGap = 3;
  const subLineH = Math.max(16, Math.round(subSize * 1.04));
  const textBlockH = guildBlockH + titleSubGap + subLineH;
  const badgeH = 58;
  const badgeGap = 8;
  const badgeStackH = badgeH + badgeGap + badgeH;
  const headerPadY = 10;
  const headerBandH = Math.max(textBlockH + headerPadY * 2, badgeStackH + headerPadY * 2, avatarSize + headerPadY * 2);
  const textBlockTop = 16 + headerPadY;
  const subtitleY = textBlockTop + guildBlockH + titleSubGap + subLineH / 2;
  const avatarY = 16 + Math.max(0, (headerBandH - avatarSize) / 2);
  const badgeColY = 16 + headerPadY;
  const serverDateBadgeOpts = {
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

  fillRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, guildIconUrl, avatarX, avatarY, avatarSize, animationPhase, guildIconResolved);
  for (let li = 0; li < guildLayout.lines.length; li += 1) {
    const y = textBlockTop + guildLineH / 2 + li * guildLineH;
    await drawLabelWithEmoji(ctx, guildLayout.lines[li], textLeft, y, {
      size: guildLayout.size,
      weight: "700",
      color: "#e8eef5",
      forcePrimaryFont: true,
    });
  }
  drawLabel(ctx, subtitleStr, textLeft, subtitleY, {
    size: subSize,
    weight: "600",
    color: "#a8b6c8",
    forcePrimaryFont: true,
  });

  drawDateBadgeStat(ctx, "Created", dateTextCompact(createdOn), badgeX, badgeColY, statBadgeW, serverDateBadgeOpts);
  drawDateBadgeStat(ctx, "Joined", dateTextCompact(invitedBotOn), badgeX, badgeColY + badgeH + badgeGap, statBadgeW, serverDateBadgeOpts);

  const metricsTop = 16 + headerBandH + 14;

  drawMetricPanel(
    ctx,
    "Messaggi",
    [
      { label: "1d", value: `${compactNumber(windows?.d1?.text)} messages` },
      { label: "7d", value: `${compactNumber(windows?.d7?.text)} messages` },
      {
        label: `${safeLookback}d`,
        value: `${compactNumber(lookbackWindow?.text)} messages`,
      },
    ],
    20,
    metricsTop,
    400,
    220,
    { denseRows: true, glyph: "message" },
  );

  drawMetricPanel(
    ctx,
    "Voice Activity",
    [
      { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds)} hours` },
      { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds)} hours` },
      {
        label: `${safeLookback}d`,
        value: `${formatHours(lookbackWindow?.voiceSeconds)} hours`,
      },
    ],
    440,
    metricsTop,
    400,
    220,
    { denseRows: true, glyph: "voice" },
  );

  drawMetricPanel(
    ctx,
    "Contributors",
    [
      {
        label: "1d",
        value: `${Number(windows?.d1?.contributors || 0)} members`,
      },
      {
        label: "7d",
        value: `${Number(windows?.d7?.contributors || 0)} members`,
      },
      {
        label: `${safeLookback}d`,
        value: `${Number(lookbackWindow?.contributors || 0)} members`,
      },
    ],
    860,
    metricsTop,
    400,
    220,
    { denseRows: true, glyph: "users" },
  );

  const topRowY = metricsTop + 220 + 22;

  await drawTopCard(
    ctx,
    "Top Members",
    {
      label: topUsersText?.[0]?.label || "-",
      value: compactNumber(topUsersText?.[0]?.value || 0),
      unit: "messages",
    },
    {
      label: topUsersVoice?.[0]?.label || "-",
      value: formatHours(topUsersVoice?.[0]?.value || 0),
      unit: "hours",
    },
    20,
    topRowY,
    600,
    220,
    { showRank: false, dense: true, glyph: "trophy" },
  );

  await drawTopCard(
    ctx,
    "Top Channels",
    {
      label: topChannelsText?.[0]?.label || "#-",
      value: compactNumber(topChannelsText?.[0]?.value || 0),
      unit: "messages",
    },
    {
      label: topChannelsVoice?.[0]?.label || "#-",
      value: formatHours(topChannelsVoice?.[0]?.value || 0),
      unit: "hours",
    },
    640,
    topRowY,
    620,
    220,
    { showRank: false, dense: true, glyph: "chart" },
  );

  const chartY = topRowY + 220 + 18;
  drawChart(ctx, chart, 20, chartY, 1240, 240, { animationPhase, glyph: "chart" });
  drawLabel(ctx, `Lookback: Last ${safeLookback} days`, 32, height - 22, {
    size: 22,
    weight: "700",
    color: "#b9c7d9",
    forcePrimaryFont: true,
  });
}

export = { paintServerActivityCanvas };

/** Immagini attività: riquadri dei numeri e delle classifiche. */
const { STATS_TITLE, sanitizeDisplayLabel, fitText, drawLabel } = require("./canvasText") as typeof import("./canvasText");
const { STATS_BODY, STATS_VALUE, fillRoundRect, strokeRoundRect, drawPanelHeaderGlyph } = require("./canvasShapes") as typeof import("./canvasShapes");
const { prepareVisibleText, drawLabelWithEmoji, textWidth } = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");

const STATS_MUTED = "#97a6b6";

function drawMetricPanel(ctx?, title?, rows?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 22, {
    size: 24,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }

  const startY = y + 40;
  const bottomPad = options.denseRows ? 6 : 10;
  const innerPad = options.denseRows ? 4 : 8;
  const periodBoxW = options.denseRows ? 62 : 80;
  const rowGap = options.denseRows ? 5 : 8;
  const n = rows.length;
  const rowsAreaH = Math.max(0, h - (startY - y) - bottomPad);
  const gapsTotal = n > 1 ? (n - 1) * rowGap : 0;
  const totalForRows = Math.max(0, rowsAreaH - gapsTotal);
  const baseRowH = n > 0 ? Math.floor(totalForRows / n) : 50;
  const remPx = n > 0 ? totalForRows - baseRowH * n : 0;
  const labelFont = Math.min(
    24,
    Math.max(18, Math.round((baseRowH + (remPx > 0 ? 1 : 0)) * 0.4)),
  );
  let rowCursor = startY;
  for (let i = 0; i < n; i += 1) {
    const rowH = baseRowH + (i < remPx ? 1 : 0);
    const rowY = rowCursor;
    rowCursor += rowH + (i < n - 1 ? rowGap : 0);
    const rowInnerLeft = x + innerPad;
    const rowInnerW = w - innerPad * 2;
    const rowRx = rowH >= 52 ? 12 : 11;
    fillRoundRect(ctx, rowInnerLeft, rowY, rowInnerW, rowH, rowRx, "rgba(19, 26, 37, 0.92)");
    fillRoundRect(ctx, rowInnerLeft, rowY, periodBoxW, rowH, rowRx, "rgba(10, 16, 27, 0.95)");
    const midY = rowY + rowH / 2;
    drawLabel(ctx, rows[i].label, rowInnerLeft + periodBoxW / 2, midY, {
      size: labelFont,
      weight: "700",
      align: "center",
      color: STATS_BODY,
      useNumericFont: true,
    });
    const valueMaxW = rowInnerW - periodBoxW - rowGap - 10;
    const valueRightX = rowInnerLeft + rowInnerW - 6;
    drawLabel(
      ctx,
      fitText(ctx, rows[i].value, valueMaxW, labelFont, "700"),
      valueRightX,
      midY,
      { size: labelFont, weight: "700", align: "right", color: STATS_VALUE, useNumericFont: true },
    );
  }
}

function drawBigLookbackPanel(ctx?, title?, bigValue?, subtitle?, x?, y?, w?, h?) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 22, {
    size: 21,
    weight: "700",
    color: "#e2e7ef",
    forcePrimaryFont: true,
  });
  drawPanelHeaderGlyph(ctx, "bolt", x + w - 18, y + 24);
  const innerPad = 14;
  const innerX = x + innerPad;
  const innerY = y + 46;
  const innerW = w - innerPad * 2;
  const innerH = h - 46 - innerPad;
  fillRoundRect(ctx, innerX, innerY, innerW, innerH, 14, "rgba(28, 36, 50, 0.95)");
  strokeRoundRect(ctx, innerX, innerY, innerW, innerH, 14, "rgba(255,255,255,0.04)", 1);
  const centerX = x + w / 2;
  const contentY = y + h / 2 + 4;
  drawLabel(ctx, String(bigValue), centerX, contentY - 14, {
    size: 44,
    weight: "800",
    color: "#eef3fb",
    align: "center",
    baseline: "middle",
    useNumericFont: true,
  });
  drawLabel(ctx, String(subtitle || ""), centerX, contentY + 20, {
    size: 18,
    weight: "600",
    color: "#8b95a5",
    align: "center",
    baseline: "middle",
  });
}

function drawMetricPanelStatbotRows(ctx?, title?, rows?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 22, {
    size: 21,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 18,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }
  const rowHeight = 50;
  const startY = y + 42;
  const innerPad = 8;
  const periodBoxW = 80;
  const rowGap = 8;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || { period: "-", value: "-" };
    const rowY = startY + i * rowHeight;
    const rowInnerLeft = x + innerPad;
    const rowInnerW = w - innerPad * 2;
    fillRoundRect(ctx, rowInnerLeft, rowY, rowInnerW, 50, 11, "rgba(19, 26, 37, 0.92)");
    fillRoundRect(ctx, rowInnerLeft, rowY, periodBoxW, 50, 11, "rgba(10, 16, 27, 0.95)");
    drawLabel(ctx, row.period, rowInnerLeft + periodBoxW / 2, rowY + 25, {
      size: 22,
      weight: "700",
      align: "center",
      color: STATS_BODY,
      useNumericFont: true,
    });
    const valueMaxW = rowInnerW - periodBoxW - rowGap - 10;
    const valueRightX = rowInnerLeft + rowInnerW - 6;
    drawLabel(ctx, fitText(ctx, row.value, valueMaxW, 20, "700"), valueRightX, rowY + 25, {
      size: 20,
      weight: "600",
      align: "right",
      color: STATS_VALUE,
      useNumericFont: true,
    });
  }
}

async function drawTopListCardStatbotStyle(ctx?, title?, rows?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  const unit = String(options.unit || "");
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 22, {
    size: 21,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 18,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }
  const rowHeight = 56;
  const startY = y + 44;
  const rp = 10;
  for (let i = 0; i < 3; i += 1) {
    const row = rows?.[i] || { label: "—", value: "0" };
    const rowY = startY + i * rowHeight;
    const valueText = unit ? `${row.value} ${unit}` : String(row.value ?? "0");
    const labelClean = sanitizeDisplayLabel(prepareVisibleText(row.label || "—"));
    const vw = textWidth(ctx, valueText, 22, "700");
    const labelMax = Math.max(100, w - rp * 2 - Math.min(200, vw + 28));
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, labelClean, labelMax, 22, "700"),
      x + rp,
      rowY + rowHeight / 2,
      { size: 22, weight: "700", color: STATS_BODY, align: "left" },
    );
    drawLabel(ctx, valueText, x + w - rp, rowY + rowHeight / 2, {
      size: 22,
      weight: "700",
      align: "right",
      color: STATS_VALUE,
      useNumericFont: true,
    });
  }
}

async function drawTopCard(ctx?, title?, first?, second?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  const showRank = options.showRank !== false;
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 12, y + 22, {
    size: 24,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }

  const edge = options.dense ? 6 : 8;
  const titleBand = 40;
  const bottomPad = options.dense ? 6 : 10;
  const rowGap = options.dense ? 8 : 10;
  const rowsAreaH = Math.max(0, h - titleBand - bottomPad);
  const gapsTotal = rowGap;
  const totalForRows = Math.max(0, rowsAreaH - gapsTotal);
  const baseRowH = Math.floor(totalForRows / 2);
  const remPx = totalForRows - baseRowH * 2;
  const row1H = baseRowH + (remPx > 0 ? 1 : 0);
  const row2H = baseRowH + (remPx > 1 ? 1 : 0);
  const chipW = w - edge * 2;
  let chipY = y + titleBand;
  await drawTopChip(
    ctx,
    first?.label || "-",
    first?.value || "-",
    first?.unit || "",
    1,
    x + edge,
    chipY,
    chipW,
    row1H,
    { showRank },
  );
  chipY += row1H + rowGap;
  await drawTopChip(
    ctx,
    second?.label || "-",
    second?.value || "-",
    second?.unit || "",
    2,
    x + edge,
    chipY,
    chipW,
    row2H,
    { showRank },
  );
}

async function drawTopChip(ctx?, label?, value?, unit?, position?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  const showRank = options.showRank !== false;
  const rowRx = h >= 58 ? 14 : 12;
  fillRoundRect(ctx, x, y, w, h, rowRx, "rgba(12, 18, 28, 0.95)");
  const safeLabel = sanitizeDisplayLabel(prepareVisibleText(label));
  const valueStr = `${String(value ?? "")}${unit ? ` ${unit}` : ""}`;
  const labelSize = Math.min(26, Math.max(18, Math.round(h * 0.34)));
  const valueSize = Math.min(34, Math.max(20, Math.round(h * 0.4)));
  const rankSize = Math.min(48, Math.max(30, Math.round(h * 0.58)));
  const vw = textWidth(ctx, valueStr, valueSize, "800");
  const labelMax = showRank
    ? w - 360
    : Math.max(
        Math.floor(w * 0.5),
        w - Math.min(Math.floor(w * 0.46), vw + 24),
      );
  const valueRight = showRank ? x + w - 112 : x + w - 10;
  const labelX = x + 14;
  const hashMatch = safeLabel.match(/^#+\s*(.*)$/s);
  if (hashMatch) {
    const channelName = sanitizeDisplayLabel(prepareVisibleText(hashMatch[1] || "—"));
    const hashW = textWidth(ctx, "#", labelSize, "800");
    drawLabel(ctx, "#", labelX, y + h / 2, {
      size: labelSize,
      weight: "800",
      color: STATS_MUTED,
      align: "left",
      forcePrimaryFont: true,
    });
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, channelName, Math.max(80, labelMax - hashW - 8), labelSize, "700"),
      labelX + hashW + 8,
      y + h / 2,
      { size: labelSize, weight: "700", color: STATS_BODY, align: "left" },
    );
  } else {
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, safeLabel, labelMax, labelSize, "700"),
      labelX,
      y + h / 2,
      { size: labelSize, weight: "700", color: STATS_BODY, align: "left" },
    );
  }
  drawLabel(ctx, valueStr, valueRight, y + h / 2, {
    size: valueSize,
    weight: "800",
    align: "right",
    color: STATS_VALUE,
    useNumericFont: true,
  });
  if (showRank) {
    drawLabel(ctx, `#${Number(position || 0) || "-"}`, x + w - 10, y + h / 2, {
      size: rankSize,
      weight: "900",
      align: "right",
      color: STATS_TITLE,
      useNumericFont: true,
    });
  }
}

async function drawTopListCard(ctx?, title?, rows?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  const unit = String(options.unit || "");
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 12, y + 22, {
    size: 21,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }

  const rowHeight = 62;
  const gap = 6;
  const startY = y + 42;

  const rowPad = 8;
  for (let i = 0; i < 3; i += 1) {
    const row = rows?.[i] || { label: "N/A", value: 0 };
    const rowY = startY + i * (rowHeight + gap);
    fillRoundRect(ctx, x + rowPad, rowY, w - rowPad * 2, rowHeight, 12, "rgba(12, 18, 28, 0.95)");
    fillRoundRect(ctx, x + rowPad, rowY, 74, rowHeight, 12, "rgba(10, 16, 27, 0.95)");

    drawLabel(ctx, String(i + 1), x + rowPad + 37, rowY + rowHeight / 2, {
      size: 22,
      weight: "800",
      color: STATS_BODY,
      align: "center",
      useNumericFont: true,
    });

    const valueText = unit ? `${row.value} ${unit}` : String(row.value ?? 0);
    const vw = textWidth(ctx, valueText, 24, "800");
    const labelMax = Math.max(120, w - rowPad * 2 - 74 - Math.min(200, vw + 36));
    const labelClean = sanitizeDisplayLabel(prepareVisibleText(row.label || "N/A"));
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, labelClean, labelMax, 24, "700"),
      x + rowPad + 74 + 10,
      rowY + rowHeight / 2,
      { size: 24, weight: "700", color: STATS_BODY, align: "left" },
    );

    const valueWidth = Math.min(w - rowPad * 2 - 74, Math.max(110, vw + 26),);
    fillRoundRect(
      ctx,
      x + w - rowPad - valueWidth,
      rowY + 10,
      valueWidth,
      rowHeight - 20,
      10,
      "rgba(30, 39, 54, 0.95)",
    );
    drawLabel(ctx, valueText, x + w - rowPad - 10, rowY + rowHeight / 2, {
      size: 24,
      weight: "800",
      color: STATS_VALUE,
      align: "right",
      useNumericFont: true,
    });
  }
}

async function drawTopRowsColumn(ctx, rows, { x, y, w, rankStart = 1, unit = "msg", rowHeight = 62, rowGap = 8 }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return;
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    const rowY = y + i * (rowHeight + rowGap);
    fillRoundRect(ctx, x, rowY, w, rowHeight, 12, "rgba(12, 18, 28, 0.95)");
    fillRoundRect(ctx, x, rowY, 72, rowHeight, 12, "rgba(10, 16, 27, 0.95)");

    const rank = rankStart + i;
    drawLabel(ctx, String(rank), x + 36, rowY + rowHeight / 2, {
      size: 22,
      weight: "800",
      color: STATS_BODY,
      align: "center",
      useNumericFont: true,
    });

    const labelMaxWidth = w - 260;
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, sanitizeDisplayLabel(prepareVisibleText(row.label || "N/A")), labelMaxWidth, 24, "700"),
      x + 90,
      rowY + rowHeight / 2,
      { size: 24, weight: "700", color: STATS_BODY, align: "left" },
    );

    const valueText = `${row.value} ${unit}`;
    const valueWidth = Math.min(w - 240, Math.max(110, textWidth(ctx, valueText, 24, "800") + 26),);
    fillRoundRect(
      ctx,
      x + w - valueWidth - 10,
      rowY + 9,
      valueWidth,
      rowHeight - 18,
      10,
      "rgba(30, 39, 54, 0.95)",
    );
    drawLabel(ctx, valueText, x + w - 18, rowY + rowHeight / 2, {
      size: 24,
      weight: "800",
      color: STATS_VALUE,
      align: "right",
      useNumericFont: true,
    });
  }
}

export = { STATS_MUTED, drawMetricPanel, drawTopCard, drawTopListCard, drawTopRowsColumn };

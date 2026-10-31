/** Immagini attività: grafici di messaggi e vocale. */
const { STATS_TITLE, drawSolidStatTitle, drawLabel } = require("./canvasText") as typeof import("./canvasText");
const { fillRoundRect, strokeRoundRect, drawPanelHeaderGlyph } = require("./canvasShapes") as typeof import("./canvasShapes");
const { STATS_MUTED } = require("./canvasPanels") as typeof import("./canvasPanels");

const CHART_LINE_MSG = "#7ab89a";
const CHART_LINE_VOICE = "#a894c4";

function drawChart(ctx?, chart?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  const animPhase =
    typeof options.animationPhase === "number" && Number.isFinite(options.animationPhase)
      ? options.animationPhase
      : null;
  const pulse = animPhase == null ? 0 : Math.sin(animPhase * Math.PI * 2);
  const rawReveal = animPhase == null ? 1 : Math.min(1, Math.max(0, animPhase));
  const lineReveal = rawReveal >= 0.998 ? 1 : rawReveal;

  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);

  drawSolidStatTitle(ctx, "Charts", x + 14, y + 24, w - 200, 24, 14, STATS_TITLE);
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
  ctx.fillStyle = CHART_LINE_MSG;
  ctx.beginPath();
  ctx.arc(x + w - 218, y + 24, 4, 0, Math.PI * 2);
  ctx.fill();
  drawLabel(ctx, "Msg", x + w - 206, y + 24, {
    size: 16,
    weight: "700",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });
  ctx.fillStyle = CHART_LINE_VOICE;
  ctx.beginPath();
  ctx.arc(x + w - 108, y + 24, 4, 0, Math.PI * 2);
  ctx.fill();
  drawLabel(ctx, "Voice", x + w - 96, y + 24, {
    size: 16,
    weight: "700",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  const px = x + 14;
  const py = y + 42;
  const pw = w - 28;
  const ph = h - 56;
  const plotPadX = 8;
  const innerLeft = px + plotPadX;
  const innerW = pw - plotPadX * 2;
  fillRoundRect(ctx, px, py, pw, ph, 12, "rgba(25, 34, 49, 0.98)");
  const points = Array.isArray(chart) ? chart : [];
  if (points.length < 2) return;
  const msgValues = points.map((p?) => Number(p?.text || 0));
  const voiceValues = points.map((p?) => Number(p?.voiceSeconds || 0) / 3600);
  const maxMsg = Math.max(1, ...msgValues);
  const maxVoice = Math.max(1, ...voiceValues);

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const yy = py + ((ph - 10) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(innerLeft, yy);
    ctx.lineTo(innerLeft + innerW, yy);
    ctx.stroke();
  }

  const nPt = points.length;
  const projectX = (idx?) =>
    nPt < 2 ? innerLeft : innerLeft + (idx / (nPt - 1)) * innerW;
  const projectY = (value?, seriesMax?) => py + ph - (value / Math.max(1, seriesMax)) * (ph - 16) - 8;
  const baseY = py + ph - 6;
  const clipRight = innerLeft + innerW * lineReveal;

  function fillUnderLine(strokeHex?, fillTopRgba?, values?, maxV?) {
    const pts = values.map((v?, i?) => ({
      x: projectX(i),
      y: projectY(v, maxV),
    }));
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerLeft, py, innerW * lineReveal, ph);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, baseY);
    pts.forEach((p?) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, baseY);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, py, 0, baseY);
    g.addColorStop(0, fillTopRgba);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerLeft, py, innerW * lineReveal, ph);
    ctx.clip();
    ctx.shadowColor = strokeHex;
    ctx.shadowBlur = 8 + (animPhase == null ? 0 : pulse * 3);
    ctx.strokeStyle = strokeHex;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    pts.forEach((p?, i?) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  fillUnderLine(CHART_LINE_MSG, "rgba(122, 184, 154, 0.18)", msgValues, maxMsg);
  fillUnderLine(CHART_LINE_VOICE, "rgba(168, 148, 196, 0.16)", voiceValues, maxVoice);

  const ptsMsg = msgValues.map((v?, i?) => ({
    x: projectX(i),
    y: projectY(v, maxMsg),
  }));
  const ptsVoice = voiceValues.map((v?, i?) => ({
    x: projectX(i),
    y: projectY(v, maxVoice),
  }));
  const dotR = 3 + (animPhase == null ? 0 : pulse * 0.5);
  [...ptsMsg, ...ptsVoice].forEach((p?, idx?) => {
    if (p.x > clipRight + 0.5) return;
    const col = idx < ptsMsg.length ? CHART_LINE_MSG : CHART_LINE_VOICE;
    ctx.fillStyle = "#f0f4f8";
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  });
}

function drawVoiceOnlyChart(ctx?, chart?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  const animPhase =
    typeof options.animationPhase === "number" && Number.isFinite(options.animationPhase)
      ? options.animationPhase
      : null;
  const pulse = animPhase == null ? 0 : Math.sin(animPhase * Math.PI * 2);
  const rawReveal = animPhase == null ? 1 : Math.min(1, Math.max(0, animPhase));
  const lineReveal = rawReveal >= 0.998 ? 1 : rawReveal;

  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawSolidStatTitle(ctx, "Voice", x + 14, y + 24, w - 60, 24, 14, STATS_TITLE);
  drawPanelHeaderGlyph(ctx, "voice", x + w - 18, y + 24);
  const px = x + 14;
  const py = y + 42;
  const pw = w - 28;
  const ph = h - 56;
  const plotPadX = 8;
  const innerLeft = px + plotPadX;
  const innerW = pw - plotPadX * 2;
  fillRoundRect(ctx, px, py, pw, ph, 12, "rgba(25, 34, 49, 0.98)");
  const points = Array.isArray(chart) ? chart : [];
  if (points.length < 2) return;
  const nPt = points.length;
  const voiceValues = points.map((p?) => Number(p?.voiceSeconds || 0) / 3600);
  const maxVoice = Math.max(0.01, ...voiceValues);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const yy = py + ((ph - 10) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(innerLeft, yy);
    ctx.lineTo(innerLeft + innerW, yy);
    ctx.stroke();
  }
  const projectX = (idx?) =>
    nPt < 2 ? innerLeft : innerLeft + (idx / (nPt - 1)) * innerW;
  const projectY = (value?) => py + ph - (value / maxVoice) * (ph - 16) - 8;
  const baseY = py + ph - 6;
  const pts = voiceValues.map((v?, i?) => ({ x: projectX(i), y: projectY(v) }));
  const clipRight = innerLeft + innerW * lineReveal;
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, py, innerW * lineReveal, ph);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, baseY);
  pts.forEach((p?) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, baseY);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, py, 0, baseY);
  g.addColorStop(0, "rgba(168, 148, 196, 0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, py, innerW * lineReveal, ph);
  ctx.clip();
  ctx.shadowColor = CHART_LINE_VOICE;
  ctx.shadowBlur = 8 + (animPhase == null ? 0 : pulse * 3);
  ctx.strokeStyle = CHART_LINE_VOICE;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p?, i?) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
  const dotR = 3 + (animPhase == null ? 0 : pulse * 0.5);
  ctx.fillStyle = "#f0f4f8";
  pts.forEach((p?) => {
    if (p.x > clipRight + 0.5) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CHART_LINE_VOICE;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  });
}

function drawMessageOnlyChart(ctx?, chart?, x?, y?, w?, h?, options: Record<string, any> = {}) {
  const animPhase =
    typeof options.animationPhase === "number" && Number.isFinite(options.animationPhase)
      ? options.animationPhase
      : null;
  const pulse = animPhase == null ? 0 : Math.sin(animPhase * Math.PI * 2);
  const lineReveal = animPhase == null ? 1 : Math.min(1, Math.max(0, animPhase));

  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawSolidStatTitle(ctx, "Messaggi", x + 14, y + 24, w - 60, 24, 14, STATS_TITLE);
  drawPanelHeaderGlyph(ctx, "message", x + w - 18, y + 24);
  const px = x + 14;
  const py = y + 42;
  const pw = w - 28;
  const ph = h - 56;
  const plotPadX = 8;
  const innerLeft = px + plotPadX;
  const innerW = pw - plotPadX * 2;
  fillRoundRect(ctx, px, py, pw, ph, 12, "rgba(25, 34, 49, 0.98)");
  const points = Array.isArray(chart) ? chart : [];
  if (points.length < 2) return;
  const nPt = points.length;
  const textValues = points.map((p?) => Number(p?.text || 0));
  const maxText = Math.max(0.01, ...textValues);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const yy = py + ((ph - 10) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(innerLeft, yy);
    ctx.lineTo(innerLeft + innerW, yy);
    ctx.stroke();
  }
  const projectX = (idx?) =>
    nPt < 2 ? innerLeft : innerLeft + (idx / (nPt - 1)) * innerW;
  const projectY = (value?) => py + ph - (value / maxText) * (ph - 16) - 8;
  const baseY = py + ph - 6;
  const pts = textValues.map((v?, i?) => ({ x: projectX(i), y: projectY(v) }));
  const clipRight = innerLeft + innerW * lineReveal;
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, py, innerW * lineReveal, ph);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, baseY);
  pts.forEach((p?) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, baseY);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, py, 0, baseY);
  g.addColorStop(0, "rgba(122, 184, 154, 0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, py, innerW * lineReveal, ph);
  ctx.clip();
  ctx.shadowColor = CHART_LINE_MSG;
  ctx.shadowBlur = 8 + (animPhase == null ? 0 : pulse * 3);
  ctx.strokeStyle = CHART_LINE_MSG;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p?, i?) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
  const dotR = 3 + (animPhase == null ? 0 : pulse * 0.5);
  ctx.fillStyle = "#f0f4f8";
  pts.forEach((p?) => {
    if (p.x > clipRight + 0.5) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CHART_LINE_MSG;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  });
}

export = { drawChart };

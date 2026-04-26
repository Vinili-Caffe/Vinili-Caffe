const canvasModule = require("canvas");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const { createCanvas } = canvasModule;
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const { safeLoadImage } = require("./safeLoadImage");

function hashSeed(source) {
  let h = 2166136261;
  const text = String(source || "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function pickFrom(arr, seed) {
  const a = Array.isArray(arr) ? arr : [];
  if (!a.length) return "";
  return a[seed % a.length];
}

/** Frasi per fascia percentuale (0 e 100 dedicate; seed = varietà stabile per coppia+msg). */
function pickMessage(percent, seed) {
  const h = hashSeed(String(seed ?? ""));
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));

  if (p === 0) {
    return pickFrom(
      [
        "Oggi i numeri sono severi: resta l'amicizia in sala.",
        "Zero per cento, zero drammi: siete comunque in community.",
        "Compatibilità bassa: meglio una chiacchierata che forzare.",
        "Il contatore dice no, il server vi saluta lo stesso.",
        "Meglio due caffè separati che una ship forzata.",
      ],
      h,
    );
  }
  if (p === 100) {
    return pickFrom(
      [
        "Cento su cento: da tenere d'occhio.",
        "Allineamento perfetto, complimenti.",
        "Come un disco che entra al primo tentativo.",
        "Il server non ha dubbi su questo abbinamento.",
        "Sintonia massima: continuate così.",
      ],
      h,
    );
  }
  if (p >= 95) {
    return pickFrom(
      [
        "Quasi al massimo: complicità evidente.",
        "Numeri altissimi, tono sobrio: bravi.",
        "C'è molta sintonia tra di voi.",
        "Un abbinamento che convince al primo sguardo.",
      ],
      h,
    );
  }
  if (p >= 90) {
    return pickFrom(
      [
        "Ottima affinità, senza esagerare.",
        "Un duo che sta bene insieme.",
        "Complicità chiara e misurata.",
      ],
      h,
    );
  }
  if (p >= 80) {
    return pickFrom(
      [
        "Buona intesa: si nota.",
        "C'è spazio per far crescere il rapporto.",
        "Sintonia solida, con i piedi per terra.",
      ],
      h,
    );
  }
  if (p >= 70) {
    return pickFrom(
      [
        "Direzione giusta, passo dopo passo.",
        "Si vede che vi trovate bene.",
        "Feeling positivo, niente fretta.",
      ],
      h,
    );
  }
  if (p >= 60) {
    return pickFrom(
      [
        "Base buona: fatevi conoscere meglio.",
        "Più che dignitoso come inizio.",
        "C'è materiale per una bella amicizia.",
      ],
      h,
    );
  }
  if (p >= 50) {
    return pickFrom(
      [
        "Metà strada: equilibrato e onesto.",
        "Una connessione discreta ma reale.",
        "Da qui in su è solo un bonus.",
      ],
      h,
    );
  }
  if (p >= 40) {
    return pickFrom(
      [
        "Margini da esplorare, senza pressioni.",
        "Non male: serve solo più tempo insieme.",
        "Curiosità sì, certezze ancora no.",
      ],
      h,
    );
  }
  if (p >= 30) {
    return pickFrom(
      [
        "Potenziale da costruire giorno per giorno.",
        "Non sottovalutatevi: i rapporti crescono.",
        "C'è ancora strada da fare, con calma.",
      ],
      h,
    );
  }
  if (p >= 20) {
    return pickFrom(
      [
        "Numeri bassi: priorità all'amicizia.",
        "Meglio conoscersi meglio in chat.",
        "Serve più tempo insieme, senza fretta.",
      ],
      h,
    );
  }
  if (p >= 10) {
    return pickFrom(
      [
        "Sorte severa oggi: niente di personale.",
        "L'amicizia resta la scelta più sensata.",
        "Il server vi augura comunque una buona giornata.",
      ],
      h,
    );
  }
  return pickFrom(
    [
      "Percentuale modesta: restate leggeri.",
      "Oggi non è il vostro giorno sul contatore.",
      "Meglio sorridere e passare oltre.",
    ],
    h,
  );
}

function runFfmpeg(args) {
  if (!ffmpegPath) return false;
  const out = spawnSync(ffmpegPath, args, {
    stdio: "ignore",
    windowsHide: true,
  });
  return Number(out?.status) === 0;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawStars(ctx, width, height, seed) {
  let state = seed || 12345;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const count = 70;
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(next() * width);
    const y = Math.floor(next() * height);
    const r = next() > 0.9 ? 2 : 1;
    const alpha = 0.35 + next() * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFramedImage(ctx, image, x, y, size, rotationDeg) {
  const rot = (rotationDeg * Math.PI) / 180;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rot);

  const framePad = 8;
  const frameSize = size + framePad * 2;
  drawRoundedRect(ctx, -frameSize / 2, -frameSize / 2, frameSize, frameSize, 6);
  ctx.fillStyle = "#ff6ecf";
  ctx.shadowColor = "rgba(255, 110, 207, 0.65)";
  ctx.shadowBlur = 14;
  ctx.fill();

  ctx.shadowBlur = 0;
  drawRoundedRect(ctx, -size / 2, -size / 2, size, size, 4);
  ctx.save();
  ctx.clip();
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
  ctx.restore();
}

function drawHeartShape(ctx, cx, cy, size) {
  const topCurveHeight = size * 0.32;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.28);
  ctx.bezierCurveTo(
    cx - size * 0.52,
    cy - topCurveHeight,
    cx - size,
    cy + size * 0.38,
    cx,
    cy + size,
  );
  ctx.bezierCurveTo(
    cx + size,
    cy + size * 0.38,
    cx + size * 0.52,
    cy - topCurveHeight,
    cx,
    cy + size * 0.28,
  );
  ctx.closePath();
}

function drawHeart(ctx, cx, cy, size) {
  ctx.save();

  const glow = ctx.createRadialGradient(cx, cy + size * 0.35, size * 0.2, cx, cy + size * 0.35, size * 1.25);
  glow.addColorStop(0, "rgba(255,120,190,0.55)");
  glow.addColorStop(1, "rgba(255,120,190,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.35, size * 1.25, 0, Math.PI * 2);
  ctx.fill();

  drawHeartShape(ctx, cx, cy, size);
  const fill = ctx.createLinearGradient(cx - size, cy - size * 0.3, cx + size, cy + size);
  fill.addColorStop(0, "#ff93d1");
  fill.addColorStop(0.5, "#ff4fa7");
  fill.addColorStop(1, "#db2a85");
  ctx.fillStyle = fill;
  ctx.fill();

  drawHeartShape(ctx, cx, cy, size);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.stroke();

  ctx.restore();
}

function getFittedTitleSize(ctx, text, maxWidth, startSize = 42, minSize = 24) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `700 ${size}px "Noto Sans", Arial, sans-serif`;
    if (ctx.measureText(String(text || "")).width <= maxWidth) break;
    size -= 2;
  }
  return Math.max(minSize, size);
}

function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return 1 - (1 - x) ** 3;
}

/** Indice ultimo frame in cui la barra ragunge il 100% del riempimento (prima del testo). */
function shipMeterFillEndFrame(totalFrames) {
  if (totalFrames <= 1) return 0;
  const last = totalFrames - 1;
  return Math.max(1, Math.floor(last * 0.56));
}

/** Progresso riempimento barra (0→1), completo entro `shipMeterFillEndFrame`. */
function shipMeterFillProgress(frameIndex, totalFrames) {
  if (totalFrames <= 1) return 1;
  const end = shipMeterFillEndFrame(totalFrames);
  return easeOutCubic(Math.min(1, frameIndex / end));
}

/** Testo percentuale: emerge dal basso solo dopo che la barra è piena. */
function shipPercentTextReveal(frameIndex, totalFrames) {
  if (totalFrames <= 1) return 1;
  const last = totalFrames - 1;
  const textStart = shipMeterFillEndFrame(totalFrames) + 1;
  if (frameIndex < textStart) return 0;
  const span = Math.max(1, last - textStart);
  return easeOutCubic(Math.min(1, (frameIndex - textStart + 1) / span));
}

/** Barra verticale: riempimento dal basso verso l'alto fino a (percent/100) dell'altezza traccia. */
function drawVerticalMeter(ctx, cx, topY, bottomY, width, percentNorm, fillAnim01) {
  const w = Math.max(24, width);
  const x = cx - w / 2;
  const h = Math.max(40, bottomY - topY);
  const r = Math.min(18, w / 2 - 2, h / 2 - 2);
  const targetFillH = h * Math.max(0, Math.min(1, percentNorm));
  const currentFillH = targetFillH * Math.max(0, Math.min(1, fillAnim01));

  ctx.save();
  ctx.beginPath();
  drawRoundedRect(ctx, x, topY, w, h, r);
  ctx.clip();
  const g = ctx.createLinearGradient(x, bottomY, x, topY);
  g.addColorStop(0, "#ff4fa7");
  g.addColorStop(0.55, "#ff7eb8");
  g.addColorStop(1, "#ffb3d9");
  ctx.fillStyle = g;
  const fillTop = bottomY - currentFillH;
  ctx.fillRect(x, fillTop, w, currentFillH + 2);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  drawRoundedRect(ctx, x, topY, w, h, r);
  ctx.stroke();
  ctx.restore();
}

function drawShipFrame(ctx, {
  width,
  height,
  leftAvatar,
  rightAvatar,
  leftName,
  rightName,
  leftId,
  rightId,
  percent,
  topText,
  frameIndex,
  totalFrames,
}) {
  const finalPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#5d008f");
  bg.addColorStop(0.52, "#9f0077");
  bg.addColorStop(1, "#1f2c8f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  drawStars(
    ctx,
    width,
    height,
    hashSeed(`${leftId}:${rightId}:${finalPercent}:${frameIndex}`),
  );

  const cx = width / 2;

  if (leftAvatar) {
    drawFramedImage(ctx, leftAvatar, 110, 145, 220, -2.8);
  } else {
    ctx.save();
    ctx.translate(220, 255);
    ctx.rotate(-2.8 * (Math.PI / 180));
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-110, -110, 220, 220);
    ctx.restore();
  }
  if (rightAvatar) {
    drawFramedImage(ctx, rightAvatar, 670, 145, 220, 3.2);
  } else {
    ctx.save();
    ctx.translate(780, 255);
    ctx.rotate(3.2 * (Math.PI / 180));
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-110, -110, 220, 220);
    ctx.restore();
  }

  const topTitleSize = getFittedTitleSize(ctx, topText, width - 64, 42, 24);
  drawTextWithSpecialFallback(ctx, topText, width / 2, 66, {
    size: topTitleSize,
    weight: "700",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });

  drawTextWithSpecialFallback(ctx, leftName, 220, 450, {
    size: 42,
    weight: "700",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });

  drawTextWithSpecialFallback(ctx, rightName, 780, 450, {
    size: 42,
    weight: "700",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });

  const percentNorm = finalPercent / 100;
  const fillAnim = shipMeterFillProgress(frameIndex, totalFrames);
  const textReveal = shipPercentTextReveal(frameIndex, totalFrames);

  const meterTop = 232;
  const meterBottom = 348;
  const meterW = 46;
  const heartCy = 188;
  const heartSize = 34;

  drawVerticalMeter(ctx, cx, meterTop, meterBottom, meterW, percentNorm, fillAnim);
  drawHeart(ctx, cx, heartCy, heartSize);

  const percentText = `${finalPercent}%`;
  const percentX = width / 2;
  const percentY = 382;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 48px "Noto Sans", Arial, sans-serif';
  const tw = ctx.measureText(percentText).width;
  const th = 56;
  const reveal = textReveal;
  if (reveal > 0) {
    ctx.beginPath();
    const clipTop = percentY + th / 2 - th * reveal;
    ctx.rect(percentX - tw / 2 - 12, clipTop, tw + 24, th * reveal + 2);
    ctx.clip();
    ctx.globalAlpha = Math.min(1, reveal * 1.15);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.strokeText(percentText, percentX, percentY);
    ctx.fillStyle = "#5b0d3f";
    ctx.fillText(percentText, percentX, percentY);
  }
  ctx.restore();
}

async function renderSinglePngBuffer(params) {
  const {
    leftAvatarUrl,
    rightAvatarUrl,
    leftName,
    rightName,
    leftId,
    rightId,
    percent,
    messageSeed,
  } = params;
  const width = 1000;
  const height = 540;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const finalPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const topText = pickMessage(finalPercent, `${leftId}:${rightId}:${messageSeed || ""}`);
  const [leftAvatar, rightAvatar] = await Promise.all([
    safeLoadImage(leftAvatarUrl),
    safeLoadImage(rightAvatarUrl),
  ]);
  drawShipFrame(ctx, {
    width,
    height,
    leftAvatar,
    rightAvatar,
    leftName,
    rightName,
    leftId,
    rightId,
    percent: finalPercent,
    topText,
    frameIndex: 17,
    totalFrames: 18,
  });
  return canvas.toBuffer("image/png");
}

/**
 * @returns {Promise<{ buffer: Buffer, format: 'gif'|'png' }>}
 */
module.exports = async function renderShipCanvas(params) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);

  const {
    leftAvatarUrl,
    rightAvatarUrl,
    leftName,
    rightName,
    leftId,
    rightId,
    percent,
    messageSeed,
  } = params;

  const width = 1000;
  const height = 540;
  const finalPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const topText = pickMessage(finalPercent, `${leftId}:${rightId}:${messageSeed || ""}`);

  const [leftAvatar, rightAvatar] = await Promise.all([
    safeLoadImage(leftAvatarUrl),
    safeLoadImage(rightAvatarUrl),
  ]);

  if (!ffmpegPath) {
    const buf = await renderSinglePngBuffer({
      leftAvatarUrl,
      rightAvatarUrl,
      leftName,
      rightName,
      leftId,
      rightId,
      percent: finalPercent,
      messageSeed,
    });
    return { buffer: buf, format: "png" };
  }

  const FRAME_COUNT = 18;
  const FRAMERATE = 12;
  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-ship-gif-"));
    const framePattern = path.join(tmpDir, "ship_%03d.png");
    const palettePath = path.join(tmpDir, "palette.png");
    const outGifPath = path.join(tmpDir, "ship.gif");

    for (let i = 0; i < FRAME_COUNT; i += 1) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      drawShipFrame(ctx, {
        width,
        height,
        leftAvatar,
        rightAvatar,
        leftName,
        rightName,
        leftId,
        rightId,
        percent: finalPercent,
        topText,
        frameIndex: i,
        totalFrames: FRAME_COUNT,
      });
      const name = `ship_${String(i + 1).padStart(3, "0")}.png`;
      fs.writeFileSync(path.join(tmpDir, name), canvas.toBuffer("image/png"));
    }

    const paletteOk = runFfmpeg([
      "-y",
      "-i",
      framePattern,
      "-vf",
      "palettegen=stats_mode=diff",
      palettePath,
    ]);
    if (!paletteOk) {
      const buf = await renderSinglePngBuffer({
        leftAvatarUrl,
        rightAvatarUrl,
        leftName,
        rightName,
        leftId,
        rightId,
        percent: finalPercent,
        messageSeed,
      });
      return { buffer: buf, format: "png" };
    }

    const gifOk = runFfmpeg([
      "-y",
      "-framerate",
      String(FRAMERATE),
      "-i",
      framePattern,
      "-i",
      palettePath,
      "-lavfi",
      "paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
      "-loop",
      "0",
      outGifPath,
    ]);
    if (!gifOk || !fs.existsSync(outGifPath)) {
      const buf = await renderSinglePngBuffer({
        leftAvatarUrl,
        rightAvatarUrl,
        leftName,
        rightName,
        leftId,
        rightId,
        percent: finalPercent,
        messageSeed,
      });
      return { buffer: buf, format: "png" };
    }
    const outGif = fs.readFileSync(outGifPath);
    if (!outGif || !outGif.length) {
      const buf = await renderSinglePngBuffer({
        leftAvatarUrl,
        rightAvatarUrl,
        leftName,
        rightName,
        leftId,
        rightId,
        percent: finalPercent,
        messageSeed,
      });
      return { buffer: buf, format: "png" };
    }
    return { buffer: outGif, format: "gif" };
  } catch {
    const buf = await renderSinglePngBuffer({
      leftAvatarUrl,
      rightAvatarUrl,
      leftName,
      rightName,
      leftId,
      rightId,
      percent: finalPercent,
      messageSeed,
    });
    return { buffer: buf, format: "png" };
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
};
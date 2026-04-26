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
        "Zero assoluto: oggi il destino ride…",
        "Compatibilità inesistente: amicizia > ship!",
        "Il cosmo dice «meglio da soli su Discord».",
        "L'amore non è nell'aria: provate un caffè insieme.",
        "Match da leggenda… invertita: 0%!",
      ],
      h,
    );
  }
  if (p === 100) {
    return pickFrom(
      [
        "100% — leggenda vivente sul server!",
        "Match cosmico: fate spazio agli altri!",
        "Anime da favola, livello massimo!",
        "Il cuore del server esplode di shipped!",
        "Perfetti come vinile + caffè!",
      ],
      h,
    );
  }
  if (p >= 95) {
    return pickFrom(
      [
        "Quasi perfetti: il server li shipa!",
        "Da copertina: tenetevi forte!",
        "Chemistry da capogiro!",
        "Il destino ha firmato in grande!",
      ],
      h,
    );
  }
  if (p >= 90) {
    return pickFrom(
      [
        "Sono perfetti insieme!",
        "Un duo che fa invidia al feed!",
        "Connessione da dieci e lode!",
      ],
      h,
    );
  }
  if (p >= 80) {
    return pickFrom(
      [
        "Scintilla forte: non mollate!",
        "Si vedono le stelle… in positivo!",
        "C'è chimica seria qui!",
      ],
      h,
    );
  }
  if (p >= 70) {
    return pickFrom(
      [
        "Sulla strada giusta per qualcosa di speciale!",
        "Ottimo feeling: continuate così!",
        "Il vibe c'è tutto!",
      ],
      h,
    );
  }
  if (p >= 60) {
    return pickFrom(
      [
        "Buona sintonia: fate crescere il legame!",
        "Più che promettente!",
        "Base solida per ship vere!",
      ],
      h,
    );
  }
  if (p >= 50) {
    return pickFrom(
      [
        "Hanno una buona connessione!",
        "Metà tabella superata: bravi!",
        "Ci sta: da qui in su è tutto bonus!",
      ],
      h,
    );
  }
  if (p >= 40) {
    return pickFrom(
      [
        "Ci sono margini… e curiosità!",
        "Mica male: un po' di mistero non guasta!",
        "Potenziale nascosto: tiratelo fuori!",
      ],
      h,
    );
  }
  if (p >= 30) {
    return pickFrom(
      [
        "Potrebbero sorprendere tutti!",
        "Non sottovalutate questo duo!",
        "La curva può salire ancora!",
      ],
      h,
    );
  }
  if (p >= 20) {
    return pickFrom(
      [
        "Ancora in fase scouting…",
        "Meglio come amici… per ora!",
        "Serve più tempo (e meme) insieme!",
      ],
      h,
    );
  }
  if (p >= 10) {
    return pickFrom(
      [
        "Ouch: il RNG non è dalla vostra parte!",
        "Amicizia salva sempre la giornata!",
        "Il server tifa comunque per voi!",
      ],
      h,
    );
  }
  return pickFrom(
    [
      "Piccolo passo… da qualche parte!",
      "Numeri bassi, cuore grande?",
      "La ship naviga con vento contrario oggi!",
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

function drawGuildBackdrop(ctx, guildIcon, cx, cy, radius) {
  if (!guildIcon) return;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(guildIcon, cx - radius, cy - radius, radius * 2, radius * 2);
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

/** t in [0,1]: crescita + leggero respiro finale */
function heartAnimationFactor(t, frameIndex, totalFrames) {
  const tt = Math.max(0, Math.min(1, t));
  const grow = 1 - (1 - tt) * (1 - tt);
  const holdPhase = frameIndex >= totalFrames - 4;
  if (!holdPhase) return grow;
  const pulse = 1 + 0.045 * Math.sin((frameIndex - (totalFrames - 4)) * 0.9);
  return Math.min(1.08, grow * pulse);
}

function drawShipFrame(ctx, {
  width,
  height,
  leftAvatar,
  rightAvatar,
  guildIcon,
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
  const cy = 228;
  drawGuildBackdrop(ctx, guildIcon, cx, cy, 150);

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

  const t = totalFrames <= 1 ? 1 : frameIndex / (totalFrames - 1);
  const anim = heartAnimationFactor(t, frameIndex, totalFrames);
  const percentNorm = finalPercent / 100;
  const heartBaseMin = 26;
  const heartBaseMax = 56 + percentNorm * 38;
  const heartSize = heartBaseMin + (heartBaseMax - heartBaseMin) * anim;

  drawHeart(ctx, cx, cy, heartSize);

  const percentText = `${finalPercent}%`;
  const percentX = width / 2;
  const percentY = 300;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 44px "Noto Sans", Arial, sans-serif';
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.strokeText(percentText, percentX, percentY);
  ctx.fillStyle = "#5b0d3f";
  ctx.fillText(percentText, percentX, percentY);
  ctx.restore();
}

async function renderSinglePngBuffer(params) {
  const {
    leftAvatarUrl,
    rightAvatarUrl,
    guildIconUrl,
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
  const [leftAvatar, rightAvatar, guildIcon] = await Promise.all([
    safeLoadImage(leftAvatarUrl),
    safeLoadImage(rightAvatarUrl),
    guildIconUrl ? safeLoadImage(guildIconUrl) : Promise.resolve(null),
  ]);
  drawShipFrame(ctx, {
    width,
    height,
    leftAvatar,
    rightAvatar,
    guildIcon,
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
    guildIconUrl,
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

  const [leftAvatar, rightAvatar, guildIcon] = await Promise.all([
    safeLoadImage(leftAvatarUrl),
    safeLoadImage(rightAvatarUrl),
    guildIconUrl ? safeLoadImage(guildIconUrl) : Promise.resolve(null),
  ]);

  if (!ffmpegPath) {
    const buf = await renderSinglePngBuffer({
      leftAvatarUrl,
      rightAvatarUrl,
      guildIconUrl,
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
        guildIcon,
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
        guildIconUrl,
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
        guildIconUrl,
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
        guildIconUrl,
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
      guildIconUrl,
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
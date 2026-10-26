const canvasModule = require("canvas");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const { createCanvas } = canvasModule;
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const { normalizeTextForCanvas, sanitizeCanvasDisplayName } = require("./canvasUtils");
const { safeLoadImage, fetchHttpImageBuffer } = require("./safeLoadImage");
const { getShopItemById } = require("../Web/hogwartsShopCatalog");
const DUEL_CANVAS_USE_PNG = String(process.env.VC_DUEL_CANVAS_PNG ?? "0").trim() === "1";
const HOGWARTS_IMG = path.join(__dirname, "..", "..", "Assets", "evento-hogwarts");
const HOGWARTS_IMG_REMOTE_BASE = String(process.env.VC_HOGWARTS_IMG_BASE_URL || "https://www.viniliecaffe.it/images/evento-hogwarts").replace(/\/$/, "");
const LOANER_WAND_ID = "willow-spark-wand";
const BOT_WAND_ID = "elder-ember-wand";
const DEFAULT_LOANER_WAND = "bacchetta di salice.png";
const VOLDEMORT_PORTRAIT_CANDIDATES = ["voldemort.png", "Voldemort.png"];
const INTRO_PHASE_END = 0.3;
const CLASH_PHASE_END = 0.74;
const RESULT_PHASE_START = 0.74;
const DUEL_CLASH_WAND = Object.freeze({ leftX: 280, rightX: 720, tipInset: 36 });
const DUEL_SPELL = Object.freeze({
  left: { core: "#ef4444", bright: "#fecaca", beam: "#dc2626", glow: "rgba(239,68,68," },
  right: { core: "#22c55e", bright: "#bbf7d0", beam: "#16a34a", glow: "rgba(34,197,94," },
  center: { hot: "#fffef8", gold: "rgba(255,248,220," },
});

const INTRO_LINES = [
  "Duello al calare del sole…",
  "Le bacchette si alzano…",
  "La sala duelli attende…",
  "Incantesimo in arrivo…",
];

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

function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return 1 - (1 - x) ** 3;
}

function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function stripMd(text) {
  return String(text || "").replace(/\*\*/g, "").trim();
}

function sanitizeDuelCaption(text) {
  return normalizeTextForCanvas(
    String(text || "")
      .replace(/<a?:[^:>]+:\d+>/gi, "")
      .replace(/:[a-z0-9_]{2,32}:/gi, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function sanitizeDuelName(name, fallback = "Giocatore") {
  return sanitizeCanvasDisplayName(name, 18, fallback);
}

const missingAssetWarned = new Set();

function duelPhase(frameIndex, totalFrames) {
  const t = frameIndex / Math.max(1, totalFrames - 1);
  if (t < INTRO_PHASE_END) return "intro";
  if (t < CLASH_PHASE_END) return "clash";
  return "result";
}

function resultReveal(frameIndex, totalFrames) {
  const start = Math.floor(totalFrames * RESULT_PHASE_START);
  if (frameIndex < start) return 0;
  const span = Math.max(1, totalFrames - start);
  const t = (frameIndex - start) / span;
  if (t < 0.32) return easeOutCubic(t / 0.32);
  return 1;
}

function runFfmpeg(args) {
  if (!ffmpegPath) return false;
  const out = spawnSync(ffmpegPath, args, { stdio: "ignore", windowsHide: true });
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
  for (let i = 0; i < 48; i += 1) {
    const x = Math.floor(next() * width);
    const y = Math.floor(next() * height);
    ctx.fillStyle = `rgba(255,230,180,${(0.15 + next() * 0.4).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, next() > 0.9 ? 1.5 : 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

const DUEL_AVATAR_GIF_DECODE_FPS = Math.max(4, Math.min(16, Math.floor(Number(process.env.VC_DUEL_AVATAR_GIF_FPS ?? 8))));
const DUEL_AVATAR_GIF_MAX_FRAMES = Math.max(8, Math.min(48, Math.floor(Number(process.env.VC_DUEL_AVATAR_GIF_MAX_FRAMES ?? 20))));

function isGifImageBuffer(buf) {
  if (!buf || buf.length < 6) return false;
  const sig = buf.subarray(0, 6).toString("ascii");
  return sig === "GIF87a" || sig === "GIF89a";
}

function pickAvatarFrame(frames, frameIndex) {
  if (!Array.isArray(frames) || !frames.length) return null;
  return frames[frameIndex % frames.length];
}

async function loadDuelAvatarFrames(tmpDir, url, prefix, ffmpegBin) {
  const loadImage = canvasModule.loadImage;
  const u = String(url || "").trim();
  if (!u) return [];
  try {
    const buf = await fetchHttpImageBuffer(u, { timeoutMs: 12_000 });
    if (!buf?.length) {
      const img = await safeLoadImage(u, { suppressWarning: true });
      return img ? [img] : [];
    }
    if (!isGifImageBuffer(buf) || !ffmpegBin) {
      const img = await loadImage(buf).catch(() => null);
      return img ? [img] : [];
    }
    const inPath = path.join(tmpDir, `${prefix}_src.gif`);
    fs.writeFileSync(inPath, buf);
    const outPattern = path.join(tmpDir, `${prefix}_%03d.png`);
    const vf = `fps=${DUEL_AVATAR_GIF_DECODE_FPS}`;
    const out = spawnSync(
      ffmpegBin,
      ["-y", "-i", inPath, "-vf", vf, "-frames:v", String(DUEL_AVATAR_GIF_MAX_FRAMES), outPattern],
      { stdio: "ignore", windowsHide: true },
    );
    if (Number(out?.status) !== 0) {
      const img = await safeLoadImage(u, { suppressWarning: true });
      return img ? [img] : [];
    }
    const frameRe = new RegExp(`^${prefix}_\\d+\\.png$`, "i");
    const names = fs
      .readdirSync(tmpDir)
      .filter((f) => frameRe.test(f))
      .sort((a, b) => {
        const ma = a.match(/_(\d+)\.png$/i);
        const mb = b.match(/_(\d+)\.png$/i);
        return (Number(ma?.[1]) || 0) - (Number(mb?.[1]) || 0);
      });
    const frames = [];
    for (const name of names) {
      const p = path.join(tmpDir, name);
      const img = await loadImage(fs.readFileSync(p)).catch(() => null);
      if (img) frames.push(img);
    }
    if (frames.length) return frames;
    const img = await safeLoadImage(u, { suppressWarning: true });
    return img ? [img] : [];
  } catch {
    const img = await safeLoadImage(u, { suppressWarning: true }).catch(() => null);
    return img ? [img] : [];
  }
}

function hogwartsDeployRoots() {
  const vinylsRoot = path.resolve(path.join(__dirname, "..", ".."));
  const roots = [path.resolve(path.join(__dirname, "..", "..", "..")), vinylsRoot];
  const cwd = path.resolve(process.cwd());
  if (!roots.includes(cwd)) roots.push(cwd);
  const parent = path.resolve(cwd, "..");
  if (!roots.includes(parent)) roots.push(parent);
  return roots;
}

function hogwartsImageDirs() {
  const dirs = [];
  const envDir = String(process.env.VC_HOGWARTS_IMG_DIR || "").trim();
  if (envDir) dirs.push(path.resolve(envDir));
  const vinylsRoot = path.resolve(path.join(__dirname, "..", ".."));
  dirs.push(path.join(vinylsRoot, "Assets", "evento-hogwarts"));
  dirs.push(path.join(vinylsRoot, "assets", "evento-hogwarts"));
  dirs.push(path.resolve(HOGWARTS_IMG));
  for (const root of hogwartsDeployRoots()) {
    if (root === vinylsRoot) continue;
    dirs.push(path.join(root, "Vinyls", "Assets", "evento-hogwarts"));
    dirs.push(path.join(root, "Vinyls", "assets", "evento-hogwarts"));
  }
  dirs.push("/var/www/viniliecaffe/images/evento-hogwarts");
  return [...new Set(dirs)];
}

function resolveWandImageFilename(wandId, imageFile, fallbackId) {
  const file = String(imageFile || "").trim();
  if (file) return file;
  const id = String(wandId || fallbackId || "").trim();
  if (id) {
    const item = getShopItemById(id);
    if (item?.imageFile) return String(item.imageFile).trim();
  }
  return DEFAULT_LOANER_WAND;
}

function isWebpBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

async function loadCanvasImageFromBuffer(buf) {
  if (!buf?.length) return null;
  if (isWebpBuffer(buf) && ffmpegPath) {
    let tmpIn = "";
    let tmpOut = "";
    try {
      tmpIn = path.join(os.tmpdir(), `vc-duel-webp-${Date.now()}.webp`);
      tmpOut = path.join(os.tmpdir(), `vc-duel-webp-${Date.now()}.png`);
      fs.writeFileSync(tmpIn, buf);
      const out = spawnSync(ffmpegPath, ["-y", "-i", tmpIn, "-frames:v", "1", tmpOut], { stdio: "ignore", windowsHide: true });
      if (Number(out?.status) === 0 && fs.existsSync(tmpOut)) {
        const pngBuf = fs.readFileSync(tmpOut);
        const img = await canvasModule.loadImage(pngBuf).catch(() => null);
        if (img) return img;
      }
    } catch {
    } finally {
      for (const p of [tmpIn, tmpOut]) {
        if (p) {
          try {
            fs.unlinkSync(p);
          } catch {
          }
        }
      }
    }
  }
  return canvasModule.loadImage(buf).catch(() => null);
}

async function loadCanvasImageFromPath(filePath) {
  const p = String(filePath || "").trim();
  if (!p || !fs.existsSync(p)) return null;
  try {
    const img = await canvasModule.loadImage(p);
    if (img?.width > 0 && img?.height > 0) return img;
  } catch {
  }
  try {
    const buf = fs.readFileSync(p);
    return loadCanvasImageFromBuffer(buf);
  } catch {
  }
  return safeLoadImage(p, { suppressWarning: true, timeoutMs: 12_000 }).catch(() => null);
}

function findLocalHogwartsAssetPath(filename) {
  const name = String(filename || "").trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const dir of hogwartsImageDirs()) {
    const direct = path.join(dir, name);
    if (fs.existsSync(direct)) return direct;
    try {
      const entries = fs.readdirSync(dir);
      const hit = entries.find((entry) => String(entry).toLowerCase() === lower);
      if (hit) return path.join(dir, hit);
    } catch {
    }
  }
  return null;
}

async function loadHogwartsAssetImage(filename, opts = {}) {
  const name = String(filename || "").trim();
  if (!name) return null;
  const silent = Boolean(opts.silent);
  const local = findLocalHogwartsAssetPath(name);
  if (local) {
    const img = await loadCanvasImageFromPath(local);
    if (img) return img;
    if (!silent && !missingAssetWarned.has(`decode:${name}`)) {
      missingAssetWarned.add(`decode:${name}`);
      global.logger?.warn?.("[duelCanvas] file trovato ma non decodificabile:", local);
    }
  }
  const bases = [HOGWARTS_IMG_REMOTE_BASE, "https://viniliecaffe.it/images/evento-hogwarts"];
  for (const base of bases) {
    const url = `${String(base).replace(/\/$/, "")}/${name.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
    try {
      const buf = await fetchHttpImageBuffer(url, { timeoutMs: 14_000 });
      if (buf?.length) {
        const img = await loadCanvasImageFromBuffer(buf);
        if (img) return img;
      }
    } catch {
    }
  }
  if (!silent && !missingAssetWarned.has(name)) {
    missingAssetWarned.add(name);
    global.logger?.warn?.("[duelCanvas] PNG assente:", name, "dirs=", hogwartsImageDirs().join(" | "));
  }
  return null;
}

async function loadWandImage(wandId, imageFile, fallbackWandId) {
  const filename = resolveWandImageFilename(wandId, imageFile, fallbackWandId);
  return loadHogwartsAssetImage(filename);
}

function resolveVoldemortPortraitFile(customFile) {
  const preferred = String(customFile || process.env.VC_DUEL_VOLDEMORT_PORTRAIT || "").trim();
  if (preferred) return preferred;
  return VOLDEMORT_PORTRAIT_CANDIDATES[0];
}

async function loadVoldemortPortraitImage(customFile) {
  const candidates = [];
  const preferred = String(customFile || process.env.VC_DUEL_VOLDEMORT_PORTRAIT || "").trim();
  if (preferred) candidates.push(preferred);
  for (const file of VOLDEMORT_PORTRAIT_CANDIDATES) {
    if (!candidates.includes(file)) candidates.push(file);
  }
  for (const file of candidates) {
    const img = await loadHogwartsAssetImage(file, { silent: true });
    if (img) return img;
  }
  const warnKey = "__voldemort_portrait__";
  if (!missingAssetWarned.has(warnKey)) {
    missingAssetWarned.add(warnKey);
    const tried = candidates.map((file) => `${file}=>${findLocalHogwartsAssetPath(file) || "?"}`).join(" | ");
    global.logger?.warn?.("[duelCanvas] ritratto Voldemort non caricato:", tried);
  }
  return null;
}

function drawFramedAvatar(ctx, image, x, y, size, accent, rotationDeg) {
  const rot = (rotationDeg * Math.PI) / 180;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rot);
  const framePad = 8;
  const frameSize = size + framePad * 2;
  drawRoundedRect(ctx, -frameSize / 2, -frameSize / 2, frameSize, frameSize, 10);
  ctx.strokeStyle = accent || "#c9a227";
  ctx.lineWidth = 3;
  ctx.stroke();
  drawRoundedRect(ctx, -size / 2, -size / 2, size, size, 8);
  ctx.save();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(-size / 2, -size / 2, size, size);
  }
  ctx.restore();
  ctx.restore();
}

function drawVoldemortPortrait(ctx, x, y, size, frameIndex) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const breathe = 1 + Math.sin(frameIndex * 0.35) * 0.012;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(breathe, breathe);
  const hoodGrad = ctx.createRadialGradient(0, -size * 0.1, size * 0.1, 0, 0, size * 0.62);
  hoodGrad.addColorStop(0, "#1e293b");
  hoodGrad.addColorStop(0.55, "#0f172a");
  hoodGrad.addColorStop(1, "#020617");
  ctx.fillStyle = hoodGrad;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.02, size * 0.38, size * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8dcc8";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.06, size * 0.22, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(180,160,140,0.35)";
  ctx.beginPath();
  ctx.ellipse(size * 0.06, size * 0.1, size * 0.04, size * 0.14, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.ellipse(-size * 0.09, -size * 0.02, size * 0.028, size * 0.055, -0.15, 0, Math.PI * 2);
  ctx.ellipse(size * 0.09, -size * 0.02, size * 0.028, size * 0.055, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,220,140,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-size * 0.11, -size * 0.02);
  ctx.lineTo(-size * 0.07, -size * 0.02);
  ctx.moveTo(size * 0.11, -size * 0.02);
  ctx.lineTo(size * 0.07, -size * 0.02);
  ctx.stroke();
  ctx.fillStyle = "rgba(30,30,30,0.5)";
  ctx.beginPath();
  ctx.moveTo(-size * 0.04, size * 0.12);
  ctx.lineTo(0, size * 0.2);
  ctx.lineTo(size * 0.04, size * 0.12);
  ctx.fill();
  ctx.strokeStyle = "rgba(148,163,184,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-size * 0.14, -size * 0.22);
  ctx.quadraticCurveTo(0, -size * 0.38, size * 0.14, -size * 0.22);
  ctx.stroke();
  ctx.restore();
  drawRoundedRect(ctx, x, y, size, size, 10);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawWandSprite(ctx, image, centerX, baseY, accent, facingLeft) {
  const h = image ? 148 : 118;
  const w = image ? Math.round((image.width / Math.max(1, image.height)) * h) : 28;
  const tilt = facingLeft ? -0.42 : 0.42;
  ctx.save();
  ctx.translate(centerX, baseY);
  ctx.rotate(tilt);
  if (image) {
    ctx.shadowColor = accent || "#d4af37";
    ctx.shadowBlur = 14;
    if (!facingLeft) {
      ctx.scale(-1, 1);
      ctx.drawImage(image, -w / 2, -h + 8, w, h);
    } else {
      ctx.drawImage(image, -w / 2, -h + 8, w, h);
    }
    ctx.shadowBlur = 0;
  } else {
    ctx.strokeStyle = accent || "#8b6914";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(facingLeft ? 18 : -18, -h);
    ctx.stroke();
  }
  ctx.restore();
}

function duelClashProgress(frameIndex, totalFrames) {
  const clashStart = Math.floor(totalFrames * INTRO_PHASE_END);
  const meetEnd = Math.floor(totalFrames * (INTRO_PHASE_END + 0.12));
  if (frameIndex < clashStart) return 0;
  if (frameIndex >= meetEnd) return 1;
  return easeOutCubic((frameIndex - clashStart) / Math.max(1, meetEnd - clashStart));
}

function duelClashPushProgress(frameIndex, totalFrames) {
  const pushStart = Math.floor(totalFrames * (INTRO_PHASE_END + 0.06));
  const pushEnd = Math.floor(totalFrames * CLASH_PHASE_END);
  if (frameIndex < pushStart) return 0;
  if (frameIndex >= pushEnd) return 1;
  return easeInOutCubic((frameIndex - pushStart) / Math.max(1, pushEnd - pushStart));
}

function clashPushDirection(winnerSide, leftPower, rightPower) {
  if (winnerSide === "left") return 1;
  if (winnerSide === "right") return -1;
  if (winnerSide === "draw") return 0;
  const delta = Number(rightPower) - Number(leftPower);
  if (Math.abs(delta) < 1) return 0;
  return delta > 0 ? -1 : 1;
}

function clashPowerGap(leftPower, rightPower) {
  return Math.max(0, Math.min(1, Math.abs(Number(rightPower) - Number(leftPower)) / 36));
}

function duelClashLayout(centerX) {
  const { leftX, rightX, tipInset } = DUEL_CLASH_WAND;
  const leftStop = leftX + tipInset;
  const rightStop = rightX - tipInset;
  return {
    leftWandX: leftX,
    rightWandX: rightX,
    leftStop,
    rightStop,
    reachLeft: centerX - leftStop,
    reachRight: rightStop - centerX,
  };
}

function clashPushReach(layout, winnerSide, leftPower, rightPower) {
  const dir = clashPushDirection(winnerSide, leftPower, rightPower);
  if (dir < 0) return { dir, reach: layout.reachLeft };
  if (dir > 0) return { dir, reach: layout.reachRight };
  return { dir: 0, reach: 0 };
}

function drawSpellBeam(ctx, fromX, fromY, toX, toY, spell, strength, pulse) {
  const alpha = Math.min(1, strength * pulse);
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.shadowColor = spell.beam;
  ctx.shadowBlur = 22 * strength;
  ctx.strokeStyle = spell.beam;
  ctx.lineWidth = 10 + strength * 8;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.quadraticCurveTo((fromX + toX) / 2, (fromY + toY) / 2 - 18, toX, toY);
  ctx.stroke();
  ctx.shadowBlur = 10;
  ctx.strokeStyle = spell.bright;
  ctx.lineWidth = 4 + strength * 4;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.quadraticCurveTo((fromX + toX) / 2, (fromY + toY) / 2 - 12, toX, toY);
  ctx.stroke();
  ctx.restore();
}

function clashBeadOffsetX(frameIndex, totalFrames, winnerSide, centerX, leftPower, rightPower, layout) {
  const phase = duelPhase(frameIndex, totalFrames);
  const meet = duelClashProgress(frameIndex, totalFrames);
  if (phase === "intro" || meet <= 0.02) return centerX;
  const pushT = duelClashPushProgress(frameIndex, totalFrames);
  const { dir, reach } = clashPushReach(layout, winnerSide, leftPower, rightPower);
  const gap = clashPowerGap(leftPower, rightPower);
  const struggle = Math.sin(frameIndex * 0.58) * 22 * (1 - pushT) * (0.35 + gap * 0.65);
  const surge = Math.sin(frameIndex * 1.35 + pushT * 2.4) * 8 * (1 - pushT * 0.85);
  const drift = dir * pushT * reach;
  return centerX + struggle + surge + drift;
}

function spellBeamStrength(meet, beadX, centerX, side, normReach) {
  const span = Math.max(1, normReach);
  const norm = Math.max(-1, Math.min(1, (beadX - centerX) / span));
  const base = Math.max(0.08, meet);
  if (side === "left") return base * (1 + norm * 0.55);
  return base * (1 - norm * 0.55);
}

function drawClashEnergyFill(ctx, layout, beadX, cy, pushT, dir, meet, pulse) {
  if (pushT < 0.2 || dir === 0) return;
  const spell = dir < 0 ? DUEL_SPELL.right : DUEL_SPELL.left;
  const fromX = dir < 0 ? layout.rightWandX : layout.leftWandX;
  const toX = dir < 0 ? layout.leftStop : layout.rightStop;
  const x0 = Math.min(fromX, toX);
  const x1 = Math.max(fromX, toX, beadX + (dir < 0 ? -8 : 8));
  const alpha = meet * pushT * pulse * 0.5;
  const grad = ctx.createLinearGradient(x0, cy, x1, cy);
  grad.addColorStop(0, `${spell.glow}${(alpha * 0.85).toFixed(3)})`);
  grad.addColorStop(0.45, `${DUEL_SPELL.center.gold}${(alpha * 0.4).toFixed(3)})`);
  grad.addColorStop(1, `${spell.glow}${(alpha * 0.2).toFixed(3)})`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(x0, cy - 26, x1 - x0, 52);
  ctx.restore();
}

function drawDominantSpellWash(ctx, layout, cy, wandY, pushT, dir, meet, pulse, flicker) {
  if (pushT < 0.35 || dir === 0) return;
  const wash = meet * (0.42 + pushT * 0.58) * pulse * flicker;
  if (dir < 0) {
    drawSpellBeam(ctx, layout.rightWandX, wandY, layout.leftStop, cy, DUEL_SPELL.right, wash, 1);
    drawSpellBeam(ctx, layout.rightWandX, wandY, layout.leftWandX + 18, cy, DUEL_SPELL.right, wash * 0.72, 0.95);
  } else {
    drawSpellBeam(ctx, layout.leftWandX, wandY, layout.rightStop, cy, DUEL_SPELL.left, wash, 1);
    drawSpellBeam(ctx, layout.leftWandX, wandY, layout.rightWandX - 18, cy, DUEL_SPELL.left, wash * 0.72, 0.95);
  }
}

function normalizeDuelPower(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function formatDuelPowerLabel(value) {
  const n = normalizeDuelPower(value);
  return n == null ? "—" : `${n}%`;
}

function animatedDuelPower(basePower, frameIndex, totalFrames, side, winnerSide, leftPower, rightPower) {
        void frameIndex;
  void totalFrames;
  void side;
  void winnerSide;
  void leftPower;
  void rightPower;
  return normalizeDuelPower(basePower);
}

function drawMagicClash(ctx, centerX, cy, frameIndex, totalFrames, winnerSide, leftPower, rightPower) {
  const phase = duelPhase(frameIndex, totalFrames);
  if (phase === "intro") return;
  const layout = duelClashLayout(centerX);
  const meet = duelClashProgress(frameIndex, totalFrames);
  const pulse = 0.6 + 0.4 * Math.sin(frameIndex * 0.62);
  const flicker = 0.85 + 0.15 * Math.sin(frameIndex * 1.1 + 0.4);
  const beadX = clashBeadOffsetX(frameIndex, totalFrames, winnerSide, centerX, leftPower, rightPower, layout);
  const pushT = duelClashPushProgress(frameIndex, totalFrames);
  const { dir, reach } = clashPushReach(layout, winnerSide, leftPower, rightPower);
  const normReach = reach || Math.max(layout.reachLeft, layout.reachRight);
  const leftStr = spellBeamStrength(meet, beadX, centerX, "left", normReach);
  const rightStr = spellBeamStrength(meet, beadX, centerX, "right", normReach);
  let state = hashSeed(`${frameIndex}:${totalFrames}:clash`);
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const left = DUEL_SPELL.left;
  const right = DUEL_SPELL.right;
  const { leftWandX, rightWandX } = layout;
  const wandY = cy + 52;
  drawClashEnergyFill(ctx, layout, beadX, cy, pushT, dir, meet, pulse);
  drawDominantSpellWash(ctx, layout, cy, wandY, pushT, dir, meet, pulse, flicker);
  const loserEndX = dir < 0 ? layout.leftStop : dir > 0 ? layout.rightStop : beadX;
  const winnerEndX = dir < 0 ? beadX + 8 : dir > 0 ? beadX - 8 : beadX;
  const leftEndX = dir > 0 ? winnerEndX : dir < 0 ? loserEndX : beadX - 10;
  const rightEndX = dir < 0 ? winnerEndX : dir > 0 ? loserEndX : beadX + 10;
  const leftFromX = leftWandX;
  const rightFromX = rightWandX;
  drawSpellBeam(ctx, leftFromX, wandY, leftEndX, cy, left, leftStr, pulse * flicker);
  drawSpellBeam(ctx, rightFromX, wandY, rightEndX, cy, right, rightStr, pulse * flicker);
  const spill = dir * pushT * Math.max(layout.reachLeft, layout.reachRight) * 0.35;
  for (let i = 0; i < 36; i += 1) {
    const sideLeft = i % 2 === 0;
    const spell = sideLeft ? left : right;
    const spread = sideLeft ? -1 : 1;
    const along = next() * meet;
    const lateral = (next() - 0.5) * 42;
    const px = beadX + spread * (18 + along * 95) + lateral * 0.35 + spill * 0.55;
    const py = cy + (next() - 0.5) * 38 * meet;
    const r = 1.2 + next() * 3.5;
    const alpha = (0.2 + next() * 0.55) * meet * pulse;
    ctx.fillStyle = `${spell.glow}${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (meet > 0.12) {
    const beadR = 10 + meet * 22 + pulse * 6;
    const bead = ctx.createRadialGradient(beadX, cy, 0, beadX, cy, beadR);
    bead.addColorStop(0, `${DUEL_SPELL.center.hot}`);
    bead.addColorStop(0.35, `${DUEL_SPELL.center.gold}${(0.75 * meet).toFixed(3)})`);
    bead.addColorStop(0.65, `${left.glow}${(0.35 * meet * flicker).toFixed(3)})`);
    bead.addColorStop(0.85, `${right.glow}${(0.35 * meet * flicker).toFixed(3)})`);
    bead.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bead;
    ctx.beginPath();
    ctx.arc(beadX, cy, beadR, 0, Math.PI * 2);
    ctx.fill();
    const haloR = beadR + 28 + meet * 20;
    const halo = ctx.createRadialGradient(beadX, cy, beadR * 0.4, beadX, cy, haloR);
    halo.addColorStop(0, `${left.glow}${(0.18 * meet).toFixed(3)})`);
    halo.addColorStop(0.5, `${DUEL_SPELL.center.gold}${(0.12 * meet).toFixed(3)})`);
    halo.addColorStop(1, `${right.glow}${(0.12 * meet).toFixed(3)})`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(beadX, cy, haloR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 8; i += 1) {
    const sideLeft = i < 4;
    const spell = sideLeft ? left : right;
    const t = next() * meet;
    const px = beadX + (sideLeft ? -1 : 1) * (8 + t * 70);
    const py = cy + (next() - 0.5) * 24;
    ctx.strokeStyle = `${spell.glow}${(0.35 * meet * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (sideLeft ? 12 : -12) * (0.4 + next()), py + (next() - 0.5) * 16);
    ctx.stroke();
  }
  ctx.restore();
}

function duelVisualAccent(side, phase, houseAccent) {
  if (phase === "intro") return houseAccent;
  return side === "left" ? DUEL_SPELL.left.core : DUEL_SPELL.right.core;
}

function getCaptions(params) {
  const { messageSeed, spellLine, winnerSide, leftName, rightName } = params;
  const introLine = pickFrom(INTRO_LINES, hashSeed(messageSeed || "duel"));
  const cleanSpell = sanitizeDuelCaption(spellLine).slice(0, 72);
  const safeLeft = sanitizeDuelName(leftName, "Wizard");
  const safeRight = sanitizeDuelName(rightName, "Rivale");
  let resultMain = "";
  let resultSub = "";
  if (winnerSide === "draw") {
    resultMain = "PAREGGIO";
    resultSub = "Le bacchette restano in equilibrio";
  } else if (winnerSide === "left") {
    resultMain = `${safeLeft} vince`;
    resultSub = cleanSpell;
  } else if (winnerSide === "right") {
    resultMain = `${safeRight} vince`;
    resultSub = cleanSpell;
  } else if (winnerSide === "pending" || winnerSide === "closed") {
    resultMain = winnerSide === "closed" ? "SFIDA CHIUSA" : "IN ATTESA";
    resultSub = cleanSpell || (winnerSide === "closed" ? "Duello annullato o scaduto" : "Accetta o rifiuta la sfida");
  }
  return { introLine, clashLine: "Gli incantesimi si scontrano…", resultMain, resultSub };
}

function drawTopCaption(ctx, width, text, alpha, size = 32) {
  if (!text || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawTextWithSpecialFallback(ctx, text, width / 2, 54, {
    size,
    weight: "700",
    color: "#f8f0d8",
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });
  ctx.restore();
}

function drawResultCard(ctx, width, captions, reveal) {
  if (reveal <= 0.12 || !captions.resultMain) return;
  const cardW = 580;
  const hasSub = Boolean(captions.resultSub);
  const cardH = hasSub ? 82 : 54;
  const cardX = (width - cardW) / 2;
  const cardY = 448;
  const alpha = Math.min(1, easeOutCubic(reveal));
  ctx.save();
  ctx.globalAlpha = alpha;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 14);
  ctx.fillStyle = "rgba(8, 12, 28, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(212, 175, 55, 0.65)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const mainY = hasSub ? cardY + 30 : cardY + cardH / 2;
  drawTextWithSpecialFallback(ctx, String(captions.resultMain).toUpperCase(), width / 2, mainY, {
    size: hasSub ? 28 : 30,
    weight: "800",
    color: "#fff8e7",
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });
  if (hasSub && reveal > 0.35) {
    const subAlpha = Math.min(1, (reveal - 0.35) / 0.45);
    ctx.globalAlpha = alpha * subAlpha;
    drawTextWithSpecialFallback(ctx, captions.resultSub, width / 2, cardY + 58, {
      size: 17,
      weight: "600",
      color: "#d4c4a8",
      align: "center",
      baseline: "middle",
      forcePrimaryFont: true,
    });
  }
  ctx.restore();
}

function drawPowerBar(ctx, x, y, w, h, percent, accent, anim, bright) {
  const raw = normalizeDuelPower(percent);
  const p = raw == null ? 0 : Math.max(0, Math.min(1, raw / 100)) * Math.max(0, Math.min(1, anim));
  drawRoundedRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(15,20,40,0.65)";
  ctx.fill();
  if (p > 0) {
    drawRoundedRect(ctx, x, y, w * p, h, h / 2);
    const g = ctx.createLinearGradient(x, y, x + w * p, y);
    g.addColorStop(0, accent || "#c9a227");
    g.addColorStop(1, bright || accent || "#f5e6b8");
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, x, y, w, h, h / 2);
  ctx.stroke();
}

function drawDuelFrame(ctx, params) {
  const {
    width,
    height,
    leftAvatarFrames,
    rightAvatarFrames,
    leftName,
    rightName,
    leftId,
    rightId,
    leftAccent,
    rightAccent,
    leftPower,
    rightPower,
    rightIsBot,
    leftWandImg,
    rightWandImg,
    frameIndex,
    totalFrames,
    captions,
  } = params;
  const phase = duelPhase(frameIndex, totalFrames);
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0c1224");
  bg.addColorStop(0.5, "#15102a");
  bg.addColorStop(1, "#0d1812");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  drawStars(ctx, width, height, hashSeed(`${leftId}:${rightId}`));
  const barAnim = easeOutCubic(Math.min(1, frameIndex / Math.max(1, Math.floor(totalFrames * 0.45))));
  if (phase === "intro") {
    const introAlpha = easeOutCubic(frameIndex / Math.max(1, Math.floor(totalFrames * INTRO_PHASE_END)));
    drawTopCaption(ctx, width, captions.introLine, introAlpha, 34);
  } else if (phase === "clash") {
    drawTopCaption(ctx, width, captions.clashLine, 0.95, 30);
  } else {
    const rev = resultReveal(frameIndex, totalFrames);
    const topFade = Math.max(0, 1 - rev * 1.4);
    if (topFade > 0.05) drawTopCaption(ctx, width, captions.clashLine, topFade * 0.85, 28);
  }
  const visualLeft = duelVisualAccent("left", phase, leftAccent);
  const visualRight = duelVisualAccent("right", phase, rightAccent);
  const leftAvatar = pickAvatarFrame(leftAvatarFrames, frameIndex);
  const voldemortImg = params.voldemortPortraitImg;
  if (!rightIsBot) {
    const rightAvatar = pickAvatarFrame(rightAvatarFrames, frameIndex);
    drawFramedAvatar(ctx, rightAvatar, 705, 118, 188, visualRight, 2);
  } else if (voldemortImg) {
    drawFramedAvatar(ctx, voldemortImg, 705, 118, 188, visualRight, 2);
  } else {
    drawVoldemortPortrait(ctx, 705, 118, 188, frameIndex);
  }
  drawFramedAvatar(ctx, leftAvatar, 95, 118, 188, visualLeft, -2);
  drawWandSprite(ctx, leftWandImg, 200, 318, visualLeft, true);
  drawWandSprite(ctx, rightWandImg, 800, 318, visualRight, false);
  drawTextWithSpecialFallback(ctx, sanitizeDuelName(leftName, "Wizard"), 189, 348, {
    size: 28,
    weight: "700",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
  });
  drawTextWithSpecialFallback(ctx, sanitizeDuelName(rightName, "Rivale"), 799, 348, {
    size: 28,
    weight: "700",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
  });
  const showLeftPower = animatedDuelPower(
    leftPower,
    frameIndex,
    totalFrames,
    "left",
    params.winnerSide,
    leftPower,
    rightPower,
  );
  const showRightPower = animatedDuelPower(
    rightPower,
    frameIndex,
    totalFrames,
    "right",
    params.winnerSide,
    leftPower,
    rightPower,
  );
  drawPowerBar(ctx, 72, 388, 235, 18, showLeftPower, visualLeft, barAnim, DUEL_SPELL.left.bright);
  drawPowerBar(ctx, 693, 388, 235, 18, showRightPower, visualRight, barAnim, DUEL_SPELL.right.bright);
  drawTextWithSpecialFallback(ctx, formatDuelPowerLabel(showLeftPower), 189, 418, {
    size: 20,
    weight: "600",
    color: phase === "intro" ? "#d4af37" : DUEL_SPELL.left.bright,
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });
  drawTextWithSpecialFallback(ctx, formatDuelPowerLabel(showRightPower), 799, 418, {
    size: 20,
    weight: "600",
    color: phase === "intro" ? "#d4af37" : DUEL_SPELL.right.bright,
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });
  drawMagicClash(
    ctx,
    width / 2,
    228,
    frameIndex,
    totalFrames,
    params.winnerSide,
    leftPower,
    rightPower,
  );
  if (phase === "result") {
    drawResultCard(ctx, width, captions, resultReveal(frameIndex, totalFrames));
  }
}

async function prepareDuelAssets(params) {
  const portraitFile = resolveVoldemortPortraitFile(params.voldemortPortraitFile);
  const leftFallbackId = params.leftWandId ? "" : LOANER_WAND_ID;
  const rightFallbackId = params.rightIsBot ? BOT_WAND_ID : LOANER_WAND_ID;
  const loads = [
    loadWandImage(params.leftWandId, params.leftWandFile, leftFallbackId),
    loadWandImage(params.rightWandId, params.rightWandFile, rightFallbackId),
    params.rightIsBot ? loadVoldemortPortraitImage(portraitFile) : Promise.resolve(null),
  ];
  const [leftWandImg, rightWandImg, voldemortPortraitImg] = await Promise.all(loads);
  const captions = getCaptions(params);
  return { leftWandImg, rightWandImg, voldemortPortraitImg, captions };
}

async function renderSinglePngBuffer(params) {
  const width = 1000;
  const height = 540;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const assets = await prepareDuelAssets(params);
  let tmpDir = "";
  let leftAvatarFrames = [];
  let rightAvatarFrames = [];
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-duel-png-"));
    [leftAvatarFrames, rightAvatarFrames] = await Promise.all([
      loadDuelAvatarFrames(tmpDir, params.leftAvatarUrl, "L", ffmpegPath),
      loadDuelAvatarFrames(tmpDir, params.rightAvatarUrl, "R", ffmpegPath),
    ]);
  } catch {
    const [a, b] = await Promise.all([
      safeLoadImage(params.leftAvatarUrl, { suppressWarning: true }),
      safeLoadImage(params.rightAvatarUrl, { suppressWarning: true }),
    ]);
    leftAvatarFrames = a ? [a] : [];
    rightAvatarFrames = b ? [b] : [];
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
      }
    }
  }
  drawDuelFrame(ctx, {
    width,
    height,
    leftAvatarFrames,
    rightAvatarFrames,
    leftName: params.leftName,
    rightName: params.rightName,
    leftId: params.leftId,
    rightId: params.rightId,
    leftAccent: params.leftAccent,
    rightAccent: params.rightAccent,
    leftPower: params.leftPower,
    rightPower: params.rightPower,
    rightIsBot: params.rightIsBot,
    leftWandImg: assets.leftWandImg,
    rightWandImg: assets.rightWandImg,
    voldemortPortraitImg: assets.voldemortPortraitImg,
    frameIndex: Math.floor(100 * RESULT_PHASE_START) + 8,
    totalFrames: 100,
    captions: assets.captions,
    winnerSide: params.winnerSide,
  });
  return canvas.toBuffer("image/png");
}

function duelGifTiming() {
  const FRAME_COUNT = Math.max(28, Math.min(48, Math.floor(Number(process.env.VC_DUEL_GIF_FRAMES ?? 42))));
  const FRAMERATE = Math.max(6, Math.min(10, Math.floor(Number(process.env.VC_DUEL_GIF_FPS ?? 8))));
  return {
    FRAME_COUNT,
    FRAMERATE,
    durationMs: Math.ceil((FRAME_COUNT / FRAMERATE) * 1000) + 250,
  };
}

async function renderDuelCanvas(params, options = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);
  const animating = options.animating === true;
  if (!animating || DUEL_CANVAS_USE_PNG || !ffmpegPath) {
    const buf = await renderSinglePngBuffer(params);
    return { buffer: buf, format: "png" };
  }
  const { FRAME_COUNT, FRAMERATE } = duelGifTiming();
  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-duel-gif-"));
    const assets = await prepareDuelAssets(params);
    const [leftAvatarFrames, rightAvatarFrames] = await Promise.all([
      loadDuelAvatarFrames(tmpDir, params.leftAvatarUrl, "L", ffmpegPath),
      loadDuelAvatarFrames(tmpDir, params.rightAvatarUrl, "R", ffmpegPath),
    ]);
    const framePattern = path.join(tmpDir, "duel_%03d.png");
    const palettePath = path.join(tmpDir, "palette.png");
    const outGifPath = path.join(tmpDir, "duel.gif");
    const width = 1000;
    const height = 540;
    for (let i = 0; i < FRAME_COUNT; i += 1) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      drawDuelFrame(ctx, {
        width,
        height,
        leftAvatarFrames,
        rightAvatarFrames,
        leftName: params.leftName,
        rightName: params.rightName,
        leftId: params.leftId,
        rightId: params.rightId,
        leftAccent: params.leftAccent,
        rightAccent: params.rightAccent,
        leftPower: params.leftPower,
        rightPower: params.rightPower,
        rightIsBot: params.rightIsBot,
        leftWandImg: assets.leftWandImg,
        rightWandImg: assets.rightWandImg,
        voldemortPortraitImg: assets.voldemortPortraitImg,
        frameIndex: i,
        totalFrames: FRAME_COUNT,
        captions: assets.captions,
        winnerSide: params.winnerSide,
      });
      const name = `duel_${String(i + 1).padStart(3, "0")}.png`;
      fs.writeFileSync(path.join(tmpDir, name), canvas.toBuffer("image/png"));
    }
    const paletteOk = runFfmpeg(["-y", "-i", framePattern, "-vf", "palettegen=stats_mode=diff", palettePath]);
    if (!paletteOk) {
      const buf = await renderSinglePngBuffer(params);
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
      const buf = await renderSinglePngBuffer(params);
      return { buffer: buf, format: "png" };
    }
    const outGif = fs.readFileSync(outGifPath);
    if (!outGif?.length) {
      const buf = await renderSinglePngBuffer(params);
      return { buffer: buf, format: "png" };
    }
    return { buffer: outGif, format: "gif" };
  } catch {
    const buf = await renderSinglePngBuffer(params);
    return { buffer: buf, format: "png" };
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
      }
    }
  }
}

function warmupDuelCanvas() {
  setImmediate(() => {
    renderDuelCanvas({
      leftAvatarUrl: "",
      rightAvatarUrl: "",
      leftName: "wizard",
      rightName: "Voldemort",
      leftId: "0",
      rightId: "1",
      leftAccent: DUEL_SPELL.left.core,
      rightAccent: DUEL_SPELL.right.core,
      leftPower: 60,
      rightPower: 94,
      leftIsBot: false,
      rightIsBot: true,
      leftWandId: LOANER_WAND_ID,
      rightWandId: BOT_WAND_ID,
      leftWandFile: DEFAULT_LOANER_WAND,
      rightWandFile: "Bacchetta_di_Sambuco_main.png",
      spellLine: "warmup",
      winnerSide: "left",
      messageSeed: "warmup",
    }, { animating: false }).catch(() => {});
  });
}

renderDuelCanvas.spinAnimationDurationMs = function spinAnimationDurationMs() {
  return duelGifTiming().durationMs;
};
renderDuelCanvas.warmup = warmupDuelCanvas;

module.exports = renderDuelCanvas;
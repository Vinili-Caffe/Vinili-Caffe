/**
 * Rigenera icone PWA + apple-touch da logo-disco.png.
 * Uso (da WebSite/): node scripts/regen-pwa-icons.mjs
 *
 * Set minimo:
 *  - images/pwa-icon-{192,512}.png (+ maskable)
 *  - apple-touch-icon.png (180)
 *  - favicon-32.png + favicon.ico
 */
import sharp from "sharp";
import { writeFileSync } from "fs";
import { join } from "path";

const root = "public";
const src = join(root, "images/logo-disco.png");

function plateSvg(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs>
        <radialGradient id="g" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stop-color="#6b4a32"/>
          <stop offset="100%" stop-color="#3a2418"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`,
  );
}

async function make(size, out, padRatio = 0.1) {
  const pad = Math.round(size * padRatio);
  const inner = size - pad * 2;
  const disc = await sharp(src)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(plateSvg(size))
    .composite([{ input: disc, left: pad, top: pad }])
    .png()
    .toFile(out);
  console.log("ok", out);
}

async function makeFavicon() {
  const bg = { r: 14, g: 9, b: 6, alpha: 1 };
  const png32 = await sharp(src).resize(32, 32, { fit: "contain", background: bg }).png().toBuffer();
  writeFileSync(join(root, "favicon-32.png"), png32);
  console.log("ok", "favicon-32.png");
  try {
    const pngToIco = (await import("png-to-ico")).default;
    const bufs = [];
    for (const s of [16, 32, 48]) {
      bufs.push(await sharp(src).resize(s, s, { fit: "contain", background: bg }).png().toBuffer());
    }
    const ico = await pngToIco(bufs);
    writeFileSync(join(root, "favicon.ico"), ico);
    // Next App Router: src/app/favicon.ico ha priorità su /favicon.ico
    writeFileSync(join("src", "app", "favicon.ico"), ico);
    console.log("ok", "favicon.ico (+ src/app/favicon.ico)");
  } catch {
    console.warn("skip favicon.ico (npm i -D png-to-ico per generarlo)");
  }
}

await make(192, join(root, "images/pwa-icon-192.png"));
await make(512, join(root, "images/pwa-icon-512.png"));
await make(192, join(root, "images/pwa-icon-192-maskable.png"), 0.18);
await make(512, join(root, "images/pwa-icon-512-maskable.png"), 0.18);
await make(180, join(root, "apple-touch-icon.png"), 0.08);
await makeFavicon();
console.log("done");

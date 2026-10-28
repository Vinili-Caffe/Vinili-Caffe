import sharp from "sharp";
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

await make(192, join(root, "images/pwa-icon-192.png"));
await make(512, join(root, "images/pwa-icon-512.png"));
await make(192, join(root, "images/pwa-icon-192-maskable.png"), 0.18);
await make(512, join(root, "images/pwa-icon-512-maskable.png"), 0.18);
await make(180, join(root, "apple-touch-icon-v12.png"), 0.08);
await make(180, join(root, "apple-touch-icon-v11.png"), 0.08);
await make(180, join(root, "apple-touch-icon.png"), 0.08);
console.log("done");

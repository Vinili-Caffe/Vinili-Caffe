/**
 * Key green/magenta screen → Discord 128 PNG into category folders.
 * Sources: assets/role3-*.jpg and promo/role-icons/_sources/
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.join(__dirname, "../../../WebSiteReact/package.json"),
);
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SOURCES = path.join(ROOT, "_sources");
const ASSETS =
  "C:/Users/corva/.cursor/projects/c-Users-corva-Desktop-Vinili-Caff-Bots/assets";
const SIZE = 128;

const CATS = {
  "01-staff": [
    "founder",
    "manager",
    "admin",
    "highstaff",
    "stafferdelmese",
    "stafferdellasettimana",
    "director",
    "seniormoderator",
    "moderator",
    "helper",
    "staff",
    "partnermanager",
    "blogger",
    "podcaster",
  ],
  "02-colori": [
    "red",
    "orange",
    "yellow",
    "green",
    "aqua",
    "blue",
    "purple",
    "pink",
    "black",
    "grey",
    "white",
  ],
  "03-colori-gradient": [
    "gradient-red",
    "gradient-brown",
    "gradient-orange",
    "gradient-yellow",
    "gradient-green",
    "gradient-blue",
    "gradient-purple",
    "gradient-pink",
    "gradient-black",
    "gradient-gray",
    "gradient-white",
  ],
  "04-colori-duo": [
    "duo-aqua",
    "duo-green",
    "duo-orange",
    "duo-purple",
    "duo-pink",
    "duo-white",
    "duo-red",
    "duo-blue",
    "duo-yellow",
  ],
  "05-badge": [
    "birthday",
    "famous",
    "vip",
    "vipplus",
    "donator",
    "booster",
    "doublebooster",
    "mvp",
    "patron",
    "royale",
    "picperms",
    "topweeklytext",
    "topweeklyvoc",
    "topmonthlymember",
    "hogwarts",
    "hogwarts-commemorativo",
  ],
  "06-social": [
    "follower",
    "fan",
    "supporter",
    "guilded",
    "promoter",
    "propulsor",
    "catalyst",
    "voter",
  ],
  "07-status": [
    "verified-hehim",
    "verified-sheher",
    "verified-neo",
    "og",
    "veterano",
    "nuovoutente",
    "member",
    "unverified",
    "muted",
    "bots",
    "vinili",
    "caffe",
  ],
  "08-livelli-musica": [
    "pop",
    "jazz",
    "rap",
    "reggae",
    "metal",
    "rock",
    "funk",
    "blues",
    "indie",
  ],
  "09-livelli-xp": [
    "rookie",
    "scout",
    "explorer",
    "tracker",
    "achiever",
    "vanguard",
    "mentor",
    "strategist",
  ],
  "10-eta": ["age-14", "age-1516", "age-1718", "age-19plus"],
  "11-pronomi": ["hehim", "sheher", "theythem", "askme"],
  "12-zodiaco": [
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "capricorn",
    "aquarius",
    "pisces",
  ],
  "13-dms": ["dms-open", "dms-closed", "dms-ask"],
  "14-interessi": [
    "anime",
    "lettura",
    "scrittura",
    "film-serie",
    "sport",
    "musica",
    "gaming",
    "disegno",
    "cucina",
    "fotografia",
  ],
  "15-games": [
    "minecraft",
    "lol",
    "fortnite",
    "roblox",
    "gta",
    "cod",
    "rocketleague",
    "amongus",
    "osu",
    "thesims",
    "valorant",
    "fifa",
    "brawlstars",
    "brawlhalla",
    "genshin",
  ],
  "16-ping": [
    "news",
    "events",
    "minigames",
    "reviveserver",
    "notturni",
    "bump",
    "partnership",
    "live",
  ],
  "17-regioni": ["nord", "centro", "sud", "estero"],
  "18-relazione": ["fidanzato", "single"],
};

const slugToCat = new Map();
for (const [cat, slugs] of Object.entries(CATS)) {
  for (const s of slugs) slugToCat.set(s, cat);
}

function outDirFor(slug) {
  const cat = slugToCat.get(slug) || "_unsorted";
  const dir = path.join(ROOT, cat);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isGreen(p) {
  return (
    p.g > 90 &&
    p.g >= p.r + 25 &&
    p.g >= p.b + 25 &&
    p.g > 0.4 * (p.r + p.g + p.b)
  );
}

function isMagenta(p) {
  return p.r > 90 && p.b > 90 && p.r >= p.g + 25 && p.b >= p.g + 25;
}

function screenScore(p) {
  if (isGreen(p)) {
    const dominance = p.g - Math.max(p.r, p.b);
    return Math.min(1, dominance / 80);
  }
  if (isMagenta(p)) {
    const dominance = Math.min(p.r, p.b) - p.g;
    return Math.min(1, dominance / 80);
  }
  return 0;
}

async function keyOne(srcPath, slug) {
  const work = 256;
  const { data, info } = await sharp(srcPath)
    .resize(work, work, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  const cx = (work - 1) / 2;
  const cy = (work - 1) / 2;
  const rMax = work * 0.5;

  for (let y = 0; y < work; y++) {
    for (let x = 0; x < work; x++) {
      const i = (y * work + x) * info.channels;
      const p = { r: out[i], g: out[i + 1], b: out[i + 2] };
      const s = screenScore(p);
      const rr = Math.hypot(x - cx, y - cy);
      let a = 255;
      if (s >= 0.55) a = 0;
      else if (s >= 0.2) a = Math.round(255 * (1 - (s - 0.2) / 0.35));
      const lum = (p.r + p.g + p.b) / 3;
      if (lum < 18 && rr > work * 0.42) a = 0;
      if (rr > rMax - 0.5) a = 0;
      out[i + 3] = a;
      if (a > 0 && a < 250 && p.g > p.r && p.g > p.b) {
        const spill = Math.max(0, p.g - Math.max(p.r, p.b));
        out[i + 1] = Math.max(0, p.g - Math.round(spill * 0.85));
      }
    }
  }

  const dir = outDirFor(slug);
  await sharp(srcPath)
    .resize(512, 512, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toFile(path.join(dir, `${slug}-hi.jpg`));

  await sharp(out, { raw: { width: work, height: work, channels: 4 } })
    .resize(SIZE, SIZE, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(path.join(dir, `${slug}.png`));
}

async function main() {
  fs.mkdirSync(SOURCES, { recursive: true });
  const files = new Map();
  for (const dir of [ASSETS, SOURCES]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/^role3-.+\.(jpe?g|png)$/i.test(f)) continue;
      const slug = f.replace(/^role3-/i, "").replace(/\.(jpe?g|png)$/i, "");
      const full = path.join(dir, f);
      if (!files.has(slug) || dir === ASSETS) files.set(slug, full);
    }
  }

  let ok = 0;
  for (const [slug, src] of [...files.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    await keyOne(src, slug);
    const destSrc = path.join(SOURCES, `role3-${slug}.jpg`);
    if (path.resolve(src) !== path.resolve(destSrc)) {
      try {
        await sharp(src).jpeg({ quality: 92 }).toFile(destSrc);
      } catch (_) {
        fs.copyFileSync(src, destSrc);
      }
    }
    ok++;
    if (ok % 20 === 0) console.log(ok, slug);
  }
  console.log("chroma done", ok);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

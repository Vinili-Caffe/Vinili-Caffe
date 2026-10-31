/** Notizie giochi: catalogo dei giochi e riconoscimento del gioco di una notizia. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

/** Catalogo giochi del menu personalizza + fonti ufficiali e non. */
function defaultGamesCatalog() {
  const R: any = IDs.roles || {};
  return [
    {
      key: "minecraft",
      label: "Minecraft",
      emoji: "⛏️",
      roleId: R.GameMinecraft,
      color: 0x5d9c3f,
      sources: [
        { type: "mojang_java_patch" },
        { type: "google_news", query: "Minecraft Java (update OR patch OR snapshot) when:7d" },
      ],
    },
    {
      key: "lol",
      label: "League of Legends",
      emoji: "⚔️",
      roleId: R.GameLeagueOfLegends,
      color: 0xc89b3c,
      sources: [
        { type: "lol_ddragon" },
        { type: "google_news", query: "League of Legends patch notes when:7d" },
      ],
    },
    {
      key: "fortnite",
      label: "Fortnite",
      emoji: "🪂",
      roleId: R.GameFortnite,
      color: 0x9d4dbb,
      sources: [
        { type: "fortnite_api" },
        { type: "google_news", query: "Fortnite (update OR patch OR stagione OR chapter) when:7d" },
      ],
    },
    {
      key: "roblox",
      label: "Roblox",
      emoji: "🧱",
      roleId: R.GameRoblox,
      color: 0xe2231a,
      sources: [
        { type: "rss", url: "https://blog.roblox.com/feed/" },
        { type: "google_news", query: "Roblox (update OR release notes OR patch) when:7d" },
      ],
    },
    {
      key: "gta",
      label: "Grand Theft Auto",
      emoji: "🚗",
      roleId: R.GameGrandTheftAuto,
      color: 0x6c9e3c,
      sources: [
        { type: "steam", appId: 271590, officialOnly: true },
        { type: "google_news", query: "GTA Online (update OR \"Title Update\" OR Rockstar) when:7d" },
      ],
    },
    {
      key: "cod",
      label: "Call of Duty",
      emoji: "🔫",
      roleId: R.GameCallOfDuty,
      color: 0x4a7c2c,
      sources: [
        { type: "steam", appId: 2933080 },
        { type: "steam", appId: 2519060 },
        { type: "google_news", query: "Call of Duty (patch notes OR update OR Warzone) when:7d" },
      ],
    },
    {
      key: "rocketleague",
      label: "Rocket League",
      emoji: "🚀",
      roleId: R.GameRocketLeague,
      color: 0x0078f2,
      sources: [
        { type: "steam", appId: 252950 },
        { type: "google_news", query: "Rocket League patch notes when:7d" },
      ],
    },
    {
      key: "amongus",
      label: "Among Us",
      emoji: "🕵️",
      roleId: R.GameAmongUs,
      color: 0xc51111,
      sources: [
        { type: "steam", appId: 945360 },
        { type: "google_news", query: "Among Us (update OR patch OR ruolo) when:7d" },
      ],
    },
    {
      key: "osu",
      label: "OSU!",
      emoji: "🎯",
      roleId: R.GameOsu,
      color: 0xff66aa,
      sources: [
        { type: "osu_news_json" },
        { type: "google_news", query: "\"osu!\" (lazer OR \"patch notes\" OR changelog) when:7d" },
      ],
    },
    {
      key: "sims",
      label: "The Sims",
      emoji: "🏠",
      roleId: R.GameTheSims,
      color: 0x7ac143,
      sources: [
        { type: "steam", appId: 1222670 },
        { type: "google_news", query: "The Sims 4 (update OR patch) when:7d" },
      ],
    },
    {
      key: "valorant",
      label: "Valorant",
      emoji: "🔫",
      roleId: R.GameValorant,
      color: 0xff4655,
      sources: [
        { type: "valorant_api_version" },
        { type: "google_news", query: "Valorant patch notes when:7d" },
      ],
    },
    {
      key: "fifa",
      label: "FIFA / EA FC",
      emoji: "⚽",
      roleId: R.GameFifa,
      color: 0x1a1f71,
      /* solo FC 27 (Steam 4080220); edizioni precedenti filtrate anche per titolo */
      sources: [
        { type: "steam", appId: 4080220 },
        {
          type: "google_news",
          query: "(\"EA Sports FC 27\" OR \"EA FC 27\" OR \"FC 27\") (update OR patch OR \"Title Update\") when:7d",
        },
      ],
    },
    {
      key: "brawlstars",
      label: "Brawl Stars",
      emoji: "⭐",
      roleId: R.GameBrawlStars,
      color: 0xf7c948,
      sources: [
        { type: "brawlstars_blog_html" },
        {
          type: "google_news",
          query: "\"Brawl Stars\" (\"brawl talk\" OR update OR maintenance OR patch OR balance) when:7d",
        },
      ],
    },
    {
      key: "brawlhalla",
      label: "Brawlhalla",
      emoji: "⚔️",
      roleId: R.GameBrawlhalla,
      color: 0xe74c3c,
      sources: [
        { type: "steam", appId: 291550 },
        {
          type: "google_news",
          query: "\"Brawlhalla\" (patch OR update OR balance OR patchnotes) when:7d",
        },
      ],
    },
    {
      key: "genshin",
      label: "Genshin Impact",
      emoji: "💠",
      roleId: R.GameGenshinImpact,
      color: 0x4fc3f7,
      sources: [
        {
          type: "google_news",
          query: "\"Genshin Impact\" (\"version update\" OR patch OR banner OR maintenance OR \"special program\") when:7d",
        },
      ],
    },
  ];
}

/** EA FC N esce a settembre anno N-1 → a set 2026 è FC 27. */
function currentEaFcEdition(now = new Date()) {
  const y = now.getFullYear() % 100;
  const month = now.getMonth() + 1;
  return month >= 9 ? y + 1 : y;
}

function extractYearsFromText(text?) {
  return [...String(text || "").matchAll(/\b(20\d{2})\b/g)].map((m?) => Number(m[1]));
}

function extractFcEditions(text?) {
  const out = [];
  const re = /\b(?:EA\s*Sports\s*)?(?:FC|FIFA)\s*(\d{2})\b/gi;
  let m;
  while ((m = re.exec(String(text || "")))) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Identità gioco: evita ping Fortnite su news Rocket League (e simili).
 * Host ufficiale vince; altrimenti nome gioco nel titolo/summary.
 * gameNewsGenshinMismatch1: Genshin/Brawlhalla mancavano → Google trash
 * (es. Forza Horizon) passava e pingava @Genshin.
 */
const GAME_IDENTITY = {
  minecraft: {
    nameRe: /\bminecraft\b/i,
    hostRe: /\b(minecraft\.net|mojang\.com)\b/i,
  },
  lol: {
    nameRe: /\b(league\s*of\s*legends|\blol\b|wild\s*rift)\b/i,
    hostRe: /\b(leagueoflegends\.com|riotgames\.com)\b/i,
  },
  fortnite: {
    nameRe: /\bfortnite\b/i,
    hostRe: /\b(fortnite\.com|epicgames\.com)\b/i,
  },
  roblox: {
    nameRe: /\broblox\b/i,
    hostRe: /\broblox\.com\b/i,
  },
  gta: {
    nameRe: /\b(gta\s*(online|v|5|vi|6)|grand\s*theft\s*auto)\b/i,
    hostRe: /\brockstargames\.com\b/i,
  },
  cod: {
    nameRe: /\b(call\s*of\s*duty|\bcod\b|warzone|black\s*ops|modern\s*warfare)\b/i,
    hostRe: /\b(callofduty\.com|activision\.com)\b/i,
  },
  rocketleague: {
    nameRe: /\brocket\s*league\b/i,
    hostRe: /\b(rocketleague\.com|psyoni?x\.com)\b/i,
  },
  amongus: {
    nameRe: /\bamong\s*us\b/i,
    hostRe: /\binnersloth\.com\b/i,
  },
  osu: {
    nameRe: /\bosu!?\b/i,
    hostRe: /\bosu\.ppy\.sh\b/i,
  },
  sims: {
    nameRe: /\b(the\s*sims|sims\s*4)\b/i,
    hostRe: /\b(ea\.com|easports\.com)\b/i,
  },
  valorant: {
    nameRe: /\bvalorant\b/i,
    hostRe: /\b(playvalorant\.com|riotgames\.com)\b/i,
  },
  fifa: {
    nameRe: /\b(ea\s*sports\s*fc|ea\s*fc|\bfifa\b|\bfc\s*2\d\b)\b/i,
    hostRe: /\b(ea\.com|easports\.com)\b/i,
  },
  brawlstars: {
    nameRe: /\bbrawl\s*stars\b/i,
    hostRe: /\b(supercell\.com|brawlstars\.com)\b/i,
  },
  brawlhalla: {
    nameRe: /\bbrawlhalla\b/i,
    hostRe: /\bbrawlhalla\.com\b/i,
  },
  genshin: {
    nameRe: /\bgenshin(\s*impact)?\b/i,
    hostRe: /\b(genshin\.hoyoverse\.com|hoyoverse\.com|mihoyo\.com)\b/i,
  },
};

function newsContentBlob(item?) {
  return `${item?.title || ""} ${item?.summary || ""} ${item?.url || ""}`;
}

function newsHost(item?) {
  try {
    return new URL(String(item?.url || "")).hostname.replace(/^www\./i, "");
  } catch (_) {
    return "";
  }
}

/** Inferisci gameKey da host/titolo; null se ambiguo. */
function inferGameKeyFromContent(item?) {
  const blob = newsContentBlob(item);
  const host = newsHost(item);
  const hostHits = [];
  const nameHits = [];
  for (const [key, id] of Object.entries(GAME_IDENTITY)) {
    if (host && id.hostRe && id.hostRe.test(host)) hostHits.push(key);
    if (id.nameRe && id.nameRe.test(blob)) nameHits.push(key);
  }
  if (hostHits.length === 1) return hostHits[0];
  if (nameHits.length === 1) return nameHits[0];
  /* host + nome stesso gioco */
  if (hostHits.length && nameHits.length) {
    const both = hostHits.filter((k?) => nameHits.includes(k));
    if (both.length === 1) return both[0];
  }
  return null;
}

/** Nome del gioco dichiarato presente in titolo/summary/url (o host ufficiale). */
function claimedGameNameMatches(item?, claimed?, id?, gamesByKey?) {
  const blob = newsContentBlob(item);
  const host = newsHost(item);
  if (id?.nameRe && id.nameRe.test(blob)) return true;
  if (id?.hostRe && host && id.hostRe.test(host)) return true;
  const live = gamesByKey && gamesByKey.get(claimed);
  const label = String(live?.label || item?.gameLabel || claimed || "").trim();
  if (!label) return false;
  const tokens = label
    .toLowerCase()
    .split(/[^a-z0-9!]+/i)
    .map((t?) => t.trim())
    .filter((t?) => t.length >= 4);
  if (!tokens.length) {
    const short = label.toLowerCase().replace(/[^a-z0-9]/gi, "");
    return short.length >= 3 && new RegExp(`\\b${short}\\b`, "i").test(blob);
  }
  /* almeno un token significativo del label (es. "Genshin" da "Genshin Impact") */
  return tokens.some((t?) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(blob));
}

/**
 * Allinea emoji/roleId al gioco vero (contenuto/URL).
 * @returns {{ item: object, reject: boolean, reason?: string, reassigned?: boolean }}
 */
function reconcileGameIdentity(item?, gamesByKey?) {
  if (!item || !item.gameKey) return { item, reject: true, reason: "no-game" };
  const claimed = String(item.gameKey);
  const inferred = inferGameKeyFromContent(item);
  const id = GAME_IDENTITY[claimed];
  const blob = newsContentBlob(item);
  const host = newsHost(item);

  if (inferred && inferred !== claimed) {
    const target = gamesByKey.get(inferred);
    if (target && target.roleId) {
      return {
        item: {
          ...item,
          gameKey: target.key,
          gameLabel: target.label,
          emoji: target.emoji,
          roleId: target.roleId,
          color: target.color,
          _reassignedFrom: claimed,
        },
        reject: false,
        reassigned: true,
      };
    }
    return { item, reject: true, reason: `wrong-game:${claimed}->${inferred}` };
  }

  /* Google (e fallback senza identity): nome gioco OBBLIGATORIO nel contenuto.
     gameNewsGenshinMismatch1: senza identity, gnews Forza passava come Genshin. */
  if (String(item.sourceType || "") === "google_news") {
    const nameOk = claimedGameNameMatches(item, claimed, id, gamesByKey);
    const hostOk = id?.hostRe && host ? id.hostRe.test(host) : false;
    const steamOk = /\bsteampowered\.com|steamcommunity\.com\b/i.test(host);
    if (!nameOk && !hostOk && !steamOk) {
      return { item, reject: true, reason: "gnews-game-mismatch" };
    }
  } else if (!id) {
    /* fonte non-google ma gioco senza identity → almeno label nel blob */
    if (!claimedGameNameMatches(item, claimed, null, gamesByKey)) {
      return { item, reject: true, reason: "game-name-missing" };
    }
  }

  /* titolo/host chiaramente di un ALTRO gioco (anche senza inferenza unica) */
  {
    const selfName = claimedGameNameMatches(item, claimed, id, gamesByKey);
    for (const [otherKey, otherId] of Object.entries(GAME_IDENTITY)) {
      if (otherKey === claimed) continue;
      const otherName = otherId.nameRe && otherId.nameRe.test(blob);
      const otherHost = otherId.hostRe && host && otherId.hostRe.test(host);
      if ((otherHost || (otherName && !selfName)) && otherKey !== inferred) {
        /* prova reassign se possibile */
        const target = gamesByKey.get(otherKey);
        if (target && target.roleId && (otherHost || otherName)) {
          return {
            item: {
              ...item,
              gameKey: target.key,
              gameLabel: target.label,
              emoji: target.emoji,
              roleId: target.roleId,
              color: target.color,
              _reassignedFrom: claimed,
            },
            reject: false,
            reassigned: true,
          };
        }
        return { item, reject: true, reason: `alien-game:${otherKey}` };
      }
    }
  }

  /* sempre riaggancia emoji/role dal catalogo live (niente ID stantii) */
  const live = gamesByKey.get(claimed);
  if (live && live.roleId) {
    return {
      item: {
        ...item,
        gameLabel: live.label || item.gameLabel,
        emoji: live.emoji || item.emoji,
        roleId: live.roleId,
        color: live.color || item.color,
      },
      reject: false,
    };
  }
  return { item, reject: false };
}

export = { defaultGamesCatalog, currentEaFcEdition, extractYearsFromText, extractFcEditions, inferGameKeyFromContent, reconcileGameIdentity };
